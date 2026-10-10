// Vim-style keys for the Vault page and its right-panel tabs. Each surface is its own React
// root, so routing between them goes through module state here.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createStore } from "./state";
import { CTRL_KEYMAP, KEYMAP, listAction, type NavRow, PREFIX_KEYMAP, type VaultCommand } from "./vault-nav";

export type Surface = "page" | "files" | "outline" | "backlinks";

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
// Radix menus and listboxes take letters for typeahead without always claiming them.
const OWN_KEYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"]';
const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';
const PREFIX_TIMEOUT_MS = 500;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
const PREFIX_STARTS = new Set(Object.keys(PREFIX_KEYMAP).map((sequence) => sequence[0]!));

/**
 * Rows the cursor moves over carry `data-nav-row`: "group" for folders, "toolbar" for a row of
 * buttons that h and l step across, "field" for a text box the cursor stops on before typing,
 * else "item".
 */
export const NAV_ROW = "[data-nav-row]";
/** Wraps a folder's row and everything nested under it. */
const NAV_GROUP = "[data-nav-group]";

/** Whether keys typed at `element` are text, so j or Escape mean something there. */
export function isTextEntry(element: Element | null): boolean {
  if (element === null) return false;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type);
  return element.closest('textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

function isShown(element: HTMLElement | undefined): element is HTMLElement {
  return element !== undefined && element.isConnected && element.getClientRects().length > 0;
}

const roots = new Map<Surface, HTMLElement>();
let lastActive: Surface = "page";

/** The surface a key with no focused target belongs to: the one last touched, else the page. */
function bodyOwner(): Surface {
  return isShown(roots.get(lastActive)) ? lastActive : "page";
}

function insideAnySurface(element: Element): boolean {
  return [...roots.values()].some((root) => root.contains(element));
}

/** What a surface should put focus on when the keys move to it; the default is its cursor row. */
export type FocusIntent = "search";

const focusRequests = createStore<{ surface: Surface; intent?: FocusIntent } | null>(null);

/** Moves the keys to a surface; a panel tab that hasn't mounted yet takes it when it does. */
export function requestSurfaceFocus(surface: Surface, intent?: FocusIntent): void {
  focusRequests.set({ surface, intent });
}

/** Frames to wait for a tab that is still opening to show. */
const SHOW_WAIT_FRAMES = 30;

/**
 * Runs `onFocus` whenever focus is requested for `surface`, including a request made before
 * mounting, once `root` is on screen (a tab can stay mounted while hidden behind another).
 */
export function useSurfaceFocusRequest(surface: Surface, root: HTMLElement | null, onFocus: (intent: FocusIntent | undefined) => void): void {
  const request = useSyncExternalStore(focusRequests.subscribe, focusRequests.get);
  const handler = useRef(onFocus);
  handler.current = onFocus;
  useEffect(() => {
    if (request === null || request.surface !== surface || root === null) return;
    focusRequests.set(null);
    // Not cancelled on cleanup: clearing the request above re-runs this effect straight away.
    let frames = 0;
    const attempt = () => {
      if (!root.isConnected) return;
      if (isShown(root)) handler.current(request.intent);
      else if (++frames < SHOW_WAIT_FRAMES) requestAnimationFrame(attempt);
    };
    // A tab that just opened lays out on the next frame.
    requestAnimationFrame(attempt);
  }, [request, surface, root]);
}

/**
 * Single-key shortcuts for one surface. Keys count only when they come from inside it (or from
 * nowhere in particular, when it was the last surface used), so bb's sidebar, the composer and
 * other plugins keep theirs. `onCommand` returns false when the key did nothing, so it keeps its
 * default.
 */
export function useVaultKeys(surface: Surface, root: HTMLElement | null, onCommand: (command: VaultCommand) => boolean): void {
  const handler = useRef(onCommand);
  handler.current = onCommand;

  // Arriving from bb's sidebar leaves focus on its link, where vault keys would be ignored.
  useEffect(() => {
    if (surface !== "page" || root === null) return;
    const active = document.activeElement;
    if (active === null || active === document.body || (!insideAnySurface(active) && !isTextEntry(active) && active.closest(OWN_KEYS) === null)) {
      root.focus({ preventScroll: true });
    }
  }, [surface, root]);

  useEffect(() => {
    if (root === null) return;
    roots.set(surface, root);
    const claim = () => {
      lastActive = surface;
    };
    root.addEventListener("focusin", claim);
    root.addEventListener("pointerdown", claim);
    let pending: { key: string; at: number } | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.altKey || event.isComposing) return;
      // Shift's own keydown arrives between g and O; it mustn't end the pending prefix.
      if (MODIFIER_KEYS.has(event.key)) return;
      if (!isShown(root)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target === null || target === document.body) {
        if (bodyOwner() !== surface) return;
      } else if (!root.contains(target)) {
        return;
      }
      if (target?.closest(OWN_KEYS) != null || document.querySelector(OPEN_DIALOG) !== null) return;
      let command: VaultCommand | undefined;
      if (isTextEntry(target)) {
        // vim-mode keeps the first Escape in a text box to leave insert mode.
        if (event.key !== "Escape" || event.ctrlKey || event.shiftKey) return;
        command = { kind: "escape", fromField: true };
      } else if (event.key === "Enter" && target?.closest("button, a[href], input, summary") != null) {
        // Buttons and links keep Enter.
        return;
      } else if (event.ctrlKey) {
        command = event.shiftKey ? undefined : CTRL_KEYMAP[event.key];
      } else {
        const sequence = pending !== null && event.timeStamp - pending.at <= PREFIX_TIMEOUT_MS ? PREFIX_KEYMAP[pending.key + event.key] : undefined;
        if (sequence === undefined && PREFIX_STARTS.has(event.key)) {
          pending = { key: event.key, at: event.timeStamp };
          event.preventDefault();
          return;
        }
        command = sequence ?? KEYMAP[event.key];
      }
      pending = null;
      if (command === undefined) return;
      if (handler.current(command)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("focusin", claim);
      root.removeEventListener("pointerdown", claim);
      if (roots.get(surface) === root) roots.delete(surface);
    };
  }, [surface, root]);
}

