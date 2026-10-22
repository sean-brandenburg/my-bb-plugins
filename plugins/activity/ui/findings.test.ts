import { describe, expect, it } from "vitest";
import type { Summary, SummaryItem } from "../contract";
import { computeFindings } from "./findings";
import { DAY, HOUR } from "./time";

const NOW = Date.UTC(2026, 9, 22, 18);

const item = (overrides: Partial<SummaryItem>): SummaryItem => ({
  plugin: "kanban",
  kind: "click",
  key: "Edit",
  label: "Edit",
  count: 4,
  pointer: 4,
  keyboard: 0,
  lastAt: NOW,
  ...overrides,
});

const summary = (items: SummaryItem[], firstAt = NOW - DAY): Summary => ({
  total: items.reduce((sum, row) => sum + row.count, 0),
  plugins: [],
  items,
  firstAt,
});

describe("findings", () => {
  it("names mouse-only controls, the keyboard share, the busiest stretch, and the top page, in that order", () => {
    const found = computeFindings(
      summary([
        item({}),
        item({ key: "Cancel", label: "Cancel", count: 3, pointer: 3 }),
        item({ key: "Open", label: "Open", count: 10, pointer: 1, keyboard: 9 }),
        item({ kind: "route", key: "/plugins/kanban/board", label: "/plugins/kanban/board", count: 12, pointer: 0, keyboard: 0 }),
      ]),
      [
        { start: NOW - 2 * HOUR, count: 3 },
        { start: NOW - HOUR, count: 9 },
        { start: NOW, count: 1 },
      ],
      HOUR,
      DAY,
      NOW,
    );
    expect(found.map((finding) => finding.id)).toEqual(["mouse-only", "busiest", "keyboard-share", "busiest-page"]);
    expect(found[0]!.lead).toBe("2 controls are");
    expect(found[0]!.rest).toContain("“Edit”, “Cancel”");
    expect(found[0]!.action).toEqual({ type: "show", kind: "click", emphasis: "mouse-only" });
    expect(found[1]!.action).toEqual({ type: "pin", start: NOW - HOUR });
    expect(found[2]!.lead).toBe("53% of clicks");
    expect(found[3]!.action).toEqual({ type: "show", kind: "route", emphasis: null });
  });

  it("only reports stale things on a long range once the log is old enough, and says nothing without data", () => {
    const old = [item({ lastAt: NOW - 20 * DAY, pointer: 1 })];
    expect(computeFindings(summary(old, NOW - 40 * DAY), [], DAY, 7 * DAY, NOW).map((finding) => finding.id)).toEqual([]);
    expect(computeFindings(summary(old, NOW - 10 * DAY), [], DAY, null, NOW).map((finding) => finding.id)).toEqual([]);
    const stale = computeFindings(summary(old, NOW - 40 * DAY), [], DAY, null, NOW);
    expect(stale.map((finding) => finding.id)).toEqual(["stale"]);
    expect(stale[0]!.lead).toBe("1 thing has");
    expect(computeFindings(summary([]), [], HOUR, DAY, NOW)).toEqual([]);
  });

  it("keeps to four findings", () => {
    const found = computeFindings(
      summary([item({}), item({ kind: "route", key: "/", label: "/", pointer: 0, keyboard: 0, count: 5 }), item({ key: "Save", label: "Save", pointer: 2, keyboard: 3, lastAt: NOW - 30 * DAY })], NOW - 40 * DAY),
      [
        { start: NOW - DAY, count: 2 },
        { start: NOW, count: 3 },
      ],
      DAY,
      null,
      NOW,
    );
    expect(found).toHaveLength(4);
    expect(found.map((finding) => finding.id)).toEqual(["mouse-only", "stale", "busiest", "keyboard-share"]);
  });
});
