import { cursorIndex, focusRow, readRows, runListScroll } from "bb-vim-keys";

export const NAV_COLUMN = "[data-nav-column]";

/** Of `centers`, the index nearest `y`. */
export function nearestIndex(centers: readonly number[], y: number): number | null {
  let best: number | null = null;
  centers.forEach((center, index) => {
    if (best === null || Math.abs(center - y) < Math.abs(centers[best]! - y)) best = index;
  });
  return best;
}

export function cursorRow(root: Element): HTMLElement | null {
  const { elements } = readRows(root);
  const index = cursorIndex(elements);
  return index === null ? null : elements[index]!;
}

/** h and l: the row beside the cursor in the next column over, nearest in height. */
export function moveAcross(root: HTMLElement, step: 1 | -1): boolean {
  const current = cursorRow(root);
  if (current === null) return false;
  const columns = Array.from(root.querySelectorAll<HTMLElement>(NAV_COLUMN)).filter((column) => readRows(column).elements.length > 0);
  const from = columns.findIndex((column) => column.contains(current));
  const column = columns[from + step];
  if (from === -1 || column === undefined) return false;
  const rows = readRows(column).elements;
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
  const rows = readRows(root).elements;
  const matches = rows.filter((row) => row.dataset.match === "true");
  if (matches.length === 0) return false;
  const at = cursorIndex(rows) ?? -1;
  const ordered = step === 1 ? matches : [...matches].reverse();
  const next = ordered.find((row) => (step === 1 ? rows.indexOf(row) > at : at === -1 || rows.indexOf(row) < at)) ?? ordered[0]!;
  focusRow(next);
  return true;
}

/** Ctrl-d and Ctrl-u page within the cursor's column; the library's paging goes by height alone, which lands in the other one. */
export function pageColumn(root: HTMLElement, step: 1 | -1): boolean {
  const current = cursorRow(root);
  const column = current?.closest<HTMLElement>(NAV_COLUMN);
  return runListScroll(column ?? root, step, 0.5);
}
