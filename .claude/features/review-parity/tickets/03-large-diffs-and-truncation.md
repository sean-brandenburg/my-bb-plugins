# 03 — Load large diffs; surface truncation

**What to build:**
- A text file with no patch (GitHub omits patches for big files; the bb SDK drops them past its size limit) and no
  structural diff shows a "Load diff (N lines changed)" placeholder instead of the dead "No text diff" note. Click or
  Enter (cursor on the placeholder or the file header) calls `DiffSource.loadPatch(path): Promise<string | null>`
  and renders the result as a text diff. Binary files say "Binary file" and offer nothing. Add `binary?: boolean` to
  `DiffFile` where a host knows (git's "Binary files" line; GitHub: no patch and 0/0 counts).
- `bb-diff-view/server` gets `patchFromSides(path, previousPath, old, new)` (temp files + `git diff --no-index`,
  rewriting the header paths) used by both hosts' `loadPatch` (diff-view plugin RPC `diff_load_patch`; kanban
  `diff_load_patch` via `fileSides`).
- Kanban PR file lists page to GitHub's maximum (30 pages of 100 = 3,000 files); compare with the pull's
  `changed_files` to know when more exist.
- `DiffResult.truncated` (and a new `truncatedNote?: string | null` naming what is missing) shows as a banner above the
  diff, not only the tree's small note. For an environment whose SDK diff is truncated and which has a local
  checkout, read the diff with local `git diff <merge-base>` instead (no cap) before falling back to the banner.

Spec: decision 3.

**Blocked by:** None — can start immediately

**Status:** done

- [x] Placeholder + Load diff (mouse and keyboard) for patchless text files; binary files labelled
- [x] `patchFromSides` in lib/server.ts with a test; both hosts expose `loadPatch`
- [x] PR lists page to 3,000 files; truncation banner with a specific message in both hosts
- [x] Local-git fallback for truncated environment diffs
- [x] READMEs updated
