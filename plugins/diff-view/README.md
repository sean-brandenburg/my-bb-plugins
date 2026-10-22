# Diff view

A thread's changes beside its chat, and the same view as a library other
plugins embed.

## In bb

- **Changes button** at the right end of every thread's top bar, muted and
  disabled while the thread has no changes. It opens the thread's diff in the
  side panel. "Changes" is also in the side panel's new-tab launcher. The
  plugin adds no page to the left sidebar. On a thread with no changes,
  Cmd-Shift-D shows a toast instead of opening an empty panel. Other plugins
  share the button's change counts through `bb-diff-view/app/use-change-totals`.
- The view: every changed file in one scroll with sticky headers, a resizable
  file tree once the container is at least 48rem wide (hidden in a narrow side
  panel), structural (difftastic) diffs, with a text (Pierre) diff for any file
  difftastic cannot diff (`gl` switches those between split, the default, and
  unified), long lines scrolled sideways in a wide view (48rem and up) and
  wrapped at spaces with a hanging indent in a narrow one, viewed marks, and
  ⌘-hover and ⌘-click symbol peeks in the thread's checkout. A structural
  hunk header (`@@`) is left out when the hunk is the whole file.
- **File marks**: with a Nerd Font (see the nerd-font plugin), each file in the
  tree and on its header leads with one muted icon: a diff glyph when it was
  added, deleted, renamed or copied, its file type otherwise. Without one, the
  tree shows git's status letter (A, D, R, C) and the header a status badge.
- **Comments**: "+" on a line, or the comment icon that appears on a file
  header under the pointer or the cursor, with replies. Drag the "+"
  or the line numbers (or shift-click a second line number) to comment on a
  range of lines, as on GitHub. "Send N to the thread" sends every unsent
  comment to the thread's agent as one message. Hosts whose comments can go to
  GitHub (kanban's PR cards) get a "→ Local / → GitHub PR" button above the
  diff (`T`) that applies to every new comment and reply.
- **Review findings** (hosts with reviews, such as kanban) show as one line
  each under their line: severity, title and the apply-round checkbox. A
  finding opens to its description, fix and scores on click, Enter, or while
  the keyboard cursor is on it. A finding with several locations (instances
  of one bug class) shows at each of them, and its scores line names the
  class and the instance count. The findings chip above the diff, or `F`,
  cycles which show: all, important and up (the default), critical only, or
  none; the chip counts the ones hidden. Findings a host marks pre-existing
  (already in the code before the change) stay out of the diff, and those its
  verifier filtered out are folded under "N filtered"; both are listed above
  the diff, each folded under its count, the pre-existing ones with "Make a
  card" when the host can make cards. A finding's scores (importance, scope
  fit, verifier confidence, bug class) are in its id's tooltip once it is
  open.
- **Viewed marks** remember the file's patch; a mark lapses once the file
  changes again.
- **Keyboard**: the whole review runs on vim-style keys, sent to the view that
  last had the pointer or focus, never while typing in a text box. "Changes:
  review with the keyboard" (⌘⇧D by default, rebindable in bb's keyboard
  settings) opens the side panel and gives it the keyboard. A cursor moves
  over lines, file headers and folds of hidden lines (Enter opens a fold: a
  short one whole, a long one 20 lines at a time with the cursor left on it);
  it is drawn from the first key and hidden again by a wheel or a click, so a
  reader on the mouse never sees it. It stays in the middle of the screen (a newly opened diff starts it on the
  first line): the diff scrolls under it as it moves (`zt`/`zb` aside, and short of either end of
  the diff), and scrolling by hand carries it along to the middle line. Keys: `j`/`k` lines (with counts, `5j`; a line with several comments or findings
  is stepped through one at a time), `h`/`l` old
  or new side (`h` past the old side, or on a file header, moves into the file
  list), `]c`/`[c` changes, `}`/`{` hunks, `]f`/`[f` files, `c`/`C`
  comment threads and review findings (one at a time when several share a
  line), `]d`/`[d` findings only, `gg`/`G`, Ctrl-D/U/F/B, and `zz`/`zt`/`zb`.
  `/` searches file names and `n`/`N` step through the files it matched.
  `i` comments on the cursor's line, or on the file from its header; `V`
  selects lines for a range comment; `O` comments on the file. The comment or
  finding under the cursor is outlined and lists the keys it takes: Enter (or
  `za`) opens or closes it, `a` replies to a thread, `r` resolves or reopens
  a GitHub thread, `e` edits your unsent comment or a finding's wording, `dd` deletes your unsent comment, `x`
  includes or excludes a finding in the apply round, `M` moves a comment
  between local and the GitHub PR, and `gx`/`go` open a thread on GitHub or
  the agent thread that replied. `T` switches where new comments go; `s`
  focuses the send bar (on kanban's PR cards, the Submit review button: Enter
  or `i` opens GitHub's review box, where `j`/`k` pick Comment, Approve or
  Request changes, `i` goes to the comment, ⌘↩ submits and Escape closes it;
  Escape on the button returns to the diff). In a comment box or an edit ⌘↩ saves; Escape returns
  to the diff, keeping a new comment's or reply's draft (an empty one closes)
  and cancelling an edit of a comment or finding (with the vim-mode plugin,
  Escape twice). `v` marks a file viewed and moves on,
  `zo`/`zc`/`zR`/`zM` fold files (`za` too on a line with nothing under it),
  `zr` shows more unchanged lines, `F` cycles which review findings show,
  `gF` folds or unfolds the filtered findings, `gp` moves the keyboard into
  the pre-existing and filtered list above the diff (`j`/`k` move, Enter
  opens one or makes a card, Escape returns),
  `K` asks for an explanation of the hunk, `S` switches to the narrative
  review where the host has one (see below),
  `gd` peeks at a symbol on the line (Escape closes it), `gl` switches line-diff files between
  split and unified, `R` refreshes, and
  `?` lists every key.
  `t` shows or hides the file list. In it, `j`/`k` move (a count repeats),
  `h`/`l` close and open folders (`h` on a file goes to its folder), `gg`/`G`
  and Ctrl-D/U jump, Enter, `o` or `l` jumps to the file with the cursor on its
  header, and Escape returns to the diff. `?`, `/` and `t` keep working there;
  the help, search, refresh, layout and file-list keys work before a diff has
  loaded.

