export type ListMotion = "up" | "down" | "top" | "bottom" | "left" | "right" | "open";

/** The right-panel tabs keys can jump to. */
export type PanelTab = "files" | "outline" | "backlinks";

export type VaultCommand =
  | { kind: "list"; motion: ListMotion }
  | { kind: "scroll"; step: 1 | -1; amount: "half" | "page" }
  | { kind: "search" }
  | { kind: "searchNext"; step: 1 | -1 }
  | { kind: "edit" }
  | { kind: "mode" }
  | { kind: "newNote" }
  | { kind: "newFolder" }
  | { kind: "rename" }
  | { kind: "delete" }
  | { kind: "copyPath" }
  | { kind: "copyLink" }
  | { kind: "cut" }
  | { kind: "paste" }
  | { kind: "collapseAll" }
  | { kind: "openInObsidian" }
  | { kind: "routine"; mode: "start" | "wrap" }
  | { kind: "panel"; tab: PanelTab }
  | { kind: "sidebar" }
  | { kind: "home" }
  | { kind: "today" }
  | { kind: "escape"; fromField: boolean }
  | { kind: "help" };

export const KEYMAP: Record<string, VaultCommand> = {
  j: { kind: "list", motion: "down" },
  ArrowDown: { kind: "list", motion: "down" },
  k: { kind: "list", motion: "up" },
  ArrowUp: { kind: "list", motion: "up" },
  G: { kind: "list", motion: "bottom" },
  l: { kind: "list", motion: "right" },
  ArrowRight: { kind: "list", motion: "right" },
  h: { kind: "list", motion: "left" },
  ArrowLeft: { kind: "list", motion: "left" },
  o: { kind: "list", motion: "open" },
  Enter: { kind: "list", motion: "open" },
  "/": { kind: "search" },
  n: { kind: "searchNext", step: 1 },
  N: { kind: "searchNext", step: -1 },
  i: { kind: "edit" },
  m: { kind: "mode" },
  a: { kind: "newNote" },
  A: { kind: "newFolder" },
  r: { kind: "rename" },
  F2: { kind: "rename" },
  y: { kind: "copyPath" },
  Y: { kind: "copyLink" },
  x: { kind: "cut" },
  p: { kind: "paste" },
  O: { kind: "openInObsidian" },
  S: { kind: "routine", mode: "start" },
  W: { kind: "routine", mode: "wrap" },
  "-": { kind: "panel", tab: "files" },
  t: { kind: "sidebar" },
  Escape: { kind: "escape", fromField: false },
  "?": { kind: "help" },
};

/** Two-key commands; their first keys wait for the second instead of acting. */
export const PREFIX_KEYMAP: Record<string, VaultCommand> = {
  gg: { kind: "list", motion: "top" },
  gO: { kind: "panel", tab: "outline" },
  gb: { kind: "panel", tab: "backlinks" },
  gh: { kind: "home" },
  gt: { kind: "today" },
  dd: { kind: "delete" },
  zM: { kind: "collapseAll" },
};

/** Vim's scroll keys keep their Ctrl. */
export const CTRL_KEYMAP: Record<string, VaultCommand> = {
  d: { kind: "scroll", step: 1, amount: "half" },
  u: { kind: "scroll", step: -1, amount: "half" },
  f: { kind: "scroll", step: 1, amount: "page" },
  b: { kind: "scroll", step: -1, amount: "page" },
};

export interface KeyHelpSection {
  title: string;
  keys: readonly { keys: readonly string[]; action: string }[];
}

