---
name: dashboard
description: How the Usage dashboard plugin's card under the new-thread composer works: the five-hour limit line, the current window's tokens by thread, the 14-day chart, where the numbers come from, and its keys. Use when the user asks about that card, its token numbers, or why a session shows up there.
---

The plugin has no commands or settings. It adds one section, "Usage", below bb's new-thread composer.

- The limit line comes from the newest `provider/rateLimits/updated` event among the 8 most recently updated threads: the window's label, status (OK, Nearly used, Reached), and time to reset. Claude reports no percentage. The weekly window appears only once Claude reports it.
- "This window" covers the five-hour window: from the reported reset minus five hours, or, when no reset has been reported, estimated from activity (a window opens at the hour of the first response after the last one closed). It lists the 6 biggest users, each a bb thread, or a Claude Code session outside bb under Claude Code's own title. A thread's sessions are added together.
- "Last 14 days" is tokens per local day.
- Tokens are summed from every assistant response in `~/.claude/projects/**/*.jsonl` (subagents included), counted once per message id: input + output + cache write + cache read. Cache reads usually dominate the total. The readout line under the card splits it.
- Sessions are matched to bb threads through the `providerThreadId` on each thread's `thread/tokenUsage/updated` events, else the `thr_…` id in a worktree path.
- The server rereads transcripts incrementally, at most every 20 seconds, when the card asks: on load, every minute, a few seconds after any thread changes, and on `r`.

Keys work once focus leaves the composer (Escape, twice with vim-mode): `j`/`k` move through bb's project/permission bar, the thread rows, and the chart; `h`/`l` step along the bar and the days; `gg`/`G`; Enter or `o` opens a thread or the picker under the cursor; `r` rereads; `i` returns to the composer; `?` lists the keys.

To remove the card, disable the plugin: `bb plugin disable dashboard`.
