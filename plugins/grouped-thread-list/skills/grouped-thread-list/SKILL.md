---
name: grouped-thread-list
description: "Inspect or change the Project switcher plugin: its double-Shift project and thread picker, its keyboard shortcuts, and the active project preference."
---

# Project switcher

The Project switcher plugin (id `grouped-thread-list`) owns bb's sidebar
thread-list slot and leaves it empty. Projects and threads live in a picker
opened by tapping Shift twice (through the Double Shift plugin, which falls
back to bb's quick palette when this plugin is off) or by the "Switch project"
command, which has no default shortcut and can be bound in bb's keyboard
settings.

The picker's left column lists Open folder…, Unassociated (bb's
built-in personal project), Pinned, and Unread (finished threads you haven't opened
since their latest response, plus Claude sessions with a prompt running, across all projects; automation runs are left out), then a divider and standard projects by most
recent activity. The picker opens with Unread selected.
The right column lists the selected entry's threads, children nested under
their parents. While that column is focused, a preview pane opens beside it with the
highlighted thread's latest messages (read-only, and it doesn't mark the
thread read). `l` from the threads column moves into the preview, where
`j`/`k` and Ctrl+E/Ctrl+Y scroll a little, Ctrl+D/Ctrl+U half a page,
Ctrl+F/Ctrl+B a page, `gg`/`G` jump to the top or bottom, and `h` goes back
(Enter, `p`, and `d` still act on the highlighted thread). Keys: `j`/`k` (or arrows, Ctrl+N/Ctrl+P) move, `h`/`l` (or
arrows, Tab) switch columns, `gg`/`G` jump, `/` filters the project list by
name, hiding Open folder…, Unassociated, Pinned, and Unread while a filter is set (Esc in
normal mode clears it), `Enter` opens a thread or moves into a
project's threads, `p` pins or unpins the highlighted thread (the mouse
highlights the row under it), `r` marks it read, `d` (hinted as "delete") archives
it rather than deleting it, so it stays restorable, `n` starts a thread in the selected project, `Esc` or `q`
closes. Typing a path after `/` (absolute or `~/`) offers
to add that folder as a project; a folder that is already a project selects it.

The one preference is `activeProject`: a project id, or `null` to follow the
most recently active project, which is then stored. Opening a thread sets it to
that thread's project (by root ancestor); Unassociated threads leave it alone. The
picker starts on the routed thread's project, or on `activeProject` when no
thread is in view.

```sh
bb grouped-thread-list prefs list [--json]
bb grouped-thread-list prefs get activeProject [--json]
bb grouped-thread-list prefs set activeProject proj_abc123 [--json]
bb grouped-thread-list prefs reset activeProject [--json]
```

`set` takes JSON; a bare word is read as a string. An invalid value fails with
`invalid_preference_value` and leaves the stored value alone. Every open window
applies a change immediately.
