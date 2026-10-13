// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { mountNoSelectionMenu } from "./selection-menu.js";

// The class list bb 0.45's TimelineSelectionMenu gives its popover content.
const MENU_CLASSES =
  "z-50 flex w-auto items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-md outline-none";
// A regular bb popover, which must stay visible.
const POPOVER_CLASSES =
  "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("mountNoSelectionMenu", () => {
  it("hides only the selection toolbar and removes its stylesheet on cleanup", () => {
    document.body.innerHTML = `
      <div data-radix-popper-content-wrapper>
        <div id="menu" role="dialog" data-state="open" class="${MENU_CLASSES}">
          <div class="flex items-center"><button>Add to chat</button></div>
        </div>
      </div>
      <div id="popover" role="dialog" data-state="open" class="${POPOVER_CLASSES}"></div>`;
    const menu = document.getElementById("menu")!;
    const popover = document.getElementById("popover")!;

    const cleanup = mountNoSelectionMenu(document);

    expect(document.querySelectorAll("style[data-no-selection-menu]")).toHaveLength(1);
    expect(getComputedStyle(menu).display).toBe("none");
    expect(getComputedStyle(popover).display).not.toBe("none");

    cleanup();

    expect(document.querySelectorAll("style[data-no-selection-menu]")).toHaveLength(0);
    expect(getComputedStyle(menu).display).not.toBe("none");
  });
});
