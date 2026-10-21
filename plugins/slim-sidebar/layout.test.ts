// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  arrangeHeaders,
  FOOTER_PANEL,
  headerClearance,
  HELD_ATTRIBUTE,
  labelRail,
  mountSlimSidebar,
  pageZoom,
  SLIM,
  SLOT_ATTRIBUTE,
} from "./layout.js";

window.matchMedia ??= ((query: string) =>
  ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

beforeEach(() => {
  Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });
});

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as { bbDesktop?: unknown }).bbDesktop;
  document.documentElement.removeAttribute("style");
});

const byId = (id: string) => document.getElementById(id)!;
const slot = (id: string) => byId(id).getAttribute(SLOT_ATTRIBUTE);
const held = () => byId("rail").hasAttribute(HELD_ATTRIBUTE);

function renderSidebar(list = "") {
  document.body.innerHTML = `
    <div id="sidebar" data-side="left" data-variant="sidebar" data-state="expanded">
      <div id="rail" data-testid="app-nav-rail">
        <nav>
          <button id="home"></button>
          <span data-nav-rail-item="kanban/board"><button id="kanban"></button></span>
          <button id="more"><svg data-icon="MoreHorizontal"></svg></button>
        </nav>
      </div>
      <div data-testid="nav-rail-sidebar-body">${list}</div>
    </div>`;
}

describe("SLIM", () => {
  it("matches the sidebar while its rail sits beside the thread list", () => {
    renderSidebar('<div data-testid="app-sidebar-body"></div>');
    expect(byId("sidebar").matches(SLIM)).toBe(true);
  });

  it("leaves Settings, Plugins, and Skills their own list", () => {
    for (const page of ["settings", "plugins", "skills"]) {
      renderSidebar(`<div data-testid="${page}-sidebar-body"></div>`);
      expect(byId("sidebar").matches(SLIM)).toBe(false);
    }
  });

  it("leaves a sidebar without bb's rail alone", () => {
    document.body.innerHTML = '<div id="sidebar" data-side="left" data-variant="sidebar"></div>';
    expect(byId("sidebar").matches(SLIM)).toBe(false);
  });
});

describe("FOOTER_PANEL", () => {
  const listWith = (panel: string) => `
    <div data-testid="app-sidebar-body">
      <div id="list"></div>
      <div id="panel">${panel}</div>
    </div>`;

  it("matches the list's footer slot while a footer icon's disclosure or Customize footer is open", () => {
    for (const panel of [
      '<section data-testid="plugin-sidebar-footer-disclosure-bb--provider-usage-usage"></section>',
      '<div><div data-testid="sidebar-footer-customize-inline"></div></div>',
    ]) {
      renderSidebar(listWith(panel));
      expect(byId("panel").matches(FOOTER_PANEL)).toBe(true);
      expect(byId("list").matches(FOOTER_PANEL)).toBe(false);
    }
  });

  it("matches nothing while the slot is empty or the rail is hidden", () => {
    renderSidebar(listWith(""));
    expect(byId("panel").matches(FOOTER_PANEL)).toBe(false);
    renderSidebar(listWith('<section data-testid="plugin-sidebar-footer-disclosure-bb--provider-usage-usage"></section>'));
    byId("sidebar").setAttribute("data-state", "collapsed");
    expect(byId("panel").matches(FOOTER_PANEL)).toBe(false);
  });
});

describe("labelRail", () => {
  it("numbers the rail's items, not More, and shows the numbers only while held", () => {
    renderSidebar();
    labelRail(document, "MacIntel", false);
    expect([slot("home"), slot("kanban"), slot("more")]).toEqual(["⌘1", "⌘2", null]);
    expect(held()).toBe(false);
    labelRail(document, "MacIntel", true);
    expect(held()).toBe(true);
  });

  it("renumbers when an item leaves the rail, and unnumbers it", () => {
    renderSidebar();
    labelRail(document, "MacIntel", false);
    document.body.append(byId("home"));
    labelRail(document, "MacIntel", false);
    expect(slot("kanban")).toBe("⌘1");
    expect(slot("home")).toBeNull();
  });
});

const press = (type: "keydown" | "keyup", key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent(type, { key, ...init }));

