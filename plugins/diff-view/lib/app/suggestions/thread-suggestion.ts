import type { SuggestionItem } from "../../types";
import { alreadyApplied, suggestionBlocks, suggestionLines } from "../../suggestions";
import type { DiffThread } from "../comments/threads";

/** New-side lines of a file as the diff shows them; null when it leaves any of them out. */
export type LinesAt = (path: string, startLine: number, endLine: number) => string[] | null;

/** The suggestion `A` and `B` act on in a thread: its latest comment holding one. */
export interface ThreadSuggestion {
  commentId: string;
  replacement: string[];
  /** What applying it sends; null when it cannot be applied, `reason` saying why. */
  item: SuggestionItem | null;
  reason: string | null;
  /** The lines already read as it would leave them. */
  applied: boolean;
  /** The thread's lines as they read today, which every block in it replaces; null when not known here. */
  current: string[] | null;
  /** The first of those lines, for numbering the drawn diff. */
  startLine: number | null;
}

/** The lines a thread's suggestions replace, as they read today; null when they are not today's new-side lines. */
export function threadCurrentLines(thread: DiffThread, linesAt: LinesAt): string[] | null {
  const range = thread.outdated ? null : suggestionLines(thread);
  return range === null ? null : linesAt(thread.path, range.startLine, range.endLine);
}

export function threadSuggestion(thread: DiffThread, linesAt: LinesAt, appliedIds: ReadonlySet<string> = new Set()): ThreadSuggestion | null {
  let latest: { commentId: string; replacement: string[] } | null = null;
  for (const entry of thread.entries) {
    const first = suggestionBlocks(entry.comment.body)[0];
    if (first !== undefined) latest = { commentId: entry.comment.id, replacement: first };
  }
  if (latest === null) return null;
  const range = suggestionLines(thread);
  const expected = threadCurrentLines(thread, linesAt);
  const found = { ...latest, current: expected, startLine: range?.startLine ?? null };
  // A deletion leaves nothing to recognise it by; only this session's record says it was applied.
  const landed =
    appliedIds.has(found.commentId) ||
    (range !== null && found.replacement.length > 0 && !thread.outdated && alreadyApplied(linesAt(thread.path, range.startLine, range.startLine + found.replacement.length - 1), found.replacement));
  const refuse = (reason: string): ThreadSuggestion => ({ ...found, item: null, reason, applied: landed });
  if (landed) return refuse("Already applied");
  if (thread.outdated) return refuse("The thread is outdated: its lines changed since");
  if (thread.resolved === true) return refuse("The thread is resolved");
  if (range === null) return refuse("Suggestions replace lines on the new side");
  if (expected === null) return refuse("The diff doesn't show all of the suggestion's lines");
  return { ...found, item: { id: found.commentId, path: thread.path, startLine: range.startLine, endLine: range.endLine, expected, replacement: found.replacement }, reason: null, applied: false };
}
