/** Height of a file's sticky header; keyboard jumps land content just below it. */
export const STICKY_HEADER_PX = 36;

/** Scroll the diff so `element` sits just below the sticky file header. */
export function scrollToElement(main: HTMLElement, element: Element): void {
  const offset = element.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
  main.scrollTo({ top: Math.max(0, offset - STICKY_HEADER_PX), behavior: "auto" });
}

/** Where the keyboard cursor rests: the middle of the diff below the sticky file header. */
export function cursorLineY(main: HTMLElement): number {
  const view = main.getBoundingClientRect();
  return (view.top + STICKY_HEADER_PX + view.bottom) / 2;
}

export type RevealBlock = "center" | "start" | "end" | "nearest";

/** How far from the scroller's edge a box revealed "nearest" ends up, like a small `scrolloff`. */
const NEAREST_MARGIN_PX = 2 * STICKY_HEADER_PX;

/**
 * Scroll the diff so a box (in viewport coordinates) sits at the cursor line, like vim with a large `scrolloff`, or at
 * the top or bottom when `block` says so. "nearest" leaves a box already in view alone and otherwise scrolls just far
 * enough to show it, like vim's default `scrolloff`: a page of prose with code under it reads top to bottom. Near
 * either end of the diff the scroll stops short and the box stays off centre.
 */
export function revealBox(main: HTMLElement, box: { top: number; height: number }, block: RevealBlock = "center"): void {
  const view = main.getBoundingClientRect();
  let delta: number;
  if (block === "nearest") {
    const above = box.top - (view.top + NEAREST_MARGIN_PX);
    const below = box.top + box.height - (view.bottom - NEAREST_MARGIN_PX);
    delta = above < 0 ? above : below > 0 ? Math.min(below, above) : 0;
  } else {
    delta = block === "start" ? box.top - (view.top + STICKY_HEADER_PX) : block === "end" ? box.top + box.height - view.bottom : box.top + box.height / 2 - cursorLineY(main);
  }
  if (delta !== 0) main.scrollTo({ top: Math.max(0, main.scrollTop + delta), behavior: "auto" });
}
