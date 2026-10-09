import { PluginCliError, type PluginSettingsValues } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { Launch } from "../contract.ts";
import {
  REFLECTION_SOURCE,
  authSchema,
  endpointsSchema,
  jsonSettingValidator,
  parseJsonSetting,
  resolveSourceName,
  sourcesSchema,
  withBuiltinSources,
  type AuthConfig,
  type Endpoint,
  type ParseResult,
  type Source,
} from "../shared/config.ts";

const DEFAULT_GRPCURL = "grpcurl";
const DEFAULT_BUF = "buf";
const EMPTY_AUTH: AuthConfig = { profiles: {}, rules: [] };

/** The settings that hold raw JSON: their schema, and what a blank field stands for. */
export const JSON_SETTINGS = {
  endpoints: { schema: endpointsSchema, empty: "[]" },
  sources: { schema: sourcesSchema, empty: "[]" },
  auth: { schema: authSchema, empty: "{}" },
} as const;
export type JsonSettingKey = keyof typeof JSON_SETTINGS;
export type JsonSettingValue<K extends JsonSettingKey> = z.output<(typeof JSON_SETTINGS)[K]["schema"]>;

function jsonSettingValidatorFor(key: JsonSettingKey) {
  return jsonSettingValidator<unknown>(JSON_SETTINGS[key].schema, key, JSON_SETTINGS[key].empty);
}

export function parseJsonSettingFor<K extends JsonSettingKey>(key: K, raw: string): ParseResult<JsonSettingValue<K>> {
  const { schema, empty } = JSON_SETTINGS[key];
  return parseJsonSetting<unknown>(raw, schema, key, empty) as ParseResult<JsonSettingValue<K>>;
}

export const SETTINGS = {
  grpcurl: { type: "string", label: "grpcurl executable", description: "Name on PATH or absolute path.", default: DEFAULT_GRPCURL },
  buf: { type: "string", label: "buf executable", description: 'Used by "buf" proto sources.', default: DEFAULT_BUF },
  defaultSource: {
    type: "string",
    label: "Default proto source",
    description: 'Source used when an endpoint names none. "reflection" is always available.',
    default: REFLECTION_SOURCE.name,
  },
  timeoutSeconds: {
    type: "number",
    label: "Default call timeout (seconds)",
    experimental_schema: z.number().min(0.1).max(3600),
    default: 30,
  },
  endpoints: {
    type: "string",
    label: "Endpoints",
    description:
      'JSON array of {name, target, transport?: "tls"|"plaintext"|"insecure", source?, headers?, auth?: profile|"none", vars?, args?, protected?, description?}.',
    experimental_multiline: true,
    experimental_schema: jsonSettingValidatorFor("endpoints"),
    default: "[]",
  },
  sources: {
    type: "string",
    label: "Proto sources",
    description:
      'JSON array of {name, kind}: "reflection"; "protoDir" {path, scan?, importPaths?}; "protoFiles" {files, importPaths}; "protoset" {files}; "buf" {path, args?}.',
    experimental_multiline: true,
    experimental_schema: jsonSettingValidatorFor("sources"),
    default: "[]",
  },
  auth: {
    type: "string",
    label: "Auth",
    description:
      'JSON {profiles: {name: {header?, command, refreshCommand?, prefix?, refreshSeconds?, vars?}}, rules: [{methodOption?, serviceOption?, field, profiles: {value: profile|null}}]}.',
    experimental_multiline: true,
    experimental_schema: jsonSettingValidatorFor("auth"),
    default: JSON.stringify(EMPTY_AUTH, null, 2),
  },
} as const;
export type SettingValues = PluginSettingsValues<typeof SETTINGS>;

export interface Config {
  tools: Launch["tools"];
  defaultSource: string;
  timeoutSeconds: number;
  endpoints: Endpoint[];
  sources: Source[];
  auth: AuthConfig;
  /** Problems with the settings; the parts that failed to parse fall back to empty. */
  errors: string[];
}

/** Profile names that endpoints and rules refer to but the auth setting does not define. */
export function referenceErrors(endpoints: Endpoint[], auth: AuthConfig): string[] {
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    if (endpoint.auth !== undefined && endpoint.auth !== "none" && auth.profiles[endpoint.auth] === undefined) {
      errors.push(`endpoint "${endpoint.name}" uses unknown auth profile "${endpoint.auth}"`);
    }
  }
  for (const rule of auth.rules) {
    for (const profile of Object.values(rule.profiles)) {
      if (profile !== null && auth.profiles[profile] === undefined) errors.push(`auth rule maps to unknown profile "${profile}"`);
    }
  }
  return errors;
}

export function loadConfig(values: SettingValues): Config {
  const endpoints = parseJsonSettingFor("endpoints", values.endpoints);
  const sources = parseJsonSettingFor("sources", values.sources);
  const auth = parseJsonSettingFor("auth", values.auth);
  const errors = [endpoints, sources, auth].flatMap((result) => (result.ok ? [] : [result.error]));
  if (endpoints.ok && auth.ok) errors.push(...referenceErrors(endpoints.value, auth.value));
  return {
    tools: { grpcurl: values.grpcurl.trim() || DEFAULT_GRPCURL, buf: values.buf.trim() || DEFAULT_BUF },
    defaultSource: values.defaultSource.trim() || REFLECTION_SOURCE.name,
    timeoutSeconds: values.timeoutSeconds,
    endpoints: endpoints.ok ? endpoints.value : [],
    sources: withBuiltinSources(sources.ok ? sources.value : []),
    auth: auth.ok ? auth.value : { profiles: {}, rules: [] },
    errors,
  };
}

/** Everything the host needs to talk to one endpoint through one proto source. */
export function resolveLaunch(config: Config, endpointName: string, sourceName: string | undefined): Launch {
  const endpoint = config.endpoints.find((candidate) => candidate.name === endpointName);
  if (endpoint === undefined) {
    throw new PluginCliError(`Unknown endpoint "${endpointName}"`, { code: "unknown_endpoint", hint: "Run `bb grpc list` to see endpoints." });
  }
  const name = resolveSourceName(endpoint, sourceName, config.defaultSource);
  const source = config.sources.find((candidate) => candidate.name === name);
  if (source === undefined) {
    throw new PluginCliError(`Unknown proto source "${name}"`, { code: "unknown_source", hint: "Run `bb grpc list` to see sources." });
  }
  return { endpoint, source, auth: config.auth, tools: config.tools };
}
