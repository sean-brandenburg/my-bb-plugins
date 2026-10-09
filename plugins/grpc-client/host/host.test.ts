import assert from "node:assert/strict";
import { test } from "node:test";
import type { Launch } from "../contract.ts";
import { authSchema, endpointSchema, profileSchema } from "../shared/config.ts";
import { createTokenCache, jwtSecondsRemaining, requestHeaders, tokenTtlSeconds } from "./auth.ts";
import type { ShellResult } from "./process.ts";
import { protoBatches } from "./sources.ts";

const NOW = 1_700_000_000_000;
/** A structurally valid, unsigned JWT; only `exp` matters here. */
const fakeJwt = (expSeconds: number) => `x.${Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url")}.y`;
const endpoint = endpointSchema.parse({ name: "dev", target: "api.example.com:443" });

test("jwtSecondsRemaining reads exp, with or without a Bearer prefix", () => {
  assert.equal(jwtSecondsRemaining(fakeJwt(NOW / 1000 + 60), NOW), 60);
  assert.equal(jwtSecondsRemaining(`Bearer ${fakeJwt(NOW / 1000 - 5)}`, NOW), -5);
  assert.equal(jwtSecondsRemaining("opaque-token", NOW), null);
  assert.equal(jwtSecondsRemaining("a.b.c", NOW), null);
});

test("token lifetime: fixed when configured, capped by the JWT's exp less a margin, at least 5s", () => {
  const plain = profileSchema.parse({ command: "x" });
  const fixed = profileSchema.parse({ command: "x", refreshSeconds: 600 });
  assert.equal(tokenTtlSeconds(plain, "opaque", NOW), 300);
  assert.equal(tokenTtlSeconds(fixed, "opaque", NOW), 600);
  assert.equal(tokenTtlSeconds(plain, fakeJwt(NOW / 1000 + 3600), NOW), 3570);
  assert.equal(tokenTtlSeconds(fixed, fakeJwt(NOW / 1000 + 3600), NOW), 600);
  assert.equal(tokenTtlSeconds(fixed, fakeJwt(NOW / 1000 + 100), NOW), 70);
  assert.equal(tokenTtlSeconds(plain, fakeJwt(NOW / 1000 + 10), NOW), 5);
});

function fakeShell(outputs: Record<string, ShellResult[]>) {
  const calls: string[] = [];
  const run = async (command: string): Promise<ShellResult> => {
    calls.push(command);
    const next = outputs[command]?.shift();
    if (next === undefined) throw new Error(`unexpected command ${command}`);
    return next;
  };
  return { calls, run };
}

test("a failing token command triggers the refresh command, then runs again", async () => {
  const profile = profileSchema.parse({ command: "get {{host}}", refreshCommand: "login {{endpoint}}", prefix: "Bearer " });
  const shell = fakeShell({
    "get api.example.com": [{ ok: false, error: "not logged in" }, { ok: true, value: "fresh" }],
    "login dev": [{ ok: true, value: "done" }],
  });
  const cache = createTokenCache(shell.run, () => NOW);
  assert.equal(await cache.value("user", profile, endpoint), "Bearer fresh");
  assert.deepEqual(shell.calls, ["get api.example.com", "login dev", "get api.example.com"]);
  assert.equal(await cache.value("user", profile, endpoint), "Bearer fresh", "cached until it expires");
  assert.equal(shell.calls.length, 3);
});

test("an expired JWT is refreshed; a non-expired one is used as is", async () => {
  const profile = profileSchema.parse({ command: "get", refreshCommand: "login" });
  const expired = fakeJwt(NOW / 1000 + 10);
  const valid = fakeJwt(NOW / 1000 + 3600);
  const shell = fakeShell({ get: [{ ok: true, value: expired }, { ok: true, value: valid }], login: [{ ok: true, value: "ok" }] });
  const cache = createTokenCache(shell.run, () => NOW);
  assert.equal(await cache.value("user", profile, endpoint), valid);
  assert.deepEqual(shell.calls, ["get", "login", "get"]);
});

