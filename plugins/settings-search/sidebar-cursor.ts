import { createKeyReader, type Keymap, keyToken } from "bb-vim-keys";
import { CURSOR_ATTRIBUTE } from "./page-cursor.js";

export const SETTINGS_LINK = 'a[href^="/settings"]';
const FALLBACK_ROW_HEIGHT_PX = 28;

type SidebarCommand = "down" | "up" | "top" | "bottom" | "escape" | "half-down" | "half-up";

const SIDEBAR_KEYMAP: Keymap<SidebarCommand> = {
  j: "down",
  k: "up",
  gg: "top",
  G: "bottom",
  "<Esc>": "escape",
  "<C-d>": "half-down",
  "<C-u>": "half-up",
};

export interface SidebarCursor {
  /** Handles a keydown while the page list has the keys; returns true when it was a cursor key. */
  handleKey(event: KeyboardEvent): boolean;
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
  const reader = createKeyReader(SIDEBAR_KEYMAP);

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

  const go = (target: number) => {
    const list = links();
    if (list.length === 0) return;
    const link = list[Math.max(0, Math.min(list.length - 1, target))]!;
    if (link.getAttribute("href") !== win.location.pathname) link.click();
    mark(link);
  };

  const halfList = (): number => {
    const list = nav();
    const rowHeight = links()[0]?.getBoundingClientRect().height || FALLBACK_ROW_HEIGHT_PX;
    return Math.max(1, Math.floor((list?.clientHeight ?? 0) / rowHeight / 2));
  };

  const handleKey = (event: KeyboardEvent): boolean => {
    const token = keyToken(event);
    if (token === null) return false;
    const read = reader.read(token, event.timeStamp);
    if (read.kind !== "command") return read.kind === "pending";
    switch (read.command) {
      case "half-down":
      case "half-up":
        go(here(links()) + (read.command === "half-down" ? 1 : -1) * halfList());
        return true;
      case "down":
      case "up":
        go(here(links()) + (read.command === "down" ? 1 : -1));
        return true;
      case "top":
        go(0);
        return true;
      case "bottom":
        go(Infinity);
        return true;
      case "escape":
        if (!ring) return false;
        mark(undefined);
        return true;
    }
  };

  return {
    handleKey,
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
