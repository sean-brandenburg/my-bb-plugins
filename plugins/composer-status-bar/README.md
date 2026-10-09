# Composer status bar

Tightens the bar under a thread's composer and adds what bb leaves out of it.

## What you get

One row, ordered by what it describes:

- **Where the work happens**, on the left: the project and environment as plain labels (`my-bb-plugins / Worktree`), then the branch as quiet text that shows its outline on hover (click to copy its name). bb's new-thread button is hidden; new threads start from the sidebar or the project picker.
- **Usage**, on the right: a warning icon with the time to reset when Claude reports a limit as near or reached, then the context chip (`324k` with bb's ring; hover for the window size, click for the breakdown).
- **The agent**, after a divider at the far right: `Opus 5.5 · High` (the composer's current model and effort, visible even while bb's picker is hidden), then the permission-mode chip, right under the send button.

With a Nerd Font installed (see the nerd-font plugin), the agent shrinks to glyphs: the model family's icon and its version (a crown and `5.5` for Opus 5.5; a feather for Sonnet, a leaf for Haiku, a book for Fable; other providers' models keep their name), then a gauge that fills with the effort level and burns at the top one. The limit warning becomes an hourglass. Hover the agent for the full model and effort.

Every control is an outlined chip; everything else is plain text. Nothing truncates except a long branch name. As the footer narrows, detail drops in this order: the environment, the project's name (its icon stays), the effort, then the model.

With the thread-header-project plugin installed too, the project moves into the thread header and the footer's project and environment labels are hidden.

Split panes each show their own thread's numbers. Disabling the plugin restores bb's normal footer.
