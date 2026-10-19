import { createKeyHandler, type KeyContext } from "./handler.ts";
import { mapKeymap, MOTION_KEYS, type Motion, stepIndex, TEXT_BOX_MOTION_KEYS } from "./motion.ts";
import type { Keymap } from "./reader.ts";

export interface PickerKeysOptions<C = never> {
  /** How many options are listed now. */
  length: () => number;
  /** The highlighted option; null for none. */
  highlight: () => number | null;
  setHighlight: (index: number) => void;
  /** Enter, from the list or the filter box. */
  pick: (index: number, event: KeyboardEvent) => void;
  /** Rows a page holds, for Ctrl-d/u and Ctrl-f/b; `visibleRowCount` measures a list. */
  pageSize?: () => number;
  /** j past the last option comes back on the first. */
  wrap?: boolean;
  /** `/` and `i` in the list: show or focus the filter box. Unbound without it. */
  openFilter?: () => void;
  /** Escape in the list. Without it, or when it returns false, Escape is left to the popover, which closes. */
  onListEscape?: () => boolean | void;
  /**
   * Escape in the filter box: say, clear the query, or go back to the list with the filter
   * still applied. Without it, or when it returns false, Escape is left to the popover.
   */
  onFilterEscape?: () => boolean | void;
  /** More keys for the list, such as `p` to pin or `dd` to remove; they win over the built-in ones. */
  keymap?: Keymap<C>;
  onCommand?: (command: C, context: KeyContext) => boolean | void;
}

export interface PickerKeys {
  /** For the list (or the trigger holding focus while it is open). True when the key was taken. */
  list(event: KeyboardEvent): boolean;
  /** For the filter box: arrows and Ctrl-n/p move, Enter picks, Escape runs `onFilterEscape`; the rest is typing. */
  filter(event: KeyboardEvent): boolean;
  reset(): void;
  /** The keymaps in force, for `keymapConflicts` and `unboundHelpKeys` in the plugin's tests. */
  readonly keymaps: { list: Keymap<unknown>; filter: Keymap<unknown> };
}

type PickerCommand<C> = { kind: "move"; motion: Motion } | { kind: "pick" } | { kind: "filter" } | { kind: "escape" } | { kind: "own"; command: C };

/**
 * Keys for a list with a highlighted option and maybe a filter box, the shape of a select, a
 * combobox, or a project switcher. Focus stays where it is (the list, its trigger, or the box)
 * and the highlight moves, as with `aria-activedescendant`. It holds no listener: hand each
 * keydown to `list` or `filter`, and stop it from reaching outer surfaces when they return true.
 */
export function createPickerKeys<C = never>(options: PickerKeysOptions<C>): PickerKeys {
  const motion = (keymap: Keymap<Motion>) => mapKeymap(keymap, (motion): PickerCommand<C> => ({ kind: "move", motion }));
  const own = mapKeymap(options.keymap ?? {}, (command): PickerCommand<C> => ({ kind: "own", command }));
  const listKeymap: Keymap<PickerCommand<C>> = {
    ...motion(MOTION_KEYS),
    ...motion({ "<C-n>": "down", "<C-p>": "up", "<Home>": "top", "<End>": "bottom" }),
    "<CR>": { kind: "pick" },
    "<Esc>": { kind: "escape" },
    ...(options.openFilter === undefined ? {} : { "/": { kind: "filter" as const }, i: { kind: "filter" as const } }),
    ...own,
  };
  const filterKeymap: Keymap<PickerCommand<C>> = {
    ...motion(TEXT_BOX_MOTION_KEYS),
    "<CR>": { kind: "pick" },
    "<Esc>": { kind: "escape" },
  };

  const run = (from: "list" | "filter") => (command: PickerCommand<C>, context: KeyContext) => {
    switch (command.kind) {
      case "move": {
        const next = stepIndex(options.length(), options.highlight(), command.motion, { count: context.count, pageSize: options.pageSize?.(), wrap: options.wrap });
        if (next !== null) options.setHighlight(next);
        return;
      }
      case "pick": {
        const index = options.highlight();
        if (index === null || index >= options.length()) return false;
        options.pick(index, context.event);
        return;
      }
      case "filter":
        options.openFilter?.();
        return;
      case "escape":
        const escape = from === "list" ? options.onListEscape : options.onFilterEscape;
        return escape === undefined ? false : escape();
      case "own":
        return options.onCommand?.(command.command, context);
    }
  };

  const list = createKeyHandler({ keymap: listKeymap, onCommand: run("list"), leaveToPressables: false, counts: true });
  const filter = createKeyHandler({ keymap: filterKeymap, onCommand: run("filter"), isText: () => false, leaveToPressables: false });
  return {
    list: (event) => list.handle(event),
    filter: (event) => filter.handle(event),
    reset: () => list.reset(),
    keymaps: { list: listKeymap, filter: filterKeymap },
  };
}
