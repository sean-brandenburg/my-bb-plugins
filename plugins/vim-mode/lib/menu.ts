import { createKeyHandler, type KeyHandler } from "./handler.ts";
import type { Keymap } from "./reader.ts";

/** A menu's items that can take focus, in order. */
export const MENU_ITEM = '[role^="menuitem"]:not([data-disabled]):not([aria-disabled="true"])';

/**
 * Moves focus through a menu's items: a step clamped at the ends, or the first or last. With no
 * item focused, stepping down lands on the first and up on the last. False with no items.
 */
export function stepMenu(menu: Element, to: 1 | -1 | "first" | "last"): boolean {
  const items = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM));
  if (items.length === 0) return false;
  const at = items.findIndex((item) => item === menu.ownerDocument.activeElement);
  const index = to === "first" ? 0 : to === "last" ? items.length - 1 : at === -1 ? (to === 1 ? 0 : items.length - 1) : Math.min(Math.max(at + to, 0), items.length - 1);
  items[index]!.focus();
  return true;
}

function defaultMenu(event: KeyboardEvent): Element | null {
  return event.target instanceof Element ? event.target.closest('[role="menu"]') : null;
}

type MenuCommand = 1 | -1 | "first" | "last";

const MENU_KEYMAP: Keymap<MenuCommand> = { j: 1, k: -1, "<C-n>": 1, "<C-p>": -1, gg: "first", G: "last" };

/**
 * j/k (and gg/G) through an open menu. Radix menus take letters for typeahead, so hand this the
 * menu content's keydowns first; it takes only the keys it moves on. `menu` finds the menu, by
 * default the one holding the key's target; pass one for a menu opened with focus left elsewhere.
 */
export function createMenuKeys(menu: (event: KeyboardEvent) => Element | null = defaultMenu): KeyHandler {
  return createKeyHandler<MenuCommand>({
    keymap: MENU_KEYMAP,
    // Radix puts focus on the menu items themselves, which are buttons.
    leaveToPressables: false,
    onCommand: (to, { event }) => {
      const root = menu(event);
      return root !== null && stepMenu(root, to);
    },
  });
}
