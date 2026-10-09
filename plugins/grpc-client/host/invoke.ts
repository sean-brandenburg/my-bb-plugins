import type { DescMethod } from "@bufbuild/protobuf";
import type { CallInput, CallResult } from "../contract.ts";
import { MASKED_VALUE, errorMessage, isClientStreaming } from "../shared/common.ts";
import { renderTemplate, type Source } from "../shared/config.ts";
import { findMethod, resolveAuth } from "../shared/descriptors.ts";
import {
  UNAUTHENTICATED,
  connectionArgs,
  grpcurlCommand,
  headerEnv,
  invokeArgs,
  okStatus,
  parseErrorStatus,
  parseVerboseOutput,
  requestBody,
  unknownStatus,
} from "../shared/grpcurl.ts";
import { requestHeaders, tokenCache, type ResolvedHeaders } from "./auth.ts";
import { loadDescriptors, type Loaded } from "./descriptor-cache.ts";
import { run, type RunResult } from "./process.ts";

/** grpcurl enforces the deadline itself (-max-time); this only stops a process that hangs past it. */
const GRPCURL_KILL_GRACE_SECONDS = 15;

function failure(method: string, auth: string | null, startedAt: number, error: string, stderr = ""): CallResult {
  return {
    method,
    ok: false,
    status: unknownStatus(error),
    error,
    responses: [],
    headers: [],
    trailers: [],
    requestMetadata: [],
    auth,
    durationMs: Date.now() - startedAt,
    stderr,
  };
}

function unknownMethod(method: string, source: Source): Error {
  const hint = source.kind === "reflection" ? " (reflection descriptors are cached: reload protos if the server changed)" : "";
  return new Error(`Unknown method ${method}${hint}`);
}

async function resolveMethod(input: CallInput): Promise<{ loaded: Loaded; method: DescMethod; auth: string | null }> {
  const loaded = await loadDescriptors(input, false);
  const method = findMethod(loaded.registry, input.method);
  if (method === undefined) throw unknownMethod(input.method, input.source);
  return { loaded, method, auth: resolveAuth(loaded.registry, method, input.auth.rules, input.endpoint).auth };
}

/** Runs the call; failures, including ones before grpcurl starts, come back as a failed result. */
export async function invoke(input: CallInput, signal: AbortSignal | undefined): Promise<CallResult> {
  const startedAt = Date.now();
  let auth: string | null = null;
  let loaded: Loaded;
  let body: string;
  let headers: ResolvedHeaders;
  try {
    const resolved = await resolveMethod(input);
    loaded = resolved.loaded;
    auth = resolved.auth;
    body = requestBody(input.request, isClientStreaming(resolved.method.methodKind));
    headers = await requestHeaders(input, auth, input.metadata);
  } catch (error) {
    return failure(input.method, auth, startedAt, errorMessage(error));
  }

  const { names, env } = headerEnv(headers.entries, process.env);
  const args = invokeArgs({
    protoset: loaded.protosetPath,
    connection: connectionArgs(input.endpoint),
    headerNames: names,
    timeoutSeconds: input.timeoutSeconds,
    target: input.endpoint.target,
    method: input.method,
  });
  let result: RunResult;
  try {
    result = await run(input.tools.grpcurl, args, {
      env,
      stdin: body,
      timeoutMs: (input.timeoutSeconds + GRPCURL_KILL_GRACE_SECONDS) * 1000,
      signal,
    });
  } catch (error) {
    return failure(input.method, auth, startedAt, errorMessage(error));
  }

  const parsed = parseVerboseOutput(result.stdout);
  const requestMetadata = parsed.requestMetadata.map(([name, value]): [string, string] => [
    name,
    headers.masked.has(name.toLowerCase()) ? MASKED_VALUE : value,
  ]);
  const status = result.code === 0 ? okStatus() : parseErrorStatus(result.stderr, result.code);
  // A rejected token is probably revoked or from another account; the next call fetches a new one.
  if (status?.code === UNAUTHENTICATED && auth !== null) tokenCache.forget(auth);
  const stderr = result.stderr.trim();
  return {
    method: input.method,
    ok: result.code === 0,
    status: status ?? unknownStatus(stderr),
    error: status === null ? stderr || `grpcurl exited with ${result.code}` : null,
    responses: parsed.responses,
    headers: parsed.headers,
    trailers: parsed.trailers,
    requestMetadata,
    auth,
    durationMs: Date.now() - startedAt,
    stderr: status === null ? stderr : "",
  };
}

/** The equivalent grpcurl command line; unlike `invoke`, problems are thrown. */
export async function command(input: CallInput): Promise<string> {
  const { loaded, method, auth } = await resolveMethod(input);
  let token: { header: string; prefix: string; command: string } | null = null;
  if (auth !== null) {
    const profile = input.auth.profiles[auth];
    if (profile === undefined) throw new Error(`Unknown auth profile "${auth}"`);
    if (!input.metadata.some(({ name }) => name === profile.header)) {
      token = { header: profile.header, prefix: profile.prefix, command: renderTemplate(profile.command, input.endpoint, profile) };
    }
  }
  return grpcurlCommand({
    protoset: loaded.protosetPath,
    endpoint: input.endpoint,
    token,
    metadata: input.metadata,
    body: requestBody(input.request, isClientStreaming(method.methodKind)),
    method: input.method,
  });
}
