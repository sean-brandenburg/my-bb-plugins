export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const NO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function addTokens(a: Tokens, b: Tokens): Tokens {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}

export function totalTokens(tokens: Tokens): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
}

/** One API response from a Claude Code transcript. */
export interface UsageRecord extends Tokens {
  at: number;
  sessionId: string;
}

export const WINDOW_MS = 5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The five-hour window `now` falls in, worked out from activity alone for when no provider has
 * reported its reset: a window opens at the hour of the first response after the last one closed.
 * Null when the last window has closed.
 */
export function estimateWindow(times: readonly number[], now: number): { startMs: number; endMs: number } | null {
  let start: number | null = null;
  for (const at of [...times].sort((a, b) => a - b)) {
    if (at > now) break;
    if (start === null || at >= start + WINDOW_MS) start = Math.floor(at / HOUR_MS) * HOUR_MS;
  }
  if (start === null || now >= start + WINDOW_MS) return null;
  return { startMs: start, endMs: start + WINDOW_MS };
}

/** The local calendar day of `at`, as `YYYY-MM-DD`. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The last `count` local days ending today, oldest first, each with its tokens. */
export function bucketDays(records: readonly UsageRecord[], count: number, now: number): { day: string; tokens: Tokens }[] {
  const days: string[] = [];
  const cursor = new Date(now);
  for (let index = 0; index < count; index += 1) {
    days.unshift(dayKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() - 1);
  }
  const sums = new Map<string, Tokens>(days.map((day) => [day, NO_TOKENS]));
  for (const record of records) {
    const day = dayKey(record.at);
    const sum = sums.get(day);
    if (sum !== undefined) sums.set(day, addTokens(sum, record));
  }
  return days.map((day) => ({ day, tokens: sums.get(day)! }));
}

/** Tokens per session between `startMs` and `endMs`, largest first. */
export function sessionsBetween(records: readonly UsageRecord[], startMs: number, endMs: number): { sessionId: string; tokens: Tokens }[] {
  const sums = new Map<string, Tokens>();
  for (const record of records) {
    if (record.at < startMs || record.at >= endMs) continue;
    sums.set(record.sessionId, addTokens(sums.get(record.sessionId) ?? NO_TOKENS, record));
  }
  return [...sums].map(([sessionId, tokens]) => ({ sessionId, tokens })).sort((a, b) => totalTokens(b.tokens) - totalTokens(a.tokens));
}

export type LimitStatus = "allowed" | "warning" | "blocked" | "unknown";

export interface LimitReport {
  at: number;
  providerId: string;
  windows: readonly { label: string | null; providerKey: string | null; status: LimitStatus; resetsAtMs: number | null }[];
}

export interface LimitWindow {
  key: string;
  providerId: string;
  providerKey: string | null;
  label: string;
  status: LimitStatus;
  resetsAtMs: number | null;
  reportedAt: number;
}

/** Each provider window's newest report; a window whose reset has passed has ended, so it's dropped. */
export function latestWindows(reports: readonly LimitReport[], now: number): LimitWindow[] {
  const byKey = new Map<string, LimitWindow>();
  for (const report of reports) {
    for (const window of report.windows) {
      const key = `${report.providerId}:${window.providerKey ?? window.label ?? "limit"}`;
      const known = byKey.get(key);
      if (known !== undefined && known.reportedAt >= report.at) continue;
      byKey.set(key, {
        key,
        providerId: report.providerId,
        providerKey: window.providerKey,
        label: window.label ?? "Usage limit",
        status: window.status,
        resetsAtMs: window.resetsAtMs,
        reportedAt: report.at,
      });
    }
  }
  return [...byKey.values()]
    .filter((window) => window.resetsAtMs === null || window.resetsAtMs > now)
    .sort((a, b) => a.providerId.localeCompare(b.providerId) || (a.resetsAtMs ?? Infinity) - (b.resetsAtMs ?? Infinity));
}
