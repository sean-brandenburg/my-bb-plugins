import assert from "node:assert/strict";
import { test } from "node:test";
import { keymapConflicts, tokenize, unboundHelpKeys } from "bb-vim-keys";
import { CAPTURE_BOX_KEYMAP, canMoveInto, KEY_HELP, KEYMAP, NAME_BOX_KEYMAP, noteMotion, SEARCH_BOX_KEYMAP } from "./vault-nav.ts";

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
  // Handled by bb (the plugin's commands), the editor, or the browser rather than the keymap.
  assert.deepEqual(unboundHelpKeys(KEY_HELP, KEYMAP, ["⌘⇧L", "⌘E", "⌘⇧F", "⌘↵", "Tab"]), []);
});

test("text boxes' keymaps take only single named keys, so typing is never held for a sequence", () => {
  for (const keymap of [SEARCH_BOX_KEYMAP, NAME_BOX_KEYMAP, CAPTURE_BOX_KEYMAP]) {
    for (const keys of Object.keys(keymap)) {
      const tokens = tokenize(keys);
      assert.equal(tokens.length, 1, keys);
      assert.match(tokens[0]!, /^<.+>$/, keys);
    }
  }
});

test("a note scrolls on the vertical motions and leaves the rest of the keys alone", () => {
  assert.equal(noteMotion(KEYMAP.j!), "down");
  assert.equal(noteMotion(KEYMAP.gg!), "top");
  assert.equal(noteMotion(KEYMAP.G!), "bottom");
  assert.equal(noteMotion(KEYMAP["<C-u>"]!), "halfUp");
  assert.equal(noteMotion(KEYMAP["<C-f>"]!), "pageDown");
  assert.equal(noteMotion(KEYMAP.h!), null);
  assert.equal(noteMotion(KEYMAP["<CR>"]!), null);
  assert.equal(noteMotion(KEYMAP["/"]!), null);
});
