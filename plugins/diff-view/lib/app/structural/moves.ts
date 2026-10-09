/** A run of identical deleted and added lines at least this long reads as a move rather than a rewrite. */
const MOVE_MIN_LINES = 3;

export interface MovedRow {
  /** Row index of the matching line on the other side. */
  counterpart: number;
  /** Line number on the other side, for the label. */
  counterpartLine: number;
  first: boolean;
}

/** Pair up blocks of pure deletions with identical blocks of pure additions; difftastic reports both as novel. */
export function detectMoves(rows: Array<{ index: number; lhs: number | null; rhs: number | null }>, oldLines: string[], newLines: string[]): Map<number, MovedRow> {
  const moved = new Map<number, MovedRow>();
  const addedByText = new Map<string, number[]>();
  for (const row of rows) {
    if (row.lhs !== null || row.rhs === null) continue;
    const text = (newLines[row.rhs - 1] ?? "").trim();
    if (text === "") continue;
    const list = addedByText.get(text) ?? [];
    list.push(row.index);
    addedByText.set(text, list);
  }
  const isDeleted = (index: number) => rows[index] !== undefined && rows[index]!.rhs === null && rows[index]!.lhs !== null;
  const isAdded = (index: number) => rows[index] !== undefined && rows[index]!.lhs === null && rows[index]!.rhs !== null;
  const textAt = (index: number) => {
    const row = rows[index]!;
    return (row.lhs !== null ? oldLines[row.lhs - 1] : newLines[row.rhs! - 1])?.trim() ?? "";
  };
  for (let i = 0; i < rows.length; i++) {
    if (!isDeleted(i) || moved.has(i)) continue;
    const text = textAt(i);
    if (text === "") continue;
    for (const j of addedByText.get(text) ?? []) {
      if (moved.has(j)) continue;
      let length = 0;
      let nonBlank = 0;
      while (isDeleted(i + length) && isAdded(j + length) && !moved.has(i + length) && !moved.has(j + length) && textAt(i + length) === textAt(j + length)) {
        if (textAt(i + length) !== "") nonBlank += 1;
        length += 1;
      }
      if (length < MOVE_MIN_LINES || nonBlank < 2) continue;
      for (let k = 0; k < length; k++) {
        moved.set(i + k, { counterpart: j + k, counterpartLine: rows[j + k]!.rhs!, first: k === 0 });
        moved.set(j + k, { counterpart: i + k, counterpartLine: rows[i + k]!.lhs!, first: k === 0 });
      }
      i += length - 1;
      break;
    }
  }
  return moved;
}