- **Narrative review** (hosts whose source serves a story, such as kanban): a
  **Files | Narrative** switch at the left of the summary bar, or `S`, swaps
  the file list for the agent's walk through the change. Each page is one
  step: its explanation over just the lines it covers, as excerpts of the
  diff drawn by the same renderer as the files view, so the cursor, comments
  (`i`, `V`, `O`, `a`, `e`, `dd`, `M`), review findings (`x`, `]d`, `c`),
  viewed marks (`v`), the layout key and the send bar work on them exactly
  as there; `j` and `k` read the step's prose on when there is no code line
  to move onto, and past the step's end turn to the next step (or back to
  the end of the one before). The summary bar shows the step reached. Each
  chapter opens on a summary page with the agent's reading order (click a
  file to open it in the files view), its watch-outs and its steps; the
  outline beside the steps (wide views, `t`) ticks the steps read, and ←
  past the old side moves into it (`j`/`k`, Enter, Escape). Keys of its own:
  `h`/`l` previous / next page (a count repeats; the arrow keys keep the
  old / new side, and ← past the old side goes to the outline), `]]`/`[[`
  chapters, `]f`/`[f`
  excerpts, `gf` opens the files view at the cursor's line (an excerpt's
  header too), `ga` follows a revision step to the step it led to, `gv`
  marks viewed the files every one of whose steps has been read, `/` and
  `n`/`N` search steps, `gl` switches the excerpts between split (the
  default) and unified, `U` writes a narrative (or an update once the code
  moved, which the switch flags with a dot), `S` returns to the files with
  the cursor where it was. Steps of an earlier narrative or a revision show
  their lines without comments, since those are not today's lines; comment
  from the current narrative's steps or the files view. Excerpts are line
  diffs, so `gd` and `zr` do nothing there.

Settings: hide vendored files (default on) and the `difft` path. Comments and
viewed marks live in this plugin's database and are deleted with their thread.

## As a library

`lib/` is a separate package, `bb-diff-view`, that another plugin adds as a
dependency:

```json
"dependencies": { "bb-diff-view": "file:../diff-view/lib" },
"pnpm": { "overrides": { "bb-diff-view": "link:../diff-view/lib" } }
```

- `bb-diff-view/app/diff-view`: `DiffView`, plus `DiffDisplayControls` and
  `DiffRefreshButton` for a toolbar outside the view; `toolbar` may be a
  function of the comments waiting to be sent, for a host that puts its send
  controls in its own heading row (kanban does). The host passes a
  `DiffSource` with the core methods (diff, structural diff, symbols, file
  slices, viewed marks, comments) and any optional groups (GitHub comments and
  drafts, review findings, the delta since the last look, a tour, hunk
  explanations); each optional group turns on its part of the UI. A tour
  group with `story()` adds the narrative review and its switch (`S`).
- `bb-diff-view/narrative`: changed-line coverage of a narrative's steps and
  the excerpt patch for a step's lines, shared by servers that check an
  agent's narrative and the view that renders it.
- `bb-diff-view/app/icons`: call `registerDiffViewIcons(app)` in
  `definePluginApp`.
- `bb-diff-view/server`: unified-diff parsing, an environment's diff and file
  sides, difftastic, and `git grep` symbol search.
- `bb-diff-view/types`: the data shapes.
