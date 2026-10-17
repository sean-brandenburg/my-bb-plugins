import type { Caret, KeyHelpSection, Keymap, ListMotion } from "bb-vim-keys";

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
  | { kind: "scroll"; step: 1 | -1; amount: "half" | "page" }
  | { kind: "escape"; fromField: boolean }
  | { kind: "help" };

export const KEYMAP: Keymap<ClientCommand> = {
  j: { kind: "list", motion: "down" },
  "<Down>": { kind: "list", motion: "down" },
  k: { kind: "list", motion: "up" },
  "<Up>": { kind: "list", motion: "up" },
  G: { kind: "list", motion: "bottom" },
  l: { kind: "list", motion: "right" },
  "<Right>": { kind: "list", motion: "right" },
  h: { kind: "list", motion: "left" },
  "<Left>": { kind: "list", motion: "left" },
  o: { kind: "list", motion: "open" },
  "<CR>": { kind: "list", motion: "open" },
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
  "<Esc>": { kind: "escape", fromField: false },
  "?": { kind: "help" },
  gg: { kind: "list", motion: "top" },
  dd: { kind: "delete" },
  "<C-d>": { kind: "scroll", step: 1, amount: "half" },
  "<C-u>": { kind: "scroll", step: -1, amount: "half" },
  "<C-f>": { kind: "scroll", step: 1, amount: "page" },
  "<C-b>": { kind: "scroll", step: -1, amount: "page" },
};

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
      { keys: ["j", "k", "/", "Enter", "Esc"], action: "In an open enum or bool list: move, filter, pick, or close it unchanged" },
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
      { keys: ["h", "l", "Enter", "Esc"], action: "Asked to confirm a send to a protected endpoint: move between Cancel and Send, press, or cancel" },
      { keys: ["Esc"], action: "Stop editing a field, then clear the search" },
      { keys: ["?"], action: "Show these shortcuts" },
    ],
  },
];
