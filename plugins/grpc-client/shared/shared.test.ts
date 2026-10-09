import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { endpointSchema, profileSchema, renderTemplate, sourceSchema, type AuthRule } from "./config.ts";
import { createRegistry, findMethod, listServices, parseDescriptorSets, typeClosure } from "./descriptors.ts";
import {
  connectionArgs,
  grpcurlCommand,
  headerEnv,
  invokeArgs,
  parseErrorStatus,
  parseVerboseOutput,
  requestBody,
  sourceArgs,
  splitJsonArray,
} from "./grpcurl.ts";
import { matchMethods } from "./schema.ts";

const registry = createRegistry(parseDescriptorSets([readFileSync(new URL("./fixtures/shop.protoset", import.meta.url))]));
const endpoint = endpointSchema.parse({ name: "dev", target: "api.example.com:443" });
const rules: AuthRule[] = [
  {
    methodOption: "acme.auth.v1.method_auth_options",
    serviceOption: "acme.auth.v1.service_auth_options",
    field: "auth_type",
    profiles: { AUTH_TYPE_ADMIN: "admin", AUTH_TYPE_USER: "user", AUTH_TYPE_UNAUTHENTICATED: null },
  },
];

test("auth rules prefer the method option, then fall back to the service option", () => {
  const services = listServices(registry, rules, endpoint);
  const orders = services.find((service) => service.typeName === "acme.shop.v1.OrderAPI")!;
  const [get, list, cancel] = orders.methods;
  assert.deepEqual([cancel?.auth, cancel?.authReason], ["user", "AUTH_TYPE_USER (service option)"]);
  assert.deepEqual([get?.auth, get?.authReason], ["user", "AUTH_TYPE_USER (service option)"]);
  assert.deepEqual([list?.auth, list?.authReason], ["admin", "AUTH_TYPE_ADMIN (method option)"]);
  assert.equal(list?.authValue, "AUTH_TYPE_ADMIN");
  assert.equal(list?.kind, "server_streaming");
  assert.equal(get?.comment, "Gets one order.");
  assert.equal(orders.comment, "Manages orders.");
  const ping = services.find((service) => service.typeName === "acme.shop.v1.PingAPI")!.methods[0];
  assert.deepEqual([ping?.auth, ping?.authReason], [null, null]);
});

test("an endpoint auth override wins over rules", () => {
  const forced = endpointSchema.parse({ name: "x", target: "a:1", auth: "admin" });
  const none = endpointSchema.parse({ name: "x", target: "a:1", auth: "none" });
  const method = listServices(registry, rules, forced).find((service) => service.typeName === "acme.shop.v1.OrderAPI")!.methods[0];
  assert.equal(method?.auth, "admin");
  const disabled = listServices(registry, rules, none).find((service) => service.typeName === "acme.shop.v1.OrderAPI")!.methods[0];
  assert.equal(disabled?.auth, null);
});

test("type closure covers nested messages, enums, maps, oneofs and recursion", () => {
  const closure = typeClosure(registry, "acme.shop.v1.Order");
  assert.deepEqual(Object.keys(closure.messages).sort(), [
    "acme.shop.v1.LineItem",
    "acme.shop.v1.Order",
    "google.protobuf.Timestamp",
  ]);
  assert.deepEqual(Object.keys(closure.enums), ["acme.shop.v1.Order.Status"]);
  const order = closure.messages["acme.shop.v1.Order"]!;
  const byName = Object.fromEntries(order.fields.map((field) => [field.name, field]));
  assert.equal(byName.items?.cardinality, "list");
  assert.equal(byName.labels?.cardinality, "map");
  assert.equal(byName.labels?.mapKey, "string");
  assert.equal(byName.card?.oneof, "payment");
  assert.equal(byName.credit_cents?.scalar, "int64");
  assert.equal(byName.created_at?.jsonName, "createdAt");
  assert.deepEqual(order.oneofs, ["payment"]);
  const request = typeClosure(registry, "acme.shop.v1.ListOrdersRequest").messages["acme.shop.v1.ListOrdersRequest"]!;
  assert.deepEqual(
    request.fields.map((field) => [field.name, field.optional]),
    [
      ["page_size", false],
      ["cursor", true],
    ],
  );
  assert.equal(typeClosure(registry, "acme.shop.v1.GetOrderRequest").messages["acme.shop.v1.GetOrderRequest"]?.fields[0]?.comment, "The order id.");
});

