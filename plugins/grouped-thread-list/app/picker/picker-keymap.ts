/** What a key does in the picker; the dialog maps each to its handler. */
export type PickerCommand =
  | "down"
  | "up"
  | "left"
  | "right"
  | "switch-column"
  | "top"
  | "bottom"
  | "activate"
  | "pin"
  | "mark-read"
  | "archive"
  | "new-thread"
  | "filter"
  | "escape"
  | "close";

/** Keys while typing in the filter box. */
export type FilterCommand = "down" | "up" | "accept" | "cancel";

export type PreviewScroll =
  | "line-down"
  | "line-up"
  | "half-down"
  | "half-up"
  | "page-down"
  | "page-up"
  | "top"
  | "bottom";

interface KeyBinding<Command extends string> {
  /** `event.key`, prefixed with `C-` when Ctrl is held. */
  keys: readonly string[];
  command: Command;
  /** Only fires on the second press in a row, like vim's `gg`. */
  doubleTap?: boolean;
  /** Shown in the footer, under the first key. */
  hint?: string;
}

export const PICKER_KEYMAP: readonly KeyBinding<PickerCommand>[] = [
  { keys: ["j", "ArrowDown", "C-n"], command: "down" },
  { keys: ["k", "ArrowUp", "C-p"], command: "up" },
  { keys: ["h", "ArrowLeft"], command: "left" },
  { keys: ["l", "ArrowRight"], command: "right" },
  { keys: ["Tab"], command: "switch-column" },
  { keys: ["g"], command: "top", doubleTap: true },
  { keys: ["G"], command: "bottom" },
  { keys: ["Enter", "o"], command: "activate" },
  { keys: ["p"], command: "pin", hint: "pin" },
  { keys: ["r"], command: "mark-read", hint: "mark read" },
  // Labelled delete because that's the intent; archiving keeps it recoverable.
  { keys: ["d"], command: "archive", hint: "delete" },
  { keys: ["n"], command: "new-thread", hint: "new" },
  { keys: ["/"], command: "filter" },
  { keys: ["Escape"], command: "escape" },
  { keys: ["q"], command: "close" },
];

export const FILTER_KEYMAP: readonly KeyBinding<FilterCommand>[] = [
  { keys: ["ArrowDown", "C-n"], command: "down" },
  { keys: ["ArrowUp", "C-p"], command: "up" },
  { keys: ["Enter"], command: "accept" },
  { keys: ["Escape"], command: "cancel" },
];

/** Only while the preview is focused; elsewhere these keys stay unhandled. */
export const PREVIEW_KEYMAP: readonly KeyBinding<PreviewScroll>[] = [
  { keys: ["C-d"], command: "half-down" },
  { keys: ["C-u"], command: "half-up" },
  { keys: ["C-f"], command: "page-down" },
  { keys: ["C-b"], command: "page-up" },
  { keys: ["C-e"], command: "line-down" },
  { keys: ["C-y"], command: "line-up" },
];

export const PICKER_HINTS: readonly (readonly [key: string, label: string])[] =
  PICKER_KEYMAP.flatMap((binding) =>
    binding.hint === undefined
      ? []
      : [[binding.keys[0], binding.hint] as const],
  );

export function keyName(event: { key: string; ctrlKey: boolean }): string {
  return event.ctrlKey ? `C-${event.key}` : event.key;
}

function indexBindings<Command extends string>(
  keymap: readonly KeyBinding<Command>[],
): ReadonlyMap<string, KeyBinding<Command>> {
  const byKey = new Map<string, KeyBinding<Command>>();
  for (const binding of keymap) {
    for (const key of binding.keys) byKey.set(key, binding);
  }
  return byKey;
}

const PICKER_BINDINGS = indexBindings(PICKER_KEYMAP);
const FILTER_BINDINGS = indexBindings(FILTER_KEYMAP);
const PREVIEW_BINDINGS = indexBindings(PREVIEW_KEYMAP);

export type PickerKeyResolution =
  | { type: "command"; command: PickerCommand }
  /** The first press of a double-tap binding: swallow it and wait. */
  | { type: "pending" }
  | { type: "unbound" };

/**
 * `pendingKey` is the previous key when that press was left pending, and null
 * otherwise, so any other key in between cancels a double tap.
 */
export function resolvePickerKey(
  key: string,
  pendingKey: string | null,
): PickerKeyResolution {
  const binding = PICKER_BINDINGS.get(key);
  if (binding === undefined) return { type: "unbound" };
  if (binding.doubleTap && pendingKey !== key) return { type: "pending" };
  return { type: "command", command: binding.command };
}

export function resolveFilterKey(key: string): FilterCommand | undefined {
  return FILTER_BINDINGS.get(key)?.command;
}

export function resolvePreviewKey(key: string): PreviewScroll | undefined {
  return PREVIEW_BINDINGS.get(key)?.command;
}
