export function rangesOverlap(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([from, to]) => start <= to && end >= from);
}
