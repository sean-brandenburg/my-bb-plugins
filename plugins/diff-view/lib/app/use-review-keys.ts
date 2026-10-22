import type { RefObject } from "react";
import { OUTSIDE_FINDINGS } from "./findings/outside-findings";
import type { ReviewCommand } from "./keys/keymap";
import { escapeFromText, type ReviewKeys } from "./keys/review-keys-context";
import { NARRATIVE_OUTLINE } from "./narrative/narrative-view";
import type { Keymap } from "./ui/vim-keys";
import { useKeyScope } from "./ui/vim-keys";

/**
 * The file list, the narrative outline and the findings listed above the diff take their own keys first; of the
 * diff's, only these work from them. The rest are swallowed rather than left to bb, as all are part of the diff.
 */
const PAST_OWN_LISTS: ReadonlySet<string> = new Set(["help", "findFile"] satisfies ReviewCommand["kind"][]);
const OWN_LISTS = `[data-file-tree], ${NARRATIVE_OUTLINE}, ${OUTSIDE_FINDINGS}`;
const MAX_COUNT = 9999;

/**
 * Vim-style review keys, sent only to the view that last saw a pointer or focus when several are mounted, and only
 * when the key comes from inside the view (or from nowhere in particular), so the thread list and other panels keep
 * theirs. Text boxes keep every key but Escape, which hands the keyboard back to the diff. `keymap` is read on each
 * key, so the view's mode (files or narrative) picks the keys; keep the maps themselves module constants.
 */
export function useReviewKeys<C extends { kind: string }>(rootRef: RefObject<HTMLElement | null>, keys: ReviewKeys, enabled: boolean, keymap: () => Keymap<C>, onCommand: (command: C, count: number) => void): void {
  useKeyScope(rootRef, enabled, {
    keymap,
    group: "diff-view",
    counts: true,
    onTextEscape: (field) => escapeFromText(field, rootRef.current),
    onCommand: (command, { target, count }) => {
      if (target?.closest(OWN_LISTS) != null && !PAST_OWN_LISTS.has(command.kind)) return;
      onCommand(command, Math.min(count ?? 1, MAX_COUNT));
    },
    // The mode label shows a half-typed command until it completes or times out.
    onPending: (pending) => {
      if (keys.get().pending !== pending) keys.set({ pending });
    },
  });
}
