import { keymapConflicts, unboundHelpKeys } from "bb-vim-keys";
import { describe, expect, it } from "vitest";
import { HELP, KEYMAP } from "./keys";

describe("activity keys", () => {
  it("has no sequence waiting on another, and lists only keys it binds", () => {
    expect(keymapConflicts(KEYMAP)).toEqual([]);
    expect(unboundHelpKeys(HELP, KEYMAP)).toEqual([]);
  });
});
