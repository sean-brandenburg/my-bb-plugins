# 12 — Handoff brief

**What to build:** When a monitored card reaches Needs you, a brief sits at the top of the card panel, and as a strip at the top of kanban's changes page, above the embedded diff. It shows, in this order:

1. the attention level and its reasons;
2. what the checks don't cover;
3. evidence, with checks the board re-ran apart from what the agent only claims;
4. the loop history: rounds, what each resolved, accepted disputes, and the nits and smells that were fixed;
5. deferred, dropped and pre-existing findings;
6. disputes awaiting me, with both sides' reasoning;
7. tokens used so far, when available.

This ticket is read-only. The actions come in 13.

**Blocked by:** 09 — Disputes and non-convergence; 11 — Attention level drives depth.

**Status:** done

- [x] The brief renders for every Needs you reason (clean, cap, not converging, checks, dispute, question, loop error), and leads with the reason when it isn't clean.
- [x] The sections appear in the order above. Empty sections are omitted, except not-covered, which says when it's empty.
- [x] Re-run evidence is labeled separately from agent-claimed evidence.
- [x] The changes page strip shows the level, reasons and not-covered list, and collapses.
- [x] Every section is reachable with the card panel's vim keys.

Tokens (section 7) are left out: no token totals exist yet; ticket 16 adds them to the brief.
