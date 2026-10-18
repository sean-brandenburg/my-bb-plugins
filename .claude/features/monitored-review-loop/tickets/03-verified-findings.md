# 03 — Verified findings

**What to build:** The code-review skill checks every finding before it reaches the board. After the finders report, a verify pass adapted from Anthropic's official code-review plugin scores each finding 0–100 for whether it is real and introduced by the change. Severity is recorded separately and never lowers confidence, so a real nit scores as high as a real bug. Findings below 80 move to a filtered list. Findings in code the diff didn't touch are tagged pre-existing. The board shows the verified findings, a collapsed "N filtered" group, and a pre-existing list with a make-a-card action that creates a backlog card describing the finding.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The skill's report carries per-finding `confidence` and `preExisting`, plus a report-level filtered list. The markdown and JSON contract otherwise stays compatible.
- [ ] The verify step's rubric is written into the skill. It states that confidence measures realness, not importance.
- [ ] Report parsing accepts the new fields and still parses stored reviews without them.
- [ ] The card panel and the changes view show filtered findings collapsed under "N filtered", which expands on demand.
- [ ] Pre-existing findings are listed separately, never pre-selected, and make-a-card creates a backlog card carrying the finding's title, description and locations.
- [ ] Running the skill on a known change produces a report that parses with the new fields.
- [ ] Keyboard paths exist for expanding the filtered group and for make-a-card.
