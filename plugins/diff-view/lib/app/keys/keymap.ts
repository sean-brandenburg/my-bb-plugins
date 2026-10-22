import { type KeyHelpSection, type Keymap, type ListMotion, mapKeymap, ROW_KEYS } from "../ui/vim-keys-core";

/** What a key sequence asks the view to do. Motions repeat by the count typed before them. */
export type ReviewCommand =
  | { kind: "line"; direction: 1 | -1 }
  | { kind: "side"; side: "LEFT" | "RIGHT" }
  | { kind: "top" }
  | { kind: "bottom" }
  | { kind: "page"; fraction: number }
  | { kind: "change"; direction: 1 | -1 }
  | { kind: "hunk"; direction: 1 | -1 }
  | { kind: "file"; direction: 1 | -1 }
  | { kind: "thread"; direction: 1 | -1 }
  | { kind: "finding"; direction: 1 | -1 }
  | { kind: "scroll"; block: "center" | "start" | "end" }
  | { kind: "fold"; action: "toggle" | "annotation" | "open" | "close" | "openAll" | "closeAll" | "moreContext" }
  | { kind: "visual" }
  | { kind: "comment" }
  | { kind: "commentFile" }
  | { kind: "reply" }
  | { kind: "resolve" }
  | { kind: "edit" }
  | { kind: "delete" }
  | { kind: "move" }
  | { kind: "openGithub" }
  | { kind: "openThread" }
  | { kind: "toggleFinding" }
  | { kind: "findingFilter" }
  | { kind: "filteredFindings" }
  | { kind: "outsideFindings" }
  | { kind: "explain" }
  | { kind: "viewed" }
  | { kind: "target" }
  | { kind: "fileTree" }
  | { kind: "layout" }
  | { kind: "refresh" }
  | { kind: "send" }
  | { kind: "findFile" }
  | { kind: "searchNext"; direction: 1 | -1 }
  | { kind: "peek" }
  | { kind: "help" }
  | { kind: "narrative" }
  | { kind: "escape" }
  /** No key: the reader scrolled by hand, and the cursor moves to the line now in the middle. */
  | { kind: "follow" };

/** Review commands by key sequence; a count typed before one repeats it. */
export const REVIEW_KEYMAP: Keymap<ReviewCommand> = {
  j: { kind: "line", direction: 1 },
  "<Down>": { kind: "line", direction: 1 },
  k: { kind: "line", direction: -1 },
  "<Up>": { kind: "line", direction: -1 },
  h: { kind: "side", side: "LEFT" },
  "<Left>": { kind: "side", side: "LEFT" },
  l: { kind: "side", side: "RIGHT" },
  "<Right>": { kind: "side", side: "RIGHT" },
  gg: { kind: "top" },
  G: { kind: "bottom" },
  "<C-d>": { kind: "page", fraction: 0.5 },
  "<C-u>": { kind: "page", fraction: -0.5 },
  "<C-f>": { kind: "page", fraction: 1 },
  "<C-b>": { kind: "page", fraction: -1 },
  "]c": { kind: "change", direction: 1 },
  "[c": { kind: "change", direction: -1 },
  "}": { kind: "hunk", direction: 1 },
  "{": { kind: "hunk", direction: -1 },
  "]f": { kind: "file", direction: 1 },
  "[f": { kind: "file", direction: -1 },
  c: { kind: "thread", direction: 1 },
  C: { kind: "thread", direction: -1 },
  "]d": { kind: "finding", direction: 1 },
  "[d": { kind: "finding", direction: -1 },
  zz: { kind: "scroll", block: "center" },
  zt: { kind: "scroll", block: "start" },
  zb: { kind: "scroll", block: "end" },
  za: { kind: "fold", action: "toggle" },
  zo: { kind: "fold", action: "open" },
  zc: { kind: "fold", action: "close" },
  zR: { kind: "fold", action: "openAll" },
  zM: { kind: "fold", action: "closeAll" },
  zr: { kind: "fold", action: "moreContext" },
  V: { kind: "visual" },
  i: { kind: "comment" },
  O: { kind: "commentFile" },
  a: { kind: "reply" },
  r: { kind: "resolve" },
  "<CR>": { kind: "fold", action: "annotation" },
  e: { kind: "edit" },
  dd: { kind: "delete" },
  M: { kind: "move" },
  gx: { kind: "openGithub" },
  go: { kind: "openThread" },
  x: { kind: "toggleFinding" },
  F: { kind: "findingFilter" },
  gF: { kind: "filteredFindings" },
  gp: { kind: "outsideFindings" },
  K: { kind: "explain" },
  v: { kind: "viewed" },
  T: { kind: "target" },
  t: { kind: "fileTree" },
  gl: { kind: "layout" },
  R: { kind: "refresh" },
  s: { kind: "send" },
  "/": { kind: "findFile" },
  n: { kind: "searchNext", direction: 1 },
  N: { kind: "searchNext", direction: -1 },
  gd: { kind: "peek" },
  S: { kind: "narrative" },
  "?": { kind: "help" },
  "<Esc>": { kind: "escape" },
};

export type FileTreeCommand = { kind: "list"; motion: ListMotion } | { kind: "scroll"; step: 1 | -1 } | { kind: "leave" } | { kind: "hide" };

