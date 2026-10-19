import { useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { type Caret, editField, focusRow, isTextEntry, type KeyContext, NAV_ROW, returnToRow, stepIndex, useKeyHandler, useKeyScope } from "bb-vim-keys/react";
import { type ClientCommand, KEYMAP, LIST_SEARCH_KEYMAP, PANEL_KEYMAP, PANEL_SELECT_KEYMAP, PANEL_TEXT_BOX_KEYMAP } from "./client-nav";

export { editField, focusRow, isTextEntry, NAV_ROW, readRows, returnToRow } from "bb-vim-keys";

/**
 * Vim-style client keys. Keys count only when they come from the view (or nowhere in particular),
 * so the thread list, the composer and other plugins keep theirs. The view mounts both as a page
 * and as a thread panel; a key with no focused target goes to whichever the user last touched.
 * `onCommand` returns false when the key did nothing, so it keeps its default.
 */
export function useClientKeys(
  root: HTMLElement | null,
  enabled: boolean,
  onCommand: (command: ClientCommand, context: KeyContext) => boolean | void,
  onTextEscape: (field: HTMLElement) => void,
): void {
  useKeyScope(root, enabled, {
    keymap: KEYMAP,
    group: "grpc",
    counts: true,
    // Arriving from the sidebar leaves focus on its link, where client keys would be ignored.
    takeFocus: true,
    onCommand,
    // vim-mode swallows Escape in text boxes unless it is set to let Escape leave them.
    onTextEscape,
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

  return useKeyHandler({
    keymap: (target) => {
      if (target instanceof HTMLSelectElement) return PANEL_SELECT_KEYMAP;
      return isTextEntry(target) ? PANEL_TEXT_BOX_KEYMAP : PANEL_KEYMAP;
    },
    // The keymap leaves text boxes their typing; it is picked by the control the key came from instead.
    isText: () => false,
    onCommand: (motion, { target, count }) => {
      const node = panel.current;
      if (node === null) return false;
      const stops = [...node.querySelectorAll<HTMLElement>(PANEL_STOPS)].filter((stop) => stop.getClientRects().length > 0);
      const index = stops.findIndex((stop) => target !== null && (stop === target || stop.contains(target)));
      const next = stops[stepIndex(stops.length, index === -1 ? null : index, motion, { count }) ?? -1];
      if (next === undefined) return false;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
    },
  });
}

/** Marks the method and call-history search boxes, so `/` can wait for whichever the list shows. */
export const LIST_SEARCH = "[data-list-search]";

/**
 * Keys for the list's search box: Escape clears the query, or with none goes back to the
 * cursor's row (the open one, else the first); ↓ goes to the first row; Enter opens the first
 * match and leaves the cursor on it, so j/k carry on through the rest.
 */
export function useListSearchKeys(options: { rows: () => HTMLElement[]; query: string; clear: () => void; openFirst: () => boolean }) {
  return useKeyHandler({
    keymap: LIST_SEARCH_KEYMAP,
    isText: () => false,
    // The box is an input, which would otherwise keep its Enter.
    leaveToPressables: false,
    onCommand: (command, { target }) => {
      const rows = options.rows();
      switch (command) {
        case "escape":
          if (options.query !== "") options.clear();
          else if (target !== null) returnToRow(target, rows.find((row) => row.getAttribute("aria-current") === "true") ?? rows[0]);
          return;
        case "rows":
          if (rows[0] === undefined) return false;
          focusRow(rows[0]);
          return;
        case "openFirst":
          if (!options.openFirst()) return false;
          if (rows[0] !== undefined) focusRow(rows[0]);
          return;
      }
    },
  });
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
