// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARK_MS, NEW_ROW_ATTR, SETTLE_MS, watchTimelineEntrances } from "./timeline-entrance";

function row(id: string, index: number): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-timeline-row-id", id);
  el.setAttribute("data-index", String(index));
  return el;
}

function list(...rows: HTMLElement[]): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-timeline-items", "");
  el.append(...rows);
  return el;
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const isNew = (el: Element) => el.hasAttribute(NEW_ROW_ATTR);

describe("watchTimelineEntrances", () => {
  let clock: number;
  let pathname: string;
  let dispose: () => void;
  let items: HTMLElement;

  const start = () => {
    dispose = watchTimelineEntrances({ root: document.body, now: () => clock, path: () => pathname });
    clock += SETTLE_MS;
  };

  beforeEach(() => {
    clock = 0;
    pathname = "/threads/a";
    items = list(row("a:0", 0), row("a:1", 1), row("a:2", 2));
    document.body.replaceChildren(items);
  });

  afterEach(() => {
    dispose?.();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("marks a row appended to the tail", async () => {
    start();
    const appended = row("a:3", 3);
    items.append(appended);
    await flush();
    expect(isNew(appended)).toBe(true);
  });

  it("leaves rows realized above the tail alone, as when scrolling up", async () => {
    items.firstElementChild!.remove();
    start();
    const realized = row("a:-1", -1);
    items.prepend(realized);
    await flush();
    expect(isNew(realized)).toBe(false);
  });

  it("leaves a previously shown row alone when it scrolls back into view", async () => {
    start();
    const last = items.lastElementChild!;
    last.remove();
    await flush();
    items.append(last);
    await flush();
    expect(isNew(last)).toBe(false);
  });

  it("treats a batch of rows as virtualizer realization, not new content", async () => {
    start();
    const batch = [row("a:3", 3), row("a:4", 4), row("a:5", 5)];
    items.append(...batch);
    await flush();
    expect(batch.some(isNew)).toBe(false);
  });

  it("leaves a summary row alone when it regroups a row already shown", async () => {
    start();
    const summary = row("t1:work-summary:a:2", 2);
    items.lastElementChild!.replaceWith(summary);
    await flush();
    expect(isNew(summary)).toBe(false);
  });

  it("marks a new row arriving beside a regrouped one", async () => {
    start();
    const summary = row("t1:work-summary:a:2", 2);
    const appended = row("a:3", 3);
    items.lastElementChild!.replaceWith(summary, appended);
    await flush();
    expect(isNew(summary)).toBe(false);
    expect(isNew(appended)).toBe(true);
  });

  it("only treats a whole shown id after a colon as regrouped", async () => {
    items.lastElementChild!.setAttribute("data-timeline-row-id", "a:5");
    start();
    const summary = row("t1:work-summary:a:51", 3);
    items.append(summary);
    await flush();
    expect(isNew(summary)).toBe(true);
  });

  it("marks a user message and status row arriving together", async () => {
    start();
    const pair = [row("a:3", 3), row("a:4", 4)];
    items.append(...pair);
    await flush();
    expect(pair.every(isNew)).toBe(true);
  });

  it("does not cascade a thread switch", async () => {
    start();
    pathname = "/threads/b";
    const next = list(row("b:0", 0));
    items.replaceWith(next);
    await flush();
    const loaded = row("b:1", 1);
    next.append(loaded);
    await flush();
    expect(isNew(loaded)).toBe(false);

    clock += SETTLE_MS;
    const streamed = row("b:2", 2);
    next.append(streamed);
    await flush();
    expect(isNew(streamed)).toBe(true);
  });

  it("ignores rows filling an empty list, as when a thread loads", async () => {
    const empty = list();
    document.body.replaceChildren(empty);
    start();
    const first = row("c:0", 0);
    empty.append(first);
    await flush();
    expect(isNew(first)).toBe(false);
  });

  it("ignores nodes added inside a row, like streaming text", async () => {
    start();
    const span = document.createElement("span");
    span.setAttribute("data-timeline-row-id", "nested");
    span.setAttribute("data-index", "9");
    items.lastElementChild!.append(span);
    await flush();
    expect(isNew(span)).toBe(false);
  });

  it("clears the mark after the entrance so it cannot replay", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    start();
    const appended = row("a:3", 3);
    items.append(appended);
    await flush();
    expect(isNew(appended)).toBe(true);
    vi.advanceTimersByTime(MARK_MS);
    expect(isNew(appended)).toBe(false);
  });

  it("stops observing and clears marks on dispose", async () => {
    start();
    const appended = row("a:3", 3);
    items.append(appended);
    await flush();
    dispose();
    expect(isNew(appended)).toBe(false);

    const later = row("a:4", 4);
    items.append(later);
    await flush();
    expect(isNew(later)).toBe(false);
  });
});
