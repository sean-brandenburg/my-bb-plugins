# 16 — Needs you sorting, notification, token spend

**What to build:** Needs you is sorted by attention level (Scrutinize first), then by age. A notification goes out when a card arrives there, if bb's plugin API offers one. Each card shows the tokens used across every thread it started (card, checks, tour, review), read from the provider transcripts the way the dashboard plugin reads them, on the card and in the brief.

**Blocked by:** 11 — Attention level drives depth.

**Status:** ready-for-agent

- [ ] Needs you cards are ordered by level, then by time in the column.
- [ ] Arrival in Needs you sends one notification per arrival when the API supports it. Without it, no error.
- [ ] Card token totals sum every thread the card started, update as threads run, and show on the card and in the brief.
- [ ] Tests cover the sort and the token summing over fake transcripts.