describe("mountSlimSidebar", () => {
  it("installs its stylesheet, numbers the rail, and removes everything on cleanup", async () => {
    renderSidebar();
    const cleanup = mountSlimSidebar(document, window);
    expect(document.querySelectorAll("style[data-slim-sidebar]")).toHaveLength(1);
    await nextFrame();
    expect(slot("kanban")).toBe("⌘2");

    press("keydown", "Meta", { metaKey: true });
    await nextFrame();
    cleanup();

    expect(document.querySelectorAll("style[data-slim-sidebar]")).toHaveLength(0);
    expect(slot("kanban")).toBeNull();
    expect(held()).toBe(false);
  });

  it("shows the numbers while Cmd is held, through a Cmd+digit, until it is let go", async () => {
    renderSidebar();
    const cleanup = mountSlimSidebar(document, window);
    press("keydown", "Meta", { metaKey: true });
    await nextFrame();
    expect(held()).toBe(true);
    press("keydown", "2", { metaKey: true });
    await nextFrame();
    expect(held()).toBe(true);
    press("keyup", "Meta");
    await nextFrame();
    expect(held()).toBe(false);
    cleanup();
  });

  it("hides the numbers for Cmd chords with other modifiers and when the window loses focus", async () => {
    renderSidebar();
    const cleanup = mountSlimSidebar(document, window);
    press("keydown", "Meta", { metaKey: true, shiftKey: true });
    await nextFrame();
    expect(held()).toBe(false);
    press("keydown", "Meta", { metaKey: true });
    await nextFrame();
    window.dispatchEvent(new Event("blur"));
    await nextFrame();
    expect(held()).toBe(false);
    cleanup();
  });

  it("numbers items that render after it mounts", async () => {
    document.body.innerHTML = "";
    const cleanup = mountSlimSidebar(document, window);
    renderSidebar();
    await nextFrame();
    await nextFrame();
    expect(slot("home")).toBe("⌘1");
    cleanup();
  });
});

/** Zooms bb's desktop window: the window keeps its width, the viewport grows. */
function zoomDesktop(zoom: number) {
  (window as { bbDesktop?: unknown }).bbDesktop = {};
  Object.defineProperty(window, "outerWidth", { configurable: true, value: 1400 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: Math.round(1400 / zoom) });
}

describe("pageZoom", () => {
  it("snaps the window-to-viewport ratio to bb's 10% zoom steps", () => {
    zoomDesktop(0.7);
    expect(pageZoom(window)).toBe(0.7);
    zoomDesktop(1.3);
    expect(pageZoom(window)).toBe(1.3);
  });

  it("reads 1 outside bb's desktop app, where browser chrome skews the ratio", () => {
    zoomDesktop(0.7);
    delete (window as { bbDesktop?: unknown }).bbDesktop;
    expect(pageZoom(window)).toBe(1);
  });
});

describe("headerClearance", () => {
  const padding = { left: 16, right: 16 };

  it("indents a top-bar row past the window buttons and before the panel toggle", () => {
    expect(headerClearance({ left: 45, right: 1400 }, padding, { leftEnd: 84, rightStart: 1355 })).toEqual({
      left: 43,
      right: 37,
    });
  });

  it("indents in the row's unzoomed pixels when the page is zoomed", () => {
    // At 80% the back button sits at 105 page px and the header content at 61.
    expect(headerClearance({ left: 45, right: 1750 }, padding, { leftEnd: 105, rightStart: null }, 0.8)).toEqual({
      left: 56,
      right: 0,
    });
  });

  it("leaves rows that already clear the controls, or have none, alone", () => {
    expect(headerClearance({ left: 400, right: 1000 }, padding, { leftEnd: 84, rightStart: 1355 })).toEqual({
      left: 0,
      right: 0,
    });
    expect(headerClearance({ left: 45, right: 1400 }, padding, { leftEnd: null, rightStart: null })).toEqual({
      left: 0,
      right: 0,
    });
  });
});

function place(id: string, left: number, top: number, right: number, bottom = top + 50) {
  const element = byId(id);
  element.getBoundingClientRect = () => ({ left, top, right, bottom }) as DOMRect;
  element.getClientRects = () => [element.getBoundingClientRect()] as unknown as DOMRectList;
}

