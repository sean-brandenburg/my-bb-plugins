import { useEffect, useState, type RefObject } from "react";

// bb portals its own dialogs (delete and archive confirmations) to the body
// at z-50, under the picker's layer.
const HOST_DIALOG = 'body > [data-bb-portaled-overlay][role="dialog"]';

/**
 * Whether one of bb's dialogs is open, so the picker can drop beneath it.
 * bb doesn't hand focus back when it closes, so the picker takes it back.
 */
export function useHostDialogOpen(
  root: RefObject<HTMLElement | null>,
): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let wasOpen = false;
    const sync = () => {
      const isOpen = document.querySelector(HOST_DIALOG) !== null;
      if (wasOpen && !isOpen) {
        const active = document.activeElement;
        if (active === null || active === document.body) root.current?.focus();
      }
      wasOpen = isOpen;
      setOpen(isOpen);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true });
    sync();
    return () => observer.disconnect();
  }, [root]);
  return open;
}
