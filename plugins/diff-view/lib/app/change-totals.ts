import type { useSdk } from "@get-bb/plugin-sdk/app";

export interface ChangeTotals {
  files: number;
  additions: number;
  deletions: number;
}

export const NO_CHANGES: ChangeTotals = { files: 0, additions: 0, deletions: 0 };

type Sdk = ReturnType<typeof useSdk>;

// Shared across every button for a thread, so a board of cards and the open card's panel fetch each thread once per
// update, and keyboard handlers that render no button can still read what the buttons show.
const known = new Map<string, { key: string; totals: ChangeTotals }>();
const pending = new Map<string, Promise<ChangeTotals>>();

/** The same status bb's own changes panel reads: uncommitted files (untracked too) plus the branch's commits since its merge base. */
export function fetchChangeTotals(sdk: Pick<Sdk, "environments">, threadId: string, environmentId: string, key: string): Promise<ChangeTotals> {
  const pendingKey = `${threadId}:${key}`;
  const inFlight = pending.get(pendingKey);
  if (inFlight !== undefined) return inFlight;
  const request = sdk.environments
    .status({ environmentId })
    .then(
      (status) => {
        if (status.outcome !== "available") return NO_CHANGES;
        const byPath = new Map<string, { insertions: number | null; deletions: number | null }>();
        for (const file of status.workspace.mergeBase?.files ?? []) byPath.set(file.path, file);
        for (const file of status.workspace.workingTree.files) byPath.set(file.path, file);
        const files = [...byPath.values()];
        return {
          files: files.length,
          additions: files.reduce((sum, file) => sum + (file.insertions ?? 0), 0),
          deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
        };
      },
      () => NO_CHANGES,
    )
    .then((totals) => {
      rememberChangeTotals(threadId, key, totals);
      return totals;
    })
    .finally(() => pending.delete(pendingKey));
  pending.set(pendingKey, request);
  return request;
}

/** Records totals that needed no fetch, such as a thread with no environment. */
export function rememberChangeTotals(threadId: string, key: string, totals: ChangeTotals): void {
  known.set(threadId, { key, totals });
}

/** The key the thread's last fetched totals were for, so a caller can skip a refetch. */
export function knownChangeTotalsKey(threadId: string): string | null {
  return known.get(threadId)?.key ?? null;
}

/** The last totals any button fetched for the thread; null when none has yet. */
export function knownChangeTotals(threadId: string): ChangeTotals | null {
  return known.get(threadId)?.totals ?? null;
}
