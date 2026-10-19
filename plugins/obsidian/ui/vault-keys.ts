// Vim-style keys for the Vault page and its right-panel tabs. Each surface is its own React
// root, so routing between them goes through module state here.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { editField, fieldInput, fieldRowOf, focusWhenShown, isShown, type ListCommandOptions, returnToRowAfterFrame, runListMotion, runListScroll, useKeyScope } from "bb-vim-keys/react";
import { createStore } from "./state";
import { KEYMAP, PAGE_STEPS, type VaultCommand } from "./vault-nav";

export type Surface = "page" | "files" | "outline" | "backlinks";

export { focusRow, readRows } from "bb-vim-keys";

/** What a surface should put focus on when the keys move to it; the default is its cursor row. */
export type FocusIntent = "search";

const focusRequests = createStore<{ surface: Surface; intent?: FocusIntent } | null>(null);

/** Moves the keys to a surface; a panel tab that hasn't mounted yet takes it when it does. */
export function requestSurfaceFocus(surface: Surface, intent?: FocusIntent): void {
  focusRequests.set({ surface, intent });
}

/** How long a tab that is still opening may take to show. */
const SHOW_WAIT_MS = 500;

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
    // A tab that just opened lays out on the next frame.
    requestAnimationFrame(() => focusWhenShown(() => root, { timeoutMs: SHOW_WAIT_MS, focus: () => handler.current(request.intent) }));
  }, [request, surface, root]);
}

/**
 * Vim-style keys for one surface. Keys count only when they come from inside it (or from nowhere
 * in particular, when it was the last surface used), so bb's sidebar, the composer and other
 * plugins keep theirs. `onCommand` returns false when the key did nothing, so it keeps its default.
 * With `fieldFallback`, Escape in a text box puts the cursor on the box's row, else on what that returns.
 */
export function useVaultKeys(
  surface: Surface,
  root: HTMLElement | null,
  onCommand: (command: VaultCommand, count: number | null) => boolean,
  fieldFallback?: () => HTMLElement | null,
): void {
  useKeyScope(root, true, {
    keymap: KEYMAP,
    group: "vault",
    primary: surface === "page",
    // Arriving from bb's sidebar leaves focus on its link, where vault keys would be ignored.
    takeFocus: surface === "page",
    counts: true,
    onCommand: (command, { count }) => onCommand(command, count),
    onTextEscape: fieldFallback === undefined ? undefined : (field) => returnToRowAfterFrame(field, fieldFallback),
  });
}

/** i on a text box's row: types in that box. False when the cursor isn't on one. */
export function editFieldAtCursor(): boolean {
  const row = fieldRowOf(document.activeElement);
  const input = row === null ? null : fieldInput(row);
  if (input === null) return false;
  editField(input);
  return true;
}

/**
 * The list motions every row list shares: j/k/gg/G/h/l move the cursor, Ctrl-d/u/f/b page it,
 * and activating a row clicks it. False when the command isn't a list motion or there are no rows.
 */
export function runListCommand(container: Element, command: VaultCommand, options: ListCommandOptions = {}): boolean {
  if (command.kind === "scroll") {
    const { step, share } = PAGE_STEPS[command.motion];
    return runListScroll(container, step, share, options);
  }
  if (command.kind === "list") return runListMotion(container, command.motion, options);
  return false;
}

/** The mounted Vault pages, for their bb commands, which are registered outside React. */
const vaultPages = new Set<{ root: HTMLElement; toggleMode: () => void }>();

/** Lets the Vault page's bb commands reach it while `root` is mounted. */
export function useVaultPageCommands(root: HTMLElement | null, toggleMode: () => void): void {
  const toggle = useRef(toggleMode);
  toggle.current = toggleMode;
  useEffect(() => {
    if (root === null) return;
    const page = { root, toggleMode: () => toggle.current() };
    vaultPages.add(page);
    return () => void vaultPages.delete(page);
  }, [root]);
}

function shownVaultPage() {
  return [...vaultPages].find((page) => isShown(page.root));
}

export function vaultPageShown(): boolean {
  return shownVaultPage() !== undefined;
}

export function toggleVaultViewMode(): void {
  shownVaultPage()?.toggleMode();
}
