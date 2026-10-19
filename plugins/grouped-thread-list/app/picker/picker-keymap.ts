import {
  displayToken,
  type Keymap,
  mapKeymap,
  MOTION_KEYS,
  type Motion,
  TEXT_BOX_MOTION_KEYS,
  tokenize,
} from "bb-vim-keys";
import type { PickerColumn } from "./picker-model.js";

export type PickerAction =
  | "left"
  | "right"
  | "switch-column"
  | "activate"
  | "pin"
  | "mark-read"
  | "archive"
  | "undo-archive"
  | "new-thread"
  | "filter"
  | "escape"
  | "close";

/** What a key does in the picker: moves the cursor (or scrolls the preview), or acts. */
export type PickerCommand =
  | { kind: "move"; motion: Motion }
  | { kind: "action"; action: PickerAction };

/** Keys while typing in the filter box; everything else is typing. */
export type FilterCommand =
  | { kind: "move"; motion: Motion }
  | { kind: "accept" }
  | { kind: "cancel" };

const move = (motion: Motion): PickerCommand => ({ kind: "move", motion });
const act = (action: PickerAction): PickerCommand => ({
  kind: "action",
  action,
});

const ACTION_KEYS: Keymap<PickerAction> = {
  h: "left",
  "<Left>": "left",
  l: "right",
  "<Right>": "right",
  "<Tab>": "switch-column",
  "<S-Tab>": "switch-column",
  "<CR>": "activate",
  o: "activate",
  p: "pin",
  r: "mark-read",
  // Labelled delete because that's the intent; archiving keeps it recoverable.
  d: "archive",
  u: "undo-archive",
  n: "new-thread",
  "/": "filter",
  "<Esc>": "escape",
  q: "close",
};

/** The projects and threads columns. */
export const LIST_KEYMAP: Keymap<PickerCommand> = {
  ...mapKeymap(TEXT_BOX_MOTION_KEYS, move),
  j: move("down"),
  k: move("up"),
  gg: move("top"),
  G: move("bottom"),
  ...mapKeymap(ACTION_KEYS, act),
};

/** The focused preview, where the moves scroll it and the actions still act on the highlighted thread. */
export const PREVIEW_KEYMAP: Keymap<PickerCommand> = {
  ...LIST_KEYMAP,
  ...mapKeymap(MOTION_KEYS, move),
  "<C-e>": move("down"),
  "<C-y>": move("up"),
};

export const FILTER_KEYMAP: Keymap<FilterCommand> = {
  ...mapKeymap(
    TEXT_BOX_MOTION_KEYS,
    (motion): FilterCommand => ({ kind: "move", motion }),
  ),
  "<CR>": { kind: "accept" },
  "<Esc>": { kind: "cancel" },
};

export function pickerKeymap(column: PickerColumn): Keymap<PickerCommand> {
  return column === "preview" ? PREVIEW_KEYMAP : LIST_KEYMAP;
}

function sameCommand(a: PickerCommand, b: PickerCommand): boolean {
  return a.kind === "move"
    ? b.kind === "move" && a.motion === b.motion
    : b.kind === "action" && a.action === b.action;
}

const EVERY_COLUMN = ["left", "right", "preview"] as const;
const ROW_COLUMNS = ["right", "preview"] as const;

/** The footer, in the order it reads, by command; each shows the first key bound to it. */
const HINTS: readonly {
  command: PickerCommand;
  label: string;
  columns: readonly PickerColumn[];
}[] = [
  { command: move("halfDown"), label: "scroll down", columns: ["preview"] },
  { command: move("halfUp"), label: "scroll up", columns: ["preview"] },
  { command: act("left"), label: "back", columns: ["preview"] },
  { command: act("right"), label: "preview", columns: ["right"] },
  { command: act("activate"), label: "open", columns: EVERY_COLUMN },
  { command: act("pin"), label: "pin", columns: ROW_COLUMNS },
  { command: act("mark-read"), label: "mark read", columns: ROW_COLUMNS },
  { command: act("archive"), label: "delete", columns: ROW_COLUMNS },
  { command: act("undo-archive"), label: "undo", columns: ROW_COLUMNS },
  { command: act("new-thread"), label: "new thread", columns: EVERY_COLUMN },
  { command: act("filter"), label: "filter", columns: ["left"] },
  { command: act("escape"), label: "close", columns: ["left"] },
];

const FOOTER_TOKENS: Readonly<Record<string, string>> = {
  "<CR>": "↵",
  "<Esc>": "esc",
};

function footerToken(token: string): string {
  return FOOTER_TOKENS[token] ?? displayToken(token).replace(/^Ctrl-/u, "⌃");
}

export interface PickerHint {
  /** In vim notation, as bound in the column's keymap. */
  keys: string;
  /** How the footer shows it: ↵, esc, ⌃d. */
  display: string;
  label: string;
}

/** The footer for the focused column: only keys that do something there. */
export function pickerHints(column: PickerColumn): PickerHint[] {
  const bindings = Object.entries(pickerKeymap(column));
  return HINTS.flatMap(({ command, label, columns }) => {
    if (!columns.includes(column)) return [];
    const keys = bindings.find(([, bound]) => sameCommand(bound, command))?.[0];
    if (keys === undefined) return [];
    return [{ keys, display: tokenize(keys).map(footerToken).join(""), label }];
  });
}