test("findMethod accepts slash and dot forms", () => {
  assert.equal(findMethod(registry, "acme.shop.v1.OrderAPI/GetOrder")?.name, "GetOrder");
  assert.equal(findMethod(registry, "acme.shop.v1.OrderAPI.ListOrders")?.name, "ListOrders");
  assert.equal(findMethod(registry, "acme.shop.v1.OrderAPI/Nope"), undefined);
});

test("templates expand built-ins and endpoint vars over profile defaults", () => {
  const profile = profileSchema.parse({
    command: "auth-cli get --address={{authAddress}}{{flags}}",
    vars: { authAddress: "{{target}}", flags: "" },
  });
  assert.equal(renderTemplate(profile.command, endpoint, profile), "auth-cli get --address=api.example.com:443");
  const local = endpointSchema.parse({ name: "local", target: "localhost:1", vars: { authAddress: "localhost:13370", flags: " --insecure" } });
  assert.equal(renderTemplate(profile.command, local, profile), "auth-cli get --address=localhost:13370 --insecure");
  assert.throws(() => renderTemplate("{{missing}}", endpoint, profile), /Unknown placeholder \{\{missing\}\}/);
  assert.equal(renderTemplate("{{host}}/{{port}}/{{endpoint}}", endpoint, profile), "api.example.com/443/dev");
});

const VERBOSE = `
Resolved method descriptor:
// Gets one order.
rpc GetOrder ( .acme.shop.v1.GetOrderRequest ) returns ( .acme.shop.v1.Order );

Request metadata to send:
authorization: Bearer secret
x-team: core

Response headers received:
content-type: application/grpc
server: envoy

Response contents:
{
  "id": "1"
}

Response contents:
{
  "id": "2"
}

Response trailers received:
(empty)
Sent 1 request and received 2 responses
`;

test("verbose output parses metadata, every response and the summary", () => {
  const parsed = parseVerboseOutput(VERBOSE);
  assert.deepEqual(parsed.requestMetadata, [
    ["authorization", "Bearer secret"],
    ["x-team", "core"],
  ]);
  assert.deepEqual(parsed.headers, [
    ["content-type", "application/grpc"],
    ["server", "envoy"],
  ]);
  assert.deepEqual(parsed.responses, [{ id: "1" }, { id: "2" }]);
  assert.deepEqual(parsed.trailers, []);
  assert.equal(parsed.summary, "Sent 1 request and received 2 responses");
});

test("error status comes from the exit code and the JSON on stderr", () => {
  const stderr = '{\n  "code": 16,\n  "message": "missing token",\n  "details": []\n}\n';
  assert.deepEqual(parseErrorStatus(stderr, 64 + 16), { code: 16, name: "Unauthenticated", message: "missing token", details: [] });
  assert.equal(parseErrorStatus("Failed to dial target host", 1), null);
  assert.deepEqual(parseErrorStatus("ERROR: weird", 64 + 14), { code: 14, name: "Unavailable", message: "ERROR: weird", details: [] });
});

test("invoke args reference header values through the environment", () => {
  const args = invokeArgs({
    protoset: "/cache/x.binpb",
    connection: ["-plaintext"],
    headerNames: ["authorization"],
    timeoutSeconds: 30,
    target: "localhost:1",
    method: "a.B/C",
  });
  assert.ok(args.includes("authorization: ${BB_GRPC_HEADER_0}"));
  assert.deepEqual(args.slice(-5), ["30", "-d", "@", "localhost:1", "a.B/C"]);
});

test("splitJsonArray keeps each element's source text, so big integers survive", () => {
  assert.deepEqual(splitJsonArray('[{"id": 9007199254740993}, {"s": "a,]}"} ,{}]'), ['{"id": 9007199254740993}', '{"s": "a,]}"}', "{}"]);
  assert.deepEqual(splitJsonArray("[]"), []);
  assert.deepEqual(splitJsonArray('[ "x\\"" , 1 ]'), ['"x\\""', "1"]);
});