/** A thread header in the top bar, a lower one, and bb's macOS title bar controls. */
function renderFrame() {
  document.body.innerHTML = `
    <div data-testid="app-layout-root" data-framed="">
      <div data-testid="app-window-title-bar">
        <div id="controls"><button data-sidebar="trigger"></button></div>
        <div><button id="toggle" data-testid="window-right-panel-toggle"></button></div>
      </div>
      <header id="top" style="padding: 0 16px"><div id="top-row" data-testid="app-page-header-content-row"></div></header>
      <header id="lower"><div id="lower-row" data-testid="app-page-header-content-row"></div></header>
      <aside><div><div id="chrome" data-testid="thread-secondary-panel-top-chrome"></div></div></aside>
    </div>`;
  place("controls", 84, 12, 176, 40);
  place("toggle", 1355, 12, 1383, 40);
  place("top", 45, 0, 1400);
  place("lower", 45, 300, 1400);
  place("chrome", 1400, 0, 1400);
}

const framed = (id: string) => byId(id).hasAttribute("data-slim-sidebar-frame");
const indent = (id: string, side: "left" | "right") =>
  byId(id).style.getPropertyValue(`--slim-sidebar-clear-${side}`) || null;

describe("arrangeHeaders", () => {
  it("makes top-row headers the top bar and indents them clear of the floating controls", () => {
    renderFrame();
    arrangeHeaders(document, true);
    expect(framed("top")).toBe(true);
    expect([indent("top-row", "left"), indent("top-row", "right")]).toEqual(["43px", "37px"]);
    expect(framed("lower")).toBe(false);
    expect(indent("lower-row", "left")).toBeNull();
  });

  it("leaves the right side alone once the panel toggle sits over a side panel instead", () => {
    renderFrame();
    place("top", 45, 0, 700);
    arrangeHeaders(document, true);
    expect(indent("top-row", "right")).toBeNull();
  });

  it("indents a side panel's tab strip clear of the panel toggle over its right end", () => {
    renderFrame();
    place("top", 45, 0, 700);
    place("chrome", 700, 0, 1400);
    arrangeHeaders(document, true);
    expect(indent("chrome", "right")).toBe("53px");

    place("chrome", 700, 300, 1400);
    arrangeHeaders(document, true);
    expect(indent("chrome", "right")).toBeNull();
  });

  it("needs no indent outside the macOS frame, and undoes everything at phone width", () => {
    renderFrame();
    byId("top").parentElement!.removeAttribute("data-framed");
    arrangeHeaders(document, true);
    expect(framed("top")).toBe(true);
    expect(indent("top-row", "left")).toBeNull();

    arrangeHeaders(document, false);
    expect(framed("top")).toBe(false);
  });
});

describe("mountSlimSidebar resize", () => {
  it("indents the top bar again once a closing side panel has finished resizing it", async () => {
    const observers: Array<{ callback: () => void; targets: Set<Element> }> = [];
    class FakeResizeObserver {
      targets = new Set<Element>();
      constructor(callback: () => void) {
        observers.push({ callback, targets: this.targets });
      }
      observe(target: Element) {
        this.targets.add(target);
      }
      unobserve(target: Element) {
        this.targets.delete(target);
      }
      disconnect() {
        this.targets.clear();
      }
    }
    const original = window.ResizeObserver;
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      renderFrame();
      place("top", 45, 0, 700);
      const cleanup = mountSlimSidebar(document, window);
      await nextFrame();
      expect(indent("top-row", "right")).toBeNull();
      expect(observers[0]!.targets.has(byId("top"))).toBe(true);

      place("top", 45, 0, 1400);
      observers[0]!.callback();
      await nextFrame();
      expect(indent("top-row", "right")).toBe("37px");

      cleanup();
      expect(observers[0]!.targets.size).toBe(0);
    } finally {
      window.ResizeObserver = original;
    }
  });
});

describe("mountSlimSidebar zoom", () => {
  it("sizes the top bar for the page zoom, and clears it on cleanup", async () => {
    zoomDesktop(0.5);
    renderFrame();
    const cleanup = mountSlimSidebar(document, window);
    await nextFrame();
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--slim-sidebar-zoom")).toBe("0.5");
    expect(root.getPropertyValue("--slim-sidebar-top-bar")).toBe("100px");
    expect(framed("top")).toBe(true);

    cleanup();

    expect(root.getPropertyValue("--slim-sidebar-zoom")).toBe("");
    expect(root.getPropertyValue("--slim-sidebar-top-bar")).toBe("");
    expect(framed("top")).toBe(false);
    expect(indent("top-row", "left")).toBeNull();
  });
});