/** What the shortcuts dialog lists, in display order. */
export const KEY_HELP: readonly KeyHelpSection[] = [
  {
    title: "Anywhere in the vault",
    keys: [
      { keys: ["/"], action: "Search the vault; Enter opens the first match" },
      { keys: ["n", "N"], action: "Open the next / previous search match" },
      { keys: ["-"], action: "The file sidebar, with the cursor on the open note" },
      { keys: ["t"], action: "Show / hide the file sidebar" },
      { keys: ["gO", "gb"], action: "Outline / backlinks of the open note" },
      { keys: ["gh", "gt"], action: "Vault home / today's daily note" },
      { keys: ["⌘⇧L"], action: "Log to today's daily note" },
      { keys: ["?"], action: "Show these shortcuts" },
    ],
  },
  {
    title: "Note",
    keys: [
      { keys: ["j", "k"], action: "Scroll down / up" },
      { keys: ["h"], action: "Over to the file sidebar" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down / up" },
      { keys: ["Ctrl-f", "Ctrl-b"], action: "A page down / up" },
      { keys: ["gg", "G"], action: "Top / bottom" },
      { keys: ["i"], action: "Edit, switching from reading view if needed" },
      { keys: ["m", "⌘E"], action: "Switch between editing and reading view" },
      { keys: ["Esc"], action: "Leave the editor (twice with vim-mode) or the title" },
      { keys: ["⌘↵"], action: "In the editor: follow the link under the cursor" },
      { keys: ["Tab"], action: "In reading view: step through links and checkboxes" },
      { keys: ["r"], action: "Rename the note" },
      { keys: ["a"], action: "New note in this note's folder" },
      { keys: ["y", "Y"], action: "Copy the vault path / a wikilink" },
      { keys: ["O"], action: "Open in Obsidian" },
      { keys: ["dd"], action: "Delete the note" },
      { keys: ["S", "W"], action: "Start day / wrap up (vault home and today's note)" },
    ],
  },
  {
    title: "File sidebar",
    keys: [
      { keys: ["j", "k"], action: "Next / previous file, folder, or search match; k past the top reaches the search and log boxes, then the buttons" },
      { keys: ["l", "i", "Enter"], action: "On the search or log box: start typing (Esc stops)" },
      { keys: ["h", "l"], action: "On those buttons: previous / next button" },
      { keys: ["gg", "G"], action: "First / last row" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down / up" },
      { keys: ["l"], action: "Expand a folder, step into it, or show a file" },
      { keys: ["h"], action: "Collapse a folder or go to its parent" },
      { keys: ["o", "Enter"], action: "Open the file and move to it, or toggle the folder" },
      { keys: ["a", "A"], action: "New note / new folder here" },
      { keys: ["r", "F2"], action: "Rename" },
      { keys: ["x", "p"], action: "Cut, then move it into the folder at the cursor" },
      { keys: ["y", "Y"], action: "Copy the path / a wikilink" },
      { keys: ["dd"], action: "Delete" },
      { keys: ["zM"], action: "Collapse all folders" },
      { keys: ["i"], action: "Log to today" },
      { keys: ["Esc"], action: "Cancel a cut, clear the search, then back to the note" },
      { keys: ["t"], action: "Hide the sidebar and go back to the note" },
    ],
  },
  {
    title: "Vault home, outline, and backlinks",
    keys: [
      { keys: ["j", "k"], action: "Next / previous row" },
      { keys: ["gg", "G"], action: "First / last row" },
      { keys: ["o", "Enter"], action: "Open it" },
      { keys: ["h", "l"], action: "On vault home's buttons: previous / next button; h past the first goes to the file sidebar" },
      { keys: ["l", "i", "Enter"], action: "On vault home's log box: start typing (Esc stops)" },
      { keys: ["h"], action: "Elsewhere on vault home: over to the file sidebar" },
      { keys: ["i"], action: "On vault home: log to today" },
      { keys: ["Esc"], action: "Leave a text box; from a panel, back to the note" },
    ],
  },
];

/** A row of a list or tree, in display order; `parent` is the index of the folder it sits in. */
export type NavRow = { kind: "group"; expanded: boolean; parent: number | null } | { kind: "item"; parent: number | null };

export type ListAction = { kind: "focus"; index: number } | { kind: "activate"; index: number };

/**
 * What a motion does from row `current`: move the cursor, or activate a row (open a note,
 * toggle a folder). Left and right walk the tree the way file trees do. With no cursor yet,
 * any motion lands on `start`.
 */
export function listAction(rows: readonly NavRow[], current: number | null, motion: ListMotion, start: number): ListAction | null {
  if (rows.length === 0) return null;
  if (current === null || current < 0 || current >= rows.length) return { kind: "focus", index: Math.min(Math.max(start, 0), rows.length - 1) };
  const row = rows[current]!;
  switch (motion) {
    case "up":
      return { kind: "focus", index: Math.max(current - 1, 0) };
    case "down":
      return { kind: "focus", index: Math.min(current + 1, rows.length - 1) };
    case "top":
      return { kind: "focus", index: 0 };
    case "bottom":
      return { kind: "focus", index: rows.length - 1 };
    case "open":
      return { kind: "activate", index: current };
    case "right":
      if (row.kind === "item" || !row.expanded) return { kind: "activate", index: current };
      return rows[current + 1]?.parent === current ? { kind: "focus", index: current + 1 } : null;
    case "left":
      if (row.kind === "group" && row.expanded) return { kind: "activate", index: current };
      return row.parent === null ? null : { kind: "focus", index: row.parent };
  }
}

/** Search matches flattened in result order; a file matched by name alone has no line. */
export interface SearchStop {
  path: string;
  line?: number;
}

/** The match `step` places from `current`, wrapping; with none chosen yet, n starts at the first and N at the last. */
export function stepSearch(count: number, current: number | null, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (current === null || current < 0 || current >= count) return step === 1 ? 0 : count - 1;
  return (current + step + count) % count;
}

/** Whether moving `path` into `folder` would change anything and is possible at all. */
export function canMoveInto(path: string, folder: string): boolean {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return parent !== folder && folder !== path && !folder.startsWith(path + "/");
}
