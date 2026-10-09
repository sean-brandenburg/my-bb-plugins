import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { CallResult } from "../contract.ts";
import { endpointSchema, profileSchema } from "../shared/config.ts";
import { createRegistry, listServices, parseDescriptorSets, typeClosure } from "../shared/descriptors.ts";
import { describeRule, formatDescription, formatMethodLine, parseHistoryId, parsePair } from "./cli-text.ts";
import { SETTINGS, loadConfig, referenceErrors, resolveLaunch, type SettingValues } from "./config.ts";
import { maskMetadata, storedResult } from "./history.ts";
import { remove, upsert } from "./setting-edits.ts";

const defaults = Object.fromEntries(Object.entries(SETTINGS).map(([key, descriptor]) => [key, descriptor.default])) as SettingValues;
const registry = createRegistry(parseDescriptorSets([readFileSync(new URL("../shared/fixtures/shop.protoset", import.meta.url))]));

test("blank settings load as an empty config with the implicit reflection source", () => {
  const config = loadConfig({ ...defaults, grpcurl: "  ", buf: "", defaultSource: " " });
  assert.deepEqual(config.tools, { grpcurl: "grpcurl", buf: "buf" });
  assert.equal(config.defaultSource, "reflection");
  assert.deepEqual(config.sources, [{ name: "reflection", kind: "reflection" }]);
  assert.deepEqual(config.auth, { profiles: {}, rules: [] });
  assert.deepEqual(config.errors, []);
});

test("a broken setting is reported and falls back to empty without hiding the others", () => {
  const config = loadConfig({
    ...defaults,
    endpoints: "[",
    sources: JSON.stringify([{ name: "protos", kind: "protoset", files: ["/p.binpb"] }]),
    auth: "",
  });
  assert.equal(config.endpoints.length, 0);
  assert.deepEqual(
    config.sources.map((source) => source.name),
    ["reflection", "protos"],
  );
  assert.equal(config.errors.length, 1);
  assert.match(config.errors[0]!, /^endpoints: invalid JSON/);
});

test("endpoints and rules naming undefined profiles are config errors", () => {
  const endpoints = [endpointSchema.parse({ name: "dev", target: "a:1", auth: "admin" }), endpointSchema.parse({ name: "off", target: "a:1", auth: "none" })];
  const auth = {
    profiles: { user: profileSchema.parse({ command: "x" }) },
    rules: [{ methodOption: "m.o", field: "f", profiles: { A: "user", B: "ghost", C: null } }],
  };
  assert.deepEqual(referenceErrors(endpoints, auth), ['endpoint "dev" uses unknown auth profile "admin"', 'auth rule maps to unknown profile "ghost"']);
});

test("resolveLaunch picks the requested source, else the endpoint's, else the default", () => {
  const config = loadConfig({
    ...defaults,
    endpoints: JSON.stringify([{ name: "dev", target: "a:1", source: "protos" }, { name: "local", target: "b:2" }]),
    sources: JSON.stringify([{ name: "protos", kind: "protoset", files: ["/p.binpb"] }]),
  });
  assert.equal(resolveLaunch(config, "dev", undefined).source.name, "protos");
  assert.equal(resolveLaunch(config, "dev", "reflection").source.name, "reflection");
  assert.equal(resolveLaunch(config, "local", undefined).source.name, "reflection");
  assert.throws(() => resolveLaunch(config, "prod", undefined), /Unknown endpoint "prod"/);
  assert.throws(() => resolveLaunch(config, "dev", "missing"), /Unknown proto source "missing"/);
});

test("history masks auth, endpoint and credential-looking headers", () => {
  const config = loadConfig({
    ...defaults,
    endpoints: JSON.stringify([{ name: "dev", target: "a:1", headers: { "x-tenant": "t1" } }]),
    auth: JSON.stringify({ profiles: { admin: { command: "x", header: "x-admin" } } }),
  });
  const launch = resolveLaunch(config, "dev", undefined);
  const metadata = ["x-admin", "x-tenant", "cookie", "x-api-key", "x-request-id"].map((name) => ({ name, value: "v" }));
  assert.deepEqual(
    maskMetadata(launch, metadata).map(({ name, value }) => `${name}=${value}`),
    ["x-admin=***", "x-tenant=***", "cookie=***", "x-api-key=***", "x-request-id=v"],
  );
});

