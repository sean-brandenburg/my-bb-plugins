import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRegistry, parseDescriptorSets, typeClosure } from "../shared/descriptors.ts";
import type { FieldInfo } from "../shared/schema.ts";
import { defaultElement, exampleMessage, hasUnsafeIntegers, readField, typeLabel, writeField } from "./proto-json.ts";

const registry = createRegistry(parseDescriptorSets([readFileSync(new URL("../shared/fixtures/shop.protoset", import.meta.url))]));
const closure = typeClosure(registry, "acme.shop.v1.Order");
const order = closure.messages["acme.shop.v1.Order"]!;
const field = (name: string): FieldInfo => order.fields.find((candidate) => candidate.name === name)!;

test("example messages fill every field once, take the first oneof member, and cut recursion", () => {
  const example = exampleMessage("acme.shop.v1.Order", closure);
  assert.equal(typeof example.createdAt, "string");
  assert.ok(!Number.isNaN(Date.parse(example.createdAt as string)));
  assert.deepEqual(
    { ...example, createdAt: "<now>" },
    {
      id: "",
      status: "STATUS_INVALID",
      items: [{ sku: "", quantity: 0 }],
      labels: { key: "" },
      createdAt: "<now>",
      card: "",
      parent: {},
    },
  );
  assert.deepEqual(exampleMessage("acme.shop.v1.Missing", closure), {});
});

test("new elements start from the proto3 JSON zero value; plain messages start empty", () => {
  assert.equal(defaultElement(field("id"), closure), "");
  assert.equal(defaultElement(field("status"), closure), "STATUS_INVALID");
  assert.equal(defaultElement(field("credit_cents"), closure), "0", "64-bit integers are strings");
  assert.equal(defaultElement(closure.messages["acme.shop.v1.LineItem"]!.fields[1]!, closure), 0);
  assert.deepEqual(defaultElement(field("items"), closure), {});
  assert.equal(typeof defaultElement(field("created_at"), closure), "string");
});

test("type labels read like the proto declaration", () => {
  assert.equal(typeLabel(field("items")), "repeated LineItem");
  assert.equal(typeLabel(field("labels")), "map<string, string>");
  assert.equal(typeLabel(field("card")), "optional string");
  assert.equal(typeLabel(field("created_at")), "Timestamp");
});

test("fields read by JSON or proto name and are written back under the JSON name", () => {
  const createdAt = field("created_at");
  assert.equal(readField({ created_at: "a" }, createdAt), "a");
  assert.equal(readField({ createdAt: "b", created_at: "a" }, createdAt), "b");
  assert.equal(readField({}, { ...createdAt, name: "toString", jsonName: "toString" }), undefined, "inherited properties are not fields");
  assert.deepEqual(writeField({ created_at: "a", id: "1" }, createdAt, "c"), { id: "1", createdAt: "c" });
  assert.deepEqual(writeField({ createdAt: "c" }, createdAt, undefined), {});
});

test("hasUnsafeIntegers flags only integer literals JavaScript would round", () => {
  assert.equal(hasUnsafeIntegers('{"id": 9007199254740991}'), false);
  assert.equal(hasUnsafeIntegers('{"id": 9007199254740993}'), true);
  assert.equal(hasUnsafeIntegers('{"id": -9007199254740993}'), true);
  assert.equal(hasUnsafeIntegers('{"id": "9007199254740993"}'), false, "strings are safe");
  assert.equal(hasUnsafeIntegers('{"s": "\\" 9007199254740993"}'), false, "escaped quotes do not end the string");
  assert.equal(hasUnsafeIntegers('{"x": 1.5e3, "y": 12345678901234567890.5}'), false);
  assert.equal(hasUnsafeIntegers('{"x": 1e999}'), true);
});
