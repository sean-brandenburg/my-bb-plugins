import { useEffect, useSyncExternalStore } from "react";

// The sidebar and the picker overlay render in separate React roots, so the
// open flag lives at module scope rather than in either tree.
let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function closeProjectPicker() {
  if (!open) return;
  open = false;
  emit();
}

export function toggleProjectPicker() {
  open = !open;
  emit();
}

/**
 * Cross-plugin contract with Double Shift (double-shift-palette), which
 * defines the same constant in plugins/double-shift-palette/double-shift.ts.
 *
 * Plugins can't run each other's commands, so Double Shift dispatches a
 * cancelable CustomEvent with this name on `window`; this plugin toggles the
 * picker and calls preventDefault() to claim it. Unclaimed, Double Shift
 * opens bb's quick palette instead. Renaming it breaks installed copies of
 * the other plugin, so change both sides together or not at all.
 */
export const TOGGLE_PROJECT_PICKER_EVENT = "bb-project-switcher:toggle";

export function useToggleProjectPickerEvent() {
  useEffect(() => {
    const onToggle = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      toggleProjectPicker();
    };
    window.addEventListener(TOGGLE_PROJECT_PICKER_EVENT, onToggle);
    return () => {
      window.removeEventListener(TOGGLE_PROJECT_PICKER_EVENT, onToggle);
    };
  }, []);
}

export function useProjectPickerOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open);
}
