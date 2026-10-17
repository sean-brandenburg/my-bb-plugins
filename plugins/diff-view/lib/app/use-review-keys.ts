import type { RefObject } from "react";
import { REVIEW_KEYMAP, type ReviewCommand } from "./keys/keymap";
import type { ReviewKeys } from "./keys/review-keys-context";
import { useKeyScope } from "./ui/vim-keys";

/** The file list moves with its own keys; of the diff's, only these reach past it. */
const FROM_FILE_TREE: ReadonlySet<ReviewCommand["kind"]> = new Set(["help", "findFile"]);
const MAX_COUNT = 9999;

/**
 * Vim-style review keys, sent only to the view that last saw a pointer or focus when several are mounted, and only
 * when the key comes from inside the view (or from nowhere in particular), so text boxes, the thread list and other
 * panels keep theirs.
 */
export function useReviewKeys(rootRef: RefObject<HTMLElement | null>, keys: ReviewKeys, enabled: boolean, onCommand: (command: ReviewCommand, count: number) => void): void {
  useKeyScope(rootRef, enabled, {
    keymap: REVIEW_KEYMAP,
    group: "diff-view",
    counts: true,
    onCommand: (command, { target, count }) => {
      if (target?.closest("[data-file-tree]") != null && !FROM_FILE_TREE.has(command.kind)) return;
      onCommand(command, Math.min(count ?? 1, MAX_COUNT));
    },
    // The mode label shows a half-typed command until it completes or times out.
    onPending: (pending) => {
      if (keys.get().pending !== pending) keys.set({ pending });
    },
  });
}
