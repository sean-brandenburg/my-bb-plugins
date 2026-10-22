// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { rpcContract, Summary, SummaryItem, SummaryQuery, TimelineQuery } from "../contract";
import { bucketOffset, bucketStart, HOUR } from "./time";

// jsdom lays nothing out, so bb-vim-keys would see every row as hidden.
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList;
  };
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

const NOW = Date.now();
const BUCKET = 6 * HOUR;
const BUSIEST = bucketStart(NOW - BUCKET, BUCKET, bucketOffset(BUCKET, NOW));
let queries: SummaryQuery[];
let timelineQueries: TimelineQuery[];

const click = (key: string, count: number, pointer: number, keyboard: number): SummaryItem => ({ plugin: "kanban", kind: "click", key, label: key, count, pointer, keyboard, lastAt: NOW - 120_000 });

const SUMMARY: Summary = {
  total: 12,
  // Three days of log under a 7d range: the strip starts at the first event and buckets by six hours.
  firstAt: NOW - 3 * 86_400_000,
  plugins: [
    { plugin: "kanban", count: 9 },
    { plugin: null, count: 3 },
  ],
  items: [
    click("Refresh board", 6, 4, 2),
    { plugin: "kanban", kind: "command", key: "gg", label: "gg", count: 3, pointer: 0, keyboard: 0, lastAt: NOW - 3_600_000 },
    { plugin: null, kind: "key", key: "<D-k>", label: "<D-k>", count: 3, pointer: 0, keyboard: 0, lastAt: NOW },
  ],
};

/** Eight clicks under one plugin, so its section folds past six. */
const MANY_CLICKS: Summary = {
  ...SUMMARY,
  items: [...SUMMARY.items, ...["Edit", "Cancel", "Save", "Open", "Close", "Archive", "Pin"].map((key, index) => click(key, 7 - index, 7 - index, 0))],
};

let mounted: { lifecycle: { unmount(): void } } | null = null;

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  mounted?.lifecycle.unmount();
  mounted = null;
});

async function render(summary: Summary = SUMMARY) {
  queries = [];
  timelineQueries = [];
  const app = await loadPluginApp(() => import("../app.js"));
  const slot = renderSlot<{ subPath: string }, typeof rpcContract>(app.navPanels[0]!, { subPath: "" }, {
    rpc: {
      summary: (query) => {
        queries.push(query);
        return summary;
      },
      timeline: (query) => {
        timelineQueries.push(query);
        return [
          { start: BUSIEST, count: 9 },
          { start: BUSIEST + BUCKET, count: 3 },
        ];
      },
      record: () => null,
      recent: () => [],
    },
  });
  mounted = slot;
  await slot.findByText("Refresh board");
  await slot.findByText(/was the busiest six hours/);
  return slot;
}

// Enter is left to a focused button for the browser to click, which jsdom doesn't do; o opens the same way.
const press = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
    // A query the key set off goes out on a later tick.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

const focused = () => document.activeElement as HTMLElement | null;
const focusedText = () => focused()?.textContent ?? "";

/** Presses j until the cursor's text matches, so the tests don't count rows above the list. */
async function jumpTo(pattern: RegExp) {
  for (let step = 0; step < 40; step += 1) {
    const onRow = focused()?.closest("[data-nav-row]") !== null && focused() !== null;
    if (onRow && (pattern.test(focusedText()) || pattern.test(focused()?.getAttribute("aria-label") ?? ""))) return;
    await press("j");
  }
  throw new Error(`no row matching ${pattern}`);
}

