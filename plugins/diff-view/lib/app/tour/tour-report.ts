import type { Narrative, SemanticChange, TourState } from "../../types";

export type TourReport = NonNullable<Narrative["report"]>;

/** The finished tour's report; `includeStale` keeps one written for an earlier head. */
export function completedReport(tour: TourState | null, { includeStale }: { includeStale: boolean }): TourReport | null {
  if (tour?.narrative?.status !== "completed") return null;
  if (!includeStale && tour.stale) return null;
  return tour.narrative.report;
}

/** The tour's semantic labels for each file it covers. */
export function semanticsByPath(tour: TourState | null): Map<string, SemanticChange[]> {
  const map = new Map<string, SemanticChange[]>();
  for (const entry of completedReport(tour, { includeStale: true })?.readingOrder ?? []) if (entry.changes.length > 0) map.set(entry.path, entry.changes);
  return map;
}
