import { NAV_ROW } from "./vim-keys.js";

export const NAV_COLUMN = "[data-nav-column]";
const PAGE_ROWS = 5;

export type Motion = "down" | "up" | "top" | "bottom" | "pageDown" | "pageUp";

/** The row a vertical motion lands on among `count`; with no cursor yet, G lands on the last row and the rest on the first. */
export function stepIndex(count: number, current: number | null, motion: Motion): number | null {
  if (count === 0) return null;
  const last = count - 1;
  if (current === null) return motion === "bottom" ? last : 0;
  switch (motion) {
    case "down":
      return Math.min(current + 1, last);
    case "up":
      return Math.max(current - 1, 0);
    case "top":
      return 0;
    case "bottom":
      return last;
    case "pageDown":
      return Math.min(current + PAGE_ROWS, last);
    case "pageUp":
      return Math.max(current - PAGE_ROWS, 0);
  }
}

/** Of `centers`, the index nearest `y`. */
export function nearestIndex(centers: readonly number[], y: number): number | null {
  let best: number | null = null;
  centers.forEach((center, index) => {
    if (best === null || Math.abs(center - y) < Math.abs(centers[best]! - y)) best = index;
  });
  return best;
}

export function navRows(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(NAV_ROW)).filter((row) => row.getClientRects().length > 0);
}

export function cursorRow(root: Element): HTMLElement | null {
  const active = root.ownerDocument.activeElement;
  return active instanceof HTMLElement && root.contains(active) ? active.closest<HTMLElement>(NAV_ROW) : null;
}

export function focusRow(row: HTMLElement): void {
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: "nearest" });
}

export function moveCursor(root: HTMLElement, motion: Motion): boolean {
  const rows = navRows(root);
  const current = cursorRow(root);
  const index = stepIndex(rows.length, current === null ? null : rows.indexOf(current), motion);
  if (index === null) return false;
  focusRow(rows[index]!);
  return true;
}

/** h and l: the row beside the cursor in the next column over, nearest in height. */
export function moveAcross(root: HTMLElement, step: 1 | -1): boolean {
  const columns = Array.from(root.querySelectorAll<HTMLElement>(NAV_COLUMN)).filter((column) => navRows(column).length > 0);
  const current = cursorRow(root);
  if (current === null) return moveCursor(root, "top");
  const from = columns.findIndex((column) => column.contains(current));
  const column = columns[from + step];
  if (from === -1 || column === undefined) return false;
  const rows = navRows(column);
  const box = current.getBoundingClientRect();
  const index = nearestIndex(
    rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }),
    box.top + box.height / 2,
  );
  if (index === null) return false;
  focusRow(rows[index]!);
  return true;
}

/** n and N: the next row marked as a search match after the cursor, wrapping. */
export function moveToMatch(root: HTMLElement, step: 1 | -1): boolean {
  const rows = navRows(root);
  const matches = rows.filter((row) => row.dataset.match === "true");
  if (matches.length === 0) return false;
  const current = cursorRow(root);
  const at = current === null ? -1 : rows.indexOf(current);
  const ordered = step === 1 ? matches : [...matches].reverse();
  const next = ordered.find((row) => (step === 1 ? rows.indexOf(row) > at : at === -1 || rows.indexOf(row) < at)) ?? ordered[0]!;
  focusRow(next);
  return true;
}
