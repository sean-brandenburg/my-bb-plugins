import { isTextEntry, scrollParent } from "./targets.ts";

/**
 * Rows a cursor moves over carry `data-nav-row`: "group" for a row that opens and closes (a
 * folder, a service), "toolbar" for a row of buttons that h and l step across, "field" for a text
 * box the cursor stops on before typing, else "item".
 */
export const NAV_ROW = "[data-nav-row]";
/** Wraps a group's row and everything nested under it. */
export const NAV_GROUP = "[data-nav-group]";

export type ListMotion = "up" | "down" | "top" | "bottom" | "left" | "right" | "open";

/**
 * A row in display order; `parent` is the index of the group it sits in. A `fixed` group is
 * always open (a message in a list), so h leaves it rather than closing it.
 */
export type NavRow = { kind: "group"; expanded: boolean; parent: number | null; fixed?: boolean } | { kind: "item"; parent: number | null };

export type ListAction = { kind: "focus"; index: number } | { kind: "activate"; index: number };

/**
 * What a motion does from row `current`: move the cursor, or activate a row (open a note, toggle
 * a folder). h and l walk the tree the way file trees do. With no cursor yet, any motion lands on
 * `start`. Null when there's nowhere to go, so the surface may use the key itself.
 */
export function listAction(rows: readonly NavRow[], current: number | null, motion: ListMotion, start: number): ListAction | null {
  if (rows.length === 0) return null;
  if (current === null || current < 0 || current >= rows.length) return { kind: "focus", index: Math.min(Math.max(start, 0), rows.length - 1) };
  const row = rows[current]!;
  switch (motion) {
    case "up":
      return { kind: "focus", index: Math.max(current - 1, 0) };
    case "down":
      return { kind: "focus", index: Math.min(current + 1, rows.length - 1) };
    case "top":
      return { kind: "focus", index: 0 };
    case "bottom":
      return { kind: "focus", index: rows.length - 1 };
    case "open":
      if (row.kind === "group" && row.fixed) return rows[current + 1]?.parent === current ? { kind: "focus", index: current + 1 } : null;
      return { kind: "activate", index: current };
    case "right":
      if (row.kind === "item" || !row.expanded) return { kind: "activate", index: current };
      return rows[current + 1]?.parent === current ? { kind: "focus", index: current + 1 } : null;
    case "left":
      if (row.kind === "group" && row.expanded && !row.fixed) return { kind: "activate", index: current };
      return row.parent === null ? null : { kind: "focus", index: row.parent };
  }
}

/** The option `step` places from `current`, wrapping. */
export function cycle<T>(options: readonly T[], current: T, step: 1 | -1): T {
  const index = options.indexOf(current);
  return options[(index + step + options.length) % options.length]!;
}

/** The index `step` places from `current` among `count`, wrapping; with none chosen yet, forward starts at the first and back at the last. */
export function stepWrapping(count: number, current: number | null, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (current === null || current < 0 || current >= count) return step === 1 ? 0 : count - 1;
  return (current + step + count) % count;
}

function isExpanded(element: Element): boolean {
  return (element.getAttribute("aria-expanded") ?? element.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")) === "true";
}

/** The rows on screen in `container`, skipping any that are leaving (inert while their exit plays). */
export function readRows(container: Element): { elements: HTMLElement[]; rows: NavRow[] } {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(NAV_ROW)).filter((element) => element.closest("[inert]") === null && element.getClientRects().length > 0);
  const headerOf = new Map<Element, number>();
  elements.forEach((element, index) => {
    const group = element.closest(NAV_GROUP);
    if (element.dataset.navRow === "group" && group !== null && !headerOf.has(group)) headerOf.set(group, index);
  });
  const rows = elements.map((element, index): NavRow => {
    let group = element.closest(NAV_GROUP);
    // A group's own row sits inside its wrapper, so its parent is the next wrapper out.
    if (group !== null && headerOf.get(group) === index) group = group.parentElement?.closest(NAV_GROUP) ?? null;
    const parent = group === null || !container.contains(group) ? null : (headerOf.get(group) ?? null);
    if (element.dataset.navRow !== "group") return { kind: "item", parent };
    const fixed = element.dataset.navFixed !== undefined;
    return { kind: "group", expanded: fixed || isExpanded(element), parent, ...(fixed ? { fixed } : {}) };
  });
  return { elements, rows };
}

/** The row holding focus, if focus is on or in one of `elements`. */
export function cursorIndex(elements: readonly HTMLElement[]): number | null {
  const active = document.activeElement;
  const index = elements.findIndex((element) => element === active || (active !== null && element.contains(active)));
  return index === -1 ? null : index;
}

export function isToolbar(row: HTMLElement): boolean {
  return row.dataset.navRow === "toolbar";
}

/** A toolbar row's buttons; a panel that opens from one of them is not part of the row. */
export function toolbarButtons(row: HTMLElement): HTMLButtonElement[] {
  return Array.from(row.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).filter(
    (button) => button.closest('[role="dialog"]') === null && button.getClientRects().length > 0,
  );
}

/** Puts the cursor on a row; a toolbar row keeps it on the button it is on, else takes it on its first. */
export function focusRow(element: HTMLElement): void {
  const toolbar = isToolbar(element);
  const buttons = toolbar ? toolbarButtons(element) : [];
  const target = toolbar ? (buttons.find((button) => button === document.activeElement) ?? buttons[0] ?? element) : element;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}

