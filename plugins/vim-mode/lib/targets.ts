const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

/** Whether keys typed at `element` are text, so `j` or Escape mean something there. */
export function isTextEntry(element: Element | null): boolean {
  if (element === null) return false;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type);
  return element.closest('textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/** Radix menus and listboxes take letters for typeahead without always claiming them. */
export const OWN_KEYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"]';

/** Dialogs that take the keyboard while open. */
export const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/** Anything floating over the page, open or not: for surfaces that sit on bb's own DOM. */
export const ANY_OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]';

/** Elements that press themselves on Enter or Space, so those keys stay theirs. */
export const PRESSABLE = 'button, a[href], input, select, summary, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"]';

export function isShown(element: Element | null | undefined): element is HTMLElement {
  return element != null && element.isConnected && element.getClientRects().length > 0;
}

/** Whether a widget owning its keys (a menu, listbox, or dialog) holds `target` and sits inside `root` rather than around it. */
export function inWidgetWithin(target: Element, root: Element): boolean {
  const widget = target.closest(OWN_KEYS);
  return widget !== null && !widget.contains(root);
}

/** Whether an overlay matching `selector` is up over `root`; one that holds the root (a plugin dialog) doesn't count. */
export function overlayOver(root: Element, selector: string = OPEN_DIALOG): boolean {
  return Array.from(root.ownerDocument.querySelectorAll(selector)).some((overlay) => !overlay.contains(root));
}

export function scrollParent(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}
