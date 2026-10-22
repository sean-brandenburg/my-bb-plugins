# 01 — Search the diff's text

**What to build:** `/` opens a search box over the diff and searches every file's text (old and new side of each
patch line, so collapsed, viewed and not-yet-mounted files count). Enter commits; `n`/`N` move the review cursor to
the next/previous match across files, wrapping like vim, expanding a collapsed file or opening a structural fold to
reach it. Matches on screen are highlighted; the box (and the summary bar while a search is active) shows "k of N".
Escape in the diff, with nothing else to close, clears the highlights. Smartcase and regex through bb-vim-keys'
`compileSearch` / `createSearchBoxKeys` / `createSearchHighlights` (extend the vim-keys lib if it lacks something,
keeping it generic). The old file-name overlay moves to `f` (same fuzzy ranking); `n`/`N` now step text matches.
Text (Pierre) diffs render in a shadow root: make the highlight visible there too.

Search the patch as displayed: with whitespace hidden (ticket 02, merged), the transformed patch. Files hidden by
the file filter (ticket 06, built alongside) are skipped once both are in. Spec: decision 1. Narrative view: leave its own `/` (step search) alone.

**Blocked by:** None — can start immediately

**Status:** done

- [x] `/` searches diff text across all files; `n`/`N` move the cursor between matches, wrapping, reaching collapsed files and folded lines
- [x] On-screen matches are highlighted in structural and text diffs; count shown; Escape clears
- [x] `f` opens the file finder (old `/` behaviour)
- [x] Pure match-finding over `DiffFile[]` tested in a new test file
- [x] KEY_HELP and README updated; keymap tests pass
