// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { rpcContract, Usage } from "./rpc-contract.js";

// jsdom lays nothing out, so bb-vim-keys would see every row as hidden.
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList;
  };
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

const NOW = Date.now();
const tokens = (output: number, cacheRead = 0) => ({ input: 0, output, cacheRead, cacheWrite: 0 });

const USAGE: Usage = {
  limits: [{ key: "claude-code:five_hour", providerId: "claude-code", providerKey: "five_hour", label: "Five-hour limit", status: "warning", resetsAtMs: NOW + 90 * 60_000, reportedAt: NOW }],
  window: {
    startMs: NOW - 3 * 3_600_000,
    endMs: NOW + 2 * 3_600_000,
    estimated: false,
    tokens: tokens(3000, 40_000),
    sessions: [
      { key: "thr_big", threadId: "thr_big", title: "Big refactor", project: "alpha", tokens: tokens(2000, 30_000) },
      { key: "sess_cli", threadId: null, title: "Poke at a script", project: "scripts", tokens: tokens(1000, 10_000) },
    ],
    others: { count: 0, tokens: tokens(0) },
  },
  days: [
    { day: "2026-10-15", tokens: tokens(10) },
    { day: "2026-10-16", tokens: tokens(0) },
    { day: "2026-10-17", tokens: tokens(3000, 40_000) },
  ],
  scannedAt: NOW,
};

let footer: HTMLElement;
let footerKeys: string[];

beforeEach(() => {
  footerKeys = [];
  footer = document.createElement("div");
  footer.dataset.newThreadFooter = "";
  for (const label of ["No project", "Approve for me"]) {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("keydown", (event) => footerKeys.push(`${label}:${event.key}`));
    footer.append(button);
  }
  document.body.prepend(footer);
});

afterEach(() => {
  footer.remove();
  (document.activeElement as HTMLElement | null)?.blur();
});

async function render() {
  const app = await loadPluginApp(() => import("./app.js"));
  const slot = renderSlot<{ projectId: string | null }, typeof rpcContract>(app.homepageSections[0]!, { projectId: null }, { rpc: { usage: () => USAGE } });
  await slot.findByText("Big refactor");
  return slot;
}

const press = async (key: string) => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

const focused = () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "";

describe("Usage", () => {
  it("shows the limit, the window's threads, and the daily totals", async () => {
    const slot = await render();
    expect(slot.getByText("Five-hour limit")).toBeTruthy();
    expect(slot.getByText("Five-hour limit").parentElement?.textContent).toMatch(/Nearly used.*resets in 1h 30m/);
    expect(slot.getByText("outside bb")).toBeTruthy();
    expect(slot.getByText("This window").parentElement?.textContent).toContain("43k tokens · 3k output · 40k cache read");
    expect(slot.getByLabelText("Today: 43k tokens")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("walks from bb's project bar into the threads and the days", async () => {
    const slot = await render();
    await press("j");
    expect(focused()).toBe("No project");
    await press("l");
    expect(focused()).toBe("Approve for me");
    await press("o");
    expect(footerKeys.at(-1)).toBe("Approve for me:Enter");
    await press("j");
    expect(focused()).toContain("Big refactor");
    expect(slot.container.textContent).toContain("Big refactor32k tokens · 2k output · 30k cache read");
    await press("Enter");
    expect(slot.inspection.sidebarActionCalls).toEqual([expect.objectContaining({ method: "open", threadId: "thr_big" })]);
    await press("G");
    expect(focused()).toBe("Today: 43k tokens");
    await press("h");
    expect(focused()).toBe("Fri, Oct 16: 0 tokens");
    slot.lifecycle.unmount();
    expect(footer.dataset.navRow).toBeUndefined();
  });

  it("toggles the keys with ?", async () => {
    const slot = await render();
    await press("?");
    expect(slot.getByText("Along the project bar and the days")).toBeTruthy();
    await press("Escape");
    expect(slot.queryByText("Along the project bar and the days")).toBeNull();
    slot.lifecycle.unmount();
  });
});
