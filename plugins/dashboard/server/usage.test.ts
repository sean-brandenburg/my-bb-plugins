import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { totalTokens } from "../usage-model.js";
import { TranscriptIndex } from "./transcripts.js";
import { createUsageService } from "./usage.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dashboard-transcripts-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const assistant = (sessionId: string, id: string, at: number, output: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "assistant",
    sessionId,
    timestamp: new Date(at).toISOString(),
    message: { id, usage: { input_tokens: 1, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 } },
    ...extra,
  });

async function writeSession(dir: string, sessionId: string, lines: string[]) {
  await mkdir(join(root, dir), { recursive: true });
  const path = join(root, dir, `${sessionId}.jsonl`);
  await writeFile(path, lines.map((line) => `${line}\n`).join(""));
  return path;
}

describe("TranscriptIndex", () => {
  it("reads responses once each, with subagents under their parent session", async () => {
    const now = Date.now();
    await writeSession("-proj", "s1", [
      assistant("s1", "msg_1", now, 5, { cwd: "/code/proj" }),
      assistant("s1", "msg_1", now, 5, { cwd: "/code/proj" }),
      JSON.stringify({ type: "ai-title", aiTitle: "Fix the build", sessionId: "s1" }),
      JSON.stringify({ type: "user", sessionId: "s1", message: { content: "hi" } }),
    ]);
    await mkdir(join(root, "-proj", "s1", "subagents"), { recursive: true });
    await writeFile(join(root, "-proj", "s1", "subagents", "agent-a.jsonl"), `${assistant("s1", "msg_2", now, 7, { isSidechain: true })}\n`);
    const index = new TranscriptIndex(root);
    await index.refresh(now - 1000);
    expect(index.usage().map((record) => [record.sessionId, record.output]).sort()).toEqual([
      ["s1", 5],
      ["s1", 7],
    ]);
    expect(index.session("s1")).toEqual({ title: "Fix the build", cwd: "/code/proj" });
  });

  it("reads only what was appended, and waits for a line to be finished", async () => {
    const now = Date.now();
    const path = await writeSession("-proj", "s1", [assistant("s1", "msg_1", now, 5)]);
    const index = new TranscriptIndex(root);
    await index.refresh(now - 1000);
    const half = assistant("s1", "msg_2", now, 9);
    await appendFile(path, half.slice(0, 40));
    await index.refresh(now - 1000);
    expect(index.usage()).toHaveLength(1);
    await appendFile(path, `${half.slice(40)}\n`);
    await index.refresh(now - 1000);
    expect(index.usage().map((record) => record.output).sort()).toEqual([5, 9]);
  });

  it("forgets responses older than the history it keeps", async () => {
    const now = Date.now();
    await writeSession("-proj", "s1", [assistant("s1", "msg_old", now - 20 * 86_400_000, 5), assistant("s1", "msg_new", now, 6)]);
    const index = new TranscriptIndex(root);
    await index.refresh(now - 86_400_000);
    expect(index.usage().map((record) => record.output)).toEqual([6]);
  });
});

function fakeBb(options: { resetsAtMs: number | null; now: number }): BbPluginApi {
  const threads = [
    { id: "thr_main", title: "Main work", titleFallback: null, projectId: "proj_a", updatedAt: options.now, archivedAt: null },
    { id: "thr_cleared", title: "Cleared twice", titleFallback: null, projectId: "proj_a", updatedAt: options.now - 1000, archivedAt: null },
    { id: "thr_wt", title: "In a worktree", titleFallback: null, projectId: "proj_a", updatedAt: options.now - 86_400_000, archivedAt: null },
  ];
  const events: Record<string, unknown[]> = {
    thr_main: [
      ...(options.resetsAtMs === null
        ? []
        : [
            {
              type: "provider/rateLimits/updated",
              createdAt: options.now - 60_000,
              data: { rateLimits: { providerId: "claude-code", windows: [{ label: "Five-hour limit", providerKey: "five_hour", status: "allowed", resetsAtMs: options.resetsAtMs }] } },
            },
          ]),
      { type: "thread/tokenUsage/updated", createdAt: options.now, data: { providerThreadId: "sess_main" } },
    ],
    thr_cleared: [
      { type: "thread/tokenUsage/updated", createdAt: options.now, data: { providerThreadId: "sess_cleared_2" } },
      { type: "thread/tokenUsage/updated", createdAt: options.now - 5000, data: { providerThreadId: "sess_cleared_1" } },
    ],
  };
  return {
    sdk: {
      threads: {
        list: async (args: { archived?: boolean }) => (args.archived ? [] : threads),
        events: {
          list: async (args: { threadId: string; types: string[] }) => (events[args.threadId] ?? []).filter((event) => args.types.includes((event as { type: string }).type)),
        },
      },
      projects: { list: async () => [{ id: "proj_a", name: "alpha" }] },
    },
  } as unknown as BbPluginApi;
}

describe("usage service", () => {
  it("ranks the window's usage by bb thread, merging a thread's sessions", async () => {
    const now = Date.now();
    const resetsAtMs = now + 60 * 60_000;
    await writeSession("-alpha", "sess_main", [assistant("sess_main", "m1", now - 60_000, 500)]);
    await writeSession("-alpha", "sess_cleared_1", [assistant("sess_cleared_1", "m2", now - 120_000, 50)]);
    await writeSession("-alpha", "sess_cleared_2", [assistant("sess_cleared_2", "m3", now - 30_000, 70)]);
    await writeSession("-Users-me--bb-worktrees-thr_wt-1-alpha", "sess_wt", [assistant("sess_wt", "m4", now - 30_000, 20, { cwd: "/Users/me/.bb/worktrees/thr_wt-1/alpha" })]);
    await writeSession("-elsewhere", "sess_cli", [assistant("sess_cli", "m5", now - 30_000, 30, { cwd: "/Users/me/code/elsewhere" }), JSON.stringify({ type: "ai-title", aiTitle: "Poke at a script", sessionId: "sess_cli" })]);
    await writeSession("-alpha", "sess_before", [assistant("sess_before", "m6", resetsAtMs - 6 * 3_600_000, 999)]);

    const usage = await createUsageService(fakeBb({ resetsAtMs, now }), root).usage(true);
    expect(usage.limits).toEqual([expect.objectContaining({ providerKey: "five_hour", status: "allowed", resetsAtMs })]);
    expect(usage.window).toMatchObject({ startMs: resetsAtMs - 5 * 3_600_000, endMs: resetsAtMs, estimated: false });
    expect(usage.window!.sessions.map((session) => [session.title, session.threadId, session.project, session.tokens.output])).toEqual([
      ["Main work", "thr_main", "alpha", 500],
      ["Cleared twice", "thr_cleared", "alpha", 120],
      ["Poke at a script", null, "elsewhere", 30],
      ["In a worktree", "thr_wt", "alpha", 20],
    ]);
    expect(totalTokens(usage.window!.tokens)).toBe(500 + 70 + 50 + 30 + 20 + 5 * 111);
    expect(usage.days).toHaveLength(14);
  });

  it("estimates the window from activity when no reset has been reported", async () => {
    const now = Date.now();
    await writeSession("-alpha", "sess_main", [assistant("sess_main", "m1", now - 60_000, 5)]);
    const usage = await createUsageService(fakeBb({ resetsAtMs: null, now }), root).usage(true);
    expect(usage.limits).toEqual([]);
    expect(usage.window).toMatchObject({ estimated: true });
    expect(usage.window!.startMs).toBeLessThanOrEqual(now - 60_000);
  });
});
