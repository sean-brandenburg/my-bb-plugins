# bb-plugin-obsidian

Browse and edit an Obsidian vault inside bb. Adds a **Vault** page to the
sidebar with a file tree down its left side, an editor with Obsidian-style live
preview, a reading view, and Outline / Backlinks tabs in the right panel.

## Features

- File tree in a sidebar on the Vault page's left (`b` or its button hides
  it). Folders, drag-and-drop moves, rename (F2 or the inline title),
  new note/folder, delete to the vault's `.trash/`.
- Editor (CodeMirror 6): markup hides off the active line, `[[` autocompletes
  note names, clicking a rendered link (or ⌘-click) follows it, checkboxes
  toggle in place, frontmatter shows as a block.
- Reading view: wikilinks, `![[embeds]]` (notes, headings, blocks, images),
  callouts (including foldable), properties, highlights, tags, tables,
  toggleable tasks.
- Links follow Obsidian's resolution rules (shortest unique path, same folder
  first). An unresolved link creates the note when you click it.
- Renaming or moving a note rewrites the links that point to it. Turn this off
  under *Update links when renaming or moving notes*.
- Full-text search (⌘⇧F or `/`); ⌘E or `m` toggles editing and reading view.
- Autosave. If the file changed on disk while you were editing, a banner
  offers to keep your version or load the disk version.
  Changes made outside bb (Obsidian, sync, agents) appear live.

## Keyboard

Vim-style keys work on the Vault page, its file sidebar, and its Outline and Backlinks tabs
whenever focus is outside a text box; `?` lists them all. The keymap and help
text live in `ui/vault-nav.ts`, the routing between surfaces in
`ui/vault-keys.ts`.

- Note: `j`/`k`, Ctrl-D/U/F/B, `gg`/`G` scroll; `i` edits (from reading view
  too), `m` switches views, `r` renames, `a` makes a new note, `y`/`Y` copy the
  path or a wikilink, `O` opens in Obsidian, `dd` deletes. Escape leaves the
  editor (twice with vim-mode, which handles editing keys inside it). ⌘↵ in the
  editor follows the link under the cursor.
- File sidebar: `h` from a note or the home moves into it, `b` shows or hides
  it. `j`/`k`, `h`/`l`, `gg`/`G` walk the tree; `l` shows a file, `o`/Enter
  opens it and moves to it; `a`/`A` new note/folder, `r` rename, `x` then `p`
  moves, `dd` deletes, `zM` collapses all, `i` logs to today.
- Anywhere: `/` searches the vault (Enter opens the first match), `n`/`N` open
  the next/previous match, `-` jumps to the open note in the file sidebar, `gO`/`gb` to
  Outline/Backlinks, `gh`/`gt` go home/to today. Escape in the sidebar or a tab
  returns to the note.

## Daily notes

- **Capture**: ⌘⇧L anywhere in bb, the "Log to today" box in the file sidebar and on the Vault home, "Save to today's daily note" on any chat message, or `bb obsidian log "…"` from agents. Entries are appended with a timestamp to the daily note's Inbox section. The note is created from the template if needed, and the append merges with edits you have open.
- **Activity**: every bb thread that finishes a turn is recorded per day (title, project, last reply): `bb obsidian activity`. Turn it off with *Record bb thread activity*.
- **Routines**: **Start day** / **Wrap up** (Vault home, today's note, command palette, `bb obsidian start|wrap`) start a Claude thread running `/daily-note start|wrap` in a bb project rooted at the vault. That project is created on first use.
- **Vault home**: today's inbox, carried-forward items, active `Tickets/` notes, and recently edited notes.
- **`@` mentions**: attach any vault note, or "Today's daily note", as context in any thread.
- The bundled `obsidian-vault` skill teaches agents the CLI and the vault conventions.

## Develop

```
npm install
npm test            # parsing, resolution, rewrite, search, and daily-note tests
npm run typecheck
bb plugin dev       # rebuild + reload on save
```

The vault path is the `vaultPath` setting (`bb plugin config obsidian set
vaultPath /path/to/vault`), or set it on the Vault page's first screen.
