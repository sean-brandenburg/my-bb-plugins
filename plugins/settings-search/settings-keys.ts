import {
  ANY_OVERLAY,
  bindKeys,
  focusWhenShown,
  isTextEntry,
  type KeyHelpSection,
  type Keymap,
  keyToken,
  mapKeymap,
  renderKeyHelp,
} from "bb-vim-keys";
import { createPageCursor, CURSOR_ATTRIBUTE, PAGE_CURSOR_KEYMAP, PAGE_ROOT, type PageCommand } from "./page-cursor.js";
import { createSidebarCursor, SIDEBAR_CURSOR_KEYMAP, type SidebarCommand } from "./sidebar-cursor.js";

const STYLE_ATTRIBUTE = "data-settings-search-style";
const KEYS_ATTRIBUTE = "data-settings-search-keys";
const VIM_IGNORE_ATTRIBUTE = "data-vim-ignore";
// How long after a search pick to wait for bb to open the page and flash the setting.
const PICK_TIMEOUT_MS = 3000;

// bb's settings sidebar markup has no plugin contract, so these selectors
// follow the shipped DOM (bb 0.46); a bb update that renames them just leaves
// settings without these keys.
export const SETTINGS_SIDEBAR = '[data-testid="settings-sidebar-body"]';
export const PAGE_LIST = ':scope > [data-sidebar="content"]';
export const SEARCH_BOX = 'input[aria-label="Search settings"]';
const SEARCH_RESULT = '[role="listbox"][aria-label="Settings search results"] [role="option"]';
/** bb's mark on the setting a search opened, for as long as it flashes. */
const SEARCH_FLASH = "[data-settings-anchor].bb-search-flash";
// Keyboard settings record a shortcut from the next key pressed anywhere.
const RECORDING_SHORTCUT = 'button[aria-pressed="true"][aria-label^="Record shortcut"]';

type SettingsCommand =
  | { kind: "sidebar"; command: SidebarCommand }
  | { kind: "page"; command: PageCommand }
  /** From the page list into the open page's settings; Enter only when no link holds focus, since a link keeps its own. */
  | { kind: "into-page"; unfocusedOnly: boolean }
  | { kind: "to-sidebar" }
  | { kind: "escape" }
  | { kind: "help" };

const SHARED_KEYMAP: Keymap<SettingsCommand> = {
  "?": { kind: "help" },
  "<Esc>": { kind: "escape" },
};

// j and k move through whichever list has the keys: the page list in the
// sidebar, or the open page's settings. l and h move between them.
export const SIDEBAR_KEYMAP: Keymap<SettingsCommand> = {
  ...mapKeymap(SIDEBAR_CURSOR_KEYMAP, (command): SettingsCommand => ({ kind: "sidebar", command })),
  ...SHARED_KEYMAP,
  l: { kind: "into-page", unfocusedOnly: false },
  "<CR>": { kind: "into-page", unfocusedOnly: true },
};

export const PAGE_KEYMAP: Keymap<SettingsCommand> = {
  ...mapKeymap(PAGE_CURSOR_KEYMAP, (command): SettingsCommand => ({ kind: "page", command })),
  ...SHARED_KEYMAP,
  h: { kind: "to-sidebar" },
};

type BoxCommand = "next" | "previous" | "leave";

/** In bb's search box, which already moves through results on the arrows and clears on Escape. */
export const SEARCH_BOX_KEYMAP: Keymap<BoxCommand> = {
  "<C-n>": "next",
  "<C-p>": "previous",
  "<Esc>": "leave",
};

/** Keys bb's search box handles itself. */
export const BB_SEARCH_KEYS = ["/", "↑", "↓"];

