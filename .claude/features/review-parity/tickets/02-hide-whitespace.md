# 02 — Hide whitespace changes (default on)

**What to build:** a "hide whitespace" preference, default on, persisted as `diff-view:hideWhitespace`, toggled by
`W` and by a chip in the summary bar ("Whitespace hidden" / "Whitespace shown"). With it on, text (Pierre) diffs
show the patch transformed client-side with `git diff -w` semantics: within each change block (a run of `-` lines
and the `+` lines that follow), lines equal after removing all whitespace are matched by LCS and become context
lines (showing the new text); hunk headers are recomputed, hunks left with no changes are dropped. Line numbers on
both sides must stay exact, so comments, findings, cursor and narrative excerpts still land. A file whose only
changes are whitespace shows "Only whitespace changed" and starts collapsed. With it off, a file whose structural
diff reports no changes while its patch has changes is shown as the text diff so whitespace changes are visible.
Summary-bar totals stay the raw counts.

Spec: decision 2. Lib only.

**Blocked by:** None — can start immediately

**Status:** done

- [x] `ignoreWhitespacePatch(patch)` (pure, tested in a new test file: indentation-only, trailing spaces, mixed blocks, all-whitespace file, line numbers preserved)
- [x] Default on, persisted, `W` and summary chip toggle it; files view, narrative excerpts and cursor rows all use the transformed patch
- [x] Whitespace-only files collapse with a note while hidden; structural-unchanged files fall back to text while shown
- [x] KEY_HELP and README updated
