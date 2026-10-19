import type { KeyHelpSection, Keymap } from "../ui/vim-keys-core";

/** What a key asks the narrative view to do. */
export type NarrativeCommand =
  | { kind: "step"; direction: 1 | -1 }
  | { kind: "chapter"; direction: 1 | -1 }
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "scroll"; lines: number }
  | { kind: "page"; fraction: number }
  | { kind: "excerpt"; direction: 1 | -1 }
  | { kind: "openExcerpt" }
  | { kind: "comment" }
  | { kind: "affected" }
  | { kind: "viewed" }
  | { kind: "outline" }
  | { kind: "search" }
  | { kind: "searchNext"; direction: 1 | -1 }
  | { kind: "generate" }
  | { kind: "files" }
  | { kind: "help" };

export const NARRATIVE_KEYMAP: Keymap<NarrativeCommand> = {
  l: { kind: "step", direction: 1 },
  "<Right>": { kind: "step", direction: 1 },
  h: { kind: "step", direction: -1 },
  "<Left>": { kind: "step", direction: -1 },
  "]]": { kind: "chapter", direction: 1 },
  "[[": { kind: "chapter", direction: -1 },
  gg: { kind: "first" },
  G: { kind: "last" },
  j: { kind: "scroll", lines: 3 },
  "<Down>": { kind: "scroll", lines: 3 },
  k: { kind: "scroll", lines: -3 },
  "<Up>": { kind: "scroll", lines: -3 },
  "<C-d>": { kind: "page", fraction: 0.5 },
  "<C-u>": { kind: "page", fraction: -0.5 },
  "<C-f>": { kind: "page", fraction: 1 },
  "<C-b>": { kind: "page", fraction: -1 },
  "]f": { kind: "excerpt", direction: 1 },
  "[f": { kind: "excerpt", direction: -1 },
  gf: { kind: "openExcerpt" },
  i: { kind: "comment" },
  ga: { kind: "affected" },
  v: { kind: "viewed" },
  t: { kind: "outline" },
  "/": { kind: "search" },
  n: { kind: "searchNext", direction: 1 },
  N: { kind: "searchNext", direction: -1 },
  U: { kind: "generate" },
  S: { kind: "files" },
  "<Esc>": { kind: "files" },
  "?": { kind: "help" },
};

export const NARRATIVE_KEY_HELP: readonly KeyHelpSection[] = [
  {
    title: "Step",
    keys: [
      { keys: ["l", "h"], action: "Next / previous step, across chapters (a count repeats: 3l)" },
      { keys: ["]]", "[["], action: "Next / previous chapter: an earlier narrative, what changed since, the current one" },
      { keys: ["gg", "G"], action: "First / last step" },
      { keys: ["j", "k"], action: "Scroll the step" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down / up" },
      { keys: ["Ctrl-f", "Ctrl-b"], action: "A whole page down / up" },
      { keys: ["/"], action: "Search steps by title and text" },
      { keys: ["n", "N"], action: "Next / previous step matching the search" },
      { keys: ["t"], action: "Show or hide the outline" },
    ],
  },
  {
    title: "Code",
    keys: [
      { keys: ["]f", "[f"], action: "Next / previous excerpt in the step" },
      { keys: ["gf"], action: "Open the excerpt in the files view, cursor on its first line" },
      { keys: ["i"], action: "Comment on the excerpt's lines (opens the files view)" },
      { keys: ["ga"], action: "In a revision step: go to the current narrative's step it shows up in" },
      { keys: ["v"], action: "Mark viewed the files every one of whose steps you have read" },
    ],
  },
  {
    title: "Narrative",
    keys: [
      { keys: ["U"], action: "Write a narrative, or an update that explains what changed since the last one" },
      { keys: ["S", "Esc"], action: "Back to the files view (S there comes back)" },
      { keys: ["Tab"], action: "Move between the step's links and excerpt headers; Enter follows one" },
      { keys: ["?"], action: "This sheet" },
    ],
  },
];
