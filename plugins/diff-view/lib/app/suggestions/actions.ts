import type { SuggestionItem } from "../../types";
import type { DiffThread } from "../comments/threads";
import type { InlineFinding } from "../findings/findings";
import type { FindingSuggestionState } from "./finding-suggestion";
import type { LinesAt, ThreadSuggestion } from "./thread-suggestion";

/** Suggested changes across the view: the lines a block replaces, the batch, and applying. */
export interface SuggestionActions {
  linesAt: LinesAt;
  /** What `A` and `B` act on in a thread; null when no comment in it holds a suggestion. */
  forThread: (thread: DiffThread) => ThreadSuggestion | null;
  /** Null when the source cannot apply suggestions. */
  apply: ((items: SuggestionItem[]) => Promise<void>) | null;
  /** Adds the item to the batch, or takes it out; returns whether it is in now. */
  toggleBatch: (item: SuggestionItem) => boolean;
  batch: readonly SuggestionItem[];
  /** An apply is on its way. */
  busy: boolean;
  /** What `A`, `B` and `gs` act on in a finding; null when it has no suggestion. */
  forFinding: (item: InlineFinding) => FindingSuggestionState | null;
  /** Posts a finding's suggestion to the pull request as a draft comment; null when comments can't go to GitHub here. */
  post: ((item: InlineFinding, state: FindingSuggestionState) => Promise<void>) | null;
  /** Finding suggestions posted this session, by suggestion id. */
  posted: ReadonlySet<string>;
}

export const NO_SUGGESTIONS: SuggestionActions = {
  linesAt: () => null,
  forThread: () => null,
  apply: null,
  toggleBatch: () => false,
  batch: [],
  busy: false,
  forFinding: () => null,
  post: null,
  posted: new Set(),
};
