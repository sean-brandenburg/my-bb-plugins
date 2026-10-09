import { describe, expect, it } from "vitest";
import { nextIndicator, railItemOffset } from "./indicator.js";

describe("railItemOffset", () => {
  it("steps one button plus one gap per item below the rail's padding", () => {
    expect(railItemOffset(0)).toBe("0.5rem");
    expect(railItemOffset(1)).toBe("3rem");
    expect(railItemOffset(3)).toBe("8rem");
  });
});

describe("nextIndicator", () => {
  it("appears in place on first mount", () => {
    expect(nextIndicator(null, 2)).toEqual({ index: 2, visible: true, slide: false });
  });

  it("slides between visible items", () => {
    const first = nextIndicator(null, 0);
    expect(nextIndicator(first, 3)).toEqual({ index: 3, visible: true, slide: true });
  });

  it("fades out where it was when no rail item is active", () => {
    const shown = nextIndicator(null, 2);
    expect(nextIndicator(shown, -1)).toEqual({ index: 2, visible: false, slide: false });
    expect(nextIndicator(null, -1)).toEqual({ index: 0, visible: false, slide: false });
  });

  it("fades in under the new item instead of sliding from where it hid", () => {
    const hidden = nextIndicator(nextIndicator(null, 1), -1);
    expect(nextIndicator(hidden, 4)).toEqual({ index: 4, visible: true, slide: false });
  });
});