/** The file list's own keys, taken before the review keys; the rest (`?`, `/`) go on to the diff. */
export const FILE_TREE_KEYMAP: Keymap<FileTreeCommand> = {
  ...mapKeymap(ROW_KEYS, (motion): FileTreeCommand => ({ kind: "list", motion })),
  "<C-d>": { kind: "scroll", step: 1 },
  "<C-u>": { kind: "scroll", step: -1 },
  "<Esc>": { kind: "leave" },
  t: { kind: "hide" },
};

/** The findings listed above the diff: rows of buttons, so h and l step across a row. */
export type OutsideFindingsCommand = { kind: "list"; motion: ListMotion } | { kind: "leave" };

export const OUTSIDE_FINDINGS_KEYMAP: Keymap<OutsideFindingsCommand> = {
  ...mapKeymap(ROW_KEYS, (motion): OutsideFindingsCommand => ({ kind: "list", motion })),
  "<Esc>": { kind: "leave" },
};

/** The `?` sheet, in the order a review goes. Keys are written as the keymaps display them, so a test can check them. */
export const KEY_HELP: readonly KeyHelpSection[] = [
  {
    title: "Move",
    keys: [
      { keys: ["j", "k"], action: "Next / previous line, stopping at each comment when a line has several (a count repeats: 5j)" },
      { keys: ["h", "l"], action: "Old / new side; h past the old side (or on a file header) goes to the file list" },
      { keys: ["]c", "[c"], action: "Next / previous change" },
      { keys: ["}", "{"], action: "Next / previous hunk" },
      { keys: ["]f", "[f"], action: "Next / previous file" },
      { keys: ["c", "C"], action: "Next / previous comment or review finding, one at a time on a shared line" },
      { keys: ["]d", "[d"], action: "Next / previous review finding" },
      { keys: ["gg", "G"], action: "First / last line" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down / up (Ctrl-f / Ctrl-b a whole page)" },
      { keys: ["zz", "zt", "zb"], action: "Scroll the cursor to the middle / top / bottom" },
      { keys: ["/"], action: "Search file names and jump to one" },
      { keys: ["n", "N"], action: "Next / previous file matching the search" },
    ],
  },
  {
    title: "Comment",
    keys: [
      { keys: ["i"], action: "Comment on the line (or the selected lines); on a file header, on the file" },
      { keys: ["V"], action: "Select lines; move, then i to comment on them" },
      { keys: ["O"], action: "Comment on the file" },
      { keys: ["a"], action: "Reply to the comment thread under the cursor" },
      { keys: ["r"], action: "Resolve or reopen that thread on GitHub" },
      { keys: ["Enter", "za"], action: "Open or close the comment or finding under the cursor, or open a fold of hidden lines (za on a bare line folds the file)" },
      { keys: ["e"], action: "Edit your unsent comment in that thread, or the finding's wording" },
      { keys: ["dd"], action: "Delete your unsent comment in that thread" },
      { keys: ["M"], action: "Move that comment between local and the GitHub PR" },
      { keys: ["gx", "go"], action: "Open the thread on GitHub / the agent thread that replied" },
      { keys: ["T"], action: "Switch where new comments go: local or the GitHub PR" },
      { keys: ["s"], action: "Go to the send bar (Enter or i opens its review box: type a comment, j / k pick how the review concludes, ⌘↩ submits, Esc closes; Esc on the bar goes back)" },
      { keys: ["⌘↩"], action: "In a comment box: add it; editing a finding: save" },
      { keys: ["Esc"], action: "In a comment box: back to the diff (an empty one closes); editing a comment or finding: cancel the edit" },
    ],
  },
  {
    title: "File list",
    keys: [
      { keys: ["t"], action: "Show or hide the file list" },
      { keys: ["j", "k"], action: "Next / previous file or folder" },
      { keys: ["h", "l"], action: "Close / open a folder (h on a file goes to its folder)" },
      { keys: ["gg", "G"], action: "First / last row" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a list down / up" },
      { keys: ["Enter", "o", "l"], action: "Jump to the file (Enter on a folder opens or closes it)" },
      { keys: ["Esc"], action: "Back to the diff" },
    ],
  },
  {
    title: "Review",
    keys: [
      { keys: ["v"], action: "Mark the file viewed (collapses it) or not" },
      { keys: ["zo", "zc"], action: "Expand / collapse the file" },
      { keys: ["zR", "zM"], action: "Expand / collapse every file" },
      { keys: ["zr"], action: "Show more unchanged lines around the hunk (structural)" },
      { keys: ["x"], action: "Include or exclude the review finding under the cursor in the apply round" },
      { keys: ["F"], action: "Which review findings show: all, important and up, critical only, or none" },
      { keys: ["gF"], action: "Show or hide the findings the review's verifier filtered out" },
      { keys: ["gp"], action: "Go to the findings listed above the diff: pre-existing and filtered (j / k move, h / l across a row, Enter opens one or makes a card, Esc back)" },
      { keys: ["K"], action: "Ask an agent to explain the hunk" },
      { keys: ["gd"], action: "Peek a symbol on the line: its definition and uses (structural)" },
      { keys: ["gl"], action: "Split or unified, for files shown as a line diff" },
      { keys: ["S"], action: "Switch to the narrative review, where the same keys work over each step's code (S there comes back)" },
      { keys: ["R"], action: "Refresh the diff" },
      { keys: ["Esc"], action: "Close a symbol peek, or leave line selection" },
      { keys: ["?"], action: "This sheet" },
    ],
  },
];