test("refresh and command failures name the profile", async () => {
  const refreshing = profileSchema.parse({ command: "get", refreshCommand: "login" });
  const failingRefresh = fakeShell({ get: [{ ok: false, error: "no" }], login: [{ ok: false, error: "denied" }] });
  await assert.rejects(createTokenCache(failingRefresh.run, () => NOW).value("user", refreshing, endpoint), {
    message: 'Auth profile "user": refresh failed: denied',
  });
  const plain = profileSchema.parse({ command: "get" });
  const failing = fakeShell({ get: [{ ok: false, error: "no" }] });
  await assert.rejects(createTokenCache(failing.run, () => NOW).value("admin", plain, endpoint), { message: 'Auth profile "admin": no' });
});

test("concurrent requests share one command run; forget and reset drop cached values", async () => {
  const profile = profileSchema.parse({ command: "get" });
  const shell = fakeShell({ get: [{ ok: true, value: "one" }, { ok: true, value: "two" }, { ok: true, value: "three" }] });
  let now = NOW;
  const cache = createTokenCache(shell.run, () => now);
  assert.deepEqual(await Promise.all([cache.value("p", profile, endpoint), cache.value("p", profile, endpoint)]), ["one", "one"]);
  cache.forget("p");
  assert.equal(await cache.value("p", profile, endpoint), "two");
  now += 301_000;
  assert.equal(await cache.value("p", profile, endpoint), "three", "re-fetched after the default 5 minutes");
  assert.equal(cache.reset(), 1);
  assert.equal(cache.reset(), 0);
});

test("request headers: endpoint, then auth, then per-call metadata; only config and auth values are masked", async () => {
  const launch: Launch = {
    endpoint: endpointSchema.parse({ name: "dev", target: "a:1", headers: { "x-tenant": "t1", authorization: "from-config" }, auth: "admin" }),
    source: { name: "reflection", kind: "reflection" },
    auth: authSchema.parse({ profiles: { admin: { command: "x", prefix: "Bearer " }, user: { command: "y", header: "x-user" } } }),
    tools: { grpcurl: "grpcurl", buf: "buf" },
  };
  const fetched: string[] = [];
  const profileValue = async (name: string) => {
    fetched.push(name);
    return `token-for-${name}`;
  };
  const endpointAuth = await requestHeaders(launch, null, [{ name: "x-tenant", value: "t2" }], profileValue);
  assert.deepEqual(endpointAuth.entries, [
    ["x-tenant", "t2"],
    ["authorization", "token-for-admin"],
  ]);
  assert.deepEqual([...endpointAuth.masked], ["authorization"]);
  const ruleAuth = await requestHeaders(launch, "user", [], profileValue);
  assert.deepEqual(ruleAuth.entries.at(-1), ["x-user", "token-for-user"]);
  const overridden = await requestHeaders(launch, null, [{ name: "authorization", value: "mine" }], profileValue);
  assert.deepEqual(overridden.entries, [
    ["x-tenant", "t1"],
    ["authorization", "mine"],
  ]);
  assert.deepEqual(fetched, ["admin", "user"], "an overridden auth header never runs its command");
  await assert.rejects(requestHeaders(launch, "ghost", [], profileValue), { message: 'Unknown auth profile "ghost"' });
});

test("proto batches stay under the argv budget and never come out empty", () => {
  assert.deepEqual(protoBatches(["a.proto", "b.proto", "c.proto"], 1000), [["a.proto", "b.proto", "c.proto"]]);
  assert.deepEqual(protoBatches(["a.proto", "b.proto", "c.proto"], 30), [["a.proto", "b.proto"], ["c.proto"]]);
  assert.deepEqual(protoBatches(["a-very-long-name.proto"], 10), [["a-very-long-name.proto"]]);
  assert.deepEqual(protoBatches([]), [[]]);
});
