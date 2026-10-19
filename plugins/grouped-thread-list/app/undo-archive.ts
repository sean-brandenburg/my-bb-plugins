import { bindKeys, OPEN_DIALOG } from "bb-vim-keys";

// bb's archive toast has no plugin API, so its Undo button is found through
// the shipped toast markup; a bb update that renames it leaves the button as
// the only way to undo.
const TOAST = "[data-sonner-toast]";
const TOAST_TITLE = '[data-testid="app-toast-title"]';
const ARCHIVED_TITLE = "Thread Archived";
const UNDO_LABEL = "Undo";

export const UNDO_ARCHIVE_KEY = "u";

function findArchiveUndo(doc: Document): HTMLButtonElement | null {
  const toasts = [...doc.querySelectorAll<HTMLElement>(TOAST)].filter(
    (toast) =>
      toast.querySelector(TOAST_TITLE)?.textContent?.trim() === ARCHIVED_TITLE,
  );
  const newest =
    toasts.find((toast) => toast.dataset.front === "true") ?? toasts[0];
  if (newest === undefined) return null;
  return (
    [...newest.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === UNDO_LABEL,
    ) ?? null
  );
}

/**
 * Clicks Undo on bb's newest "Thread Archived" toast, so the undo is bb's own:
 * it restores child threads too and returns to the thread if it was open.
 * Returns false when no such toast is showing.
 */
export function undoLastArchive(doc: Document): boolean {
  const undo = findArchiveUndo(doc);
  if (undo === null) return false;
  undo.click();
  return true;
}

/**
 * `u` anywhere outside a text box undoes the archive while its toast shows.
 * It listens in the window's bubble phase, so the picker's own `u` goes first.
 */
export function installUndoArchiveKey(doc: Document, win: Window): () => void {
  return bindKeys(win, {
    keymap: { [UNDO_ARCHIVE_KEY]: "undo" },
    // While one of bb's dialogs is open, its keys are the dialog's.
    blocked: () => doc.querySelector(OPEN_DIALOG) !== null,
    onCommand: () => undoLastArchive(doc),
  });
}
