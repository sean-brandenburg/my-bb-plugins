/** Computed line height in pixels, estimated from the font size for `normal`. */
export function lineHeightOf(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;
  const fontSize = parseFloat(style.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.2 : 16;
}

/**
 * The nearest element from `start` upward that is scrolling overflowing
 * content, or the document's scroller. `scroller` counts as scrollable even
 * without an `overflow` style.
 */
export function scrollParentOf(start: HTMLElement, scroller?: HTMLElement): HTMLElement {
  for (let current: HTMLElement | null = start; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    const scrollable = current === scroller || overflowY === "auto" || overflowY === "scroll";
    if (scrollable && current.scrollHeight > current.clientHeight) return current;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
