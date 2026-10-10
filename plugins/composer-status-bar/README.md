# Composer status bar

Tightens the bar under a thread's composer and adds what bb leaves out of it.

## What you get

One row, ordered by what it describes:

- **Where the work happens**, on the left: the project and environment as plain labels (`my-bb-plugins / Worktree`), then the branch as quiet text that shows its outline on hover (click to copy its name). bb's new-thread button is hidden; new threads start from the sidebar or the project picker.
- **Usage**, on the right: a warning icon with the time to reset when Claude reports a limit as near or reached, then the context chip (`324k` with bb's ring; hover for the window size, click for the breakdown).
- **The agent**, at the far right: an `Opus 5.5 · High` chip (the composer's current model and effort, visible even while bb's own picker is hidden in the collapsed prompt box) that opens bb's model and reasoning picker, the same one as ⇧⌘M, then the permission-mode chip, right under the send button.

With a Nerd Font installed (see the nerd-font plugin), the limit warning's icon is an hourglass.

bb's picker lays its reasoning levels out in one row sized for bb's own font; the plugin puts them in a grid so a wider font (Fira Code) fits the menu, wherever the picker opens from.

Every control is an outlined chip; everything else is plain text. Nothing truncates except a long branch name. As the footer narrows, detail drops in this order: the environment, the project's name (its icon stays), the effort, then the model.

With the thread-header-project plugin installed too, the project moves into the thread header and the footer's project and environment labels are hidden.

Split panes each show their own thread's numbers. Disabling the plugin restores bb's normal footer.
