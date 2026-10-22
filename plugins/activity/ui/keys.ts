import { type KeyHelpSection, type Keymap, type ListMotion, ROW_KEYS } from "bb-vim-keys";
import type { Kind } from "../contract";

export type Command = ListMotion | "scroll-down" | "scroll-up" | "range-1" | "range-2" | "range-3" | "range-4" | "cycle-kind" | "filter" | "refresh" | "help" | "escape";

export const KEYMAP: Keymap<Command> = {
  ...ROW_KEYS,
  "<C-d>": "scroll-down",
  "<C-u>": "scroll-up",
  "1": "range-1",
  "2": "range-2",
  "3": "range-3",
  "4": "range-4",
  c: "cycle-kind",
  "/": "filter",
  i: "filter",
  r: "refresh",
  "?": "help",
  "<Esc>": "escape",
};

export const RANGES: readonly { label: string; ms: number | null }[] = [
  { label: "24h", ms: 86_400_000 },
  { label: "7d", ms: 7 * 86_400_000 },
  { label: "30d", ms: 30 * 86_400_000 },
  { label: "All", ms: null },
];

export const KIND_FILTERS: readonly { label: string; kind: Kind | null }[] = [
  { label: "Everything", kind: null },
  { label: "Clicks", kind: "click" },
  { label: "Key commands", kind: "command" },
  { label: "Other keys", kind: "key" },
  { label: "Pages", kind: "route" },
];

export const HELP: readonly KeyHelpSection[] = [
  {
    title: "Move",
    keys: [
      { keys: ["j", "k"], action: "Next and previous row" },
      { keys: ["h", "l"], action: "Close and open a plugin's rows; along the range and kind buttons" },
      { keys: ["gg", "G"], action: "First and last row" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page" },
    ],
  },
  {
    title: "Act",
    keys: [
      { keys: ["Enter", "o"], action: "Toggle a plugin's rows, or press the button under the cursor" },
      { keys: ["1", "2", "3", "4"], action: "Last day, week, month, or all time" },
      { keys: ["c"], action: "Cycle what's shown: everything, clicks, key commands, other keys, pages" },
      { keys: ["/", "i"], action: "Filter rows by name" },
      { keys: ["r"], action: "Reread the log" },
      { keys: ["Esc"], action: "Leave the filter box, or clear it" },
      { keys: ["?"], action: "Show these keys" },
    ],
  },
];
