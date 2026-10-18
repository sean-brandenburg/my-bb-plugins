# 11 — Attention level drives depth

**What to build:** At the start of round 1 the loop spawns the tour (owned by the narrative thread; the loop only calls it and reads per-file role and risk). A pure function computes the attention level, Glance, Read or Scrutinize, with human-readable reasons, from:

- the highest per-file risk;
- per-project path rules (glob → minimum level);
- loop signals: rounds, disputes, check failures, a non-empty not-covered list;
- scope signals: open scope findings, deferred critical findings;
- diff size.

The level picks the review depth: Glance → Quick, Read → Standard, Scrutinize → Deep. It shows on the card and is recomputed when the loop ends.

**Blocked by:** 06 — Review depth; 08 — Loop review and fix rounds.

**Status:** ready-for-agent

- [ ] The loop spawns a tour before the first review and waits for it. A failed tour retries once, then the loop falls back to Standard depth.
- [ ] The attention function returns a level plus reasons, and is tested directly: path rules raise it, loop and scope signals raise it, and a deferred critical finding raises it to at least Read.
- [ ] The per-project path-rules setting exists alongside the check command.
- [ ] The review runs at the depth the level maps to.
- [ ] The card shows the level as "ready · Read", and so on, when it reaches Needs you.
- [ ] The tour's prompt and schema are unchanged.
