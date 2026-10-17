import type { RefObject } from "react";
import { isTextEntry, OPEN_DIALOG, useKeyScope } from "bb-vim-keys/react";
import { type BoardCommand, KEYMAP } from "./board-nav";
import { KANBAN_MENU, stepMenu } from "./primitives";

/** The plugin's own menus; bb's are left alone. */
const OPEN_MENU = `.${KANBAN_MENU}[data-state="open"]`;
/** While a menu is open its keys are its own; the board's would act behind it. */
const BLOCKED_BY = `${OPEN_DIALOG}, ${OPEN_MENU}`;
/** Marks the board, its header and its card panel: the places a keypress may come from. */
const SCOPE = "[data-kanban-keys]";

/**
 * Vim-style board shortcuts. Keys count only when they come from the board's own surfaces (or
 * nowhere in particular), so the thread list, other plugins' panels and every text box keep theirs.
 */
export function useBoardKeys(rootRef: RefObject<HTMLElement | null>, enabled: boolean, onCommand: (command: BoardCommand) => void): void {
  useKeyScope(rootRef, enabled, {
    keymap: KEYMAP,
    alsoWithin: SCOPE,
    blockedBy: BLOCKED_BY,
    // Arriving from the sidebar leaves focus on its link, where board keys would be ignored.
    takeFocus: true,
    onCommand,
    // A menu opened with the mouse can leave focus on its trigger or the page; j and k still belong to the menu.
    intercept: (event, token) => {
      if (token !== "j" && token !== "k") return false;
      const menu = document.querySelector<HTMLElement>(OPEN_MENU);
      if (menu === null || isTextEntry(event.target instanceof Element ? event.target : null)) return false;
      stepMenu(menu, token === "j" ? 1 : -1);
      return true;
    },
  });
}
