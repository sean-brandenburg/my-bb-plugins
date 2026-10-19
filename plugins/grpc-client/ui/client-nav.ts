import { type Caret, type KeyHelpSection, type Keymap, type ListMotion, mapKeymap, type Motion, ROW_KEYS, TEXT_BOX_MOTION_KEYS } from "bb-vim-keys";

export type ClientCommand =
  | { kind: "list"; motion: ListMotion }
  | { kind: "search" }
  | { kind: "searchNext"; step: 1 | -1 }
  | { kind: "filters" }
  | { kind: "endpoint" }
  | { kind: "history" }
  | { kind: "toggleList" }
  | { kind: "edit"; caret: Caret }
  | { kind: "requestTab"; step: 1 | -1 }
  | { kind: "responseTab"; step: 1 | -1 }
  | { kind: "mode" }
  | { kind: "copyCommand" }
  | { kind: "delete" }
  | { kind: "scroll"; motion: "halfDown" | "halfUp" | "pageDown" | "pageUp" }
  | { kind: "escape" }
  | { kind: "help" };

export const KEYMAP: Keymap<ClientCommand> = {
  ...mapKeymap(ROW_KEYS, (motion): ClientCommand => ({ kind: "list", motion })),
  "/": { kind: "search" },
  n: { kind: "searchNext", step: 1 },
  N: { kind: "searchNext", step: -1 },
  f: { kind: "filters" },
  e: { kind: "endpoint" },
  c: { kind: "history" },
  b: { kind: "toggleList" },
  i: { kind: "edit", caret: "start" },
  I: { kind: "edit", caret: "start" },
  a: { kind: "edit", caret: "end" },
  A: { kind: "edit", caret: "end" },
  "]": { kind: "requestTab", step: 1 },
  "[": { kind: "requestTab", step: -1 },
  "}": { kind: "responseTab", step: 1 },
  "{": { kind: "responseTab", step: -1 },
  m: { kind: "mode" },
  y: { kind: "copyCommand" },
  "<Esc>": { kind: "escape" },
  "?": { kind: "help" },
  dd: { kind: "delete" },
  "<C-d>": { kind: "scroll", motion: "halfDown" },
  "<C-u>": { kind: "scroll", motion: "halfUp" },
  "<C-f>": { kind: "scroll", motion: "pageDown" },
  "<C-b>": { kind: "scroll", motion: "pageUp" },
};

/** An open enum or bool list's own keys, beside the picker's motions, Enter, / and Esc. */
export const CHOICE_KEYMAP: Keymap<"pick"> = { "<Space>": "pick" };

/**
 * A popover panel's keys, which step through its controls. Which map applies depends on the
 * focused control: a text box keeps its letters, and a select keeps its arrows (they change its value).
 */
export const PANEL_KEYMAP: Keymap<Motion> = { j: "down", k: "up", "<Down>": "down", "<Up>": "up", gg: "top", G: "bottom" };
export const PANEL_TEXT_BOX_KEYMAP: Keymap<Motion> = TEXT_BOX_MOTION_KEYS;
export const PANEL_SELECT_KEYMAP: Keymap<Motion> = { j: "down", k: "up" };

/** Closes an open popover from anywhere, unless something nearer took the Escape first. */
export const DISMISS_KEYMAP: Keymap<"close"> = { "<Esc>": "close" };

/** The protected-endpoint confirmation: back to Cancel or on to Send. */
export const CONFIRM_KEYMAP: Keymap<Motion> = { h: "up", k: "up", "<Left>": "up", "<Up>": "up", l: "down", j: "down", "<Right>": "down", "<Down>": "down" };

/** The method and call-history search boxes: Esc clears the query (then leaves), ↓ goes to the rows, Enter opens the first. */
export type ListSearchCommand = "escape" | "rows" | "openFirst";
export const LIST_SEARCH_KEYMAP: Keymap<ListSearchCommand> = { "<Esc>": "escape", "<Down>": "rows", "<CR>": "openFirst" };

/** What the shortcuts dialog lists, in display order. */
export const KEY_HELP: readonly KeyHelpSection[] = [
  {
    title: "",
    keys: [
      { keys: ["j", "k"], action: "Next / previous method, call, or request field; scroll the response. k past the list's top reaches the buttons above it" },
      { keys: ["h", "l"], action: "On those buttons (or call history's Clear): previous / next button" },
      { keys: ["gg", "G"], action: "First / last row" },
      { keys: ["l"], action: "Expand, open the method into its fields, step to a field's buttons (like Now), then on to the response" },
      { keys: ["h"], action: "Step back: collapse, go up a level, or from the response to the fields and on to the list" },
      { keys: ["o", "Enter"], action: "Open the method or call, toggle the section, or edit the field" },
      { keys: ["i", "I"], action: "Edit the field, with the caret at the start" },
      { keys: ["a", "A"], action: "Edit the field, with the caret at the end" },
      { keys: ["j", "k", "gg", "G", "/", "Enter", "Space", "Esc"], action: "In an open enum or bool list: move, jump to the ends, filter, pick, or close it unchanged" },
      { keys: ["j", "k", "Enter", "Esc"], action: "In the endpoint or filter menu: move, press, or close it" },
      { keys: ["dd"], action: "Remove the list item or optional field, empty the field, or delete the call from history" },
      { keys: ["/"], action: "Search methods or call history, whichever the list shows (Enter opens the first match), or the response when you're in it" },
      { keys: ["n", "N"], action: "Next / previous match in the response" },
      { keys: ["f"], action: "Filter methods" },
      { keys: ["e"], action: "Switch endpoint or protos" },
      { keys: ["c"], action: "Toggle call history" },
      { keys: ["b"], action: "Show / hide the method list" },
      { keys: ["[", "]"], action: "Previous / next request tab" },
      { keys: ["{", "}"], action: "Previous / next response tab" },
      { keys: ["m"], action: "Switch between form and JSON" },
      { keys: ["y"], action: "Copy as grpcurl command, or the response when you're in it" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down / up in the pane you're in" },
      { keys: ["Ctrl-f", "Ctrl-b"], action: "A page down / up in the pane you're in" },
      { keys: ["⌘↵"], action: "Send" },
      { keys: ["h", "l", "j", "k", "Enter", "Esc"], action: "Asked to confirm a send to a protected endpoint: move between Cancel and Send, press, or cancel" },
      { keys: ["Esc"], action: "Stop editing a field, then clear the search" },
      { keys: ["?"], action: "Show these shortcuts" },
    ],
  },
];
