import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { NO_CHANGES, fetchChangeTotals, knownChangeTotals, knownChangeTotalsKey, rememberChangeTotals, type ChangeTotals } from "./change-totals";

const REFRESH_DELAY_MS = 2_000;

/**
 * A thread's change totals as bb's changes panel counts them, refetched shortly after the thread updates.
 * Null until the first fetch lands, and for a thread the sidebar doesn't list, so callers decide what unknown means.
 */
export function useThreadChangeTotals(thread: PluginSidebarThread | null | undefined): ChangeTotals | null {
  const sdk = useSdk();
  const threadId = thread?.id ?? null;
  const environmentId = thread === undefined || thread === null ? undefined : (thread.environment?.id ?? null);
  const updatedAt = thread?.updatedAt ?? null;
  const [totals, setTotals] = useState<{ threadId: string; totals: ChangeTotals } | null>(null);
  useEffect(() => {
    if (threadId === null || environmentId === undefined) return;
    if (environmentId === null) {
      rememberChangeTotals(threadId, "none", NO_CHANGES);
      setTotals({ threadId, totals: NO_CHANGES });
      return;
    }
    const key = `${environmentId}:${updatedAt ?? ""}`;
    const cached = knownChangeTotals(threadId);
    if (cached !== null) setTotals({ threadId, totals: cached });
    if (knownChangeTotalsKey(threadId) === key) return;
    let cancelled = false;
    // Only a refetch waits: a working thread updates constantly, and its first totals shouldn't.
    const timer = window.setTimeout(
      () => {
        void fetchChangeTotals(sdk, threadId, environmentId, key).then((next) => {
          if (!cancelled) setTotals({ threadId, totals: next });
        });
      },
      cached === null ? 0 : REFRESH_DELAY_MS,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [environmentId, sdk, threadId, updatedAt]);
  return totals !== null && totals.threadId === threadId ? totals.totals : null;
}
