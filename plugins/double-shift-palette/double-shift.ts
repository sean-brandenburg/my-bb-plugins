export const DOUBLE_SHIFT_WINDOW_MS = 400;

/**
 * Cross-plugin contract with the Project switcher (grouped-thread-list),
 * which defines the same constant in
 * plugins/grouped-thread-list/app/picker/picker-store.ts.
 *
 * Plugins can't run each other's commands, so this plugin dispatches a
 * cancelable CustomEvent with this name on `window`; the Project switcher
 * toggles its picker and calls preventDefault() to claim it. Unclaimed, it
 * falls back to bb's quick palette. Renaming it breaks installed copies of
 * the other plugin, so change both sides together or not at all.
 */
export const TOGGLE_PROJECT_PICKER_EVENT = "bb-project-switcher:toggle";

/** True when a listener (the Project switcher) claimed the request. */
export function requestProjectPicker(target: EventTarget): boolean {
  return !target.dispatchEvent(
    new CustomEvent(TOGGLE_PROJECT_PICKER_EVENT, { cancelable: true }),
  );
}

export interface Shortcut {
  key: string;
  mod?: boolean;
  meta?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/**
 * Two Shift taps within the window, with nothing else pressed in between and
 * neither held down past the window. Typing capitals never trips it because
 * the letter resets the sequence.
 */
export function createDoubleShiftDetector(
  onDoubleShift: () => void,
  windowMs = DOUBLE_SHIFT_WINDOW_MS,
) {
  let shiftDownAt: number | null = null;
  let lastTapAt: number | null = null;

  const reset = () => {
    shiftDownAt = null;
    lastTapAt = null;
  };

  return {
    keydown(event: KeyboardEvent) {
      if (
        event.key !== "Shift" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        reset();
        return;
      }
      if (!event.repeat) shiftDownAt = event.timeStamp;
    },
    keyup(event: KeyboardEvent) {
      if (event.key !== "Shift" || shiftDownAt === null) return;
      const now = event.timeStamp;
      const held = now - shiftDownAt;
      shiftDownAt = null;
      if (held > windowMs) {
        lastTapAt = null;
        return;
      }
      if (lastTapAt !== null && now - lastTapAt <= windowMs) {
        reset();
        onDoubleShift();
        return;
      }
      lastTapAt = now;
    },
    reset,
  };
}

export function isMacPlatform(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/u.test(userAgent);
}

/** The keydown bb would see if the user pressed this shortcut themselves. */
export function shortcutKeydown(
  shortcut: Shortcut,
  isMac: boolean,
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: shortcut.key,
    metaKey: Boolean(shortcut.meta || (shortcut.mod && isMac)),
    ctrlKey: Boolean(shortcut.control || (shortcut.mod && !isMac)),
    altKey: Boolean(shortcut.alt),
    shiftKey: Boolean(shortcut.shift),
    bubbles: true,
    cancelable: true,
  });
}

export function findCommandShortcut(
  keybindings: readonly { command: string; shortcut: Shortcut | null }[],
  command: string,
): Shortcut | null {
  return (
    keybindings.find(
      (binding) => binding.command === command && binding.shortcut,
    )?.shortcut ?? null
  );
}
