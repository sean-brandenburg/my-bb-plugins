import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import type { DiffComment, DiffResult } from "./lib/types";

type Host = ReturnType<typeof createFakePluginHost>;

const patchFor = (body: string) => `diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+${body}\n`;

let host: Host | null = null;
let patch = patchFor("b");
let sent: Array<{ threadId: string; text: string }> = [];

async function load(): Promise<Host> {
  patch = patchFor("b");
  sent = [];
  host = createFakePluginHost({
    pluginId: "diff-view",
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) => makeThreadResponse({ id: threadId, projectId: "proj_1", environmentId: `env_${threadId}` }),
        send: async ({ threadId, input }) => {
          sent.push({ threadId, text: input.map((part) => (part.type === "text" ? part.text : "")).join("") });
          return {};
        },
      },
    },
  });
  await plugin(host.bb);
  host.harness.sdk.stub("environments.get", async () => ({ id: "env_thr_1", mergeBaseBranch: "main" }));
  host.harness.sdk.stub("environments.diff", async () => ({ outcome: "available", diff: { diff: patch, files: "x.ts", mergeBaseRef: "f0d73cb95bf8", shortstat: "", truncated: false } }));
  return host;
}

function call<T>(method: string, input: unknown): Promise<T> {
  if (host === null) throw new Error("plugin not loaded");
  return host.harness.behavior.callRpc(method, input) as Promise<T>;
}

afterEach(async () => {
  await host?.harness.lifecycle.dispose();
  host = null;
});

describe("thread diff", () => {
  it("diffs the thread's environment against its merge base", async () => {
    await load();
    const diff = await call<DiffResult>("diff_get", { threadId: "thr_1" });
    expect(diff).toMatchObject({ source: "environment", baseRef: "f0d73cb95bf8" });
    expect(diff.files).toEqual([expect.objectContaining({ path: "x.ts", additions: 1, deletions: 1 })]);
  });
});

describe("structural diff", () => {
  it("reads both sides against the diff's resolved merge-base sha, not the branch name", async () => {
    await load();
    const reads: Array<{ side: string; target: string; mergeBaseRef?: string }> = [];
    host!.harness.sdk.stub("environments.diffFile", async (args: { side: string; target: string; mergeBaseRef?: string }) => {
      reads.push(args);
      return { path: "x.ts", content: args.side === "old" ? "a\n" : "b\n", contentEncoding: "utf8" };
    });
    const structural = await call<{ oldText: string; newText: string }>("diff_structural", { threadId: "thr_1", path: "x.ts" });
    expect(reads).toEqual([expect.objectContaining({ side: "old", target: "all", mergeBaseRef: "f0d73cb95bf8" }), expect.objectContaining({ side: "new", target: "all", mergeBaseRef: "f0d73cb95bf8" })]);
    expect(structural).toMatchObject({ oldText: "a\n", newText: "b\n" });
  });
});

describe("viewed marks", () => {
  it("lapse once the file's changes differ from what was viewed", async () => {
    await load();
    expect(await call("diff_viewed_set", { threadId: "thr_1", path: "x.ts", viewed: true })).toEqual({ paths: ["x.ts"] });
    expect(await call("diff_viewed_list", { threadId: "thr_1" })).toEqual({ paths: ["x.ts"] });
    patch = patchFor("c");
    expect(await call("diff_viewed_list", { threadId: "thr_1" })).toEqual({ paths: [] });
  });
});

describe("comments", () => {
  it("attaches replies to the root and sends unsent comments to the thread once", async () => {
    await load();
    const root = await call<DiffComment>("diff_comment_add", { threadId: "thr_1", path: "x.ts", line: 1, body: "Why b?" });
    const reply = await call<DiffComment>("diff_comment_add", { threadId: "thr_1", path: "other.ts", body: "Or c", inReplyTo: root.id });
    const nested = await call<DiffComment>("diff_comment_add", { threadId: "thr_1", path: "other.ts", body: "Never mind", inReplyTo: reply.id });
    expect(reply).toMatchObject({ path: "x.ts", line: 1, inReplyTo: root.id });
    expect(nested.inReplyTo).toBe(root.id);

    expect(await call("diff_comments_send", { threadId: "thr_1" })).toEqual({ sent: 3 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.threadId).toBe("thr_1");
    const text = sent[0]!.text;
    expect(text).toContain("- `x.ts:1`: Why b?");
    expect(text).toContain('replying to "Why b?": Or c');

    const { comments } = await call<{ comments: DiffComment[] }>("diff_comments_list", { threadId: "thr_1" });
    expect(comments.every((comment) => comment.applyId !== null)).toBe(true);
    expect(await call("diff_comments_send", { threadId: "thr_1" })).toEqual({ sent: 0 });
    await expect(call("diff_comment_update", { id: root.id, body: "edited" })).rejects.toThrow(/already sent/u);
  });

  it("keeps comments unsent when the thread rejects the message", async () => {
    await load();
    await call("diff_comment_add", { threadId: "thr_1", path: "x.ts", body: "Fix" });
    host!.harness.sdk.stub("threads.send", async () => {
      throw new Error("thread is archived");
    });
    await expect(call("diff_comments_send", { threadId: "thr_1" })).rejects.toThrow(/archived/u);
    const { comments } = await call<{ comments: DiffComment[] }>("diff_comments_list", { threadId: "thr_1" });
    expect(comments[0]!.applyId).toBeNull();
  });

  it("refuses replies to another thread's comments", async () => {
    await load();
    const other = await call<DiffComment>("diff_comment_add", { threadId: "thr_2", path: "x.ts", body: "Elsewhere" });
    await expect(call("diff_comment_add", { threadId: "thr_1", path: "x.ts", body: "Hi", inReplyTo: other.id })).rejects.toThrow(/No comment/u);
  });
});

describe("symbol peek", () => {
  it("rejects paths outside the checkout", async () => {
    await load();
    host!.harness.sdk.stub("system.config", async () => ({ primaryHostId: "host_1" }));
    host!.harness.sdk.stub("environments.get", async () => ({ id: "env_thr_1", path: "/tmp/checkout", hostId: "host_1", mergeBaseBranch: null }));
    await expect(call("symbol_peek_file", { threadId: "thr_1", path: "../etc/passwd", startLine: 1, endLine: 2 })).rejects.toThrow(/Invalid path/u);
  });
});
