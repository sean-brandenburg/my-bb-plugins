// @vitest-environment jsdom

import { keymapConflicts, unboundHelpKeys } from "bb-vim-keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BB_SEARCH_KEYS, KEY_HELP, mountSettingsKeys, PAGE_KEYMAP, SEARCH_BOX_KEYMAP, SIDEBAR_KEYMAP } from "./settings-keys.js";

const row = (label: string) => `
  <div data-settings-anchor="${label}">
    <div data-control-placement="inline">
      <div class="min-w-0 flex-1"><div><p class="text-sm">${label}</p></div></div>
      <div><button role="switch" aria-label="${label}"></button></div>
    </div>
  </div>`;

const PAGES: Record<string, string> = {
  "/settings": `<h2>Git</h2>${row("New branch prefix")}`,
  "/settings/appearance": `<h2>Appearance</h2>${row("Theme")}${row("Fade inactive splits")}`,
  "/settings/plugins/vim-mode": `<h2>Configuration</h2>${row("Start in insert mode")}`,
};

/** What bb's search finds for a query, and the page each result opens. */
const RESULTS: Record<string, [label: string, href: string][]> = {
  fade: [["Fade inactive splits", "/settings/appearance"]],
  in: [
    ["Fade inactive splits", "/settings/appearance"],
    ["Start in insert mode", "/settings/plugins/vim-mode"],
  ],
};

const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
const flush = async () => {
  for (let i = 0; i < 4; i++) await nextFrame();
};

function open(href: string, flash?: string) {
  window.history.pushState(null, "", href);
  document.querySelector("[data-page-scroll-viewport]")!.innerHTML = PAGES[href] ?? "";
  if (flash) document.querySelector(`[data-settings-anchor="${flash}"]`)!.classList.add("bb-search-flash");
}

/** Stands in for bb 0.46's settings sidebar and its search combobox, which keeps focus while it opens a result. */
function renderSettings(path = "/settings") {
  window.history.replaceState(null, "", path);
  document.body.innerHTML = `
    <div data-testid="settings-sidebar-body">
      <div data-testid="settings-sidebar-top-reserve-row">
        <label><input placeholder="Search" aria-label="Search settings" role="combobox" /></label>
      </div>
      <div data-sidebar="content">
        <div><a href="/settings">General</a><a href="/settings/appearance">Appearance</a></div>
        <div>Plugins</div>
        <div><a href="/settings/plugins/vim-mode">Vim Mode</a></div>
        <div><a href="/settings/archived">Archived threads</a></div>
      </div>
    </div>
    <main><div data-app-content-shell><main><div data-page-scroll-viewport>${PAGES[path]}</div></main></div></main>`;
  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-sidebar] a")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(link.getAttribute("href")!);
    });
  }
  const box = searchBox();
  const state = { highlight: 0, arrows: [] as string[] };
  box.addEventListener("keydown", (event) => {
    const results = RESULTS[box.value] ?? [];
    if (event.defaultPrevented) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      state.arrows.push(event.key);
      state.highlight = (state.highlight + (event.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length);
    } else if (event.key === "Escape") {
      box.value = "";
    } else if (event.key === "Enter" && results[state.highlight]) {
      const [label, href] = results[state.highlight]!;
      box.value = "";
      setTimeout(() => open(href, label), 0);
    }
  });
  return state;
}

const searchBox = () => document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')!;
const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
const cursorText = () => document.querySelector("[data-settings-search-cursor]")?.textContent?.trim() ?? null;

