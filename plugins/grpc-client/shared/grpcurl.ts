import type { MetadataEntry } from "../contract.ts";
import { errorMessage } from "./common.ts";
import type { Endpoint, Source } from "./config.ts";

export const STATUS_CODES = [
  "OK",
  "Canceled",
  "Unknown",
  "InvalidArgument",
  "DeadlineExceeded",
  "NotFound",
  "AlreadyExists",
  "PermissionDenied",
  "ResourceExhausted",
  "FailedPrecondition",
  "Aborted",
  "OutOfRange",
  "Unimplemented",
  "Internal",
  "Unavailable",
  "DataLoss",
  "Unauthenticated",
] as const;

export function statusName(code: number): string {
  return STATUS_CODES[code] ?? `Code(${code})`;
}

/** grpcurl exits with 64 + the gRPC status code when the server returns a non-OK status. */
export const STATUS_EXIT_OFFSET = 64;

export type Metadata = [name: string, value: string][];

export interface VerboseOutput {
  requestMetadata: Metadata;
  headers: Metadata;
  trailers: Metadata;
  /** Parsed JSON per response message; raw text when a block is not JSON. */
  responses: unknown[];
  summary: string | null;
}

const SECTION_HEADERS: Record<string, "descriptor" | "request" | "headers" | "contents" | "trailers"> = {
  "Resolved method descriptor:": "descriptor",
  "Request metadata to send:": "request",
  "Response headers received:": "headers",
  "Response contents:": "contents",
  "Response trailers received:": "trailers",
};
const SUMMARY_PATTERN = /^Sent \d+ requests? and received \d+ responses?$/;

function parseMetadata(lines: string[]): Metadata {
  const metadata: Metadata = [];
  for (const line of lines) {
    if (line.trim() === "" || line.trim() === "(empty)") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    metadata.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return metadata;
}

function parseContents(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Parses the stdout of `grpcurl -v -format json`. */
export function parseVerboseOutput(stdout: string): VerboseOutput {
  const output: VerboseOutput = { requestMetadata: [], headers: [], trailers: [], responses: [], summary: null };
  let section: (typeof SECTION_HEADERS)[string] | null = null;
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (section === "request") output.requestMetadata = parseMetadata(buffer);
    if (section === "headers") output.headers = parseMetadata(buffer);
    if (section === "trailers") output.trailers = parseMetadata(buffer);
    if (section === "contents" && text !== "") output.responses.push(parseContents(text));
    buffer = [];
  };
  for (const line of stdout.split(/\r?\n/)) {
    const header = SECTION_HEADERS[line];
    if (header !== undefined) {
      flush();
      section = header;
      continue;
    }
    if (SUMMARY_PATTERN.test(line)) {
      flush();
      section = null;
      output.summary = line;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return output;
}

export interface CallStatus {
  code: number;
  name: string;
  message: string;
  details: unknown[];
}

export const UNAUTHENTICATED = STATUS_CODES.indexOf("Unauthenticated");

export function okStatus(): CallStatus {
  return { code: 0, name: "OK", message: "", details: [] };
}

/** The status of a call that failed without a gRPC status, e.g. a dial error or a bad request. */
export function unknownStatus(message: string): CallStatus {
  return { code: STATUS_CODES.indexOf("Unknown"), name: "Unknown", message, details: [] };
}

/** Reads the status grpcurl prints to stderr with `-format-error -format json`. */
export function parseErrorStatus(stderr: string, exitCode: number): CallStatus | null {
  if (exitCode < STATUS_EXIT_OFFSET) return null;
  const code = exitCode - STATUS_EXIT_OFFSET;
  const start = stderr.indexOf("{");
  if (start !== -1) {
    try {
      const parsed = JSON.parse(stderr.slice(start, stderr.lastIndexOf("}") + 1)) as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
      };
      const parsedCode = typeof parsed.code === "number" ? parsed.code : code;
      return {
        code: parsedCode,
        name: statusName(parsedCode),
        message: typeof parsed.message === "string" ? parsed.message : "",
        details: Array.isArray(parsed.details) ? parsed.details : [],
      };
    } catch {
      // Fall through to the raw text.
    }
  }
  return { code, name: statusName(code), message: stderr.trim(), details: [] };
}

/** Header values are passed through the environment so tokens never appear in argv. */
export function headerEnvName(index: number): string {
  return `BB_GRPC_HEADER_${index}`;
}

/** The environment that carries header values for `headerFlags`. */
export function headerEnv(entries: [string, string][], base: NodeJS.ProcessEnv): { names: string[]; env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = { ...base };
  entries.forEach(([, value], index) => {
    env[headerEnvName(index)] = value;
  });
  return { names: entries.map(([name]) => name), env };
}

/** `-H` flags whose values grpcurl expands from `headerEnv` (needs `-expand-headers`). */
export function headerFlags(names: string[]): string[] {
  return names.flatMap((name, index) => ["-H", `${name}: \${${headerEnvName(index)}}`]);
}

/** Connection flags shared by every grpcurl invocation for an endpoint. */
export function connectionArgs(endpoint: Endpoint): string[] {
  const args: string[] = [];
  if (endpoint.transport === "plaintext") args.push("-plaintext");
  if (endpoint.transport === "insecure") args.push("-insecure");
  args.push(...endpoint.args);
  return args;
}

/** grpcurl flags that load descriptors straight from a source (used to build the descriptor cache). */
export function sourceArgs(source: Source, protoFiles: string[]): string[] {
  switch (source.kind) {
    case "reflection":
    case "buf":
      return [];
    case "protoset":
      return source.files.flatMap((file) => ["-protoset", file]);
    case "protoDir":
    case "protoFiles": {
      const importPaths = source.kind === "protoDir" ? [source.path, ...source.importPaths] : source.importPaths;
      const files = source.kind === "protoDir" ? protoFiles : source.files;
      return [...importPaths.flatMap((path) => ["-import-path", path]), ...files.flatMap((file) => ["-proto", file])];
    }
  }
}

export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./:=@%+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}


export function invokeArgs(input: {
  protoset: string;
  connection: string[];
  headerNames: string[];
  timeoutSeconds: number;
  target: string;
  method: string;
}): string[] {
  return [
    "-v",
    "-format",
    "json",
    "-emit-defaults",
    "-format-error",
    "-expand-headers",
    "-protoset",
    input.protoset,
    ...input.connection,
    ...headerFlags(input.headerNames),
    "-max-time",
    String(input.timeoutSeconds),
    "-d",
    "@",
    input.target,
    input.method,
  ];
}

/**
 * Source text of each element of a top-level JSON array. Splitting the text,
 * rather than re-serializing parsed values, keeps 64-bit integers exact.
 */
export function splitJsonArray(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) throw new Error("Expected a JSON array");
  const elements: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      if (depth === 1 && start === -1) start = index;
    } else if (char === "[" || char === "{") {
      if (depth === 1 && start === -1) start = index;
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        if (start !== -1) elements.push(trimmed.slice(start, index).trim());
        break;
      }
    } else if (char === "," && depth === 1) {
      if (start !== -1) elements.push(trimmed.slice(start, index).trim());
      start = -1;
    } else if (depth === 1 && start === -1 && !/\s/.test(char ?? "")) {
      start = index;
    }
  }
  return elements;
}

