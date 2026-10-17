import assert from "node:assert/strict";
import { test } from "node:test";
import { keymapConflicts, unboundHelpKeys } from "bb-vim-keys";
import { KEY_HELP, KEYMAP } from "./client-nav.ts";

test("no key both runs a command and starts a longer one", () => {
  assert.deepEqual(keymapConflicts(KEYMAP), []);
});

test("every key in the help is mapped", () => {
  assert.deepEqual(unboundHelpKeys(KEY_HELP, KEYMAP, ["⌘↵"]), []);
});
