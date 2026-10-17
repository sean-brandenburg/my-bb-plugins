import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Usage, UsageSession } from "../rpc-contract.js";
import {
  addTokens,
  bucketDays,
  estimateWindow,
  type LimitReport,
  latestWindows,
  NO_TOKENS,
  sessionsBetween,
  totalTokens,
  WINDOW_MS,
} from "../usage-model.js";
import { type SessionInfo, TranscriptIndex } from "./transcripts.js";

export const HISTORY_DAYS = 14;
export const TOP_SESSIONS = 6;
const CACHE_MS = 20_000;
/** Threads whose latest limit report is read; limits are per account, so any recent thread will do. */
const SAMPLED_THREADS = 8;
const WORKTREE_THREAD = /\/worktrees\/(thr_[a-z0-9]+)-\d+(?:\/|$)/;

type Sdk = BbPluginApi["sdk"];

interface ThreadInfo {
  id: string;
  title: string;
  projectId: string;
  updatedAt: number;
}

function startOfHistory(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (HISTORY_DAYS - 1));
  return date.getTime();
}

/** How a session is shown: its bb thread when there is one, else Claude Code's own title and folder. */
export function describeSession(
  sessionId: string,
  thread: ThreadInfo | undefined,
  projects: ReadonlyMap<string, string>,
  session: SessionInfo | undefined,
): Omit<UsageSession, "tokens"> {
  const folder = session?.cwd ? basename(session.cwd) : null;
  if (thread !== undefined) return { key: thread.id, threadId: thread.id, title: thread.title, project: projects.get(thread.projectId) ?? folder };
  return { key: sessionId, threadId: null, title: session?.title ?? folder ?? "Claude Code session", project: folder };
}

export function createUsageService(bb: BbPluginApi, root = join(homedir(), ".claude", "projects")) {
  const index = new TranscriptIndex(root);
  const sessionThreads = new Map<string, string>();
  const scannedAt = new Map<string, number>();
  let cached: { at: number; result: Promise<Usage> } | null = null;

  const listThreads = async (sdk: Sdk): Promise<ThreadInfo[]> => {
    const [live, archived] = await Promise.all([sdk.threads.list({ includeHidden: true }), sdk.threads.list({ includeHidden: true, archived: true })]);
    const byId = new Map<string, ThreadInfo>();
    for (const thread of [...live, ...archived]) {
      byId.set(thread.id, { id: thread.id, title: thread.title ?? thread.titleFallback ?? thread.id, projectId: thread.projectId, updatedAt: thread.updatedAt });
    }
    return [...byId.values()];
  };

  const readLimits = async (threads: readonly ThreadInfo[], now: number) => {
    const sampled = [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SAMPLED_THREADS);
    const reports = await Promise.all(
      sampled.map((thread) =>
        bb.sdk.threads.events
          .list({ threadId: thread.id, types: ["provider/rateLimits/updated"], order: "desc", limit: "1" })
          .then((rows) => rows.flatMap((row): LimitReport[] => (row.type === "provider/rateLimits/updated" ? [{ at: row.createdAt, ...row.data.rateLimits }] : [])))
          .catch((): LimitReport[] => []),
      ),
    );
    return latestWindows(reports.flat(), now);
  };

  // A bb thread's Claude Code session ids are the providerThreadId on its token-usage events; a
  // thread gets a new one when its context is cleared, so every recent one is collected.
  const learnSessions = async (threads: readonly ThreadInfo[], sinceMs: number) => {
    const stale = threads.filter((thread) => thread.updatedAt >= sinceMs && scannedAt.get(thread.id) !== thread.updatedAt);
    await Promise.all(
      stale.map(async (thread) => {
        const rows = await bb.sdk.threads.events
          .list({ threadId: thread.id, types: ["thread/tokenUsage/updated"], order: "desc", limit: "100" })
          .catch(() => []);
        for (const row of rows) {
          if (row.type === "thread/tokenUsage/updated") sessionThreads.set(row.data.providerThreadId, thread.id);
        }
        scannedAt.set(thread.id, thread.updatedAt);
      }),
    );
  };

  const threadOf = (sessionId: string): string | null => {
    const known = sessionThreads.get(sessionId);
    if (known !== undefined) return known;
    const cwd = index.session(sessionId)?.cwd ?? "";
    return WORKTREE_THREAD.exec(cwd)?.[1] ?? null;
  };

  const compute = async (now: number): Promise<Usage> => {
    await index.refresh(startOfHistory(now));
    const records = index.usage();
    const threads = await listThreads(bb.sdk);
    const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
    const [limits, projects] = await Promise.all([
      readLimits(threads, now),
      bb.sdk.projects.list().then((list) => new Map(list.map((project) => [project.id, project.name]))),
    ]);
    const reported = limits.find((limit) => limit.providerKey === "five_hour" && limit.resetsAtMs !== null);
    const estimate = reported === undefined ? estimateWindow(records.map((record) => record.at), now) : null;
    const span =
      reported !== undefined
        ? { startMs: reported.resetsAtMs! - WINDOW_MS, endMs: reported.resetsAtMs!, estimated: false }
        : estimate === null
          ? null
          : { ...estimate, estimated: true };
    let window: Usage["window"] = null;
    if (span !== null) {
      await learnSessions(threads, span.startMs);
      const rows = new Map<string, UsageSession>();
      for (const session of sessionsBetween(records, span.startMs, span.endMs)) {
        const threadId = threadOf(session.sessionId);
        const row = describeSession(session.sessionId, threadId === null ? undefined : threadsById.get(threadId), projects, index.session(session.sessionId));
        const known = rows.get(row.key);
        rows.set(row.key, { ...(known ?? row), tokens: addTokens(known?.tokens ?? NO_TOKENS, session.tokens) });
      }
      const ranked = [...rows.values()].sort((a, b) => totalTokens(b.tokens) - totalTokens(a.tokens));
      const rest = ranked.slice(TOP_SESSIONS);
      window = {
        ...span,
        tokens: ranked.reduce((sum, row) => addTokens(sum, row.tokens), NO_TOKENS),
        sessions: ranked.slice(0, TOP_SESSIONS),
        others: { count: rest.length, tokens: rest.reduce((sum, row) => addTokens(sum, row.tokens), NO_TOKENS) },
      };
    }
    return { limits, window, days: bucketDays(records, HISTORY_DAYS, now), scannedAt: now };
  };

  return {
    usage(refresh: boolean): Promise<Usage> {
      const now = Date.now();
      if (refresh || cached === null || now - cached.at > CACHE_MS) {
        const entry = { at: now, result: compute(now) };
        cached = entry;
        entry.result.catch(() => {
          if (cached === entry) cached = null;
        });
      }
      return cached.result;
    },
  };
}
