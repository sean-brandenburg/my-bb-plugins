import type { RefObject } from "react";
import { isTextEntry, type KeyToken, OPEN_DIALOG, stepMenu, useKeyScope } from "bb-vim-keys/react";
import { type BoardCommand, KEYMAP } from "./board-nav";
import { KANBAN_MENU } from "./primitives";

/** The plugin's own menus; bb's are left alone. */
const OPEN_MENU = `.${KANBAN_MENU}[data-state="open"]`;
/** While a menu is open its keys are its own; the board's and the card's would act behind it. */
export const BLOCKED_BY = `${OPEN_DIALOG}, ${OPEN_MENU}`;
/** Marks the board, its header and the todo list: the places a keypress may come from. The card panel has its own keys. */
const SCOPE = "[data-kanban-keys]";

/**
 * A menu opened with the mouse can leave focus on its trigger or the page; j and k still belong
 * to the menu. For a key handler's `intercept`.
 */
export function stepOpenMenu(event: KeyboardEvent, token: KeyToken): boolean {
  if (token !== "j" && token !== "k") return false;
  const menu = document.querySelector<HTMLElement>(OPEN_MENU);
  if (menu === null || isTextEntry(event.target instanceof Element ? event.target : null)) return false;
  return stepMenu(menu, token === "j" ? 1 : -1);
}

/**
 * Vim-style board shortcuts. Keys count only when they come from the board's own surfaces (or
 * nowhere in particular), so the thread list, other plugins' panels and every text box keep theirs.
 * `onTextEscape` sees Escape in one of the surfaces' text boxes; false leaves it.
 */
export function useBoardKeys(rootRef: RefObject<HTMLElement | null>, enabled: boolean, onCommand: (command: BoardCommand) => void, onTextEscape: () => boolean): void {
  useKeyScope(rootRef, enabled, {
    keymap: KEYMAP,
    alsoWithin: SCOPE,
    blockedBy: BLOCKED_BY,
    // Arriving from the sidebar leaves focus on its link, where board keys would be ignored.
    takeFocus: true,
    onCommand,
    onTextEscape,
    intercept: stepOpenMenu,
  });
}
