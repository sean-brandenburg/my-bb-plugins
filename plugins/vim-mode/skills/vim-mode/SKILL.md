---
name: vim-mode
description: How the Vim Mode plugin adds vim keybindings to bb's prompt box and other text boxes, its settings, and its limits. Use when the user asks about vim keys in bb, why a key behaves a certain way in a text box, or how to turn vim mode off or narrow it to the prompt box.
---

# Vim Mode

Vim Mode runs the vim engine from `@replit/codemirror-vim-core` (the engine
behind CodeMirror's vim mode) against bb's text boxes: the prompt box (a TipTap
editor), CodeMirror 6 editors that other plugins render (such as the Obsidian
vault editor), and ordinary text fields and textareas.

## Behavior

- A text box enters insert mode when it gains focus, so typing works as usual.
  Escape switches to normal mode.
- In normal mode with nothing pending, Enter keeps its bb meaning and sends
  the prompt, and Escape goes to bb, which leaves the text box (or closes its
  dialog, or cancels a message edit).
- Leaving a text box on a thread page enters scroll mode, labelled `SCROLL`
  where the mode label sits. Its keys act on the thread's conversation:
  `j`/`k` scroll a few lines, Ctrl-D/Ctrl-U half a screen, `gg`/`G` to the
  top or bottom. `/` and `?` search forward or backward and `n`/`N` repeat;
  matches are highlighted, and Escape clears the highlights. `i` returns to
  the text box that was left (or the thread's prompt box if it is gone) in
  insert mode. Other keys go to bb. Focusing any text box ends scroll mode.
- Scroll mode search is case-insensitive unless the pattern has a capital
  (vim's smartcase), uses JavaScript regex syntax plus `\<` and `\>`, and
  searches only visible text. It scrolls through the whole conversation,
  including parts bb has not rendered yet, and wraps at the top or bottom.
- Ctrl+O and Ctrl+I go to bb (back and forward, from the slim-sidebar
  plugin) instead of vim's jump list, in normal or insert mode, unless a vim
  command is half typed.
- Cmd shortcuts always reach bb.
- While the prompt box's `@`/`/` menu is open, Escape, Enter, Tab, and the
  arrow keys go to the menu.
- A small muted label shows the mode and pending keys. In the prompt box it
  sits in the toolbar row, left of the voice and send buttons. In other text
  boxes it sits in the bottom-right corner.
- The `:` and `/` command line and vim's messages replace that label in the
  prompt box toolbar row. In other text boxes they appear just below the box.
- Normal and visual modes draw a block cursor.
- Registers are shared across all text boxes. `"+y` and `"+p` use the system
  clipboard.
- `u` and Ctrl-R undo and redo one vim command or insert session at a time.
  In the prompt box, undo uses the editor's history, so mention pills come back
  intact. Cmd+Z still uses each editor's own history.
- If a handler throws, the error is logged to the console as `[vim-mode]` and
  that text box's vim state is rebuilt, so vim keeps working.
- A mention pill counts as one character for motions. Yanking a pill copies its
  position but not the pill itself.

## Settings

Settings live under Settings → Plugins → Vim Mode, or
`bb plugin config vim-mode`:

| Setting | Effect |
| --- | --- |
| Enable vim keys | Turns vim editing on or off. |
| Text boxes | `All text boxes` or `Prompt box only`. |
| Start in insert mode | Off starts focused boxes in normal mode. |

Command palettes, comboboxes, terminals, Monaco editors, and CodeMirror's own
search panel are always excluded. CodeMirror editors count as "All text boxes",
not "Prompt box only". Add `data-vim-ignore` to an element to exclude it and its contents.

## Not supported

Code folding, syntax-aware motions (such as `%` skipping strings and `dit`),
comment toggling (`gc`), and language indentation (`=`). Visual block mode
works, but secondary cursors are not drawn.
