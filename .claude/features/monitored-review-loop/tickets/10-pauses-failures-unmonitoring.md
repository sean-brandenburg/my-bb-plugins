# 10 — Pauses, failures, unmonitoring

**What to build:** The loop handles the unhappy cases:

- **A question:** while the card thread waits on me, the loop pauses and the card shows needs-you with reason "question" without leaving its column. It resumes on the next ready.
- **A failed thread:** a checks, tour or review thread that goes idle without a record or report is retried once, then escalates as "loop error".
- **Unmonitoring:** turning monitoring off partway through stops the loop after the current step and brings back the manual buttons.

Every escalation's reason shows on the card.

**Blocked by:** 08 — Loop review and fix rounds.

**Status:** ready-for-agent

- [ ] The card thread's needs-input state pauses the loop and shows reason "question". The next ready resumes it.
- [ ] A failed loop thread is retried once, and a second failure escalates with reason "loop error" and a link to the thread.
- [ ] Unmonitoring partway through leaves the card's findings and history intact and restores the manual Review and Apply buttons.
- [ ] Reducer tests cover pause and resume, retry then error, and unmonitoring in each phase.
