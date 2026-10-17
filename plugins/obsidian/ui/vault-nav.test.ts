import assert from "node:assert/strict";
import { test } from "node:test";
import { keymapConflicts, unboundHelpKeys } from "bb-vim-keys";
import { canMoveInto, KEY_HELP, KEYMAP } from "./vault-nav.ts";

test("a move must land somewhere new and never inside itself", () => {
  assert.equal(canMoveInto("Daily/2026-10-09.md", "Archive"), true);
  assert.equal(canMoveInto("Daily/2026-10-09.md", "Daily"), false);
  assert.equal(canMoveInto("Note.md", ""), false);
  assert.equal(canMoveInto("Projects", "Projects"), false);
  assert.equal(canMoveInto("Projects", "Projects/Archive"), false);
  assert.equal(canMoveInto("Projects/Archive", ""), true);
  assert.equal(canMoveInto("Pro", "Projects"), true);
});

test("no key both runs a command and starts a longer one", () => {
  assert.deepEqual(keymapConflicts(KEYMAP), []);
});

test("every key in the shortcuts dialog is bound", () => {
  // Handled by bb, the editor, or the browser rather than the keymap.
  assert.deepEqual(unboundHelpKeys(KEY_HELP, KEYMAP, ["⌘⇧L", "⌘E", "⌘↵", "Tab"]), []);
});
