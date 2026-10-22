// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { rpcContract, Summary, SummaryQuery } from "../contract";

// jsdom lays nothing out, so bb-vim-keys would see every row as hidden.
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList;
  };
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

const NOW = Date.now();
let queries: SummaryQuery[];

const SUMMARY: Summary = {
  total: 12,
  firstAt: NOW - 86_400_000,
  plugins: [
    { plugin: "kanban", count: 9 },
    { plugin: null, count: 3 },
  ],
  items: [
    { plugin: "kanban", kind: "click", key: "Refresh board", label: "Refresh board", count: 6, pointer: 4, keyboard: 2, lastAt: NOW - 120_000 },
    { plugin: "kanban", kind: "command", key: "gg", label: "gg", count: 3, pointer: 0, keyboard: 0, lastAt: NOW - 3_600_000 },
    { plugin: null, kind: "key", key: "<D-k>", label: "<D-k>", count: 3, pointer: 0, keyboard: 0, lastAt: NOW },
  ],
};

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

async function render() {
  queries = [];
  const app = await loadPluginApp(() => import("../app.js"));
  const slot = renderSlot<{ subPath: string }, typeof rpcContract>(app.navPanels[0]!, { subPath: "" }, {
    rpc: {
      summary: (query) => {
        queries.push(query);
        return SUMMARY;
      },
      record: () => null,
      recent: () => [],
    },
  });
  await slot.findByText("Refresh board");
  return slot;
}

const press = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
};

const focused = () => (document.activeElement as HTMLElement | null)?.textContent ?? "";

describe("ActivityPage", () => {
  it("lists what was used under each plugin, busiest first", async () => {
    const slot = await render();
    expect(queries[0]).toEqual({ sinceMs: expect.any(Number), kind: null, plugin: null, limit: 2000 });
    expect(slot.getByText("12 events · logging since", { exact: false })).toBeTruthy();
    const groups = slot.container.querySelectorAll('[data-nav-row="group"]');
    expect([...groups].map((group) => group.textContent)).toEqual([expect.stringContaining("kanban"), expect.stringContaining("bb")]);
    expect(slot.getByText("4 mouse · 2 keyboard")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("walks the rows, closes a plugin with h twice, changes the range with 4 and the kind with c, and filters with /", async () => {
    const slot = await render();
    await press("j");
    await press("j");
    await press("j");
    expect(focused()).toContain("kanban");
    await press("j");
    expect(focused()).toContain("Refresh board");
    await press("h");
    expect(focused()).toContain("kanban");
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
    slot.lifecycle.unmount();
  });

  it("toggles the keys with ?", async () => {
    const slot = await render();
    await press("?");
    expect(slot.getByText("Reread the log")).toBeTruthy();
    await press("Escape");
    expect(slot.queryByText("Reread the log")).toBeNull();
    slot.lifecycle.unmount();
  });
});
