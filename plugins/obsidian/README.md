# bb-plugin-obsidian

Browse and edit an Obsidian vault inside bb. Adds a **Vault** page to the
sidebar with a file tree, an editor with Obsidian-style live preview, a reading
view, and Outline / Backlinks tabs in the right panel.

## Features

- File tree in the **Files** tab of bb's right panel (next to Outline and
  Backlinks). Folders, drag-and-drop moves, rename (F2 or the inline title),
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
- Full-text search (⌘⇧F); ⌘E toggles editing and reading view.
- Autosave. If the file changed on disk while you were editing, a banner
  offers to keep your version or load the disk version.
  Changes made outside bb (Obsidian, sync, agents) appear live.

## Daily notes

- **Capture**: ⌘⇧L anywhere in bb, the "Log to today" box in the Files tab and on the Vault home, "Save to today's daily note" on any chat message, or `bb obsidian log "…"` from agents. Entries are appended with a timestamp to the daily note's Inbox section. The note is created from the template if needed, and the append merges with edits you have open.
- **Activity**: every bb thread that finishes a turn is recorded per day (title, project, last reply): `bb obsidian activity`. Turn it off with *Record bb thread activity*.
- **Routines**: **Start day** / **Wrap up** (Vault home, today's note, command palette, `bb obsidian start|wrap`) start a Claude thread running `/daily-note start|wrap` in a bb project rooted at the vault. That project is created on first use.
- **Vault home**: today's inbox, carried-forward items, today's bb threads, active `Tickets/` notes, and recently edited notes.
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