test("history drops response bodies that are too large to keep", () => {
  const result: CallResult = {
    method: "a.B/C",
    ok: true,
    status: { code: 0, name: "OK", message: "", details: [] },
    error: null,
    responses: [{ blob: "x".repeat(300 * 1024) }],
    headers: [],
    trailers: [],
    requestMetadata: [],
    auth: null,
    durationMs: 1,
    stderr: "",
  };
  const stored = JSON.parse(storedResult(result)) as CallResult;
  assert.equal(stored.responses.length, 1);
  assert.match(String(stored.responses[0]), /^\(1 response message\(s\), \d+ bytes: too large to keep in history\)$/);
  const small = { ...result, responses: [{ id: "1" }] };
  assert.deepEqual(JSON.parse(storedResult(small)), small);
});

test("CLI pairs and history ids parse the way the commands document", () => {
  assert.deepEqual(parsePair(" Authorization : Bearer a:b ", ":"), ["Authorization", "Bearer a:b"]);
  assert.deepEqual(parsePair("a=b=c", "="), ["a", "b=c"]);
  assert.throws(() => parsePair("=x", "="), /Expected "name=value"/);
  assert.equal(parseHistoryId("#42"), 42);
  assert.equal(parseHistoryId("42"), 42);
  assert.ok(!Number.isInteger(parseHistoryId("x")));
  assert.equal(describeRule({ methodOption: "m.o", field: "f" }), "m.o f");
  assert.equal(describeRule({ methodOption: "m.o", serviceOption: "s.o", field: "f" }), "m.o / s.o f");
});

test("upsert and remove edit named entries, refusing silent overwrites", () => {
  const items = [{ name: "a", v: 1 }];
  assert.deepEqual(upsert("b", { name: "b", v: 2 }, false, "Endpoint")(items), [...items, { name: "b", v: 2 }]);
  assert.deepEqual(upsert("a", { name: "a", v: 3 }, true, "Endpoint")(items), [{ name: "a", v: 3 }]);
  assert.throws(() => upsert("a", { name: "a", v: 3 }, false, "Endpoint")(items), /Endpoint "a" already exists/);
  assert.deepEqual(remove("a", "endpoint")(items), []);
  assert.throws(() => remove("b", "endpoint")(items), /No endpoint named "b"/);
});

test("describe renders the request shape with nested messages, enums and oneofs", () => {
  const rules = [{ methodOption: "acme.auth.v1.method_auth_options", serviceOption: "acme.auth.v1.service_auth_options", field: "auth_type", profiles: {} }];
  const methods = listServices(registry, rules, endpointSchema.parse({ name: "dev", target: "a:1" })).flatMap((service) => service.methods);
  const list = methods.find((method) => method.name === "ListOrders")!;
  assert.equal(formatMethodLine(list), "acme.shop.v1.OrderAPI/ListOrders  [server streaming]");
  assert.equal(
    formatDescription(undefined, typeClosure(registry, "acme.shop.v1.Order")),
    [
      "acme.shop.v1.Order:",
      "  id: string",
      "  status: acme.shop.v1.Order.Status",
      "    values: STATUS_INVALID | STATUS_OPEN",
      "  items: repeated acme.shop.v1.LineItem",
      "    sku: string",
      "    quantity: uint32",
      "  labels: map<string, string>",
      // Well-known types and recursive references are not expanded.
      "  createdAt: google.protobuf.Timestamp",
      "  card: optional string (oneof payment)",
      "  creditCents: optional int64 (oneof payment)",
      "  parent: acme.shop.v1.Order",
    ].join("\n"),
  );
});
