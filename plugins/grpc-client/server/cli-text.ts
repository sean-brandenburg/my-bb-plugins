import { PLUGIN_CLI_OUTPUT_MAX_BYTES, PluginCliError } from "@get-bb/plugin-sdk";
import type { CallResult } from "../contract.ts";
import { resolveSourceName } from "../shared/config.ts";
import { formatResponse } from "../shared/common.ts";
import type { MessageInfo, MethodInfo, TypeClosure } from "../shared/schema.ts";
import type { Config } from "./config.ts";
import type { HistoryEntry } from "./rpc-contract.ts";
import type { RuleKey } from "./setting-edits.ts";

/** Room left under the CLI output cap for bb's own framing. */
const OUTPUT_LIMIT = PLUGIN_CLI_OUTPUT_MAX_BYTES - 4096;
/** `describe` stops expanding nested messages at this indent. */
const MAX_DESCRIBE_INDENT = 16;

export function bounded(text: string): string {
  if (Buffer.byteLength(text) <= OUTPUT_LIMIT) return text;
  return `${Buffer.from(text).subarray(0, OUTPUT_LIMIT).toString("utf8")}\n… (output truncated)`;
}

/** Truncated JSON would be unparseable, so oversized JSON output is an error instead. */
export function boundedJson(value: unknown): string {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) <= OUTPUT_LIMIT) return text;
  throw new PluginCliError(`JSON output is ${Buffer.byteLength(text)} bytes, over the ${OUTPUT_LIMIT}-byte CLI limit`, {
    code: "output_too_large",
    hint: "Narrow it (e.g. --filter), or drop --json for truncated text output.",
  });
}

export function parsePair(raw: string, separator: ":" | "="): [string, string] {
  const index = raw.indexOf(separator);
  if (index <= 0) throw new PluginCliError(`Expected "name${separator}value", got "${raw}"`, { code: "invalid_value" });
  return [raw.slice(0, index).trim(), raw.slice(index + 1).trim()];
}

/** A history id as printed by `bb grpc history`, with or without its "#"; NaN when it is not a number. */
export function parseHistoryId(raw: string): number {
  return Number(raw.replace(/^#/, ""));
}

export function describeRule(rule: RuleKey): string {
  return `${[rule.methodOption, rule.serviceOption].filter((option) => option !== undefined).join(" / ")} ${String(rule.field)}`;
}

export function formatConfig(config: Config): string {
  const lines = config.errors.map((error) => `! ${error}`);
  lines.push("Endpoints:");
  if (config.endpoints.length === 0) lines.push("  (none — add one with `bb grpc endpoint add`)");
  for (const endpoint of config.endpoints) {
    const flags = [endpoint.transport, `source=${resolveSourceName(endpoint, undefined, config.defaultSource)}`];
    if (endpoint.auth) flags.push(`auth=${endpoint.auth}`);
    if (endpoint.protected) flags.push("protected");
    lines.push(`  ${endpoint.name}  ${endpoint.target}  ${flags.join("  ")}`);
  }
  lines.push("Sources:");
  for (const source of config.sources) {
    const where = "path" in source ? `  ${source.path}` : "files" in source ? `  ${source.files.join(", ")}` : "";
    lines.push(`  ${source.name}  ${source.kind}${where}`);
  }
  lines.push(`Auth profiles: ${Object.keys(config.auth.profiles).join(", ") || "(none)"}`);
  lines.push("Auth rules:");
  if (config.auth.rules.length === 0) lines.push("  (none — add one with `bb grpc rule add`)");
  for (const rule of config.auth.rules) {
    const mapping = Object.entries(rule.profiles).map(([value, profile]) => `${value}=${profile ?? "none"}`);
    lines.push(`  ${describeRule(rule)}  ${mapping.join("  ")}`);
  }
  return lines.join("\n");
}

function kindLabel(method: MethodInfo): string {
  return method.kind.replace("_", " ");
}

export function formatMethodLine(method: MethodInfo): string {
  const tags = [method.kind === "unary" ? "" : kindLabel(method), method.auth ? `auth=${method.auth}` : "", method.deprecated ? "deprecated" : ""].filter(Boolean);
  return `${method.fullName}${tags.length ? `  [${tags.join(", ")}]` : ""}`;
}

function describeFields(message: MessageInfo, closure: TypeClosure, indent: string, seen: Set<string>, lines: string[]) {
  for (const field of message.fields) {
    const type = field.kind === "scalar" ? field.scalar! : field.typeName!;
    const shape =
      field.cardinality === "map" ? `map<${field.mapKey}, ${type}>` : field.cardinality === "list" ? `repeated ${type}` : field.optional && field.kind !== "message" ? `optional ${type}` : type;
    const extra = [field.oneof ? `oneof ${field.oneof}` : "", field.deprecated ? "deprecated" : ""].filter(Boolean).join(", ");
    lines.push(`${indent}${field.jsonName}: ${shape}${extra ? ` (${extra})` : ""}${field.comment ? `  // ${field.comment.split("\n")[0]}` : ""}`);
    if (field.kind === "enum" && field.typeName && closure.enums[field.typeName]) {
      lines.push(`${indent}  values: ${closure.enums[field.typeName]!.values.map((value) => value.name).join(" | ")}`);
    }
    const nested = field.kind === "message" && field.typeName ? closure.messages[field.typeName] : undefined;
    if (nested !== undefined && !field.typeName!.startsWith("google.protobuf.") && !seen.has(nested.typeName) && indent.length < MAX_DESCRIBE_INDENT) {
      seen.add(nested.typeName);
      describeFields(nested, closure, `${indent}  `, seen, lines);
      seen.delete(nested.typeName);
    }
  }
}

/** A method's request shape (or, without a method, the closure's root message) as indented text. */
export function formatDescription(method: MethodInfo | undefined, closure: TypeClosure): string {
  const lines: string[] = [];
  if (method !== undefined) {
    lines.push(`${method.fullName}  (${kindLabel(method)})`);
    if (method.comment) lines.push(...method.comment.split("\n").map((line) => `// ${line}`));
    lines.push(`auth: ${method.auth ?? "none"}${method.authReason ? ` — ${method.authReason}` : ""}`);
    lines.push(`request ${method.input}:`);
  } else {
    lines.push(`${closure.root}:`);
  }
  const root = closure.messages[closure.root]!;
  describeFields(root, closure, "  ", new Set([root.typeName]), lines);
  if (method !== undefined) lines.push(`response ${method.output}`);
  return lines.join("\n");
}

/** Why a call failed: the pre-call error, else the gRPC status. */
export function failureText(result: CallResult): string {
  return result.error ?? `${result.status.name}: ${result.status.message}`;
}

export function formatResponses(result: CallResult): string[] {
  return result.responses.map(formatResponse);
}

export function historyLine(entry: HistoryEntry): string {
  return `#${entry.id}  ${new Date(entry.at).toISOString()}  ${entry.endpoint}  ${entry.method}  ${entry.status}  ${entry.durationMs}ms`;
}

export function formatHistoryCall(entry: HistoryEntry, result: CallResult | null): string {
  const lines = [historyLine(entry), "", "request:", entry.request];
  if (entry.metadata.length > 0) lines.push("", "metadata:", ...entry.metadata.map(({ name, value }) => `  ${name}: ${value}`));
  lines.push("", "response:");
  if (result === null) lines.push("  (not recorded)");
  else {
    if (!result.ok) lines.push(failureText(result));
    lines.push(...formatResponses(result));
  }
  return lines.join("\n");
}
