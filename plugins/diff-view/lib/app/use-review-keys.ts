import { useEffect, useState } from "react";
import { claimKeyboard, ownsKeyboard, releaseKeyboard } from "./state";

export interface ReviewKeyHandlers {
  /** j / k */
  stepHunk: (direction: 1 | -1) => void;
  /** n / p */
  stepFile: (direction: 1 | -1) => void;
  /** c / C */
  stepComment: (direction: 1 | -1) => void;
  /** v */
  toggleViewed: () => void;
}

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element !== null && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable);
}

/**
 * Single-key review shortcuts, sent only to the view that last saw a pointer or focus when several are mounted. Spread
 * the returned props on the view's root so it can claim the keyboard.
 */
export function useReviewKeys(handlers: ReviewKeyHandlers): { onPointerDownCapture: () => void; onFocusCapture: () => void } {
  const [owner] = useState(() => Symbol("diff-view"));
  useEffect(() => () => releaseKeyboard(owner), [owner]);
  // Resubscribed every render so the handlers always see the current files and viewed marks.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntry(event.target)) return;
      if (!ownsKeyboard(owner)) return;
      switch (event.key) {
        case "j":
          handlers.stepHunk(1);
          break;
        case "k":
          handlers.stepHunk(-1);
          break;
        case "n":
          handlers.stepFile(1);
          break;
        case "p":
          handlers.stepFile(-1);
          break;
        case "c":
          handlers.stepComment(1);
          break;
        case "C":
          handlers.stepComment(-1);
          break;
        case "v":
          handlers.toggleViewed();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return { onPointerDownCapture: () => claimKeyboard(owner), onFocusCapture: () => claimKeyboard(owner) };
}
