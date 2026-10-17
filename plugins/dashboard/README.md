# Usage dashboard

A small Usage card under the new-thread composer, for what bb doesn't show elsewhere: how much Claude you've used.

- **Limit**: the five-hour window's status (OK, Nearly used, Reached) and time to reset, from the newest report among recent threads. The weekly window shows up when Claude reports it, which is once it nears its cap. Claude reports no percentage, so there's none here.
- **This window**: tokens used since the five-hour window opened, by thread, largest first, with a bar for each. Sessions outside bb (Claude Code in a terminal) are listed too, under Claude Code's own title. When no reset has been reported, the window is estimated from activity.
- **Last 14 days**: tokens per day, today highlighted.
- The line at the bottom spells out the row or day under the cursor or pointer: total, output, cache write, cache read, input.

Everything comes from Claude Code's transcripts in `~/.claude/projects`, so it covers every Claude Code session on this machine. A session is matched to its bb thread by the session id on the thread's token-usage events, or by the thread id in its worktree path. A thread whose context was cleared has several sessions, which add up to one row.

## Keys

Press Escape to leave the composer (twice with vim-mode on), then:

| Keys | Action |
| --- | --- |
| `j` `k` | Next and previous row: bb's project and permission bar, each thread, the days |
| `h` `l` | Along the project bar, and day by day in the chart |
| `gg` `G` | First and last row |
| `Enter` `o` | Open the thread, or the picker under the cursor |
| `r` | Reread usage |
| `i` | Back to the composer |
| `?` | Show the keys |

The keys come from `bb-vim-keys` (`plugins/vim-mode/lib`). bb's bar is tagged as a toolbar row while the card is mounted, so the same cursor walks it.

## Development

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
bb plugin build .
```