export const KEY_HELP: KeyHelpSection[] = [
  {
    title: "",
    keys: [
      { keys: ["j", "k"], action: "Next or previous page, or setting" },
      { keys: ["l", "h"], action: "Into the page's settings, or back to the pages" },
      { keys: ["gg", "G"], action: "First or last" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a list down or up" },
      { keys: ["Enter"], action: "Use the setting: flip, open, or edit" },
      { keys: ["i"], action: "Focus the setting's control" },
      { keys: ["Esc"], action: "Back to the keys from a control or the search" },
      { keys: ["/"], action: "Search settings" },
      { keys: ["↑", "↓", "Ctrl-n", "Ctrl-p"], action: "Move through search results" },
      { keys: ["?"], action: "Show these keys" },
    ],
  },
];

export const SETTINGS_KEYS_CSS = `
[${KEYS_ATTRIBUTE}] {
  margin: 4px 8px 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}
[${KEYS_ATTRIBUTE}] [data-key-help-row] {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
[${KEYS_ATTRIBUTE}] [data-key-help-row] > span:first-child {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  min-width: 96px;
  color: var(--sidebar-foreground);
}
[${KEYS_ATTRIBUTE}] kbd {
  font: inherit;
}
[${CURSOR_ATTRIBUTE}] {
  position: relative;
}
${SETTINGS_SIDEBAR} [${CURSOR_ATTRIBUTE}]::before {
  inset: 0;
  border-radius: 6px;
}
[${CURSOR_ATTRIBUTE}]::before {
  content: "";
  position: absolute;
  inset: -6px -8px;
  border-radius: 8px;
  background: var(--state-hover);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ring) 45%, transparent);
  pointer-events: none;
  animation: bbm-fade-in var(--bbm-duration-fast) var(--bbm-ease-out) both;
}
`;

/**
 * Vim keys for bb's settings pages, on top of bb's own settings search: j/k
 * walk the sidebar's pages or the open page's settings, and a setting picked
 * from the search gets the cursor, with focus back on the keys.
 */
export function mountSettingsKeys(doc: Document, win: Window): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = SETTINGS_KEYS_CSS;
  doc.head.append(style);

  let sidebar: Element | null = null;
  let box: HTMLInputElement | null = null;
  let keys: HTMLElement | null = null;
  let pane: "sidebar" | "page" = "sidebar";
  let frame = 0;
  let stopWatching: (() => void) | null = null;

  const cursor = createPageCursor(doc, win);
  const sidebarCursor = createSidebarCursor(win, () => sidebar?.querySelector(PAGE_LIST) ?? null);

  const toggleKeys = (show = !keys) => {
    keys?.remove();
    keys = null;
    if (!show) return;
    const list = sidebar?.querySelector(PAGE_LIST);
    if (!list) return;
    keys = doc.createElement("div");
    keys.setAttribute(KEYS_ATTRIBUTE, "");
    keys.classList.add("bbm-drop-in", "bbm-near", "bbm-fast");
    keys.append(renderKeyHelp(doc, KEY_HELP));
    list.prepend(keys);
  };

  const toSidebar = () => {
    pane = "sidebar";
    cursor.hide();
    sidebarCursor.show();
  };

  /** After a pick, bb opens the page and flashes the setting; the cursor goes there and focus leaves the box. */
  const watchPick = () => {
    stopWatching?.();
    const before = doc.querySelector(SEARCH_FLASH);
    stopWatching = focusWhenShown(
      () => {
        const flashed = doc.querySelector<HTMLElement>(SEARCH_FLASH);
        return flashed === before ? null : flashed;
      },
      {
        timeoutMs: PICK_TIMEOUT_MS,
        view: win,
        focus: (anchor) => {
          if (doc.activeElement === box) box?.blur();
          pane = "page";
          sidebarCursor.hide();
          cursor.place(anchor.querySelector("[data-control-placement]") ?? anchor);
        },
      },
    );
  };

  const runCommand = (command: SettingsCommand, target: Element | null): boolean | void => {
    switch (command.kind) {
      case "help":
        toggleKeys();
        return;
      case "escape":
        if (keys) {
          toggleKeys(false);
          return;
        }
        return pane === "sidebar" ? sidebarCursor.run("escape") : cursor.run("escape");
      case "into-page":
        if (command.unfocusedOnly && target !== null) return false;
        pane = "page";
        sidebarCursor.hide();
        cursor.enter();
        return;
      case "to-sidebar":
        toSidebar();
        return;
      case "sidebar":
        return sidebarCursor.run(command.command);
      case "page":
        return cursor.run(command.command);
    }
  };

  const runBoxCommand = (command: BoxCommand): boolean | void => {
    if (!box) return false;
    if (command === "leave") {
      // bb's own Escape clears a query; an empty box hands the keys back.
      if (box.value !== "") return false;
      box.blur();
      toSidebar();
      return;
    }
    box.dispatchEvent(new KeyboardEvent("keydown", { key: command === "next" ? "ArrowDown" : "ArrowUp", bubbles: true, cancelable: true }));
  };

  // vim-mode marks the Escape that leaves a text box as handled, and only
  // leaves text boxes on thread pages itself, so this watches every Escape
  // rather than waiting for one the key handler would take. One vim-mode kept
  // never gets here.
  const onFieldEscape = (event: KeyboardEvent) => {
    const field = event.target;
    if (keyToken(event) !== "<Esc>" || event.shiftKey || !sidebar || !(field instanceof HTMLElement)) return;
    if (isTextEntry(field) && field.closest(PAGE_ROOT) && !doc.querySelector(ANY_OVERLAY)) field.blur();
  };

  const onPick = (event: Event) => {
    if (event.target instanceof Element && event.target.closest(SEARCH_RESULT)) watchPick();
  };

  const attach = (target: Element) => {
    sidebar = target;
    box = target.querySelector<HTMLInputElement>(SEARCH_BOX);
    // Escape and Ctrl-n/p in the box are bb's and these keys', not vim's.
    box?.setAttribute(VIM_IGNORE_ATTRIBUTE, "");
  };

  const detach = () => {
    stopWatching?.();
    stopWatching = null;
    keys?.remove();
    sidebar = box = keys = null;
    pane = "sidebar";
    sidebarCursor.hide();
    cursor.hide();
  };

  const sync = () => {
    frame = 0;
    const target = doc.querySelector(SETTINGS_SIDEBAR);
    if (sidebar && target !== sidebar) detach();
    if (target && !sidebar) attach(target);
    if (!sidebar) return;
    const current = sidebar.querySelector<HTMLInputElement>(SEARCH_BOX);
    if (current !== box) attach(sidebar);
    cursor.sync();
    sidebarCursor.sync();
  };

  const schedule = () => {
    if (frame === 0) frame = win.requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener("pointerdown", onPick, true);

  const unbindBox = bindKeys<BoxCommand>(doc, {
    // Before bb's own handler on the box, which would otherwise take Escape first.
    capture: true,
    accepts: (element) => element !== null && element === box,
    isText: () => false,
    leaveToPressables: false,
    observe: (event) => {
      if (event.target === box && keyToken(event) === "<CR>") watchPick();
    },
    keymap: SEARCH_BOX_KEYMAP,
    onCommand: (command) => runBoxCommand(command),
  });
  const unbindKeys = bindKeys<SettingsCommand>(doc, {
    observe: onFieldEscape,
    active: () => sidebar !== null,
    blocked: () => doc.querySelector(ANY_OVERLAY) !== null || doc.querySelector(RECORDING_SHORTCUT) !== null,
    keymap: () => (pane === "sidebar" ? SIDEBAR_KEYMAP : PAGE_KEYMAP),
    // The cursors decide for themselves when a focused control keeps Enter.
    leaveToPressables: false,
    onCommand: (command, { target }) => runCommand(command, target),
  });
  schedule();

  return () => {
    observer.disconnect();
    if (frame !== 0) win.cancelAnimationFrame(frame);
    doc.removeEventListener("pointerdown", onPick, true);
    unbindBox();
    unbindKeys();
    box?.removeAttribute(VIM_IGNORE_ATTRIBUTE);
    detach();
    cursor.dispose();
    sidebarCursor.dispose();
    style.remove();
  };
}