/**
 * grpcurl reads a stream of concatenated JSON messages; a JSON array means one
 * message per element. The original text is forwarded, never re-serialized,
 * so 64-bit integers written as bare numbers keep every digit.
 */
export function requestBody(request: string, clientStreams: boolean): string {
  const text = request.trim() === "" ? "{}" : request.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Request is not valid JSON: ${errorMessage(error)}`);
  }
  if (clientStreams && Array.isArray(parsed)) {
    const elements = splitJsonArray(text);
    if (parsed.some((element) => typeof element !== "object" || element === null || Array.isArray(element))) {
      throw new Error("Each streamed message must be a JSON object");
    }
    return elements.join("\n");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(clientStreams ? "Request must be a JSON object or an array of objects" : "Request must be a JSON object");
  }
  return text;
}

function doubleQuoted(text: string): string {
  return `"${text.replace(/(["\\$`])/g, "\\$1")}"`;
}

function envVarFor(header: string): string {
  return header.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/**
 * A grpcurl command line to copy and run by hand. It never embeds a secret:
 * endpoint header values are read from same-named environment variables, and
 * the auth token stays a live `$(command)` substitution.
 */
export function grpcurlCommand(input: {
  protoset: string;
  endpoint: Endpoint;
  /** The auth header, or null when there is none or per-call metadata overrides it. */
  token: { header: string; prefix: string; command: string } | null;
  metadata: MetadataEntry[];
  body: string;
  method: string;
}): string {
  const parts = ["grpcurl", "-protoset", shellQuote(input.protoset), ...connectionArgs(input.endpoint).map(shellQuote)];
  const headerArgs = new Map<string, string>();
  for (const name of Object.keys(input.endpoint.headers)) headerArgs.set(name, `"${name}: \${${envVarFor(name)}:?}"`);
  if (input.token !== null) {
    const { header, prefix, command } = input.token;
    headerArgs.set(header, `${doubleQuoted(`${header}: ${prefix}`).slice(0, -1)}$(${command})"`);
  }
  for (const { name, value } of input.metadata) headerArgs.set(name, doubleQuoted(`${name}: ${value}`));
  for (const arg of headerArgs.values()) parts.push("-H", arg);
  parts.push("-d", shellQuote(input.body), shellQuote(input.endpoint.target), input.method);
  return parts.join(" ");
}
