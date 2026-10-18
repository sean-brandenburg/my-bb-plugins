# 09 — Disputes and non-convergence

**What to build:** The card thread answers every finding in a fix prompt with a new response command: fixed, or disputed with a reason. The delta re-review judges each answer. Disputes go one of three ways:

- **accepted:** the finding closes as "disputed, accepted";
- **rejected, critical or important:** escalates to Needs you with reason "dispute";
- **rejected, minor:** stays open as a minor without escalating.

A finding answered "fixed" that's still present at re-check escalates right away with reason "not converging", without waiting for the cap.

**Blocked by:** 08 — Loop review and fix rounds.

**Status:** ready-for-agent

- [ ] The response command records an answer per finding for the round. The fix round isn't complete until every listed finding has one.
- [ ] The re-review prompt includes each answer, and the report records each dispute's outcome.
- [ ] The reducer closes accepted disputes, escalates rejected critical or important ones, and keeps rejected minors open.
- [ ] A finding answered fixed that's still open escalates with reason "not converging".
- [ ] Reducer tests cover each outcome.
