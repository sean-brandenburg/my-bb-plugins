/** Ticket ids per column, left to right, top to bottom, as the board shows them. */
export type BoardLayout = readonly (readonly string[])[];

export type Direction = "left" | "right" | "up" | "down";
export type Motion = Direction | "top" | "bottom" | "first-column" | "last-column";

export type BoardCommand =
  | { kind: "cursor"; motion: Motion }
  | { kind: "move"; direction: Direction }
  | { kind: "open" }
  | { kind: "thread" }
  | { kind: "diff" }
  | { kind: "add" }
  | { kind: "help" };

export const KEYMAP: Record<string, BoardCommand> = {
  h: { kind: "cursor", motion: "left" },
  ArrowLeft: { kind: "cursor", motion: "left" },
  l: { kind: "cursor", motion: "right" },
  ArrowRight: { kind: "cursor", motion: "right" },
  j: { kind: "cursor", motion: "down" },
  ArrowDown: { kind: "cursor", motion: "down" },
  k: { kind: "cursor", motion: "up" },
  ArrowUp: { kind: "cursor", motion: "up" },
  G: { kind: "cursor", motion: "bottom" },
  "0": { kind: "cursor", motion: "first-column" },
  $: { kind: "cursor", motion: "last-column" },
  H: { kind: "move", direction: "left" },
  L: { kind: "move", direction: "right" },
  J: { kind: "move", direction: "down" },
  K: { kind: "move", direction: "up" },
  o: { kind: "open" },
  t: { kind: "thread" },
  d: { kind: "diff" },
  a: { kind: "add" },
  "?": { kind: "help" },
};

/** What the shortcuts dialog lists, in display order. */
export const BOARD_KEY_HELP: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ["h", "l"], action: "Previous / next column" },
  { keys: ["j", "k"], action: "Next / previous card" },
  { keys: ["gg", "G"], action: "First / last card in the column" },
  { keys: ["0", "$"], action: "First / last column" },
  { keys: ["H", "L"], action: "Move card to the previous / next column" },
  { keys: ["J", "K"], action: "Move card down / up" },
  { keys: ["o", "Enter"], action: "Open card" },
  { keys: ["t"], action: "Open the card's thread" },
  { keys: ["d"], action: "View the card's changes" },
  { keys: ["a"], action: "New card in this column" },
  { keys: ["?"], action: "Show these shortcuts" },
];

function locate(layout: BoardLayout, id: string): { column: number; row: number } | null {
  for (let column = 0; column < layout.length; column += 1) {
    const row = layout[column]!.indexOf(id);
    if (row !== -1) return { column, row };
  }
  return null;
}

/** The nearest non-empty column from `start` stepping by `step`, `start` included. */
function nonEmptyColumn(layout: BoardLayout, start: number, step: 1 | -1): number | null {
  for (let column = start; column >= 0 && column < layout.length; column += step) {
    if (layout[column]!.length > 0) return column;
  }
  return null;
}

/**
 * The card the cursor lands on. Sideways motions skip empty columns and keep the row where the
 * target column is long enough. With no cursor yet, any motion lands on the first card.
 */
export function cursorAfter(layout: BoardLayout, from: string | null, motion: Motion): string | null {
  const at = from === null ? null : locate(layout, from);
  if (at === null) {
    const first = nonEmptyColumn(layout, 0, 1);
    return first === null ? null : layout[first]![0]!;
  }
  const cards = layout[at.column]!;
  const inColumn = (column: number | null) => (column === null ? from : layout[column]![Math.min(at.row, layout[column]!.length - 1)]!);
  switch (motion) {
    case "up":
      return cards[Math.max(at.row - 1, 0)]!;
    case "down":
      return cards[Math.min(at.row + 1, cards.length - 1)]!;
    case "top":
      return cards[0]!;
    case "bottom":
      return cards[cards.length - 1]!;
    case "left":
      return inColumn(nonEmptyColumn(layout, at.column - 1, -1));
    case "right":
      return inColumn(nonEmptyColumn(layout, at.column + 1, 1));
    case "first-column":
      return inColumn(nonEmptyColumn(layout, 0, 1));
    case "last-column":
      return inColumn(nonEmptyColumn(layout, layout.length - 1, -1));
  }
}

/**
 * Where a card moved one step lands: a column index and its index among that column's visible
 * cards without it. Sideways moves keep the row and may land in an empty column. Null at an edge.
 */
export function movePlacement(layout: BoardLayout, id: string, direction: Direction): { column: number; index: number } | null {
  const at = locate(layout, id);
  if (at === null) return null;
  const length = layout[at.column]!.length;
  switch (direction) {
    case "up":
      return at.row === 0 ? null : { column: at.column, index: at.row - 1 };
    case "down":
      return at.row === length - 1 ? null : { column: at.column, index: at.row + 1 };
    case "left":
    case "right": {
      const column = at.column + (direction === "left" ? -1 : 1);
      if (column < 0 || column >= layout.length) return null;
      return { column, index: Math.min(at.row, layout[column]!.length) };
    }
  }
}

/**
 * Converts an index among a column's visible cards into the server's index among all of the
 * column's cards, which includes subtasks the board hides. The card goes just before the visible
 * card that will follow it, or last. Both lists exclude the card being moved.
 */
export function placementIndex(columnIds: readonly string[], visibleIds: readonly string[], visibleIndex: number): number {
  const next = visibleIds[visibleIndex];
  const index = next === undefined ? -1 : columnIds.indexOf(next);
  return index === -1 ? columnIds.length : index;
}
