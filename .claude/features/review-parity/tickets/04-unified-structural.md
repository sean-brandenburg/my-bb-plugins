# 04 — Unified layout for structural diffs

**What to build:** `gl` (and the existing layout control in `DiffDisplayControls`) switches structural (difftastic)
files between split and unified too, not only text diffs; the `layout` preference is persisted
(`diff-view:layout`). Unified structural: one code column with old and new line-number gutters; in each change block
the deleted (old-only) rows come before the added (new-only) rows; rows present on both sides show once (the new
text, with both numbers) — modified pairs show as a deleted row then an added row, as GitHub does; difftastic's token
highlights stay. The review cursor (j/k over unified order; h/l pick the side on rows that have both), comments
(+, drag ranges, `i`, `V`), findings, folds (`zr`, Enter on folds), symbol peeks and the narrative's structural
excerpts (if any) work in unified. Build the row order as a pure function next to `structural/rows.ts`.

Spec: decision 4. Lib only.

**Blocked by:** None — can start immediately

**Status:** done

- [x] Pure unified row builder tested in a new test file (pure insert, pure delete, modified pairs, moved blocks, folds)
- [x] Structural files render unified when layout is unified; `gl` toggles all files; preference persisted
- [x] Cursor, comments, findings and folds work in unified structural
- [x] KEY_HELP (`gl` wording) and README updated
