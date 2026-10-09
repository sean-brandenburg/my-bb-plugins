/** Height of a file's sticky header; keyboard jumps land content just below it. */
const STICKY_HEADER_PX = 36;

/** Scroll the diff so `element` sits just below the sticky file header. */
export function scrollToElement(main: HTMLElement, element: Element): void {
  const offset = element.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
  main.scrollTo({ top: Math.max(0, offset - STICKY_HEADER_PX), behavior: "auto" });
}

/** Scroll to the next (or previous) element matching `selector` strictly below (above) the current reading position. */
export function stepTo(main: HTMLElement, selector: string, direction: 1 | -1): void {
  const mainTop = main.getBoundingClientRect().top + STICKY_HEADER_PX;
  const elements = Array.from(main.querySelectorAll(selector));
  const target =
    direction === 1
      ? elements.find((element) => element.getBoundingClientRect().top > mainTop + 2)
      : [...elements].reverse().find((element) => element.getBoundingClientRect().top < mainTop - 2);
  if (target !== undefined) scrollToElement(main, target);
}
