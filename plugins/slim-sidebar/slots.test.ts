import { describe, expect, it, vi } from "vitest";
import { activateRailSlot, publishRail, railSlotAvailable, railSlotLabel } from "./slots.js";

describe("rail slots", () => {
  it("activates the visible item at the pressed digit and skips disabled ones without renumbering", () => {
    const activate = vi.fn();
    const unpublish = publishRail(
      [
        { id: "kanban/board", enabled: true },
        { id: "__bb__/automations", enabled: false },
        { id: "__bb__/extensions", enabled: true },
      ],
      activate,
    );
    expect([1, 2, 3, 4].map(railSlotAvailable)).toEqual([true, false, true, false]);
    activateRailSlot(3);
    activateRailSlot(2);
    activateRailSlot(4);
    expect(activate.mock.calls).toEqual([["__bb__/extensions"]]);
    unpublish();
    expect(railSlotAvailable(1)).toBe(false);
  });

  it("keeps the newest rail when an older one unmounts after it", () => {
    const older = publishRail([{ id: "a", enabled: true }], vi.fn());
    const activate = vi.fn();
    const newer = publishRail([{ id: "b", enabled: true }], activate);
    older();
    activateRailSlot(1);
    expect(activate).toHaveBeenCalledWith("b");
    newer();
  });

  it("labels the first nine items for the platform", () => {
    expect(railSlotLabel(0, "MacIntel")).toBe("⌘1");
    expect(railSlotLabel(8, "Win32")).toBe("Ctrl+9");
    expect(railSlotLabel(9, "MacIntel")).toBeNull();
  });
});
