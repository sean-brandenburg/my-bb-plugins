import {
  createKeyReader,
  displaySequence,
  type Keymap,
  keymapConflicts,
  SEQUENCE_TIMEOUT_MS,
  unboundHelpKeys,
} from "bb-vim-keys";
import { describe, expect, it } from "vitest";
import {
  FILTER_KEYMAP,
  LIST_KEYMAP,
  pickerHints,
  pickerKeymap,
  PREVIEW_KEYMAP,
} from "./picker-keymap.js";
import type { PickerColumn } from "./picker-model.js";

const COLUMNS: readonly PickerColumn[] = ["left", "right", "preview"];

function commandName(
  command: { kind: string; motion?: string; action?: string } | undefined,
) {
  return command?.motion ?? command?.action ?? command?.kind;
}

function commands(keymap: Keymap<{ kind: string }>, keys: readonly string[]) {
  return keys.map((key) => commandName(keymap[key]));
}

describe("picker keymap", () => {
  it("has no sequence that starts a longer one", () => {
    expect(keymapConflicts(LIST_KEYMAP)).toEqual([]);
    expect(keymapConflicts(PREVIEW_KEYMAP)).toEqual([]);
    expect(keymapConflicts(FILTER_KEYMAP)).toEqual([]);
  });

  it("maps vim keys, arrows, and Ctrl+N/P to the same moves", () => {
    expect(commands(LIST_KEYMAP, ["j", "<Down>", "<C-n>"])).toEqual([
      "down",
      "down",
      "down",
    ]);
    expect(commands(LIST_KEYMAP, ["k", "<Up>", "<C-p>"])).toEqual([
      "up",
      "up",
      "up",
    ]);
    expect(
      commands(LIST_KEYMAP, [
        "h",
        "l",
        "<Tab>",
        "<S-Tab>",
        "gg",
        "G",
        "<CR>",
        "o",
        "/",
        "q",
      ]),
    ).toEqual([
      "left",
      "right",
      "switch-column",
      "switch-column",
      "top",
      "bottom",
      "activate",
      "activate",
      "filter",
      "close",
    ]);
    expect(commands(LIST_KEYMAP, ["d", "u", "p", "r", "n", "<Esc>"])).toEqual([
      "archive",
      "undo-archive",
      "pin",
      "mark-read",
      "new-thread",
      "escape",
    ]);
    expect(LIST_KEYMAP.x).toBeUndefined();
  });

  it("jumps to the top on gg typed within the sequence timeout", () => {
    const reader = createKeyReader(LIST_KEYMAP);
    const read = (key: string, at: number) => {
      const result = reader.read(key, at);
      return result.kind === "command"
        ? commandName(result.command)
        : result.kind;
    };
    expect(read("g", 0)).toBe("pending");
    expect(read("g", 10)).toBe("top");
    expect(read("g", 100)).toBe("pending");
    expect(read("j", 110)).toBe("down");
    expect(read("g", 200)).toBe("pending");
    expect(read("g", 200 + SEQUENCE_TIMEOUT_MS + 1)).toBe("pending");
  });

  it("scrolls the preview with vim's scroll keys, and keeps them out of the lists", () => {
    const scrollKeys = ["<C-d>", "<C-u>", "<C-f>", "<C-b>", "<C-e>", "<C-y>"];
    expect(commands(PREVIEW_KEYMAP, scrollKeys)).toEqual([
      "halfDown",
      "halfUp",
      "pageDown",
      "pageUp",
      "down",
      "up",
    ]);
    expect(commands(PREVIEW_KEYMAP, ["j", "k", "gg", "G", "d", "h"])).toEqual([
      "down",
      "up",
      "top",
      "bottom",
      "archive",
      "left",
    ]);
    for (const key of scrollKeys) expect(LIST_KEYMAP[key]).toBeUndefined();
    expect(pickerKeymap("left")).toBe(LIST_KEYMAP);
    expect(pickerKeymap("right")).toBe(LIST_KEYMAP);
    expect(pickerKeymap("preview")).toBe(PREVIEW_KEYMAP);
  });

  it("leaves typed letters to the filter box", () => {
    expect(
      commands(FILTER_KEYMAP, [
        "<Down>",
        "<C-n>",
        "<Up>",
        "<C-p>",
        "<CR>",
        "<Esc>",
      ]),
    ).toEqual(["down", "down", "up", "up", "accept", "cancel"]);
    expect(commands(FILTER_KEYMAP, ["j", "k", "q", "/"])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("hints only the keys that act in the focused column", () => {
    const footer = (column: PickerColumn) =>
      pickerHints(column).map(({ display, label }) => [display, label]);
    expect(footer("left")).toEqual([
      ["↵", "open"],
      ["n", "new thread"],
      ["/", "filter"],
      ["esc", "close"],
    ]);
    expect(footer("right")).toEqual([
      ["l", "preview"],
      ["↵", "open"],
      ["p", "pin"],
      ["r", "mark read"],
      ["d", "delete"],
      ["u", "undo"],
      ["n", "new thread"],
    ]);
    expect(footer("preview")).toEqual([
      ["⌃d", "scroll down"],
      ["⌃u", "scroll up"],
      ["h", "back"],
      ["↵", "open"],
      ["p", "pin"],
      ["r", "mark read"],
      ["d", "delete"],
      ["u", "undo"],
      ["n", "new thread"],
    ]);
  });

  it("hints only keys bound in the column they're shown in", () => {
    for (const column of COLUMNS) {
      const section = {
        title: column,
        keys: pickerHints(column).map(({ keys, label }) => ({
          keys: [displaySequence(keys)],
          action: label,
        })),
      };
      expect(unboundHelpKeys([section], pickerKeymap(column))).toEqual([]);
    }
  });
});
