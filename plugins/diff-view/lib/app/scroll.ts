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

/**
 * Scroll the diff so a box (in viewport coordinates) sits at the cursor line, like vim with a large `scrolloff`, or at
 * the top or bottom when `block` says so. Near either end of the diff the scroll stops short and the box stays off
 * centre.
 */
export function revealBox(main: HTMLElement, box: { top: number; height: number }, block: "center" | "start" | "end" = "center"): void {
  const view = main.getBoundingClientRect();
  const delta = block === "start" ? box.top - (view.top + STICKY_HEADER_PX) : block === "end" ? box.top + box.height - view.bottom : box.top + box.height / 2 - cursorLineY(main);
  if (delta !== 0) main.scrollTo({ top: Math.max(0, main.scrollTop + delta), behavior: "auto" });
}
