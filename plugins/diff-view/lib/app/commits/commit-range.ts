// Picking part of a diff's history: the picker's rows, the range each row stands for, and how a range is named.
import { WORKTREE_SHA, type CommitRange, type DiffCommits } from "../../types";
import type { Keymap } from "../ui/vim-keys-core";

export type CommitRow = { kind: "all" } | { kind: "mark"; sha: string; label: string } | { kind: "commit"; index: number };

/** The picker's own keys, on top of its list motions: start a range on the highlighted commit. */
export const COMMIT_PICKER_KEYMAP: Keymap<"mark"> = { "<Space>": "mark", x: "mark" };

export function headOf(commits: DiffCommits): string | null {
  return commits.commits.at(-1)?.sha ?? null;
}

export function rangeKey(range: CommitRange | null): string {
  return range === null ? "all" : `${range.from}..${range.to}`;
}

export function shortCommit(sha: string): string {
  return sha === WORKTREE_SHA ? "Uncommitted" : sha.slice(0, 7);
}

/** All changes, then each mark, then each commit oldest first. */
export function pickerRows(commits: DiffCommits): CommitRow[] {
  return [{ kind: "all" }, ...commits.marks.map((mark): CommitRow => ({ kind: "mark", ...mark })), ...commits.commits.map((_, index): CommitRow => ({ kind: "commit", index }))];
}

/** A range covering every commit is all the changes. */
export function normalizeRange(range: CommitRange, commits: DiffCommits): CommitRange | null {
  return range.from === commits.base && range.to === headOf(commits) ? null : range;
}

/** Commits `a` through `b` (either order) as a range; undefined when the first commit's parent is unknown. */
export function commitsRange(commits: DiffCommits, a: number, b: number): CommitRange | null | undefined {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const to = commits.commits[high]?.sha;
  const from = low === 0 ? commits.base : (commits.commits[low - 1]?.sha ?? null);
  if (to === undefined || from === null) return undefined;
  return normalizeRange({ from, to }, commits);
}

/** From a mark to the head; undefined when there are no commits. */
export function markRange(commits: DiffCommits, sha: string): CommitRange | null | undefined {
  const head = headOf(commits);
  return head === null ? undefined : normalizeRange({ from: sha, to: head }, commits);
}

/** Whether the range reads up to the head, where the new side's lines are the ones comments and findings sit on. */
export function rangeEndsAtHead(range: CommitRange | null, commits: DiffCommits | null): boolean {
  return range === null || (commits !== null && range.to === headOf(commits));
}

/** Indexes of the commits a range covers, `[first, last]`; null when it does not line up with the list. */
export function rangeSpan(range: CommitRange, commits: DiffCommits): [number, number] | null {
  const last = commits.commits.findIndex((commit) => commit.sha === range.to);
  const before = range.from === commits.base ? -1 : commits.commits.findIndex((commit) => commit.sha === range.from);
  if (last === -1 || (before === -1 && range.from !== commits.base) || before >= last) return null;
  return [before + 1, last];
}

/** What the summary bar calls the selection: All changes, a mark's name, one commit's short sha, or "3 commits". */
export function rangeLabel(range: CommitRange | null, commits: DiffCommits | null): string {
  if (range === null) return "All changes";
  if (commits !== null) {
    const mark = commits.marks.find((entry) => entry.sha === range.from && range.to === headOf(commits));
    if (mark !== undefined) return mark.label;
    const span = rangeSpan(range, commits);
    if (span !== null) return span[0] === span[1] ? shortCommit(range.to) : `${span[1] - span[0] + 1} commits`;
  }
  return `${shortCommit(range.from)}..${shortCommit(range.to)}`;
}