describe("ActivityPage", () => {
  it("shows the totals, the findings, each plugin's share and split, and its rows by kind", async () => {
    const slot = await render();
    expect(queries[0]).toEqual({ sinceMs: expect.any(Number), untilMs: null, kind: null, plugin: null, limit: 2000 });
    expect(timelineQueries[0]).toMatchObject({ kind: null, plugin: null, bucketMs: BUCKET, untilMs: null });
    expect(slot.getByText(/12 events/).parentElement?.textContent).toMatch(/12 events since/);
    expect(slot.getByText("33% of clicks")).toBeTruthy();
    expect(slot.getByText("were made from the keyboard")).toBeTruthy();
    expect(slot.getByLabelText("Share of events per plugin").textContent).toContain("kanban 75%");
    const groups = slot.container.querySelectorAll('[data-nav-row="group"]');
    expect([...groups].map((group) => group.textContent)).toEqual([expect.stringContaining("kanban"), expect.stringContaining("bb")]);
    expect(groups[0]!.textContent).toContain("9 events, 75%");
    expect(groups[0]!.textContent).toContain("4 / 2");
    // Each kind is named twice: as a filter button and as a section heading.
    for (const name of ["Clicks", "Key commands", "Other keys"]) expect(slot.getByText(name, { selector: "span" })).toBeTruthy();
  });

  it("pins a stretch of the time strip with Enter and clears it with Esc", async () => {
    const slot = await render();
    await jumpTo(/events$/);
    expect(focused()?.closest('[aria-label="Events over time"]')).not.toBeNull();
    const first = focused();
    await press("l");
    expect(focused()).not.toBe(first);
    await press("o");
    const pinned = queries.at(-1)!;
    expect(pinned.untilMs).toBe(pinned.sinceMs! + BUCKET);
    expect(slot.getByText(/^Only /)).toBeTruthy();
    await press("Escape");
    expect(queries.at(-1)!.untilMs).toBeNull();
    expect(slot.queryByText(/^Only /)).toBeNull();
  });

  it("acts on a finding, then puts things back with Esc", async () => {
    const slot = await render();
    await jumpTo(/was the busiest/);
    await press("o");
    expect(queries.at(-1)!.sinceMs).toBe(BUSIEST);
    await press("Escape");
    await jumpTo(/33% of clicks/);
    await press("o");
    expect(queries.at(-1)!.kind).toBe("click");
  });

  it("marks mouse-only controls first when that finding is chosen, and shows a kind's remaining rows on request", async () => {
    const slot = await render(MANY_CLICKS);
    expect(slot.getByText("5 controls are")).toBeTruthy();
    expect(slot.queryByText("Pin")).toBeNull();
    await jumpTo(/^2 more controls$/);
    await press("o");
    expect(slot.getByText("Pin")).toBeTruthy();
    await jumpTo(/5 controls are/);
    for (let step = 0; step < 40 && !/5 controls are/.test(focusedText()); step += 1) await press("k");
    await press("o");
    expect(queries.at(-1)!.kind).toBe("click");
    expect(slot.getByText("Mouse-only controls first")).toBeTruthy();
    const rows = [...slot.container.querySelectorAll('[data-nav-row="item"]')].map((row) => row.textContent ?? "");
    expect(rows.findIndex((text) => text.startsWith("Edit"))).toBeLessThan(rows.findIndex((text) => text.startsWith("Refresh board")));
    await press("Escape");
    expect(slot.queryByText("Mouse-only controls first")).toBeNull();
  });

  it("walks the rows, closes a plugin with h twice, changes the range with 4 and the kind with c, and filters with /", async () => {
    const slot = await render();
    await jumpTo(/^▾kanban/);
    await press("j");
    expect(focusedText()).toContain("Refresh board");
    await press("h");
    expect(focusedText()).toContain("kanban");
    expect(slot.getByText("Refresh board")).toBeTruthy();
    await press("h");
    expect(slot.queryByText("Refresh board")).toBeNull();
    await press("l");
    expect(slot.getByText("Refresh board")).toBeTruthy();
    await press("4");
    expect(queries.at(-1)!.sinceMs).toBeNull();
    await press("c");
    expect(queries.at(-1)!.kind).toBe("click");
    await press("/");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Filter rows");
    await act(async () => {
      const box = document.activeElement as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(box, "gg");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(slot.queryByText("Refresh board")).toBeNull();
    expect(slot.getByText("gg")).toBeTruthy();
    await press("Escape");
    expect(document.activeElement?.getAttribute("aria-label")).not.toBe("Filter rows");
    await press("Escape");
    expect(slot.getByText("Refresh board")).toBeTruthy();
  });

  it("toggles the keys with ?", async () => {
    const slot = await render();
    await press("?");
    expect(slot.getByText("Reread the log")).toBeTruthy();
    await press("Escape");
    expect(slot.queryByText("Reread the log")).toBeNull();
  });
});
