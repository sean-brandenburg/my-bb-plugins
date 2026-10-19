import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { totalTokens } from "../../shared/spend";
import type { KanbanContext } from "../context";
import { createSpend } from "./spend";
import { SessionTranscripts } from "./transcripts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kanban-transcripts-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Each response costs 1 input, `output` output, 100 cache read and 10 cache write tokens.
const assistant = (sessionId: string, id: string, output: number) =>
  JSON.stringify({
    type: "assistant",
    sessionId,
    timestamp: new Date().toISOString(),
    message: { id, usage: { input_tokens: 1, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 } },
  });

async function write(path: string, lines: string[]) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, lines.map((line) => `${line}\n`).join(""));
}

describe("SessionTranscripts", () => {
  it("sums a session's responses once each, with its subagents, and reads only what was added since", async () => {
    const main = join(root, "-code-proj", "s1.jsonl");
    await write(main, [assistant("s1", "msg_1", 5), assistant("s1", "msg_1", 5), JSON.stringify({ type: "user", sessionId: "s1" })]);
    await write(join(root, "-code-proj", "s1", "subagents", "agent-a.jsonl"), [assistant("s1", "msg_2", 7)]);
    await write(join(root, "-code-other", "s2.jsonl"), [assistant("s2", "msg_3", 1000)]);

    const transcripts = new SessionTranscripts(root);
    await transcripts.refresh(["s1"]);
    expect(transcripts.tokens("s1")).toEqual({ input: 2, output: 12, cacheRead: 200, cacheWrite: 20 });

    // A half-written line waits for its newline.
    await appendFile(main, `${assistant("s1", "msg_4", 3)}\n${assistant("s1", "msg_5", 4).slice(0, 20)}`);
    await transcripts.refresh(["s1"]);
    expect(transcripts.tokens("s1").output).toBe(15);
    expect(transcripts.tokens("s2").output).toBe(0);
  });
});

describe("createSpend", () => {
  it("adds up every thread a card started, through the sessions its token-usage events name", async () => {
    await write(join(root, "-proj", "card-session.jsonl"), [assistant("card-session", "msg_1", 5)]);
    await write(join(root, "-proj", "cleared-session.jsonl"), [assistant("cleared-session", "msg_2", 6)]);
    await write(join(root, "-proj", "review-session.jsonl"), [assistant("review-session", "msg_3", 7)]);
    await write(join(root, "-proj", "review-session", "subagents", "agent-a.jsonl"), [assistant("review-session", "msg_4", 8)]);
    const sessions: Record<string, string[]> = { "thr-card": ["card-session", "cleared-session"], "thr-review": ["review-session"], "thr-other": [] };
    const ctx = {
      bb: {
        sdk: {
          threads: {
            list: async ({ archived }: { archived?: boolean }) => (archived ? [] : Object.keys(sessions).map((id) => ({ id, updatedAt: 1 }))),
            events: {
              list: async ({ threadId }: { threadId: string }) =>
                sessions[threadId]!.map((providerThreadId) => ({ type: "thread/tokenUsage/updated", data: { providerThreadId } })),
            },
          },
        },
      },
      stmts: {
        cardThreads: {
          all: () => [
            { ticket_id: "card", thread_id: "thr-card" },
            { ticket_id: "card", thread_id: "thr-review" },
            { ticket_id: "quiet", thread_id: "thr-other" },
          ],
        },
      },
      publish: () => {},
    } as unknown as KanbanContext;

    const spend = createSpend(ctx, root);
    expect(await spend.refresh()).toBe(true);
    expect(spend.spendOf("card")).toEqual({ input: 4, output: 26, cacheRead: 400, cacheWrite: 40 });
    expect(spend.spendOf("quiet")).toBeNull();
    expect(await spend.refresh()).toBe(false);

    await appendFile(join(root, "-proj", "review-session.jsonl"), `${assistant("review-session", "msg_5", 9)}\n`);
    expect(await spend.refresh()).toBe(true);
    expect(totalTokens(spend.spendOf("card")!)).toBe(5 + 35 + 500 + 50);
  });
});
