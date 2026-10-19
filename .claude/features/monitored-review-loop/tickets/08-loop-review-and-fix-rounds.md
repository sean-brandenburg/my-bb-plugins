# 08 — Loop review and fix rounds

**What to build:** Passing checks lead to a review instead of straight to Needs you. The review runs at Standard depth until the attention level exists. Every finding triaged apply, whatever its severity, goes into one fix prompt to the card thread, which fixes exactly those (each bug class in full, nothing beyond), commits, and reports ready again. The fix commit is checked, then gets a delta re-review that carries open findings forward and checks the fixes stayed in scope. A clean review moves the card to Needs you. After three automatic rounds the loop stops:

- with any critical or important finding still open, it escalates with reason "cap";
- with only minor findings open, it ends as if clean and lists them.

Deferred, dropped and pre-existing findings never enter a round. Round pips show on the card.

**Blocked by:** 05 — Scope finder and triage; 07 — Monitored flag, ready, and the checks gate.

**Status:** done

- [x] After checks pass, the reducer spawns a review of the ready commit, then a delta re-review on later rounds.
- [x] The fix prompt lists every finding triaged apply and nothing else, and states the scope rule.
- [x] The delta re-review flags fix commits that go beyond their findings, as scope findings.
- [x] A clean review moves the card to Needs you with reason "clean".
- [x] The cap is three automatic rounds. Reaching it with critical or important findings open escalates, and with only minors open it ends as clean with those minors listed.
- [x] Round pips and the review rN and fixing rN phase chips update as rounds run.
- [x] Reducer tests cover clean on round 1, a fix then clean, the cap with important findings open, the cap with only minors open, and non-apply findings never routed.
