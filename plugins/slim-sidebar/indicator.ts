// Must match the rail's py-2, size-9, and gap-1 in rail.tsx.
const RAIL_PADDING_REM = 0.5;
const ITEM_SIZE_REM = 2.25;
const ITEM_GAP_REM = 0.25;

/** How far down the rail the item at `index` starts, as a CSS length. */
export function railItemOffset(index: number): string {
  return `${RAIL_PADDING_REM + Math.max(0, index) * (ITEM_SIZE_REM + ITEM_GAP_REM)}rem`;
}

export interface IndicatorState {
  /** Item the indicator sits behind; kept while hidden so it fades out in place. */
  index: number;
  visible: boolean;
  /** False when appearing from hidden, so it fades in under the item instead of sliding from wherever it last was. */
  slide: boolean;
}

export function nextIndicator(previous: IndicatorState | null, activeIndex: number): IndicatorState {
  if (activeIndex < 0) {
    return { index: previous?.index ?? 0, visible: false, slide: false };
  }
  return { index: activeIndex, visible: true, slide: previous?.visible === true };
}
