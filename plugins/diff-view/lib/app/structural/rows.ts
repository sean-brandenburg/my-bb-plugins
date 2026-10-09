import type { DiffSide, StructuralDiff } from "../../types";

/** Unchanged lines kept visible on each side of a change, GitHub-style. */
export const CONTEXT_LINES = 3;

/** One row of the side-by-side view; a null side is a blank cell. */
export interface StructuralRow {
  index: number;
  lhs: number | null;
  rhs: number | null;
  changed: boolean;
}

export function structuralRows(diff: StructuralDiff): StructuralRow[] {
  const oldChanged = new Set(diff.oldChanges.map((entry) => entry.line));
  const newChanged = new Set(diff.newChanges.map((entry) => entry.line));
  return diff.aligned.map(([lhs, rhs], index) => ({
    index,
    lhs,
    rhs,
    changed: lhs === null || rhs === null || oldChanged.has(lhs) || newChanged.has(rhs),
  }));
}

/**
 * The rows left unfolded: changes and their context, rows the user expanded, and the context around every finding
 * (new-side lines) and comment thread, which can sit on lines this view would otherwise fold away because GitHub's
 * hunks carry more context than difftastic's.
 */
export function visibleRows(
  rows: readonly StructuralRow[],
  {
    revealed,
    findingLines,
    threads,
  }: { revealed: ReadonlySet<number>; findingLines: ReadonlyArray<number | null>; threads: ReadonlyArray<{ line: number | null; side: DiffSide }> },
): Set<number> {
  const visible = new Set<number>(revealed);
  const showAround = (index: number) => {
    for (let i = Math.max(0, index - CONTEXT_LINES); i <= Math.min(rows.length - 1, index + CONTEXT_LINES); i++) visible.add(i);
  };
  for (const row of rows) if (row.changed) showAround(row.index);
  const rowByOldLine = new Map<number, number>();
  const rowByNewLine = new Map<number, number>();
  for (const row of rows) {
    if (row.lhs !== null) rowByOldLine.set(row.lhs, row.index);
    if (row.rhs !== null) rowByNewLine.set(row.rhs, row.index);
  }
  for (const line of findingLines) {
    const index = line === null ? undefined : rowByNewLine.get(line);
    if (index !== undefined) showAround(index);
  }
  for (const thread of threads) {
    const index = thread.line === null ? undefined : (thread.side === "LEFT" ? rowByOldLine : rowByNewLine).get(thread.line);
    if (index !== undefined) showAround(index);
  }
  return visible;
}

/** The hunk starting at row `index`: its last visible row, and the line span on the side it is numbered by (new, unless it only deletes). */
export function hunkSpan(rows: readonly StructuralRow[], visible: ReadonlySet<number>, index: number): { end: number; side: "old" | "new"; start: number; stop: number } {
  let end = index;
  while (end + 1 < rows.length && visible.has(end + 1)) end += 1;
  const slice = rows.slice(index, end + 1);
  const news = slice.map((row) => row.rhs).filter((line): line is number => line !== null);
  const olds = slice.map((row) => row.lhs).filter((line): line is number => line !== null);
  const side: "old" | "new" = news.length > 0 ? "new" : "old";
  const lines = side === "new" ? news : olds;
  return { end, side, start: Math.min(...lines), stop: Math.max(...lines) };
}
