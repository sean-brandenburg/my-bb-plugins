# 09 — Suggested changes in comments

**What to build:**
- Rendering: a ```` ```suggestion ```` block in any comment body (local or GitHub, threads and drafts) renders as a
  small diff: the commented lines' current text (from the diff, by the comment's range on the new side) as removed,
  the suggestion as added. A pure parser finds the blocks.
- Authoring: `I` on a new-side line or `V` selection opens the comment form prefilled with
  "```suggestion\n<those lines' text>\n```", caret inside the block. The form also gets a "Suggest" button that
  inserts the block for its range, with a keyboard path inside the textarea (pick a chord bb and vim-mode don't use,
  e.g. ⌘⇧S; check `plugins/vim-mode` and bb's keyboard settings). Local suggestions sent to the agent arrive as the
  body, which already carries the block; add one line to the send message telling the agent a suggestion block is the
  exact replacement for the lines.
- Applying: `DiffSource.suggestions?: { apply(items: SuggestionItem[], message: string | null): Promise<{ applied:
  number; commitUrl: string | null }> }`, `SuggestionItem { id, path, startLine, endLine, expected: string[],
  replacement: string[] }`. Servers refuse (with the path and lines in the error) any item whose `expected` lines no
  longer match. diff-view plugin and kanban env cards: write the local checkout's file (no commit). Kanban PR cards:
  one commit on the PR head branch (`head.repo.full_name`, `head.ref`) via the git data API (blobs → tree → commit →
  PATCH ref), default message "Apply suggestions from code review", then resolve each applied GitHub thread.
- Keys: on a thread with an applicable suggestion (not outdated or resolved), `A` applies it now; `B` adds/removes it
  from the batch (outlined + "in batch" badge); a summary-bar button "Commit N suggestions", or `gB`, applies the
  batch. Applied suggestions show "applied"; the diff refreshes.

Spec: decision 9.

**Blocked by:** 05 — Comments view; declutter inline threads

**Status:** done

- [x] Suggestion blocks render as diffs everywhere comments render
- [x] `I` + form button/chord author suggestions
- [x] `suggestions.apply` in both hosts (local write; PR git-data commit + resolve), expected-line check
- [x] `A`, `B`, `gB`, summary button
- [x] Parser and expected-line check tested in new test files
- [x] KEY_HELP and READMEs updated