function isExpanded(element: Element): boolean {
  return element.getAttribute("aria-expanded") === "true";
}

export function readRows(container: Element): { elements: HTMLElement[]; rows: NavRow[] } {
  const elements = [...container.querySelectorAll<HTMLElement>(NAV_ROW)].filter((element) => element.getClientRects().length > 0);
  const headerOf = new Map<Element, number>();
  elements.forEach((element, index) => {
    const group = element.closest(NAV_GROUP);
    if (element.dataset.navRow === "group" && group !== null && !headerOf.has(group)) headerOf.set(group, index);
  });
  const rows = elements.map((element, index): NavRow => {
    let group = element.closest(NAV_GROUP);
    // A folder's own row sits inside its wrapper, so its parent is the next wrapper out.
    if (group !== null && headerOf.get(group) === index) group = group.parentElement?.closest(NAV_GROUP) ?? null;
    const parent = group === null || !container.contains(group) ? null : (headerOf.get(group) ?? null);
    return element.dataset.navRow === "group" ? { kind: "group", expanded: isExpanded(element), parent } : { kind: "item", parent };
  });
  return { elements, rows };
}

/** The row holding focus, if focus is on one of `elements`. */
export function cursorIndex(elements: readonly HTMLElement[]): number | null {
  const active = document.activeElement;
  const index = elements.findIndex((element) => element === active || (active !== null && element.contains(active)));
  return index === -1 ? null : index;
}

/** The text box a "field" row holds; activating the row starts typing in it. */
function fieldInput(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)");
}

/** The field row around a text box, so Escape from typing leaves the cursor on it. */
export function fieldRowOf(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>('[data-nav-row="field"]') ?? null;
}

/** i on a text box's row: types in that box. False when the cursor isn't on one. */
export function editFieldAtCursor(): boolean {
  const row = document.activeElement instanceof HTMLElement && document.activeElement.dataset.navRow === "field" ? document.activeElement : null;
  const input = row === null ? null : fieldInput(row);
  if (input === null) return false;
  input.focus({ preventScroll: true });
  return true;
}

/** A toolbar row's buttons, which h and l step across. */
function toolbarButtons(row: HTMLElement): HTMLButtonElement[] {
  return [...row.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].filter((button) => button.getClientRects().length > 0);
}

/** Puts the cursor on a row; a toolbar row takes it on its first button. */
export function focusRow(element: HTMLElement): void {
  const target = element.dataset.navRow === "toolbar" ? (toolbarButtons(element)[0] ?? element) : element;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}

export function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Vim's Ctrl-d and friends for a cursor: moves it the given share of its pane's height through
 * `rows` and scrolls the pane by as much, so it stays where it was on screen.
 */
export function pageCursor(rows: HTMLElement[], current: HTMLElement, step: 1 | -1, share: number): void {
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
 * The list motions every row list shares: j/k/gg/G/h/l move the cursor, Ctrl-d/u/f/b page it,
 * and activating a row clicks it. `onActivate` may take over activation (a tree row toggling or
 * opening). False when the command isn't a list motion or there are no rows.
 */
export function runListCommand(
  container: Element,
  command: VaultCommand,
  options: { start?: (elements: HTMLElement[]) => number; onActivate?: (row: HTMLElement, motion: "open" | "right" | "left") => void } = {},
): boolean {
  if (command.kind !== "list" && command.kind !== "scroll") return false;
  const { elements, rows } = readRows(container);
  if (elements.length === 0) return false;
  const current = cursorIndex(elements);
  const start = options.start?.(elements) ?? 0;
  if (command.kind === "scroll") {
    const row = current === null ? elements[Math.min(Math.max(start, 0), elements.length - 1)]! : elements[current]!;
    if (current === null) focusRow(row);
    else pageCursor(elements, row, command.step, command.amount === "half" ? 0.5 : 1);
    return true;
  }
  const { motion } = command;
  // With no cursor, h and l mean the surface's own left and right, not a row's.
  if (current === null && (motion === "left" || motion === "right")) return false;
  const row = current === null ? null : elements[current]!;
  if (row !== null && row.dataset.navRow === "toolbar" && motion !== "up" && motion !== "down" && motion !== "top" && motion !== "bottom") {
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
  // l, o and Enter on a text box's row start typing in it.
  if (row !== null && row.dataset.navRow === "field" && (motion === "open" || motion === "right")) {
    const input = fieldInput(row);
    if (input === null) return false;
    input.focus({ preventScroll: true });
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.setSelectionRange(input.value.length, input.value.length);
    return true;
  }
  const action = listAction(rows, current, motion, start);
  // Nowhere to go: h past the tree's top level, say. The surface may act on the key instead.
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
