import { PluginCliError, cliCommand, defineCli } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import { SOURCE_KINDS, authRuleSchema, endpointSchema, headerNameSchema, profileSchema, sourceSchema, transportSchema } from "../shared/config.ts";
import { UNKNOWN_MESSAGE_TYPE, matchMethods, type MethodInfo, type ServiceInfo } from "../shared/schema.ts";
import {
  bounded,
  boundedJson,
  describeRule,
  failureText,
  formatConfig,
  formatDescription,
  formatHistoryCall,
  formatMethodLine,
  formatResponses,
  historyLine,
  parseHistoryId,
  parsePair,
} from "./cli-text.ts";
import type { GrpcService } from "./grpc.ts";
import type { History } from "./history.ts";
import { remove, sameRule, upsert, type RawSetting, type RuleKey, type SettingEditor } from "./setting-edits.ts";

const DEFAULT_PROFILE_HEADER = profileSchema.shape.header.parse(undefined);

function findServiceMethod(list: ServiceInfo[], name: string): MethodInfo | undefined {
  const matches = matchMethods(list.flatMap((service) => service.methods), name);
  if (matches.length > 1) {
    throw new PluginCliError(`"${name}" matches ${matches.length} methods: ${matches.map((method) => method.fullName).join(", ")}`, {
      code: "ambiguous_method",
      hint: "Pass the full pkg.Service/Method name.",
    });
  }
  return matches[0];
}

const json = { type: "boolean", description: "Emit machine-readable JSON" } as const;
const sourceOption = { type: "string", description: "Proto source to use instead of the endpoint's default" } as const;
const replace = { type: "boolean", description: "Overwrite an existing entry with the same name" } as const;
const ruleKeyOptions = {
  "method-option": { type: "string", description: "Fully-qualified extension on google.protobuf.MethodOptions" },
  "service-option": { type: "string", description: "Fully-qualified extension on google.protobuf.ServiceOptions, used when the method has none" },
  field: { type: "string", required: true, description: "Field of the option message whose value selects the profile" },
} as const;

function ruleKey(options: { "method-option"?: string; "service-option"?: string; field: string }): RuleKey {
  return {
    ...(options["method-option"] === undefined ? {} : { methodOption: options["method-option"] }),
    ...(options["service-option"] === undefined ? {} : { serviceOption: options["service-option"] }),
    field: options.field,
  };
}

function parseHeader(raw: string): { name: string; value: string } {
  const [name, value] = parsePair(raw, ":");
  if (!headerNameSchema.safeParse(name.toLowerCase()).success) {
    throw new PluginCliError(`Invalid header name "${name}"`, { code: "invalid_value", hint: "Use letters, digits, '_', '.' or '-'." });
  }
  return { name: name.toLowerCase(), value };
}

