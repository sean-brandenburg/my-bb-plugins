import type { Keymap } from "./reader.ts";

/**
 * Vertical motions, shared by every cursor and scroller: a highlighted option, a row, or a pane
 * with no cursor at all. Half and page are vim's Ctrl-d/u and Ctrl-f/b.
 */
export type Motion = "up" | "down" | "top" | "bottom" | "halfUp" | "halfDown" | "pageUp" | "pageDown";

/** vim's keys for each motion, arrows included. Spread into a keymap through `mapKeymap`. */
export const MOTION_KEYS: Keymap<Motion> = {
  j: "down",
  k: "up",
  "<Down>": "down",
  "<Up>": "up",
  gg: "top",
  G: "bottom",
  "<C-d>": "halfDown",
  "<C-u>": "halfUp",
  "<C-f>": "pageDown",
  "<C-b>": "pageUp",
};

/** The motions a text box can take without stealing letters: arrows and Ctrl-n/p, as in vim's completion menu. */
export const TEXT_BOX_MOTION_KEYS: Keymap<Motion> = {
  "<Down>": "down",
  "<Up>": "up",
  "<C-n>": "down",
  "<C-p>": "up",
};

/** A keymap with each command passed through `wrap`: `mapKeymap(MOTION_KEYS, (motion) => ({ kind: "move", motion }))`. */
export function mapKeymap<A, B>(keymap: Keymap<A>, wrap: (command: A) => B): Keymap<B> {
  return Object.fromEntries(Object.entries(keymap).map(([keys, command]) => [keys, wrap(command)]));
}

function forward(motion: Motion): boolean {
  return motion === "down" || motion === "halfDown" || motion === "pageDown" || motion === "bottom";
}

export interface StepOptions {
  /** A count from the keys: j and k move that many, gg and G go to that row. */
  count?: number | null;
  /** How many rows a page holds; half motions move half of it. */
  pageSize?: number;
  /** j past the last row comes back on the first, and k past the first on the last. */
  wrap?: boolean;
}

/**
 * Where a motion takes a cursor at `current` among `length` rows. With no cursor yet (null),
 * moving down or to the top lands on the first row and moving up or to the bottom on the last.
 * Null only when there are no rows.
 */
export function stepIndex(length: number, current: number | null, motion: Motion, options: StepOptions = {}): number | null {
  if (length === 0) return null;
  const last = length - 1;
  const clamp = (index: number) => Math.min(Math.max(index, 0), last);
  const count = options.count ?? null;
  const page = Math.max(1, options.pageSize ?? 10);
  if (motion === "top") return count === null ? 0 : clamp(count - 1);
  if (motion === "bottom") return count === null ? last : clamp(count - 1);
  if (current === null || current < 0 || current > last) return forward(motion) ? 0 : last;
  const size = motion === "down" || motion === "up" ? 1 : motion === "halfDown" || motion === "halfUp" ? Math.max(1, Math.floor(page / 2)) : page;
  const delta = (forward(motion) ? 1 : -1) * size * (count ?? 1);
  if (options.wrap === true && size === 1) return (((current + delta) % length) + length) % length;
  return clamp(current + delta);
}

/**
 * How many rows of a list fit in its visible height, for half and page motions: at least 1.
 * `fallbackRowHeight` stands in while the row has no height yet (or none to measure).
 */
export function visibleRowCount(list: Element, row: Element | null = list.firstElementChild, fallbackRowHeight = 0): number {
  const height = (row instanceof HTMLElement ? row.offsetHeight : 0) || fallbackRowHeight;
  if (height === 0) return 1;
  return Math.max(1, Math.floor(list.clientHeight / height));
}

export interface PaneScrollOptions {
  count?: number | null;
  /** Pixels j and k scroll. */
  line?: number;
  /** Share of the pane's height Ctrl-d/u scroll; Ctrl-f/b scroll `page`. */
  half?: number;
  page?: number;
  /** The height half and full pages are shares of, when something covers part of the pane: defaults to its clientHeight. */
  extent?: (pane: HTMLElement) => number;
  /** How the pane scrolls, for one that must first tell its owner (bb unpins a thread on a wheel event). */
  scrollBy?: (pane: HTMLElement, top: number) => void;
}

/** Scrolls a pane that has no cursor by a motion: j/k a line, Ctrl-d/u half a page, gg/G to the ends. */
export function scrollPane(pane: HTMLElement, motion: Motion, options: PaneScrollOptions = {}): void {
  const count = options.count ?? 1;
  const height = options.extent?.(pane) ?? pane.clientHeight;
  let top: number;
  if (motion === "top") top = -pane.scrollTop;
  else if (motion === "bottom") top = pane.scrollHeight - pane.clientHeight - pane.scrollTop;
  else {
    const size = motion === "down" || motion === "up" ? (options.line ?? 40) : height * (motion === "halfDown" || motion === "halfUp" ? (options.half ?? 0.5) : (options.page ?? 0.9));
    top = (forward(motion) ? 1 : -1) * size * count;
  }
  if (options.scrollBy !== undefined) options.scrollBy(pane, top);
  // jsdom has no scrollBy.
  else if (typeof pane.scrollBy === "function") pane.scrollBy({ top, behavior: "instant" });
  else pane.scrollTop += top;
}