/** Where editing a field puts the caret: vim's i and a. */
export type Caret = "start" | "end";

/** Focuses a field for typing with the caret at one end. */
export function editField(field: HTMLElement, caret: Caret = "end"): void {
  field.focus({ preventScroll: true });
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !isTextEntry(field)) return;
  const at = caret === "start" ? 0 : field.value.length;
  try {
    field.setSelectionRange(at, at);
  } catch {
    // Some input types (email, number) have no caret to place.
  }
}

/** The text box a "field" row holds. */
export function fieldInput(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)");
}

/** The field row around a text box, so Escape from typing leaves the cursor on it. */
export function fieldRowOf(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>('[data-nav-row="field"]') ?? null;
}

/**
 * Vim's Ctrl-d and friends for a cursor: moves it `share` of its pane's height through `rows` and
 * scrolls the pane by as much, so it stays where it was on screen.
 */
export function pageCursor(rows: readonly HTMLElement[], current: HTMLElement, step: 1 | -1, share: number): void {
  const pane = scrollParent(current);
  const from = current.getBoundingClientRect().top;
  const target = from + step * share * (pane?.clientHeight ?? window.innerHeight);
  let best = current;
  for (const row of rows) {
    if (Math.abs(row.getBoundingClientRect().top - target) < Math.abs(best.getBoundingClientRect().top - target)) best = row;
  }
  if (best === current) best = rows[rows.indexOf(current) + step] ?? current;
  pane?.scrollBy({ top: best.getBoundingClientRect().top - from });
  focusRow(best);
}

/**
 * Scrolls `share` of a page and, like vim, moves the cursor only when the scroll took it out of
 * view: to the first item now in view going down, the last going up. Returns where the cursor goes.
 */
export function scrollKeepingCursor(scroller: HTMLElement, items: readonly HTMLElement[], current: HTMLElement | null, step: 1 | -1, share = 0.5): HTMLElement | null {
  scroller.scrollBy({ top: step * scroller.clientHeight * share, behavior: "instant" });
  const view = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
  const inView = items.filter((item) => {
    const rect = item.getBoundingClientRect();
    return rect.top >= view.top && rect.bottom <= view.bottom;
  });
  if (current !== null && inView.includes(current)) return current;
  return (step === 1 ? inView[0] : inView[inView.length - 1]) ?? current;
}

export interface ListCommandOptions {
  /** Where a cursor that isn't on a row yet lands. */
  start?: (elements: HTMLElement[]) => number;
  /** Takes over activating a row (a tree row toggling or opening); the row is clicked otherwise. */
  onActivate?: (row: HTMLElement, motion: "open" | "right" | "left") => void;
}

/**
 * The list motions row lists share: j/k/gg/G/h/l move the cursor, a toolbar row steps across its
 * buttons, a field row starts typing on l, o or Enter, and activating any other row clicks it.
 * False when there are no rows or nowhere to go, so the surface may act on the key instead.
 */
export function runListMotion(container: Element, motion: ListMotion, options: ListCommandOptions = {}): boolean {
  const { elements, rows } = readRows(container);
  if (elements.length === 0) return false;
  const current = cursorIndex(elements);
  // With no cursor, h and l mean the surface's own left and right, not a row's.
  if (current === null && (motion === "left" || motion === "right")) return false;
  const row = current === null ? null : elements[current]!;
  if (row !== null && isToolbar(row) && motion !== "up" && motion !== "down" && motion !== "top" && motion !== "bottom") {
    const buttons = toolbarButtons(row);
    const at = buttons.findIndex((button) => button === document.activeElement);
    if (motion === "open") {
      (buttons[at] ?? buttons[0])?.click();
      return true;
    }
    const next = buttons[at + (motion === "right" ? 1 : -1)];
    // Past either end of the toolbar the key falls through to the surface.
    if (at === -1 || next === undefined) return false;
    next.focus({ preventScroll: true });
    return true;
  }
  if (row !== null && row.dataset.navRow === "field" && (motion === "open" || motion === "right")) {
    const input = fieldInput(row);
    if (input === null) return false;
    editField(input, "end");
    return true;
  }
  const action = listAction(rows, current, motion, options.start?.(elements) ?? 0);
  if (action === null) return false;
  const element = elements[action.index]!;
  if (action.kind === "focus") {
    focusRow(element);
    return true;
  }
  const activation = motion === "open" || motion === "right" || motion === "left" ? motion : "open";
  if (options.onActivate !== undefined) options.onActivate(element, activation);
  else element.click();
  return true;
}

/** Ctrl-d/u/f/b over a row list: pages the cursor, or puts it on the start row if it has none. False with no rows. */
export function runListScroll(container: Element, step: 1 | -1, share: number, options: Pick<ListCommandOptions, "start"> = {}): boolean {
  const { elements } = readRows(container);
  if (elements.length === 0) return false;
  const current = cursorIndex(elements);
  if (current === null) focusRow(elements[Math.min(Math.max(options.start?.(elements) ?? 0, 0), elements.length - 1)]!);
  else pageCursor(elements, elements[current]!, step, share);
  return true;
}
