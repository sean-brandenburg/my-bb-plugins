import type { FindingSeverity, TourState } from "../types";
import type { PlacedFinding } from "./findings/findings";
import { completedReport } from "./tour/tour-report";

/** Review attention a file needs, 1–5, when the tour has not scored it: its worst finding's severity. */
const SEVERITY_RISK: Record<FindingSeverity, number> = { critical: 5, important: 4, minor: 2 };

/** Each file's review attention: the current tour's score, else the worst review finding in it. */
export function riskByPath(tour: TourState | null, findingsByPath: ReadonlyMap<string, readonly PlacedFinding[]>): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of completedReport(tour, { includeStale: false })?.readingOrder ?? []) if (entry.risk !== null) map.set(entry.path, entry.risk);
  for (const [path, list] of findingsByPath) {
    if (map.has(path)) continue;
    const worst = list.reduce<number>((score, entry) => Math.max(score, SEVERITY_RISK[entry.item.finding.severity]), 0);
    if (worst > 0) map.set(path, worst);
  }
  return map;
}

export const RISK_DOT: Record<number, string> = { 1: "bg-emerald-500", 2: "bg-emerald-400", 3: "bg-amber-500", 4: "bg-orange-500", 5: "bg-red-500" };
