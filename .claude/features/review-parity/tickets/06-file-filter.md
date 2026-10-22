# 06 — File filter

**What to build:** `gf` (files view) opens a "Filter files" menu (bb-vim-keys `createMenuKeys`; j/k, Space/Enter
toggle, Escape closes) like GitHub's file filter: one checkbox per file extension present (with counts; files without
one under "No extension"), change type (added / modified / renamed / deleted), "Hide viewed files", "Only files with
comments", "Only files with findings", and "Clear filters". The same menu opens from a funnel button at the top of the
file tree. Filtered-out files leave the file tree, the scroll, `]f`/`[f` and other cursor motions, and search; a
summary-bar chip "Showing 12 of 40 files" clears the filter on click. State lives per view instance (by
`instanceKey`) for the session. The narrative view keeps its own `gf`.

Spec: decision 6. Lib only.

**Blocked by:** None — can start immediately

**Status:** done

- [x] Pure filter predicate over files + viewed/comment/finding sets, tested in a new test file
- [x] Menu by `gf` and by a tree button; all options; Clear
- [x] Tree, scroll and navigation honour the filter; summary chip
- [x] KEY_HELP and README updated
