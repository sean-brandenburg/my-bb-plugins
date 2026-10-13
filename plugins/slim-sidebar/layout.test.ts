// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  arrangeHeaders,
  headerClearance,
  mountSlimSidebar,
  pageZoom,
  SIDEBAR,
} from "./layout.js";

window.matchMedia ??= ((query: string) =>
  ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as { bbDesktop?: unknown }).bbDesktop;
});

/** Zooms bb's desktop window: the window keeps its width, the viewport grows. */
function zoomDesktop(zoom: number) {
  (window as { bbDesktop?: unknown }).bbDesktop = {};
  Object.defineProperty(window, "outerWidth", {
    configurable: true,
    value: 1400,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: Math.round(1400 / zoom),
  });
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
  it("indents a top-row header so it starts past the corner controls", () => {
    expect(headerClearance({ left: 52, top: 0 }, 16, 120, 48)).toBe(72);
  });

  it("indents in the row's unzoomed pixels when the page is zoomed", () => {
    // At 70% the toggle sits at 120 page px and the header content at 90.
    expect(headerClearance({ left: 74, top: 0 }, 16, 120, 71, 0.7)).toBe(41);
  });

  it("leaves headers that already start past the controls or sit lower alone", () => {
    expect(headerClearance({ left: 400, top: 0 }, 16, 120, 48)).toBe(0);
    expect(headerClearance({ left: 52, top: 300 }, 16, 120, 48)).toBe(0);
  });
});

describe("SIDEBAR", () => {
  it("matches the main sidebar but not the Plugins, Skills, or Settings ones", () => {
    document.body.innerHTML = `
      <div id="main" data-side="left" data-variant="sidebar">
        <div data-testid="app-sidebar-resize-handle"></div>
      </div>
      <div id="plugins" data-side="left" data-variant="sidebar">
        <div data-testid="plugins-sidebar-resize-handle"></div>
      </div>`;
    expect(document.getElementById("main")!.matches(SIDEBAR)).toBe(true);
    expect(document.getElementById("plugins")!.matches(SIDEBAR)).toBe(false);
  });
});

const byId = (id: string) => document.getElementById(id)!;

function placeAt(id: string, left: number, top: number, bottom = top + 48) {
  byId(id).getBoundingClientRect = () =>
    ({ left, top, bottom, right: left + 500 }) as DOMRect;
}

/**
 * The hidden sidebar toggle sits at 80px, centered in a 50px top row; one
 * page header is in that row and another is lower on the page.
 */
function renderChrome(topHeaderLeft = 52) {
  document.body.innerHTML = `
    <div id="sidebar" data-side="left" data-variant="sidebar" data-state="expanded"></div>
    <div data-testid="app-desktop-sidebar-trigger"><button id="trigger"></button></div>
    <header id="top" style="padding-left: 16px">
      <div id="top-row" data-testid="app-page-header-content-row"></div>
    </header>
    <header id="lower">
      <div id="lower-row" data-testid="app-page-header-content-row"></div>
    </header>`;
  placeAt("trigger", 80, 12, 38);
  placeAt("top", topHeaderLeft, 0);
  placeAt("lower", 52, 300);
}

const framed = (id: string) => byId(id).hasAttribute("data-slim-sidebar-frame");
const clearance = (id: string) =>
  byId(id).hasAttribute("data-slim-sidebar-clear")
    ? byId(id).style.getPropertyValue("--slim-sidebar-clear")
    : null;

describe("arrangeHeaders", () => {
  it("frames top-row headers and indents those under the window buttons", () => {
    renderChrome();
    arrangeHeaders(document, true);
    expect(framed("top")).toBe(true);
    // 80px toggle + 20px gap - (52px left + 16px padding)
    expect(clearance("top-row")).toBe("32px");
    expect(framed("lower")).toBe(false);
    expect(clearance("lower-row")).toBeNull();
  });

  it("frames a header that already starts past the buttons without indenting it", () => {
    renderChrome(400);
    arrangeHeaders(document, true);
    expect(framed("top")).toBe(true);
    expect(clearance("top-row")).toBeNull();
  });

  it("undoes everything when the sidebar collapses or the window is phone-width", () => {
    renderChrome();
    arrangeHeaders(document, false);
    expect(framed("top")).toBe(false);
    expect(clearance("top-row")).toBeNull();

    arrangeHeaders(document, true);
    byId("sidebar").setAttribute("data-state", "collapsed");
    arrangeHeaders(document, true);
    expect(framed("top")).toBe(false);
    expect(clearance("top-row")).toBeNull();
  });
});

describe("mountSlimSidebar", () => {
  it("installs its stylesheet, arranges headers, and removes everything on cleanup", async () => {
    renderChrome();
    const cleanup = mountSlimSidebar(document, window);
    expect(document.querySelectorAll("style[data-slim-sidebar]")).toHaveLength(
      1,
    );
    await nextFrame();
    expect(framed("top")).toBe(true);
    expect(clearance("top-row")).toBe("32px");

    cleanup();

    expect(document.querySelectorAll("style[data-slim-sidebar]")).toHaveLength(
      0,
    );
    expect(framed("top")).toBe(false);
    expect(clearance("top-row")).toBeNull();
    expect(byId("top-row").style.getPropertyValue("--slim-sidebar-clear")).toBe(
      "",
    );
  });

  it("sizes the top bar for the page zoom, and clears it on cleanup", async () => {
    zoomDesktop(0.5);
    renderChrome();
    const cleanup = mountSlimSidebar(document, window);
    await nextFrame();
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--slim-sidebar-zoom")).toBe("0.5");
    expect(root.getPropertyValue("--slim-sidebar-top-bar")).toBe("100px");
    // (80px toggle - 68px content) * 0.5 + 20px gap
    expect(clearance("top-row")).toBe("26px");

    cleanup();

    expect(root.getPropertyValue("--slim-sidebar-zoom")).toBe("");
    expect(root.getPropertyValue("--slim-sidebar-top-bar")).toBe("");
  });

  it("re-arranges after the page changes, and stops once cleaned up", async () => {
    renderChrome();
    const cleanup = mountSlimSidebar(document, window);
    await nextFrame();

    byId("sidebar").setAttribute("data-state", "collapsed");
    await nextFrame();
    await nextFrame();
    expect(framed("top")).toBe(false);

    cleanup();
    byId("sidebar").setAttribute("data-state", "expanded");
    await nextFrame();
    await nextFrame();
    expect(framed("top")).toBe(false);
  });
});