let cleanup: (() => void) | null = null;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom lays nothing out; everything rendered counts as on screen.
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return (this.isConnected ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount(path = "/settings") {
  const box = renderSettings(path);
  cleanup = mountSettingsKeys(document, window);
  await flush();
  return box;
}

describe("mountSettingsKeys", () => {
  it("keeps vim-mode out of bb's search box", async () => {
    await mount();
    expect(searchBox().hasAttribute("data-vim-ignore")).toBe(true);
  });

  it("moves through bb's search results with Ctrl-n and Ctrl-p", async () => {
    const box = await mount();
    searchBox().focus();
    searchBox().value = "in";
    press(searchBox(), "n", { ctrlKey: true });
    press(searchBox(), "p", { ctrlKey: true });
    expect(box.arrows).toEqual(["ArrowDown", "ArrowUp"]);
    // Typing stays typing.
    expect(press(searchBox(), "j")).toBe(true);
  });

  it("leaves bb's Escape to clear a query, and hands the keys back from an empty box", async () => {
    await mount("/settings/appearance");
    searchBox().focus();
    searchBox().value = "fade";
    press(searchBox(), "Escape");
    expect(searchBox().value).toBe("");
    expect(document.activeElement).toBe(searchBox());
    press(searchBox(), "Escape");
    expect(document.activeElement).not.toBe(searchBox());
    expect(cursorText()).toBe("Appearance");
  });

  it("puts the page cursor on a setting picked from the search, with focus back on the keys", async () => {
    await mount();
    searchBox().focus();
    searchBox().value = "in";
    press(searchBox(), "n", { ctrlKey: true });
    press(searchBox(), "Enter");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();
    expect(window.location.pathname).toBe("/settings/plugins/vim-mode");
    expect(cursorText()).toContain("Start in insert mode");
    expect(document.activeElement).not.toBe(searchBox());
    // The keys carry on in the page's settings, not the page list.
    press(document.body, "k");
    expect(window.location.pathname).toBe("/settings/plugins/vim-mode");
  });

  it("walks the page list with j and k until l moves into the page's settings", async () => {
    await mount();
    press(document.body, "j");
    expect(window.location.pathname).toBe("/settings/appearance");
    expect(cursorText()).toBe("Appearance");
    press(document.body, "j");
    expect(window.location.pathname).toBe("/settings/plugins/vim-mode");
    press(document.body, "k");
    expect(window.location.pathname).toBe("/settings/appearance");

    press(document.body, "l");
    expect(cursorText()).toContain("Theme");
    press(document.body, "j");
    expect(cursorText()).toContain("Fade inactive splits");

    press(document.body, "h");
    expect(cursorText()).toBe("Appearance");
    press(document.body, "l");
    expect(cursorText()).toContain("Fade inactive splits");
  });

  it("jumps to the first or last page on gg and G", async () => {
    await mount("/settings/appearance");
    press(document.body, "G");
    expect(window.location.pathname).toBe("/settings/archived");
    press(document.body, "g");
    press(document.body, "g");
    expect(window.location.pathname).toBe("/settings");
  });

  it("leaves a text box on the page on Escape, even one vim-mode marked handled", async () => {
    await mount();
    const field = document.createElement("input");
    document.querySelector("[data-page-scroll-viewport]")!.append(field);
    field.focus();
    field.addEventListener("keydown", (event) => event.preventDefault());
    press(field, "Escape");
    expect(document.activeElement).not.toBe(field);
  });

  it("leaves the keys to an open menu or dialog", async () => {
    await mount();
    document.body.insertAdjacentHTML("beforeend", '<div role="menu"><div role="menuitem" tabindex="0"></div></div>');
    press(document.querySelector('[role="menuitem"]')!, "j");
    expect(cursorText()).toBeNull();
  });

  it("lists its keys on ?, and hides them on Escape before the cursor", async () => {
    await mount();
    press(document.body, "j");
    press(document.body, "?");
    const first = document.querySelector("[data-settings-search-keys] [data-key-help-row]")!;
    expect([...first.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual(["j", "k"]);
    press(document.body, "Escape");
    expect(document.querySelector("[data-settings-search-keys]")).toBeNull();
    expect(cursorText()).toBe("Appearance");
    press(document.body, "Escape");
    expect(cursorText()).toBeNull();
  });

  it("leaves Ctrl-L and Ctrl-H alone rather than switching lists", async () => {
    await mount("/settings/appearance");
    expect(press(document.body, "l", { ctrlKey: true })).toBe(true);
    expect(cursorText()).toBeNull();
    press(document.body, "l");
    expect(cursorText()).toContain("Theme");
    expect(press(document.body, "h", { ctrlKey: true })).toBe(true);
    expect(cursorText()).toContain("Theme");
  });

  it("moves into the page's settings on Enter, unless a link has focus", async () => {
    await mount("/settings/appearance");
    const link = document.querySelector<HTMLAnchorElement>('[data-sidebar] a[href="/settings"]')!;
    link.focus();
    expect(press(link, "Enter")).toBe(true);
    expect(cursorText()).toBeNull();
    link.blur();
    press(document.body, "Enter");
    expect(cursorText()).toContain("Theme");
  });

  it("stops with the settings sidebar and starts again with it", async () => {
    await mount();
    document.querySelector('[data-testid="settings-sidebar-body"]')!.remove();
    await flush();
    press(document.body, "j");
    expect(window.location.pathname).toBe("/settings");

    renderSettings();
    await flush();
    press(document.body, "j");
    expect(window.location.pathname).toBe("/settings/appearance");
  });

  it("removes everything it added on cleanup", async () => {
    await mount();
    press(document.body, "?");
    cleanup!();
    cleanup = null;
    expect(document.querySelector("[data-settings-search-keys], [data-settings-search-cursor]")).toBeNull();
    expect(searchBox().hasAttribute("data-vim-ignore")).toBe(false);
    expect(document.querySelector("style[data-settings-search-style]")).toBeNull();
  });
});

describe("keys", () => {
  it("has no sequence that starts another", () => {
    expect(keymapConflicts(SIDEBAR_KEYMAP)).toEqual([]);
    expect(keymapConflicts(PAGE_KEYMAP)).toEqual([]);
  });

  it("lists only keys the lists, the search box, or bb's search bind", () => {
    expect(unboundHelpKeys(KEY_HELP, [SIDEBAR_KEYMAP, PAGE_KEYMAP, SEARCH_BOX_KEYMAP], BB_SEARCH_KEYS)).toEqual([]);
  });
});
