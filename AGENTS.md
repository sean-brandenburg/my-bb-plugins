# Agent notes

## Keyboard first

Build every plugin to be driven from the keyboard, with vim-style keys wherever they fit:

- Lists, boards, and trees move with `j`/`k` (and `h`/`l` across columns or levels), jump with `gg`/`G`, and scroll with Ctrl-D/Ctrl-U.
- `/` searches, `n`/`N` step through matches, `i` focuses the main text input, and `?` lists the plugin's keys.
- Escape leaves a text box and returns to the keys. Text boxes whose Escape or arrows must reach the plugin (a list's search box) opt out of vim-mode with `data-vim-ignore`.
- Ignore keys when focus is in a text box or a Cmd/Alt modifier is held, and don't take keys bb or the vim-mode plugin already use.
- Every mouse action needs a keyboard path.

Build key handling on `bb-vim-keys` (`plugins/vim-mode/lib`, see vim-mode's README): one keymap in vim notation, `useKeyScope` or `bindKeyScope` for the listener, and its row cursors, rather than another copy of the text-box checks and `gg` timers. kanban's board, grpc-client, and obsidian use it; vim-mode's scroll mode is the reference for scrolling a thread.

## Finishing work

When a plugin change is done, land it and install it locally without waiting to be asked:

1. Commit on the thread's branch, then apply it to `main` in the main checkout (`/Users/sean/dev/my-bb-plugins`) with `git -C /Users/sean/dev/my-bb-plugins cherry-pick <sha>...`. Other sessions commit to `main` concurrently, so cherry-pick rather than fast-forward or rebase.
2. In the main checkout's plugin directory, run `pnpm install --frozen-lockfile` if its dependencies changed, then the typecheck and tests, then `bb plugin build .`.
3. Load it with `bb plugin reload <name>`. A new plugin is first listed in `.bb/plugins.json`, then installed with `bb plugin install path:/Users/sean/dev/my-bb-plugins --plugin <name> --yes`.
4. Check that `bb plugin reload` reports it `running`. Don't push `main` unless asked.

Install from the main checkout, never a worktree path: a worktree install breaks once the worktree is cleaned up.

Commits are GPG-signed and the sandbox blocks `~/.gnupg`, so `git commit` and `cherry-pick` run outside it. So do the install, build, and reload in the main checkout, which the sandbox can't write to.
