import { useSdk } from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";

export type LimitStatus = "allowed" | "warning" | "blocked" | "unknown";

export interface LimitReport {
  /** When the provider reported it (the event's time). */
  at: number;
  providerId: string;
  windows: readonly { label: string | null; providerKey: string | null; status: LimitStatus; resetsAtMs: number | null }[];
}

export interface LimitWindow {
  key: string;
  providerId: string;
  label: string;
  status: LimitStatus;
  resetsAtMs: number | null;
  reportedAt: number;
}

/** Threads whose latest report is read; limits are per account, so any recent thread will do. */
export const SAMPLED_THREADS = 8;
const REFRESH_MS = 60_000;

/**
 * Each provider window's newest report. A window whose reset has passed is dropped, since its
 * report describes a window that has ended.
 */
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

/**
 * The newest usage-limit report among the given threads (ids, most recent first). `version` is
 * anything that changes when those threads do, so a finished turn refetches.
 */
export function useLimitWindows(threadIds: readonly string[], version: number): { windows: LimitWindow[]; loaded: boolean } {
  const sdk = useSdk();
  const [reports, setReports] = useState<LimitReport[] | null>(null);
  const [tick, setTick] = useState(0);
  const key = threadIds.join(",");
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const ids = key === "" ? [] : key.split(",");
    void Promise.all(
      ids.map((threadId) =>
        sdk.threads.events
          .list({ threadId, types: ["provider/rateLimits/updated"], order: "desc", limit: "1", signal: controller.signal })
          .then((rows) => rows.flatMap((row): LimitReport[] => (row.type === "provider/rateLimits/updated" ? [{ at: row.createdAt, ...row.data.rateLimits }] : [])))
          .catch((): LimitReport[] => []),
      ),
    ).then((results) => {
      if (!controller.signal.aborted) setReports(results.flat());
    });
    return () => controller.abort();
  }, [sdk, key, version, tick]);
  return { windows: latestWindows(reports ?? [], Date.now()), loaded: reports !== null };
}
