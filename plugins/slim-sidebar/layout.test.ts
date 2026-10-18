// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HELD_ATTRIBUTE, labelRail, mountSlimSidebar, SLIM, SLOT_ATTRIBUTE } from "./layout.js";

const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

beforeEach(() => {
  Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });
});

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
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
