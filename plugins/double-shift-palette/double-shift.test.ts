// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  createDoubleShiftDetector,
  findCommandShortcut,
  requestProjectPicker,
  shortcutKeydown,
  TOGGLE_PROJECT_PICKER_EVENT,
} from "./double-shift.js";

function key(
  type: "keydown" | "keyup",
  keyName: string,
  timeStamp: number,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent(type, { key: keyName, ...init });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function tap(
  detector: ReturnType<typeof createDoubleShiftDetector>,
  at: number,
  heldMs = 50,
) {
  detector.keydown(key("keydown", "Shift", at));
  detector.keyup(key("keyup", "Shift", at + heldMs));
}

describe("createDoubleShiftDetector", () => {
  it("fires on two quick Shift taps, then needs two fresh taps", () => {
    const fire = vi.fn();
    const detector = createDoubleShiftDetector(fire, 400);
    tap(detector, 0);
    tap(detector, 200);
    expect(fire).toHaveBeenCalledOnce();
    tap(detector, 400);
    expect(fire).toHaveBeenCalledOnce();
    tap(detector, 600);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it("ignores taps too far apart", () => {
    const fire = vi.fn();
    const detector = createDoubleShiftDetector(fire, 400);
    tap(detector, 0);
    tap(detector, 600);
    expect(fire).not.toHaveBeenCalled();
  });

  it("does not fire while typing capitals", () => {
    const fire = vi.fn();
    const detector = createDoubleShiftDetector(fire, 400);
    detector.keydown(key("keydown", "Shift", 0));
    detector.keydown(key("keydown", "A", 20, { shiftKey: true }));
    detector.keyup(key("keyup", "Shift", 40));
    tap(detector, 100);
    expect(fire).not.toHaveBeenCalled();
  });

  it("does not count a held Shift or Shift chorded with another modifier", () => {
    const fire = vi.fn();
    const detector = createDoubleShiftDetector(fire, 400);
    tap(detector, 0, 900);
    tap(detector, 1000);
    expect(fire).not.toHaveBeenCalled();
    detector.keydown(key("keydown", "Shift", 1100, { metaKey: true }));
    detector.keyup(key("keyup", "Shift", 1150));
    tap(detector, 1200);
    expect(fire).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat keydowns while Shift is held", () => {
    const fire = vi.fn();
    const detector = createDoubleShiftDetector(fire, 400);
    tap(detector, 0);
    detector.keydown(key("keydown", "Shift", 100));
    detector.keydown(key("keydown", "Shift", 150, { repeat: true }));
    detector.keyup(key("keyup", "Shift", 200));
    expect(fire).toHaveBeenCalledOnce();
  });
});

describe("shortcutKeydown", () => {
  it("maps mod to Command on macOS and Control elsewhere", () => {
    const mac = shortcutKeydown({ key: "k", mod: true, shift: true }, true);
    expect([mac.key, mac.metaKey, mac.ctrlKey, mac.shiftKey]).toEqual([
      "k",
      true,
      false,
      true,
    ]);
    const other = shortcutKeydown({ key: "k", mod: true }, false);
    expect([other.metaKey, other.ctrlKey, other.shiftKey]).toEqual([
      false,
      true,
      false,
    ]);
    expect(other.bubbles).toBe(true);
  });
});

describe("findCommandShortcut", () => {
  it("returns the first bound shortcut for the command", () => {
    expect(
      findCommandShortcut(
        [
          { command: "thread.new", shortcut: { key: "o" } },
          { command: "palette.open", shortcut: null },
          { command: "palette.open", shortcut: { key: "k", mod: true } },
        ],
        "palette.open",
      ),
    ).toEqual({ key: "k", mod: true });
    expect(findCommandShortcut([], "palette.open")).toBeNull();
  });
});

describe("requestProjectPicker", () => {
  it("uses the event name the Project switcher listens for", () => {
    expect(TOGGLE_PROJECT_PICKER_EVENT).toBe("bb-project-switcher:toggle");
  });

  it("reports whether a listener claimed the event", () => {
    const target = new EventTarget();
    expect(requestProjectPicker(target)).toBe(false);
    target.addEventListener(TOGGLE_PROJECT_PICKER_EVENT, (event) =>
      event.preventDefault(),
    );
    expect(requestProjectPicker(target)).toBe(true);
  });
});
