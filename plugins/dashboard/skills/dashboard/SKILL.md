---
name: dashboard
description: How the Dashboard plugin's section under the new-thread composer works: its Needs you, Running, Usage limits, and Worktrees groups, where each comes from, its keys, and its worktree cleanup. Use when the user asks about that dashboard, why a thread or worktree shows there, or what its keys do.
---

The plugin has no commands or settings. It adds one section, "Dashboard", below bb's new-thread composer. It follows the composer's project selection, or covers every project when none is selected.

- **Needs you** lists threads by bb's own sidebar indicator: waiting for input (question, approval, plan), unread failure, failed queued message, unread finished turn. Most urgent first, then newest. Opening the thread clears it, as in the sidebar. Hidden helper threads are left out.
- **Running** lists threads that are starting, active, stopping, or provisioning, with the time since their latest `turn/started` event and their background agents, commands, workflows, and queued message.
- **Usage limits** reads the latest `provider/rateLimits/updated` event of the 8 most recently updated threads and keeps each window's newest report, dropping windows whose reset has passed. Statuses are OK, Nearly used, Reached. Providers report no percentage.
- **Worktrees** comes from the plugin's `worktrees` RPC, which runs `environments.status` on every active bb-managed worktree (cached for a minute, rechecked when threads start or are archived, and on `r`). It lists worktrees with uncommitted or untracked changes, and worktrees with no live thread. A worktree whose only live threads are hidden plugin threads (kanban's review threads) is counted in a "kept by hidden kanban threads" line instead.

Keys work once focus leaves the composer (Escape, twice with vim-mode): `j`/`k`, `h`/`l` across columns, `gg`/`G`, Ctrl-d/Ctrl-u, Enter or `o` to open, `dd` then `y` to clean up an unused worktree, `r` to recheck worktrees, `/` with `n`/`N` to search, `i` back to the composer, `?` for the list, Esc to close or clear.

Cleanup calls `environments.experimental_cleanup` after the server rechecks that the worktree is bb-managed, clean, and has no live thread, hidden ones included. It refuses otherwise. A worktree with uncommitted changes is never offered for cleanup.

To remove the section, disable the plugin: `bb plugin disable dashboard`.
