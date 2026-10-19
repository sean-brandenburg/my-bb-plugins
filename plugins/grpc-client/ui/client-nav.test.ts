import assert from "node:assert/strict";
import { test } from "node:test";
import { createPickerKeys, keymapConflicts, unboundHelpKeys } from "bb-vim-keys";
import {
  CHOICE_KEYMAP,
  CONFIRM_KEYMAP,
  DISMISS_KEYMAP,
  KEY_HELP,
  KEYMAP,
  LIST_SEARCH_KEYMAP,
  PANEL_KEYMAP,
  PANEL_SELECT_KEYMAP,
  PANEL_TEXT_BOX_KEYMAP,
} from "./client-nav.ts";

/** The open enum or bool list's keys, as ChoiceSelect builds them. */
const choiceKeys = createPickerKeys({ length: () => 0, highlight: () => null, setHighlight() {}, pick() {}, openFilter() {}, keymap: CHOICE_KEYMAP }).keymaps;

const KEYMAPS = {
  client: KEYMAP,
  choiceList: choiceKeys.list,
  choiceFilter: choiceKeys.filter,
  panel: PANEL_KEYMAP,
  panelTextBox: PANEL_TEXT_BOX_KEYMAP,
  panelSelect: PANEL_SELECT_KEYMAP,
  dismiss: DISMISS_KEYMAP,
  confirm: CONFIRM_KEYMAP,
  listSearch: LIST_SEARCH_KEYMAP,
};

for (const [name, keymap] of Object.entries(KEYMAPS)) {
  test(`no ${name} key both runs a command and starts a longer one`, () => {
    assert.deepEqual(keymapConflicts(keymap), []);
  });
}

test("every key in the help is mapped", () => {
  assert.deepEqual(unboundHelpKeys(KEY_HELP, [KEYMAP, choiceKeys.list, PANEL_KEYMAP, CONFIRM_KEYMAP], ["⌘↵"]), []);
});

test("an open choice list jumps to its top on gg, not a bare g", () => {
  assert.ok("gg" in choiceKeys.list);
  assert.ok(!("g" in choiceKeys.list));
});

test("an open choice list picks with Space as well as Enter", () => {
  assert.ok("<Space>" in choiceKeys.list);
  assert.ok("<CR>" in choiceKeys.list);
});

test("a panel's text box keeps its letters and a select its arrows", () => {
  assert.ok(Object.keys(PANEL_TEXT_BOX_KEYMAP).every((keys) => keys.startsWith("<")));
  assert.ok(!("<Down>" in PANEL_SELECT_KEYMAP) && !("<Up>" in PANEL_SELECT_KEYMAP));
  assert.ok("j" in PANEL_SELECT_KEYMAP && "k" in PANEL_SELECT_KEYMAP);
});
