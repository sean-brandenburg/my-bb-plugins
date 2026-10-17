import { useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { type Caret, editField, isTextEntry, NAV_ROW, useKeyScope } from "bb-vim-keys/react";
import { type ClientCommand, KEYMAP } from "./client-nav";

export { editField, focusRow, isTextEntry, isToolbar, NAV_ROW, pageCursor, readRows, toolbarButtons } from "bb-vim-keys";

/**
 * Vim-style client keys. Keys count only when they come from the view (or nowhere in particular),
 * so the thread list, the composer and other plugins keep theirs. The view mounts both as a page
 * and as a thread panel; a key with no focused target goes to whichever the user last touched.
 * `onCommand` returns false when the key did nothing, so it keeps its default.
 */
export function useClientKeys(root: HTMLElement | null, enabled: boolean, onCommand: (command: ClientCommand) => boolean | void): void {
  useKeyScope(root, enabled, {
    keymap: KEYMAP,
    group: "grpc",
    // Arriving from the sidebar leaves focus on its link, where client keys would be ignored.
    takeFocus: true,
    onCommand,
    // vim-mode swallows Escape in text boxes unless it is set to let Escape leave them.
    onTextEscape: () => onCommand({ kind: "escape", fromField: true }),
  });
}

const PANEL_STOPS = "button:not(:disabled), input:not(:disabled), select:not(:disabled)";

/**
 * Moves focus into a panel as it opens, onto its current choice if it marks one, and lets
 * j/k or the arrows step through its controls. Returns the panel's keydown handler.
 */
export function usePanelKeys(panel: RefObject<HTMLElement | null>, open: boolean): (event: ReactKeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    const node = panel.current;
    if (!open || node === null) return;
    const initial = node.querySelector<HTMLElement>('[aria-current="true"]') ?? node.querySelector<HTMLElement>(PANEL_STOPS);
    initial?.focus({ preventScroll: true });
  }, [panel, open]);

  return (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const node = panel.current;
    const target = event.target as Element;
    if (node === null) return;
    // A select's arrows change its value, but j and k still leave it.
    const select = target instanceof HTMLSelectElement;
    const typing = isTextEntry(target) && !select;
    const down = (event.key === "ArrowDown" && !select) || (event.key === "j" && !typing);
    const up = (event.key === "ArrowUp" && !select) || (event.key === "k" && !typing);
    const step = down ? 1 : up ? -1 : 0;
    if (step === 0) return;
    const stops = [...node.querySelectorAll<HTMLElement>(PANEL_STOPS)].filter((stop) => stop.getClientRects().length > 0);
    const index = stops.findIndex((stop) => stop === target || stop.contains(target));
    const next = stops[index === -1 ? 0 : Math.min(Math.max(index + step, 0), stops.length - 1)];
    if (next === undefined) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest" });
  };
}

/** Makes an element a stop for the request form's field cursor; pair it with FOCUS_RING. */
export const FIELD_ROW = { "data-nav-row": "item", tabIndex: -1 } as const;
/** A message in a list: a stop of its own (so dd can remove it) that holds its fields' rows. */
export const FIXED_GROUP_ROW = { "data-nav-row": "group", "data-nav-fixed": "", "data-nav-group": "", tabIndex: -1 } as const;

/** The row's own controls, not those of rows nested inside it. */
export function ownControls<T extends Element>(row: HTMLElement, selector: string): T[] {
  return [...row.querySelectorAll<T>(selector)].filter((control) => control.closest(NAV_ROW) === row);
}

const ROW_INPUTS = "input:not(:disabled), textarea:not(:disabled), select:not(:disabled)";

/** Opens a row: clicks a button row, else starts editing its first field, else clicks its first button. */
export function activateRow(row: HTMLElement, caret: Caret = "end"): void {
  if (row instanceof HTMLButtonElement) {
    row.click();
    return;
  }
  // A list's message item has no box of its own; editing it starts at its first field.
  const inputs = row.dataset.navFixed !== undefined ? [...row.querySelectorAll<HTMLElement>(ROW_INPUTS)] : ownControls<HTMLElement>(row, ROW_INPUTS);
  const text = inputs.find(isTextEntry);
  if (text !== undefined) {
    editField(text, caret);
    return;
  }
  // A choice opens its list, where j/k pick a value.
  const choice = (row.dataset.navFixed !== undefined ? [...row.querySelectorAll<HTMLElement>("[data-choice]")] : ownControls<HTMLElement>(row, "[data-choice]"))[0];
  if (choice !== undefined) {
    choice.focus({ preventScroll: true });
    choice.click();
    return;
  }
  if (inputs[0] !== undefined) {
    inputs[0].focus({ preventScroll: true });
    return;
  }
  // Removing and clearing are dd's; opening a row never does either.
  ownControls<HTMLElement>(row, 'button:not(:disabled):not([aria-label^="Remove "]):not([aria-label^="Clear "])')[0]?.click();
}

/**
 * The buttons beside a row's box that l steps across (a timestamp's Now, a list item's remove,
 * a header's checkbox). The box itself, a choice, hidden Clear buttons, and the button that
 * opening the row presses are not among them.
 */
export function rowCells(row: HTMLElement): HTMLElement[] {
  const cells = ownControls<HTMLElement>(row, 'button:not(:disabled):not([data-choice]):not([aria-label^="Clear "]), input[type="checkbox"]:not(:disabled)');
  const hasBox = ownControls<HTMLElement>(row, `${ROW_INPUTS}, [data-choice]`).some((control) => control instanceof HTMLButtonElement || isTextEntry(control));
  return hasBox ? cells : cells.slice(1);
}

/** Sets a controlled input's value the way typing would, so React sees the change. */
function setNativeValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

/**
 * Removes what a row holds: its Remove button (list item, map entry, header), else its Clear
 * button (a set field, which unsets it), else empties its inputs. False when nothing changed.
 */
export function deleteRow(row: HTMLElement): boolean {
  const button =
    ownControls<HTMLButtonElement>(row, 'button[aria-label^="Remove "]')[0] ?? ownControls<HTMLButtonElement>(row, 'button[aria-label^="Clear "]')[0];
  if (button !== undefined) {
    button.click();
    return true;
  }
  let changed = false;
  for (const control of ownControls<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(row, ROW_INPUTS)) {
    if (!isTextEntry(control) || control.value === "") continue;
    if (control instanceof HTMLSelectElement && ![...control.options].some((option) => option.value === "")) continue;
    setNativeValue(control, "");
    changed = true;
  }
  return changed;
}
