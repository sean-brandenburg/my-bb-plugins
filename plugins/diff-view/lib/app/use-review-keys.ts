import type { RefObject } from "react";
import { OUTSIDE_FINDINGS } from "./findings/outside-findings";
import { REVIEW_KEYMAP, type ReviewCommand } from "./keys/keymap";
import { escapeFromText, type ReviewKeys } from "./keys/review-keys-context";
import { useKeyScope } from "./ui/vim-keys";

/**
 * The file list and the findings listed above the diff take their own keys first; of the diff's, only these work from
 * them. The rest are swallowed rather than left to bb, as both are part of the diff.
 */
const PAST_OWN_LISTS: ReadonlySet<ReviewCommand["kind"]> = new Set(["help", "findFile"]);
const MAX_COUNT = 9999;

/**
 * Vim-style review keys, sent only to the view that last saw a pointer or focus when several are mounted, and only
 * when the key comes from inside the view (or from nowhere in particular), so the thread list and other panels keep
 * theirs. Text boxes keep every key but Escape, which hands the keyboard back to the diff.
 */
export function useReviewKeys(rootRef: RefObject<HTMLElement | null>, keys: ReviewKeys, enabled: boolean, onCommand: (command: ReviewCommand, count: number) => void): void {
  useKeyScope(rootRef, enabled, {
    keymap: REVIEW_KEYMAP,
    group: "diff-view",
    counts: true,
    onTextEscape: (field) => escapeFromText(field, rootRef.current),
    onCommand: (command, { target, count }) => {
      if ((target?.closest("[data-file-tree]") != null || target?.closest(OUTSIDE_FINDINGS) != null) && !PAST_OWN_LISTS.has(command.kind)) return;
      onCommand(command, Math.min(count ?? 1, MAX_COUNT));
    },
    // The mode label shows a half-typed command until it completes or times out.
    onPending: (pending) => {
      if (keys.get().pending !== pending) keys.set({ pending });
    },
  });
}
