# 07 — Monitored flag, ready, and the checks gate

**What to build:** A card can be flagged monitored, and the board starts driving it:

- **Turning it on:** a toggle in the card panel, a key, or `bb kanban monitor on|off`. Monitored cards are marked on the board.
- **The card thread's contract:** it's told to commit its work, run the project's check command, and finish with `bb kanban ready` (commit, evidence, and the check command when the project sets none). It's never to move the card itself.
- **The checks gate:** the board starts a hidden checks thread in a fresh worktree at that commit, which re-runs the check command and records its exit code and output tail. Failing checks go back to the card thread with the output, and a second failure in a row escalates. Passing checks move the card to Needs you for now.

This ticket introduces the loop reducer with its first states, the `checking` column (added to existing boards, just before `review`), new default column names (Building, Needs you), a per-project check-command setting, and phase chips on monitored cards.

**Blocked by:** 02 — Manual review for local cards.

**Status:** done

- [x] The loop is a pure reducer from (state, event) to (state, actions), tested on its own. Adapters turn bb thread events, CLI calls and RPCs into events and carry out the actions.
- [x] Monitoring on and off works from the panel, a key and the CLI. Off stops the loop after the current step.
- [x] Monitored card threads get the new role instructions, and unmonitored ones keep today's.
- [x] `bb kanban ready` records the commit, the evidence (commands, exit codes, output tails, screenshot paths) and the check command. It moves the card to Checking.
- [x] A hidden checks thread re-runs the command at the commit and records the result. Pass moves the card to Needs you. A failure prompts the card thread with the output, and a second consecutive failure escalates with reason "checks".
- [x] The per-project check command setting is used when set. Otherwise the agent's command is used and marked as agent-chosen.
- [x] An existing board gains the `checking` column the first time a card is monitored. New boards get the renamed defaults, and column ids are unchanged.
- [x] Phase chips show building, checks, needs you and the escalation reason.
- [x] Reducer tests cover ready, checks pass, a single failure and a double failure. Adapter tests cover ready spawning a checks thread.
