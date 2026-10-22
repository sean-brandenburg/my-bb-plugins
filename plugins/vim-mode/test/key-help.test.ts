import { act, createElement, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterKeyHelp, type KeyHelpSection } from "../lib/index.ts";
import { KeyHelp } from "../lib/react.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECTIONS: KeyHelpSection[] = [
  {
    title: "Move",
    keys: [
      { keys: ["j", "k"], action: "Down or up" },
      { keys: ["gg", "G"], action: "Top or bottom" },
    ],
  },
  {
    title: "Act",
    keys: [
      { keys: ["o", "Enter"], action: "Open the card" },
      { keys: ["?"], action: "These keys" },
    ],
  },
];

describe("filterKeyHelp", () => {
  it("keeps entries whose action or keys match, and whole sections whose title does", () => {
    expect(filterKeyHelp(SECTIONS, "")).toEqual(SECTIONS);
    expect(filterKeyHelp(SECTIONS, "open")).toEqual([{ title: "Act", keys: [{ keys: ["o", "Enter"], action: "Open the card" }] }]);
    expect(filterKeyHelp(SECTIONS, "gg")).toEqual([{ title: "Move", keys: [{ keys: ["gg", "G"], action: "Top or bottom" }] }]);
    expect(filterKeyHelp(SECTIONS, "move")).toEqual([SECTIONS[0]]);
    expect(filterKeyHelp(SECTIONS, "?").map(({ keys }) => keys.map(({ action }) => action))).toEqual([["These keys"]]);
    expect(filterKeyHelp(SECTIONS, "nothing")).toEqual([]);
  });

  it("ignores case only for a query with no capitals", () => {
    expect(filterKeyHelp(SECTIONS, "g").flatMap(({ keys }) => keys.map(({ action }) => action))).toEqual(["Top or bottom"]);
    expect(filterKeyHelp(SECTIONS, "G").flatMap(({ keys }) => keys.map(({ action }) => action))).toEqual(["Top or bottom"]);
    expect(filterKeyHelp(SECTIONS, "Open")).toHaveLength(1);
    expect(filterKeyHelp(SECTIONS, "OPEN")).toEqual([]);
  });
});

/** Closes on an Escape heard in document capture, as Radix's dialogs do. */
function FakeDialog({ onOpenChange, children }: { onOpenChange: (open: boolean) => void; children?: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onOpenChange]);
  return createElement("div", { role: "dialog", tabIndex: -1 }, children);
}

describe("KeyHelp search", () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(element: ReturnType<typeof createElement>) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(element));
  }

  function inDialog(onOpenChange: (open: boolean) => void) {
    return createElement(FakeDialog, { onOpenChange }, createElement(KeyHelp, { sections: SECTIONS, search: true }));
  }

  function press(target: EventTarget, name: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
    act(() => void target.dispatchEvent(event));
    return event;
  }

  function type(input: HTMLInputElement, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const actions = () => Array.from(document.querySelectorAll("dd"), (dd) => dd.textContent);
  const box = () => document.querySelector<HTMLInputElement>('input[aria-label="Search keys"]')!;
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;

  it("focuses the box on / from anywhere in the dialog and filters as you type", () => {
    render(inDialog(() => {}));
    expect(box().tabIndex).toBe(-1);
    expect(box().hasAttribute("data-vim-ignore")).toBe(true);
    expect(press(dialog(), "/").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(box());
    type(box(), "open");
    expect(actions()).toEqual(["Open the card"]);
    type(box(), "zzz");
    expect(document.body.textContent).toContain("No keys match.");
  });

  it("keeps the filter on Enter and drops it on Escape, without closing the dialog", () => {
    const onOpenChange = vi.fn();
    render(inDialog(onOpenChange));
    press(dialog(), "/");
    type(box(), "open");
    press(box(), "Enter");
    expect(actions()).toEqual(["Open the card"]);
    expect(box().contains(document.activeElement)).toBe(false);
    expect(dialog().contains(document.activeElement)).toBe(true);

    press(dialog(), "/");
    expect(document.activeElement).toBe(box());
    press(box(), "Escape");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(box().value).toBe("");
    expect(actions()).toHaveLength(4);
    expect(dialog().contains(document.activeElement)).toBe(true);

    press(document.activeElement!, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("leaves Backspace in an empty box as a way back to the keys", () => {
    render(inDialog(() => {}));
    press(dialog(), "/");
    press(box(), "Backspace");
    expect(document.activeElement).not.toBe(box());
  });

  it("adds no box or / key without search", () => {
    render(createElement("div", { role: "dialog" }, createElement(KeyHelp, { sections: SECTIONS })));
    expect(document.querySelector("input")).toBeNull();
    expect(press(dialog(), "/").defaultPrevented).toBe(false);
  });
});
