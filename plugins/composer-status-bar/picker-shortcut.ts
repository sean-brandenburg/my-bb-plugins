import { COMPOSER, PART_ATTRIBUTE } from "./footer-style.js";

const FOOTER_PICKER = `[${PART_ATTRIBUTE}="model-picker"] > button`;
// bb's modelPicker.toggle stays out of terminals, browser tabs, and modal dialogs.
const OFF_LIMITS = '.xterm, iframe, webview, [role="dialog"][aria-modal="true"], [role="alertdialog"]';

/** bb's default binding for modelPicker.toggle: ⇧⌘M on macOS, Ctrl+Shift+M elsewhere. */
export function isPickerShortcut(event: KeyboardEvent, mac: boolean): boolean {
  if (event.key.toLowerCase() !== "m" || !event.shiftKey || event.altKey) return false;
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

function shown(element: HTMLElement): boolean {
  return typeof element.checkVisibility !== "function" || element.checkVisibility();
}

/** The footer picker the shortcut should toggle, or null to leave the key to bb. */
export function shortcutTarget(doc: Document): HTMLElement | null {
  const open = doc.querySelector<HTMLElement>(`${FOOTER_PICKER}[aria-expanded="true"]`);
  if (open !== null) return open;
  const active = doc.activeElement;
  if (active?.closest(OFF_LIMITS)) return null;
  const composer = active?.closest(COMPOSER) ?? doc.querySelector(`${COMPOSER}[data-app-composer-role="primary"]`);
  const trigger = composer?.querySelector<HTMLElement>(FOOTER_PICKER) ?? null;
  return trigger !== null && shown(trigger) ? trigger : null;
}

/**
 * bb anchors its picker to its own button in the prompt box, which the footer hides while it shows its copy, so the
 * shortcut toggles the footer's picker instead. Without one (narrow composers, phones) the key reaches bb as usual.
 * A rebound shortcut isn't followed and opens bb's picker as before.
 */
export function watchPickerShortcut(win: Window): () => void {
  const mac = /mac/i.test(win.navigator.platform);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || !isPickerShortcut(event, mac)) return;
    const target = shortcutTarget(win.document);
    if (target === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.click();
  };
  // Capture on the window runs before bb's own shortcut handling.
  win.addEventListener("keydown", onKeyDown, true);
  return () => win.removeEventListener("keydown", onKeyDown, true);
}