test("matchMethods only matches on name segment boundaries", () => {
  const methods = ["a.v1.OrderAPI/GetOrder", "a.v1.OrderAPI/BatchGetOrder", "a.v1.MyOrderAPI/GetOrder", "a.v1.OrderAPI/CancelOrder"].map((fullName) => ({ fullName }));
  const names = (name: string) => matchMethods(methods, name).map((method) => method.fullName);
  assert.deepEqual(names("Order"), []);
  assert.deepEqual(names("BatchGetOrder"), ["a.v1.OrderAPI/BatchGetOrder"]);
  assert.deepEqual(names("GetOrder"), ["a.v1.OrderAPI/GetOrder", "a.v1.MyOrderAPI/GetOrder"]);
  assert.deepEqual(names("OrderAPI.GetOrder"), ["a.v1.OrderAPI/GetOrder"]);
  assert.deepEqual(names("OrderAPI/GetOrder"), ["a.v1.OrderAPI/GetOrder"]);
  assert.deepEqual(names("a.v1.OrderAPI.GetOrder"), ["a.v1.OrderAPI/GetOrder"]);
});

test("request bodies forward the original text: one object, or one line per streamed message", () => {
  assert.equal(requestBody("  ", false), "{}");
  assert.equal(requestBody('{"id": 9007199254740993}', false), '{"id": 9007199254740993}');
  assert.equal(requestBody('[{"id": 9007199254740993}, {}]', true), '{"id": 9007199254740993}\n{}');
  assert.equal(requestBody("{}", true), "{}");
  assert.throws(() => requestBody("[{}]", false), { message: "Request must be a JSON object" });
  assert.throws(() => requestBody("[1]", true), { message: "Each streamed message must be a JSON object" });
  assert.throws(() => requestBody("1", true), { message: "Request must be a JSON object or an array of objects" });
  assert.throws(() => requestBody("{", false), /^Error: Request is not valid JSON: /);
});

test("connection and source flags", () => {
  assert.deepEqual(connectionArgs(endpointSchema.parse({ name: "a", target: "a:1", transport: "plaintext", args: ["-authority", "x"] })), ["-plaintext", "-authority", "x"]);
  assert.deepEqual(connectionArgs(endpointSchema.parse({ name: "a", target: "a:1", transport: "insecure" })), ["-insecure"]);
  assert.deepEqual(connectionArgs(endpoint), []);
  const dir = sourceSchema.parse({ name: "d", kind: "protoDir", path: "/p", importPaths: ["/i"] });
  assert.deepEqual(sourceArgs(dir, ["a.proto"]), ["-import-path", "/p", "-import-path", "/i", "-proto", "a.proto"]);
  assert.deepEqual(sourceArgs(sourceSchema.parse({ name: "s", kind: "protoset", files: ["/a.binpb"] }), []), ["-protoset", "/a.binpb"]);
  assert.deepEqual(sourceArgs(sourceSchema.parse({ name: "r", kind: "reflection" }), []), []);
});

test("header values travel in the environment, never in argv", () => {
  const { names, env } = headerEnv(
    [
      ["authorization", "Bearer value"],
      ["x-tenant", "t1"],
    ],
    { PATH: "/bin" },
  );
  assert.deepEqual(names, ["authorization", "x-tenant"]);
  assert.deepEqual(env, { PATH: "/bin", BB_GRPC_HEADER_0: "Bearer value", BB_GRPC_HEADER_1: "t1" });
});

test("copied grpcurl commands keep secrets out: env lookups for endpoint headers, $(...) for the token", () => {
  const withHeaders = endpointSchema.parse({ name: "dev", target: "api.example.com:443", headers: { "x-tenant": "t1" }, args: ["-authority", "a b"] });
  const command = grpcurlCommand({
    protoset: "/cache/my set.binpb",
    endpoint: withHeaders,
    token: { header: "authorization", prefix: "Bearer ", command: "auth-cli token --for dev" },
    metadata: [{ name: "x-note", value: 'say "$hi"' }],
    body: '{"id": "1"}',
    method: "a.B/C",
  });
  assert.equal(
    command,
    [
      "grpcurl -protoset '/cache/my set.binpb' -authority 'a b'",
      '-H "x-tenant: ${X_TENANT:?}"',
      '-H "authorization: Bearer $(auth-cli token --for dev)"',
      String.raw`-H "x-note: say \"\$hi\""`,
      `-d '{"id": "1"}' api.example.com:443 a.B/C`,
    ].join(" "),
  );
  const overriding = grpcurlCommand({ protoset: "/p", endpoint: withHeaders, token: null, metadata: [{ name: "x-tenant", value: "mine" }], body: "{}", method: "a.B/C" });
  assert.equal(overriding, `grpcurl -protoset /p -authority 'a b' -H "x-tenant: mine" -d '{}' api.example.com:443 a.B/C`);
});
