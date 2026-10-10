import assert from "node:assert/strict";
import { test } from "node:test";
import { canMoveInto, CTRL_KEYMAP, KEY_HELP, KEYMAP, listAction, type NavRow, PREFIX_KEYMAP, stepSearch } from "./vault-nav.ts";

// Daily (expanded) holding two notes, then Tickets (collapsed), then a root note.
const tree: NavRow[] = [
  { kind: "group", expanded: true, parent: null },
  { kind: "item", parent: 0 },
  { kind: "item", parent: 0 },
  { kind: "group", expanded: false, parent: null },
  { kind: "item", parent: null },
];
// Projects (expanded) holding Archive (expanded) holding one note.
const nested: NavRow[] = [
  { kind: "group", expanded: true, parent: null },
  { kind: "group", expanded: true, parent: 0 },
  { kind: "item", parent: 1 },
];

test("with no cursor, any motion lands on the start row, clamped to the list", () => {
  assert.deepEqual(listAction(tree, null, "down", 2), { kind: "focus", index: 2 });
  assert.deepEqual(listAction(tree, null, "open", 9), { kind: "focus", index: 4 });
  assert.deepEqual(listAction(tree, 7, "up", 0), { kind: "focus", index: 0 });
  assert.equal(listAction([], null, "down", 0), null);
});

test("j/k/gg/G move within the list and stop at its ends", () => {
  assert.deepEqual(listAction(tree, 0, "down", 0), { kind: "focus", index: 1 });
  assert.deepEqual(listAction(tree, 4, "down", 0), { kind: "focus", index: 4 });
  assert.deepEqual(listAction(tree, 0, "up", 0), { kind: "focus", index: 0 });
  assert.deepEqual(listAction(tree, 2, "top", 0), { kind: "focus", index: 0 });
  assert.deepEqual(listAction(tree, 0, "bottom", 0), { kind: "focus", index: 4 });
});

test("l expands a collapsed folder, steps into an open one, and shows a note", () => {
  assert.deepEqual(listAction(tree, 3, "right", 0), { kind: "activate", index: 3 });
  assert.deepEqual(listAction(tree, 0, "right", 0), { kind: "focus", index: 1 });
  assert.deepEqual(listAction(tree, 2, "right", 0), { kind: "activate", index: 2 });
  assert.equal(listAction([{ kind: "group", expanded: true, parent: null }], 0, "right", 0), null);
});

test("h collapses an open folder and climbs one level at a time", () => {
  assert.deepEqual(listAction(tree, 0, "left", 0), { kind: "activate", index: 0 });
  assert.deepEqual(listAction(tree, 2, "left", 0), { kind: "focus", index: 0 });
  assert.equal(listAction(tree, 3, "left", 0), null);
  assert.equal(listAction(tree, 4, "left", 0), null);
  assert.deepEqual(listAction(nested, 2, "left", 0), { kind: "focus", index: 1 });
  assert.deepEqual(listAction(nested, 1, "left", 0), { kind: "activate", index: 1 });
});

test("o activates whatever row the cursor is on", () => {
  assert.deepEqual(listAction(tree, 0, "open", 0), { kind: "activate", index: 0 });
  assert.deepEqual(listAction(tree, 1, "open", 0), { kind: "activate", index: 1 });
});

test("n and N wrap through the matches, starting from either end", () => {
  assert.equal(stepSearch(0, null, 1), null);
  assert.equal(stepSearch(3, null, 1), 0);
  assert.equal(stepSearch(3, null, -1), 2);
  assert.equal(stepSearch(3, 2, 1), 0);
  assert.equal(stepSearch(3, 0, -1), 2);
  assert.equal(stepSearch(3, 1, 1), 2);
  assert.equal(stepSearch(2, 5, 1), 0);
});

test("a move must land somewhere new and never inside itself", () => {
  assert.equal(canMoveInto("Daily/2026-10-09.md", "Archive"), true);
  assert.equal(canMoveInto("Daily/2026-10-09.md", "Daily"), false);
  assert.equal(canMoveInto("Note.md", ""), false);
  assert.equal(canMoveInto("Projects", "Projects"), false);
  assert.equal(canMoveInto("Projects", "Projects/Archive"), false);
  assert.equal(canMoveInto("Projects/Archive", ""), true);
  assert.equal(canMoveInto("Pro", "Projects"), true);
});

test("single keys, prefixes, and Ctrl chords don't collide", () => {
  const starts = new Set(Object.keys(PREFIX_KEYMAP).map((sequence) => sequence[0]!));
  for (const start of starts) assert.equal(KEYMAP[start], undefined, `${start} starts a prefix and can't also act alone`);
  for (const sequence of Object.keys(PREFIX_KEYMAP)) assert.equal(sequence.length, 2);
  assert.deepEqual(Object.keys(CTRL_KEYMAP).sort(), ["b", "d", "f", "u"]);
});

test("every key in the shortcuts dialog is bound", () => {
  const bound = new Set([...Object.keys(KEYMAP), ...Object.keys(PREFIX_KEYMAP), ...Object.keys(CTRL_KEYMAP).map((key) => `Ctrl-${key}`)]);
  // Handled by bb, the editor, or the browser rather than the keymap.
  const elsewhere = new Set(["⌘⇧L", "⌘E", "⌘↵", "Tab", "Esc"]);
  for (const section of KEY_HELP) {
    for (const { keys } of section.keys) {
      for (const key of keys) assert.ok(bound.has(key) || elsewhere.has(key), `${key} is listed but not bound`);
    }
  }
});
