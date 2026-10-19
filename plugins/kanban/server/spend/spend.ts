import { homedir } from "node:os";
import { join } from "node:path";
import { addTokens, NO_TOKENS, totalTokens, type Tokens } from "../../shared/spend";
import type { KanbanContext } from "../context";
import { errorMessage } from "../util";
import { SessionTranscripts } from "./transcripts";

const REFRESH_MS = 30_000;
const EVENT_LOOKUPS_AT_ONCE = 8;

/** Tokens each card's threads have used, re-read from the transcripts in the background and published when a total moves. */
export function createSpend(ctx: KanbanContext, root = join(homedir(), ".claude", "projects")) {
  const { bb, stmts, publish } = ctx;
  const transcripts = new SessionTranscripts(root);
  // A bb thread's Claude Code session ids are the providerThreadId on its token-usage events; clearing its context
  // starts a new one, so every id seen is kept.
  const threadSessions = new Map<string, { updatedAt: number; sessions: Set<string> }>();
  let totals = new Map<string, Tokens>();

  async function learnSessions(threadIds: ReadonlySet<string>): Promise<void> {
    const [live, archived] = await Promise.all([bb.sdk.threads.list({ includeHidden: true }), bb.sdk.threads.list({ includeHidden: true, archived: true })]);
    const stale = [...live, ...archived].filter((thread) => threadIds.has(thread.id) && threadSessions.get(thread.id)?.updatedAt !== thread.updatedAt);
    for (let start = 0; start < stale.length; start += EVENT_LOOKUPS_AT_ONCE) {
      await Promise.all(
        stale.slice(start, start + EVENT_LOOKUPS_AT_ONCE).map(async (thread) => {
          const rows = await bb.sdk.threads.events.list({ threadId: thread.id, types: ["thread/tokenUsage/updated"], order: "desc", limit: "100" }).catch(() => null);
          if (rows === null) return;
          const sessions = threadSessions.get(thread.id)?.sessions ?? new Set<string>();
          for (const row of rows) if (row.type === "thread/tokenUsage/updated") sessions.add(row.data.providerThreadId);
          threadSessions.set(thread.id, { updatedAt: thread.updatedAt, sessions });
        }),
      );
    }
  }

  /** Re-reads every card's spend; true when a total changed. */
  async function refresh(): Promise<boolean> {
    const threadsByTicket = new Map<string, Set<string>>();
    for (const { ticket_id, thread_id } of stmts.cardThreads.all()) {
      const threads = threadsByTicket.get(ticket_id) ?? new Set<string>();
      threads.add(thread_id);
      threadsByTicket.set(ticket_id, threads);
    }
    await learnSessions(new Set([...threadsByTicket.values()].flatMap((threads) => [...threads])));
    const sessionsByTicket = new Map<string, Set<string>>();
    for (const [ticketId, threads] of threadsByTicket) {
      sessionsByTicket.set(ticketId, new Set([...threads].flatMap((threadId) => [...(threadSessions.get(threadId)?.sessions ?? [])])));
    }
    await transcripts.refresh([...sessionsByTicket.values()].flatMap((sessions) => [...sessions]));
    const next = new Map<string, Tokens>();
    for (const [ticketId, sessions] of sessionsByTicket) {
      const sum = [...sessions].reduce((total, sessionId) => addTokens(total, transcripts.tokens(sessionId)), NO_TOKENS);
      if (totalTokens(sum) > 0) next.set(ticketId, sum);
    }
    const changed = next.size !== totals.size || [...next].some(([ticketId, sum]) => totalTokens(sum) !== totalTokens(totals.get(ticketId) ?? NO_TOKENS));
    totals = next;
    return changed;
  }

  function registerService(): void {
    bb.background.service("card-spend", {
      async start(signal) {
        while (!signal.aborted) {
          try {
            if (await refresh()) publish();
          } catch (cause) {
            bb.log.warn(`could not read card token spend: ${errorMessage(cause)}`);
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, REFRESH_MS);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
        }
      },
    });
  }

  return {
    /** The card's tokens so far; null before any of its threads has used one. */
    spendOf: (ticketId: string): Tokens | null => totals.get(ticketId) ?? null,
    refresh,
    registerService,
  };
}

export type Spend = ReturnType<typeof createSpend>;
