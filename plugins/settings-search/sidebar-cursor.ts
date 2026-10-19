import { type Keymap, stepIndex, visibleRowCount } from "bb-vim-keys";
import { CURSOR_ATTRIBUTE, CURSOR_MOTION_KEYS, type CursorMotion } from "./page-cursor.js";

export const SETTINGS_LINK = 'a[href^="/settings"]';
const FALLBACK_ROW_HEIGHT_PX = 28;

export type SidebarCommand = CursorMotion | "escape";

export const SIDEBAR_CURSOR_KEYMAP: Keymap<SidebarCommand> = {
  ...CURSOR_MOTION_KEYS,
  "<Esc>": "escape",
};

export interface SidebarCursor {
  /** Runs a command on the page list; false when it did nothing, leaving its key to the page. */
  run(command: SidebarCommand): boolean;
  /** Shows the cursor on the open page's link. */
  show(): void;
  hide(): void;
  /** Keeps a showing cursor on the open page's link after a navigation it didn't make. */
  sync(): void;
  dispose(): void;
}

/**
 * A cursor over the settings sidebar's page list. Moving it opens the page
 * under it, so the page beside it is always the one it points at.
 */
export function createSidebarCursor(win: Window, nav: () => Element | null): SidebarCursor {
  let ring: Element | null = null;

  const links = () => [...(nav()?.querySelectorAll<HTMLAnchorElement>(SETTINGS_LINK) ?? [])];

  /** The open page's link: the longest one the path starts with, so a project's page counts as Projects. */
  const here = (list: HTMLAnchorElement[]): number => {
    const path = win.location.pathname;
    let found = -1;
    let length = -1;
    list.forEach((link, at) => {
      const href = link.getAttribute("href")!;
      const matches = path === href || path.startsWith(`${href}/`);
      if (matches && href.length > length) [found, length] = [at, href.length];
    });
    return found;
  };

  const mark = (link: Element | undefined) => {
    ring?.removeAttribute(CURSOR_ATTRIBUTE);
    ring = link ?? null;
    if (!link) return;
    link.setAttribute(CURSOR_ATTRIBUTE, "");
    link.scrollIntoView({ block: "nearest" });
  };

  const run = (command: SidebarCommand): boolean => {
    if (command === "escape") {
      if (!ring) return false;
      mark(undefined);
      return true;
    }
    const list = links();
    if (list.length === 0) return true;
    const at = here(list);
    const link = list[stepIndex(list.length, at < 0 ? null : at, command, { pageSize: visibleRowCount(nav()!, list[0], FALLBACK_ROW_HEIGHT_PX) })!]!;
    if (link.getAttribute("href") !== win.location.pathname) link.click();
    mark(link);
    return true;
  };

  return {
    run,
    show: () => {
      const list = links();
      mark(list[here(list)]);
    },
    hide: () => mark(undefined),
    sync() {
      if (!ring) return;
      const list = links();
      const link = list[here(list)];
      if (link !== ring) mark(link);
    },
    dispose() {
      mark(undefined);
    },
  };
}
