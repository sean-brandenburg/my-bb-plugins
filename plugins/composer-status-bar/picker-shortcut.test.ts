// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPickerShortcut, shortcutTarget, watchPickerShortcut } from "./picker-shortcut.js";

const composer = (id: string, role: string) => `
  <div data-app-composer data-app-composer-role="${role}" id="${id}">
    <div contenteditable="true" id="${id}-editor"></div>
    <span data-composer-status-part="model-picker"><button id="${id}-picker" aria-expanded="false"></button></span>
  </div>`;

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { key: "M", shiftKey: true, bubbles: true, cancelable: true, ...init });
const byId = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  document.body.innerHTML = `${composer("main", "primary")}${composer("split", "secondary")}<div class="xterm"><textarea id="terminal"></textarea></div>`;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isPickerShortcut", () => {
  it("matches ⇧⌘M on macOS and Ctrl+Shift+M elsewhere", () => {
    expect(isPickerShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isPickerShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isPickerShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(isPickerShortcut(key({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(isPickerShortcut(key({ metaKey: true, shiftKey: false, key: "m" }), true)).toBe(false);
  });
});

describe("shortcutTarget", () => {
  it("toggles the picker of the composer that has focus", () => {
    byId("split-editor").focus();
    expect(shortcutTarget(document)).toBe(byId("split-picker"));
  });

  it("falls back to the primary composer when focus is elsewhere", () => {
    expect(shortcutTarget(document)).toBe(byId("main-picker"));
  });

  it("closes an open picker wherever focus went", () => {
    byId("split-picker").setAttribute("aria-expanded", "true");
    byId("terminal").focus();
    expect(shortcutTarget(document)).toBe(byId("split-picker"));
  });

  it("leaves the key alone in a terminal, or when the footer has no picker", () => {
    byId("terminal").focus();
    expect(shortcutTarget(document)).toBeNull();
    byId("main").querySelector("[data-composer-status-part]")!.remove();
    byId("main-editor").focus();
    expect(shortcutTarget(document)).toBeNull();
  });
});

describe("watchPickerShortcut", () => {
  it("opens the footer picker and keeps the key from bb", () => {
    const stop = watchPickerShortcut(window);
    const bb = vi.fn();
    document.addEventListener("keydown", bb);
    const click = vi.fn();
    byId("main-picker").addEventListener("click", click);
    const mac = /mac/i.test(navigator.platform);
    const event = key(mac ? { metaKey: true } : { ctrlKey: true });
    byId("main-editor").dispatchEvent(event);
    expect(click).toHaveBeenCalledOnce();
    expect(bb).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    stop();
    document.removeEventListener("keydown", bb);
  });
});