export function grpcCli({ grpc, history, editSetting }: { grpc: GrpcService; history: History; editSetting: SettingEditor }) {
  async function findMethod(endpoint: string, source: string | undefined, name: string): Promise<MethodInfo | undefined> {
    return findServiceMethod((await grpc.services(endpoint, source, false)).services, name);
  }

  return defineCli({
    name: "grpc",
    summary: "Call gRPC endpoints with grpcurl, using named endpoints, proto sources and auth profiles",
    description:
      "Endpoints, proto sources and auth profiles live in the gRPC plugin settings. The gRPC page in the sidebar is the interactive client; these commands are the scriptable one.",
    commands: {
      list: cliCommand({
        summary: "List endpoints, proto sources, auth profiles and auth rules",
        options: { json },
        async run({ options }) {
          const config = await grpc.config();
          if (options.json) {
            return {
              exitCode: 0,
              stdout: JSON.stringify({ endpoints: config.endpoints, sources: config.sources, profiles: Object.keys(config.auth.profiles), errors: config.errors }),
            };
          }
          return { exitCode: 0, stdout: formatConfig(config) };
        },
      }),

      methods: cliCommand({
        summary: "List the services and methods an endpoint exposes",
        positionals: [{ name: "endpoint", description: "Endpoint name", required: true }],
        options: {
          source: sourceOption,
          filter: { type: "string", description: "Case-insensitive substring of the service or method name" },
          reload: { type: "boolean", description: "Rebuild the descriptor cache first" },
          json,
        },
        async run({ positionals, options }) {
          const result = await grpc.services(positionals.endpoint, options.source, options.reload);
          const needle = options.filter?.toLowerCase();
          const methods = result.services
            .flatMap((service) => service.methods)
            .filter((method) => needle === undefined || method.fullName.toLowerCase().includes(needle));
          if (options.json) return { exitCode: 0, stdout: boundedJson({ state: result.state, methods }) };
          const lines = methods.map(formatMethodLine);
          lines.push(`${methods.length} method(s) from ${result.state.fileCount} files (source ${result.source})`);
          return { exitCode: 0, stdout: bounded(lines.join("\n")) };
        },
      }),

      describe: cliCommand({
        summary: "Show a method's request shape, or a message type's fields",
        positionals: [
          { name: "endpoint", description: "Endpoint name", required: true },
          { name: "symbol", description: "Method (pkg.Service/Method or a unique Method name) or fully-qualified message", required: true },
        ],
        options: { source: sourceOption, json },
        async run({ positionals, options }) {
          const method = await findMethod(positionals.endpoint, options.source, positionals.symbol);
          const typeName = method?.input ?? positionals.symbol;
          const closure = await grpc.types(positionals.endpoint, options.source, typeName).catch((error: unknown) => {
            if (!(error instanceof Error) || !error.message.includes(UNKNOWN_MESSAGE_TYPE)) throw error;
            throw new PluginCliError(`No method or message named "${positionals.symbol}"`, {
              code: "not_found",
              hint: `Run \`bb grpc methods ${positionals.endpoint} --filter <text>\` to find it.`,
            });
          });
          if (options.json) return { exitCode: 0, stdout: boundedJson({ method: method ?? null, types: closure }) };
          return { exitCode: 0, stdout: bounded(formatDescription(method, closure)) };
        },
      }),

      call: cliCommand({
        summary: "Call a method; prints the response JSON",
        positionals: [
          { name: "endpoint", description: "Endpoint name", required: true },
          { name: "method", description: "pkg.Service/Method, or a Method name unique on the endpoint", required: true },
        ],
        options: {
          data: { type: "string", stdin: true, description: "Request JSON (object; for client streaming an array). Default {}. --data-stdin reads it from stdin" },
          header: { type: "string", repeatable: true, short: "H", description: "Extra metadata 'name: value' (repeatable); overrides auth and endpoint headers" },
          timeout: { type: "duration", defaultUnit: "s", min: 100, max: 3_600_000, description: "Call deadline (default from settings, 30s)" },
          source: sourceOption,
          yes: { type: "boolean", description: "Required to call an endpoint marked protected" },
          json: { type: "boolean", description: "Print the full result (status, headers, trailers, responses) as JSON" },
        },
        async run({ positionals, options }) {
          const config = await grpc.config();
          const endpoint = config.endpoints.find((candidate) => candidate.name === positionals.endpoint);
          if (endpoint?.protected && !options.yes) {
            throw new PluginCliError(`Endpoint "${endpoint.name}" is protected`, {
              code: "confirmation_required",
              hint: "Confirm with the user, then pass --yes.",
            });
          }
          const method = await findMethod(positionals.endpoint, options.source, positionals.method);
          if (method === undefined) {
            throw new PluginCliError(`No unique method "${positionals.method}" on ${positionals.endpoint}`, {
              code: "not_found",
              hint: `Run \`bb grpc methods ${positionals.endpoint} --filter ${positionals.method.split(/[/.]/).pop()}\`.`,
            });
          }
          const result = await grpc.invoke("cli", {
            endpoint: positionals.endpoint,
            source: options.source,
            method: method.fullName,
            request: options.data ?? "{}",
            metadata: options.header.map(parseHeader),
            timeoutSeconds: options.timeout === undefined ? undefined : options.timeout / 1000,
          });
          if (options.json) return { exitCode: result.ok ? 0 : 1, stdout: boundedJson(result) };
          const body = formatResponses(result).join("\n");
          if (result.ok) return { exitCode: 0, stdout: bounded(body || "{}") };
          const details = result.status.details.length > 0 ? `\ndetails: ${JSON.stringify(result.status.details)}` : "";
          return { exitCode: 1, stdout: body ? bounded(body) : undefined, stderr: `${failureText(result)}${details}` };
        },
      }),

      command: cliCommand({
        summary: "Print an equivalent grpcurl command (auth tokens stay as $(...) substitutions)",
        positionals: [
          { name: "endpoint", description: "Endpoint name", required: true },
          { name: "method", description: "pkg.Service/Method", required: true },
        ],
        options: { data: { type: "string", description: "Request JSON (default {})" }, source: sourceOption },
        async run({ positionals, options }) {
          const method = await findMethod(positionals.endpoint, options.source, positionals.method);
          if (method === undefined) throw new PluginCliError(`No unique method "${positionals.method}"`, { code: "not_found" });
          const command = await grpc.command({
            endpoint: positionals.endpoint,
            source: options.source,
            method: method.fullName,
            request: options.data ?? "{}",
            metadata: [],
          });
          return { exitCode: 0, stdout: command };
        },
      }),

      history: cliCommand({
        summary: "Show recent calls from the UI and CLI",
        options: { limit: { type: "integer", min: 1, max: 500, default: 20, description: "Entries to show (max 500)" }, json },
        async run({ options }) {
          const entries = history.list(options.limit);
          if (options.json) return { exitCode: 0, stdout: boundedJson({ entries }) };
          if (entries.length === 0) return { exitCode: 0, stdout: "No calls yet." };
          return { exitCode: 0, stdout: entries.map((entry) => `${historyLine(entry)}  (${entry.origin})`).join("\n") };
        },
      }),

      "history show": cliCommand({
        summary: "Show one recorded call: its request and the response it got",
        positionals: [{ name: "id", description: "History id from `bb grpc history` (the #number)", required: true }],
        options: { json },
        async run({ positionals, options }) {
          const id = parseHistoryId(positionals.id);
          if (!Number.isInteger(id)) throw new PluginCliError(`Invalid history id "${positionals.id}"`, { code: "invalid_value" });
          const entry = history.entry(id);
          if (entry === undefined) throw new PluginCliError(`No history entry ${id}`, { code: "not_found", hint: "Run `bb grpc history` to see ids." });
          const result = history.result(id);
          if (options.json) return { exitCode: 0, stdout: boundedJson({ entry, result }) };
          return { exitCode: 0, stdout: bounded(formatHistoryCall(entry, result)) };
        },
      }),

      "history delete": cliCommand({
        summary: "Delete history entries by id, or all of them with --all",
        positionals: [{ name: "ids", description: "History ids (the #number)", variadic: true }],
        options: { all: { type: "boolean", description: "Delete every history entry" } },
        async run({ positionals, options }) {
          if (options.all) return { exitCode: 0, stdout: `Deleted ${history.clear()} entries.` };
          const ids = positionals.ids.map(parseHistoryId);
          if (ids.length === 0 || ids.some((id) => !Number.isInteger(id))) {
            throw new PluginCliError("Pass one or more numeric history ids, or --all", { code: "invalid_value" });
          }
          return { exitCode: 0, stdout: `Deleted ${history.delete(ids)} of ${ids.length} entries.` };
        },
      }),

      "auth reset": cliCommand({
        summary: "Forget cached auth tokens so the next call runs the profile commands again",
        async run() {
          return { exitCode: 0, stdout: `Cleared ${await grpc.resetAuth()} cached token(s).` };
        },
      }),

      "endpoint add": cliCommand({
        summary: "Add or replace a named endpoint",
        positionals: [{ name: "name", description: "Endpoint name, e.g. local, dev, staging, prod", required: true }],
        options: {
          target: { type: "string", required: true, description: "host:port of the gRPC server" },
          transport: { type: "enum", values: transportSchema.options, default: "tls", description: "tls (default), plaintext, or insecure (TLS without verification)" },
          source: { type: "string", description: "Default proto source" },
          auth: { type: "string", description: 'Auth profile for every method (overrides option rules), or "none"' },
          var: { type: "string", repeatable: true, description: "Placeholder value for auth commands, 'name=value' (repeatable)" },
          header: { type: "string", repeatable: true, description: "Static metadata 'name: value' (repeatable)" },
          arg: { type: "string", repeatable: true, description: "Extra grpcurl flag (repeatable; use --arg=-flag)" },
          protected: { type: "boolean", description: "Require confirmation before every call (for prod)" },
          description: { type: "string", description: "Free-form note shown in the UI" },
          replace,
        },
        async run({ positionals, options }) {
          const entry: z.input<typeof endpointSchema> = { name: positionals.name, target: options.target };
          if (options.transport !== "tls") entry.transport = options.transport;
          if (options.source !== undefined) entry.source = options.source;
          if (options.auth !== undefined) entry.auth = options.auth;
          if (options.var.length > 0) entry.vars = Object.fromEntries(options.var.map((raw) => parsePair(raw, "=")));
          if (options.header.length > 0) {
            entry.headers = Object.fromEntries(options.header.map((raw) => parsePair(raw, ":")).map(([name, value]) => [name.toLowerCase(), value]));
          }
          if (options.arg.length > 0) entry.args = options.arg;
          if (options.protected) entry.protected = true;
          if (options.description !== undefined) entry.description = options.description;
          const parsed = endpointSchema.safeParse(entry);
          if (!parsed.success) throw new PluginCliError(parsed.error.issues[0]?.message ?? "Invalid endpoint", { code: "invalid_value" });
          await editSetting("endpoints", upsert(positionals.name, entry, options.replace, "Endpoint"));
          return { exitCode: 0, stdout: `Saved endpoint ${positionals.name} → ${options.target}` };
        },
      }),

      "endpoint remove": cliCommand({
        summary: "Remove a named endpoint",
        positionals: [{ name: "name", description: "Endpoint name", required: true }],
        async run({ positionals }) {
          await editSetting("endpoints", remove(positionals.name, "endpoint"));
          return { exitCode: 0, stdout: `Removed endpoint ${positionals.name}` };
        },
      }),

      "source add": cliCommand({
        summary: "Add or replace a named proto source",
        positionals: [{ name: "name", description: "Source name", required: true }],
        options: {
          kind: { type: "enum", values: SOURCE_KINDS, required: true, description: "reflection, protoDir, protoFiles, protoset, or buf" },
          path: { type: "string", description: "protoDir root or buf input (absolute or ~/)" },
          file: { type: "string", repeatable: true, description: "protoFiles/protoset file (repeatable)" },
          "import-path": { type: "string", repeatable: true, description: "Import path (repeatable)" },
          scan: { type: "string", repeatable: true, description: "protoDir: only scan these root-relative subdirectories (repeatable)" },
          arg: { type: "string", repeatable: true, description: "buf: extra `buf build` flag (repeatable)" },
          replace,
        },
        async run({ positionals, options }) {
          // Built loosely: which fields are allowed depends on the kind, and the schema checks that below.
          const entry: Record<string, unknown> = { name: positionals.name, kind: options.kind };
          if (options.path !== undefined) entry.path = options.path;
          if (options.file.length > 0) entry.files = options.file;
          if (options["import-path"].length > 0) entry.importPaths = options["import-path"];
          if (options.scan.length > 0) entry.scan = options.scan;
          if (options.arg.length > 0) entry.args = options.arg;
          const parsed = sourceSchema.safeParse(entry);
          if (!parsed.success) {
            const issue = parsed.error.issues[0];
            throw new PluginCliError(`${issue?.path.join(".") || "source"}: ${issue?.message ?? "invalid"}`, {
              code: "invalid_value",
              hint: "Run `bb grpc source add --help` for which options each kind takes.",
            });
          }
          await editSetting("sources", upsert(positionals.name, entry as RawSetting<"sources">[number], options.replace, "Source"));
          return { exitCode: 0, stdout: `Saved source ${positionals.name} (${options.kind})` };
        },
      }),

      "source remove": cliCommand({
        summary: "Remove a named proto source",
        positionals: [{ name: "name", description: "Source name", required: true }],
        async run({ positionals }) {
          await editSetting("sources", remove(positionals.name, "source"));
          return { exitCode: 0, stdout: `Removed source ${positionals.name}` };
        },
      }),

      "profile add": cliCommand({
        summary: "Add or replace an auth profile (a command whose output becomes a header)",
        positionals: [{ name: "name", description: "Profile name, e.g. admin", required: true }],
        options: {
          command: { type: "string", required: true, description: "Shell command printing the header value; may use {{target}}, {{host}}, {{port}}, {{endpoint}} and vars" },
          "refresh-command": { type: "string", description: "Run when the command fails or prints an expired JWT" },
          header: { type: "string", default: DEFAULT_PROFILE_HEADER, description: "Metadata key (default authorization)" },
          prefix: { type: "string", description: 'Prepended to the output, e.g. "Bearer "' },
          "refresh-seconds": { type: "integer", min: 1, max: 86_400, description: "Fixed cache lifetime (default: JWT exp, else 300)" },
          var: { type: "string", repeatable: true, description: "Default placeholder value 'name=value' (repeatable)" },
          replace,
        },
        async run({ positionals, options }) {
          const profile: z.input<typeof profileSchema> = { command: options.command };
          if (options.header !== DEFAULT_PROFILE_HEADER) profile.header = options.header.toLowerCase();
          if (options["refresh-command"] !== undefined) profile.refreshCommand = options["refresh-command"];
          if (options.prefix !== undefined) profile.prefix = options.prefix;
          if (options["refresh-seconds"] !== undefined) profile.refreshSeconds = options["refresh-seconds"];
          if (options.var.length > 0) profile.vars = Object.fromEntries(options.var.map((raw) => parsePair(raw, "=")));
          const parsed = profileSchema.safeParse(profile);
          if (!parsed.success) throw new PluginCliError(parsed.error.issues[0]?.message ?? "Invalid profile", { code: "invalid_value" });
          await editSetting("auth", (auth) => {
            if (auth.profiles?.[positionals.name] !== undefined && !options.replace) {
              throw new PluginCliError(`Profile "${positionals.name}" already exists`, { code: "exists", hint: "Pass --replace to overwrite it." });
            }
            return { ...auth, profiles: { ...auth.profiles, [positionals.name]: profile } };
          });
          await grpc.resetAuth().catch(() => 0);
          return { exitCode: 0, stdout: `Saved auth profile ${positionals.name}` };
        },
      }),

      "profile remove": cliCommand({
        summary: "Remove an auth profile",
        positionals: [{ name: "name", description: "Profile name", required: true }],
        async run({ positionals }) {
          await editSetting("auth", (auth) => {
            if (auth.profiles?.[positionals.name] === undefined) throw new PluginCliError(`No profile named "${positionals.name}"`, { code: "not_found" });
            const { [positionals.name]: _removed, ...profiles } = auth.profiles;
            return { ...auth, profiles };
          });
          return { exitCode: 0, stdout: `Removed auth profile ${positionals.name}` };
        },
      }),

      "rule add": cliCommand({
        summary: "Add or replace an auth rule that picks a profile from a custom method or service option",
        description:
          "A rule is identified by its options and field; adding one with the same three replaces it. Methods without an endpoint auth override use the first rule whose option is set.",
        options: {
          ...ruleKeyOptions,
          map: {
            type: "string",
            repeatable: true,
            required: true,
            description: "Option value → profile, 'VALUE=profile', or 'VALUE=none' for no auth (repeatable)",
          },
        },
        async run({ options }) {
          const rule: z.input<typeof authRuleSchema> = {
            ...ruleKey(options),
            profiles: Object.fromEntries(
              options.map.map((raw) => {
                const [value, profile] = parsePair(raw, "=");
                return [value, profile === "none" ? null : profile];
              }),
            ),
          };
          const parsed = authRuleSchema.safeParse(rule);
          if (!parsed.success) throw new PluginCliError(parsed.error.issues[0]?.message ?? "Invalid rule", { code: "invalid_value" });
          let replaced = false;
          await editSetting("auth", (auth) => {
            const rules = auth.rules ?? [];
            const index = rules.findIndex((existing) => sameRule(existing, rule));
            replaced = index !== -1;
            return { ...auth, rules: replaced ? rules.map((existing, position) => (position === index ? rule : existing)) : [...rules, rule] };
          });
          return { exitCode: 0, stdout: `${replaced ? "Replaced" : "Added"} auth rule on ${describeRule(rule)}` };
        },
      }),

      "rule remove": cliCommand({
        summary: "Remove the auth rule with these options and field",
        options: ruleKeyOptions,
        async run({ options }) {
          const key = ruleKey(options);
          await editSetting("auth", (auth) => {
            const rules = auth.rules ?? [];
            if (!rules.some((existing) => sameRule(existing, key))) {
              throw new PluginCliError(`No auth rule on ${describeRule(key)}`, { code: "not_found" });
            }
            return { ...auth, rules: rules.filter((existing) => !sameRule(existing, key)) };
          });
          return { exitCode: 0, stdout: `Removed auth rule on ${describeRule(key)}` };
        },
      }),
    },
  });
}
