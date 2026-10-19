import { describe, expect, it } from "vitest";
import { cursorAfter, movePlacement, placementIndex } from "./board-nav";

const layout = [["a1", "a2", "a3"], [], ["c1"], ["d1", "d2"]];

describe("cursorAfter", () => {
  it("lands on the first card when there is no cursor, or it is gone", () => {
    expect(cursorAfter(layout, null, "down")).toBe("a1");
    expect(cursorAfter([[], ["b1"]], "gone", "right")).toBe("b1");
    expect(cursorAfter([[], []], null, "down")).toBeNull();
  });

  it("steps within a column and stops at its ends", () => {
    expect(cursorAfter(layout, "a1", "down")).toBe("a2");
    expect(cursorAfter(layout, "a3", "down")).toBe("a3");
    expect(cursorAfter(layout, "a2", "up")).toBe("a1");
    expect(cursorAfter(layout, "a1", "up")).toBe("a1");
    expect(cursorAfter(layout, "a2", "top")).toBe("a1");
    expect(cursorAfter(layout, "a1", "bottom")).toBe("a3");
  });

  it("skips empty columns sideways and clamps the row to the target column", () => {
    expect(cursorAfter(layout, "a3", "right")).toBe("c1");
    expect(cursorAfter(layout, "c1", "left")).toBe("a1");
    expect(cursorAfter(layout, "d2", "left")).toBe("c1");
    expect(cursorAfter(layout, "a2", "first-column")).toBe("a2");
    expect(cursorAfter(layout, "a2", "last-column")).toBe("d2");
    expect(cursorAfter(layout, "c1", "first-column")).toBe("a1");
  });

  it("stays put at the board's edges", () => {
    expect(cursorAfter(layout, "a2", "left")).toBe("a2");
    expect(cursorAfter(layout, "d1", "right")).toBe("d1");
  });
});

describe("movePlacement", () => {
  it("reorders within the column, as an index among the other cards", () => {
    expect(movePlacement(layout, "a1", "down")).toEqual({ column: 0, index: 1 });
    expect(movePlacement(layout, "a2", "up")).toEqual({ column: 0, index: 0 });
    expect(movePlacement(layout, "a1", "up")).toBeNull();
    expect(movePlacement(layout, "a3", "down")).toBeNull();
  });

  it("moves to the adjacent column, empty or not, keeping the row where it can", () => {
    expect(movePlacement(layout, "a3", "right")).toEqual({ column: 1, index: 0 });
    expect(movePlacement(layout, "d2", "left")).toEqual({ column: 2, index: 1 });
    expect(movePlacement(layout, "a1", "left")).toBeNull();
    expect(movePlacement(layout, "d1", "right")).toBeNull();
    expect(movePlacement(layout, "gone", "right")).toBeNull();
  });
});

describe("placementIndex", () => {
  // Subtasks a1-s and b1-s are in the column but hidden from the board.
  const column = ["A", "a1-s", "B", "b1-s", "C"];
  const visible = ["A", "B", "C"];

  it("places the card just before the visible card that will follow it", () => {
    expect(placementIndex(column, visible, 0)).toBe(0);
    expect(placementIndex(column, visible, 1)).toBe(2);
    expect(placementIndex(column, visible, 2)).toBe(4);
  });

  it("places it last when it goes after every visible card", () => {
    expect(placementIndex(column, visible, 3)).toBe(5);
    expect(placementIndex([], [], 0)).toBe(0);
  });
});
