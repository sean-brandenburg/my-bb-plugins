# Dashboard

A dashboard under the new-thread composer, so starting a thread begins with what's already going on. It follows the composer's project: pick a project and every group narrows to it; with "No project" it covers everything.

- **Needs you**: threads blocked on a question, approval, or plan, then threads that failed, had a queued message fail, or finished, while they're unread. These are the same signals as bb's sidebar dots, so opening a thread clears it here too.
- **Running**: threads mid-turn, with how long the current turn has run and what's going on in the background (agents, commands, workflows, a queued message).
- **Usage limits**: the provider's usage-limit windows (Claude reports its five-hour window) with their status and time to reset, from the newest report among recent threads. Claude reports a status, not a percentage, so there's no gauge.
- **Worktrees**: bb-managed worktrees with uncommitted changes, and worktrees no live thread uses, which can be cleaned up. Worktrees that only hidden plugin threads use (kanban's review threads) are counted, not listed, since that plugin owns them.

## Keys

Press Escape to leave the composer (twice with vim-mode on), then:

| Keys | Action |
| --- | --- |
| `j` `k` | Next and previous row |
| `h` `l` | Across columns |
| `gg` `G` | First and last row |
| `Ctrl-d` `Ctrl-u` | Half a page down and up |
| `Enter` `o` | Open the thread |
| `dd`, then `y` | Clean up an unused worktree (`n` or Esc cancels) |
| `r` | Recheck worktrees |
| `/`, `n` `N` | Search rows, then step through matches |
| `i` | Back to the composer |
| `?` | Show the keys |
| `Esc` | Close the keys, cancel, or clear the search |

Every key has a mouse equivalent: click a row to open it, hover an unused worktree for its Clean up button.

## Cleanup

Clean up removes the worktree through bb (`bb environment cleanup`). The server rechecks before it does: the worktree must be bb-managed, clean, and used by no live thread, hidden ones included.

## Development

The keys come from `bb-vim-keys` (`plugins/vim-mode/lib`), like the other plugins' lists: one keymap in vim notation, rows tagged `data-nav-row`, and the library's list motions. `ui/cursor.ts` adds the two motions this layout needs on top: `h`/`l` across columns and `n`/`N` across search matches.

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
bb plugin build .
```
