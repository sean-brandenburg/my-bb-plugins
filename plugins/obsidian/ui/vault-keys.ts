// Vim-style keys for the Vault page and its right-panel tabs. Each surface is its own React
// root, so routing between them goes through module state here.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { fieldInput, type ListCommandOptions, runListMotion, runListScroll, useKeyScope } from "bb-vim-keys/react";
import { createStore } from "./state";
import { KEYMAP, type VaultCommand } from "./vault-nav";

export type Surface = "page" | "files" | "outline" | "backlinks";

export { fieldRowOf, focusRow, readRows } from "bb-vim-keys";

function isShown(element: HTMLElement | undefined): element is HTMLElement {
  return element !== undefined && element.isConnected && element.getClientRects().length > 0;
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
 * Vim-style keys for one surface. Keys count only when they come from inside it (or from nowhere
 * in particular, when it was the last surface used), so bb's sidebar, the composer and other
 * plugins keep theirs. `onCommand` returns false when the key did nothing, so it keeps its default.
 */
export function useVaultKeys(surface: Surface, root: HTMLElement | null, onCommand: (command: VaultCommand) => boolean): void {
  useKeyScope(root, true, {
    keymap: KEYMAP,
    group: "vault",
    primary: surface === "page",
    // Arriving from bb's sidebar leaves focus on its link, where vault keys would be ignored.
    takeFocus: surface === "page",
    onCommand,
    onTextEscape: () => onCommand({ kind: "escape", fromField: true }),
  });
}

/** i on a text box's row: types in that box. False when the cursor isn't on one. */
export function editFieldAtCursor(): boolean {
  const row = document.activeElement instanceof HTMLElement && document.activeElement.dataset.navRow === "field" ? document.activeElement : null;
  const input = row === null ? null : fieldInput(row);
  if (input === null) return false;
  input.focus({ preventScroll: true });
  return true;
}

/**
 * The list motions every row list shares: j/k/gg/G/h/l move the cursor, Ctrl-d/u/f/b page it,
 * and activating a row clicks it. False when the command isn't a list motion or there are no rows.
 */
export function runListCommand(container: Element, command: VaultCommand, options: ListCommandOptions = {}): boolean {
  if (command.kind === "scroll") return runListScroll(container, command.step, command.amount === "half" ? 0.5 : 1, options);
  if (command.kind === "list") return runListMotion(container, command.motion, options);
  return false;
}
