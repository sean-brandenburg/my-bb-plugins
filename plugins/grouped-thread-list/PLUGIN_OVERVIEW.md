A keyboard-first project and thread picker, replacing the projects and threads in bb's sidebar.

## What you get

- **No thread list in the sidebar.** bb's sidebar keeps its navigation and footer; projects and threads move into the picker.
- **Double Shift opens the picker.** Tap Shift twice (with the Double Shift plugin installed), or bind the Switch project command under Settings → Keyboard; it has no default shortcut. It opens on Unread. On the left, a mini sidebar: Open folder…, Unassociated, Pinned, and Unread (finished threads with a response you haven't opened yet, plus Claude sessions with a prompt running, across every project; automation runs are left out), then a divider and your projects, most recently active first, each with a working or attention glyph. On the right, the selected entry's threads, nested under their parents, with status and age. While you're in the threads column, a preview pane opens beside it with the end of the highlighted thread's conversation; previewing doesn't mark it read. Press `l` again to move into the preview and scroll it with `j`/`k`, Ctrl+D/Ctrl+U, Ctrl+F/Ctrl+B, Ctrl+E/Ctrl+Y, and `gg`/`G`; `h` goes back to the threads.
- **Keyboard first, vim style.** `j`/`k` move, `h`/`l` switch columns, `gg`/`G` jump to the top or bottom, `/` filters the project list by name (Esc clears it), `Enter` opens a thread (or moves into a project's threads), `p` pins or unpins the highlighted thread, `r` marks it read (dropping it from Unread), `d` (shown as delete) archives it, so it can still be restored from Settings → Archived threads, `n` starts a thread in the selected project, `Esc` closes. Arrow keys, Tab, and Ctrl+N/Ctrl+P work too. A mouse works as well; the thread under the pointer is the highlighted one.
- **Open a folder as a project.** Choose Open folder… for the system folder dialog, or press `/` and type a path such as `~/dev/app`. A folder that is already a project selects it.

## How it works

The picker opens with the active project selected, so the entries above the divider are a `k` away; if the thread you're viewing belongs to it, that thread is highlighted on the right. Opening a thread makes its project the active one (Unassociated threads don't), which is what the picker starts on. It's a synced preference, so every window agrees.

Pick it under Settings → Appearance → Sidebar, or disable the bundled Thread list plugin; owning that slot is what keeps bb's own list out of the sidebar. `bb grouped-thread-list prefs` reads and changes the active project.
