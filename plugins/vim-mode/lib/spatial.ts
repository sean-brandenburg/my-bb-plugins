export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type Direction = "left" | "right" | "up" | "down";

/** Groups boxes, given in document order, into visual rows sorted left to right; a box joins a row it overlaps vertically. */
function rowsOf(boxes: readonly Box[]): number[][] {
  const rows: number[][] = [];
  let top = 0;
  let bottom = 0;
  boxes.forEach((box, index) => {
    const row = rows[rows.length - 1];
    if (row !== undefined && box.top < bottom && box.bottom > top) {
      row.push(index);
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    } else {
      rows.push([index]);
      top = box.top;
      bottom = box.bottom;
    }
  });
  return rows.map((row) => row.sort((a, b) => boxes[a]!.left - boxes[b]!.left));
}

function horizontalGap(a: Box, b: Box): number {
  return Math.max(0, a.left - b.right, b.left - a.right);
}

/**
 * h/j/k/l over things laid out in two dimensions (a form's fields and buttons): left and right
 * within a visual row, up and down to the neighbouring row's box nearest horizontally (the
 * leftmost of those it lines up with). Null at an edge. From no box (-1), any direction lands on the first.
 */
export function spatialStep(boxes: readonly Box[], index: number, direction: Direction): number | null {
  if (boxes.length === 0) return null;
  if (index === -1) return 0;
  const rows = rowsOf(boxes);
  const rowIndex = rows.findIndex((row) => row.includes(index));
  const row = rows[rowIndex]!;
  const at = row.indexOf(index);
  if (direction === "left") return row[at - 1] ?? null;
  if (direction === "right") return row[at + 1] ?? null;
  const target = rows[rowIndex + (direction === "down" ? 1 : -1)];
  if (target === undefined) return null;
  const from = boxes[index]!;
  return target.reduce((best, candidate) => (horizontalGap(boxes[candidate]!, from) < horizontalGap(boxes[best]!, from) ? candidate : best));
}
