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
  /** First reported by a re-review that ran after the reviewer last looked. */
  isNew: boolean;
  /** Still open from an earlier review; the earlier finding's id. */
  carriedFrom: string | null;
  /** Its lines changed since the reviewer last looked. */
  touched: boolean;
}

/** A finding at one of its locations: a new-side line, or null for the whole file. */
export interface PlacedFinding {
  item: InlineFinding;
  line: number | null;
}

/**
 * The reviews whose findings still stand, oldest first: back from the newest up to and including the latest full review
 * or the latest re-review that carried every open finding forward. Re-reviews from before carry-over existed stack.
 */
export function activeReviews(reviews: Review[]): Review[] {
  const active: Review[] = [];
  for (const review of reviews.filter((entry) => entry.status === "completed").sort((a, b) => b.createdAt - a.createdAt)) {
    active.push(review);
    if (review.sinceCommitSha === null || review.report?.carriesForward === true) break;
  }
  return active.filter((review) => review.report !== null).reverse();
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
        isNew: newest !== null && review.id === newest.id && newest.sinceCommitSha !== null && (finding.carriedFrom ?? null) === null,
        carriedFrom: finding.carriedFrom?.split("/").pop() ?? null,
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
