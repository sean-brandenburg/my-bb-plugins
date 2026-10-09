import type { DiffDelta, Finding, FindingSeverity, Review } from "../../types";
import { rangesOverlap } from "../ranges";

export const SEVERITY_LABEL: Record<FindingSeverity, string> = { critical: "Critical", important: "Important", minor: "Minor" };

/** A review finding placed in the diff, with the apply-round selection it carries. */
export interface InlineFinding {
  reviewId: string;
  finding: Finding;
  selected: boolean;
  overridden: boolean;
  edited: boolean;
  /** From a review that ran after the reviewer last looked. */
  isNew: boolean;
  /** Its lines changed since the reviewer last looked. */
  touched: boolean;
}

/** A finding at one of its locations: a new-side line, or null for the whole file. */
export interface PlacedFinding {
  item: InlineFinding;
  line: number | null;
}

/**
 * The reviews whose findings still stand: the latest full review plus every incremental one after it, oldest first.
 * Earlier full reviews are superseded.
 */
export function activeReviews(reviews: Review[]): Review[] {
  const completed = reviews.filter((review) => review.status === "completed" && review.report !== null).sort((a, b) => a.createdAt - b.createdAt);
  let lastFull = -1;
  completed.forEach((review, index) => {
    if (review.sinceCommitSha === null) lastFull = index;
  });
  return lastFull === -1 ? completed : completed.slice(lastFull);
}

/** The active reviews' findings by file, once per location; `delta` marks the ones whose lines changed since the last look. */
export function inlineFindingsByPath(reviews: Review[], delta: DiffDelta | null): Map<string, PlacedFinding[]> {
  const byPath = new Map<string, PlacedFinding[]>();
  const active = activeReviews(reviews);
  const newest = active.at(-1) ?? null;
  const changedRanges = new Map((delta?.files ?? []).map((file) => [file.path, file.ranges]));
  for (const review of active) {
    if (review.report === null) continue;
    for (const finding of review.report.findings) {
      const touched = finding.locations.some((location) => {
        const ranges = changedRanges.get(location.file);
        return ranges !== undefined && location.startLine !== null && rangesOverlap(location.startLine, location.endLine ?? location.startLine, ranges);
      });
      const item: InlineFinding = {
        reviewId: review.id,
        finding,
        selected: review.selection[finding.id] ?? false,
        overridden: finding.id in review.selectionOverrides,
        edited: finding.id in review.findingEdits,
        isNew: newest !== null && review.id === newest.id && newest.sinceCommitSha !== null,
        touched,
      };
      for (const location of finding.locations) {
        const list = byPath.get(location.file) ?? [];
        list.push({ item, line: location.startLine });
        byPath.set(location.file, list);
      }
    }
  }
  return byPath;
}
