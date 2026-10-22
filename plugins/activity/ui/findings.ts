import type { Kind, Summary, SummaryItem, TimelineBucket } from "../contract";
import { formatCount } from "./format";
import { bucketLabel, bucketUnit, DAY } from "./time";

/** A way of sorting and marking rows that a finding switches on. */
export type Emphasis = "mouse-only" | "stale";

export type FindingAction = { type: "show"; kind: Kind | null; emphasis: Emphasis | null } | { type: "pin"; start: number };

export interface Finding {
  id: string;
  /** The part set strong: the number or the name the sentence hangs on. */
  lead: string;
  rest: string;
  /** What Enter does, in two or three words. */
  hint: string;
  action: FindingAction;
}

export const STALE_AFTER = 14 * DAY;
const MOUSE_ONLY_MIN = 3;
const MAX_FINDINGS = 4;

export function isMouseOnly(item: SummaryItem): boolean {
  return item.kind === "click" && item.pointer >= MOUSE_ONLY_MIN && item.keyboard === 0;
}

export function isStale(item: SummaryItem, now: number): boolean {
  return now - item.lastAt >= STALE_AFTER;
}

export function matchesEmphasis(item: SummaryItem, emphasis: Emphasis, now: number): boolean {
  return emphasis === "mouse-only" ? isMouseOnly(item) : isStale(item, now);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const NAME_MAX = 36;
/** A control's label short enough to sit in a sentence; list rows carry their whole text as a label. */
const shortName = (label: string) => (label.length <= NAME_MAX ? label : `${label.slice(0, NAME_MAX - 1).trimEnd()}…`);

/**
 * What the numbers say, as short sentences a key press can act on: controls that want a key, things nobody has
 * touched in two weeks, the busiest stretch, how much of the clicking happens from the keyboard, the most-opened
 * page. Only the ones the data supports; at most four.
 */
export function computeFindings(summary: Summary, buckets: readonly TimelineBucket[], bucketMs: number, rangeMs: number | null, now: number, pinned: number | null = null): Finding[] {
  const findings: Finding[] = [];

  const mouseOnly = summary.items.filter(isMouseOnly);
  if (mouseOnly.length > 0) {
    const names = mouseOnly.slice(0, 2).map((item) => `“${shortName(item.label)}”`);
    const more = mouseOnly.length > 2 ? ` and ${mouseOnly.length - 2} more` : "";
    findings.push({
      id: "mouse-only",
      lead: plural(mouseOnly.length, "control is", "controls are"),
      rest: `only ever clicked with the mouse: ${names.join(", ")}${more}`,
      hint: "show them",
      action: { type: "show", kind: "click", emphasis: "mouse-only" },
    });
  }

  const longRange = rangeMs === null || rangeMs >= 30 * DAY;
  if (longRange && summary.firstAt !== null && now - summary.firstAt >= STALE_AFTER) {
    const stale = summary.items.filter((item) => isStale(item, now));
    if (stale.length > 0) {
      findings.push({
        id: "stale",
        lead: plural(stale.length, "thing has", "things have"),
        rest: "not been used in two weeks",
        hint: "show them",
        action: { type: "show", kind: null, emphasis: "stale" },
      });
    }
  }

  const used = buckets.filter((bucket) => bucket.count > 0);
  if (used.length >= 2) {
    const busiest = used.reduce((best, bucket) => (bucket.count > best.count ? bucket : best));
    findings.push({
      id: "busiest",
      lead: bucketLabel(busiest.start, bucketMs),
      rest: `was the busiest ${bucketUnit(bucketMs)}, with ${formatCount(busiest.count)} events`,
      hint: pinned === busiest.start ? "unpin it" : "pin it",
      action: { type: "pin", start: busiest.start },
    });
  }

  let pointer = 0;
  let keyboard = 0;
  for (const item of summary.items) {
    if (item.kind !== "click") continue;
    pointer += item.pointer;
    keyboard += item.keyboard;
  }
  if (pointer + keyboard >= 5) {
    findings.push({
      id: "keyboard-share",
      lead: `${Math.round((keyboard / (pointer + keyboard)) * 100)}% of clicks`,
      rest: "were made from the keyboard",
      hint: "see the split",
      action: { type: "show", kind: "click", emphasis: null },
    });
  }

  const page = summary.items.find((item) => item.kind === "route");
  if (page !== undefined) {
    findings.push({
      id: "busiest-page",
      lead: page.label,
      rest: `is the most-opened page, ${plural(page.count, "open", "opens")}`,
      hint: "see pages",
      action: { type: "show", kind: "route", emphasis: null },
    });
  }

  return findings.slice(0, MAX_FINDINGS);
}
