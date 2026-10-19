# 05 — Scope finder and triage

**What to build:** Reviews keep changes well scoped. The review prompt carries the card's intent: title, description, the approved plan when there is one, and the spec when one exists. A scope finder flags hunks beyond that intent and recommends removing or splitting them out. After verify, a triage step decides apply, defer or drop for every verified, introduced finding, with a reason:

- **defer:** wrong scope;
- **drop:** churn far out of proportion to the benefit, or a conflict with project conventions. Low priority alone is never a reason to drop.

Importance and scope fit stay as triage inputs. The criteria live in one shared written reference that both the triage step and apply-review's interactive triage read. On the board, the default selection becomes the findings triaged apply. Deferred findings get make-a-card. Dropped findings show collapsed with their reasons.

**Blocked by:** 03 — Verified findings.

**Status:** done

- [x] Review prompts for PR and local cards include the card's intent.
- [x] Scope findings appear under a `scope` category, name the hunks beyond the intent, and recommend removing or splitting them.
- [x] Every verified, introduced finding carries a triage decision and reason in the report.
- [x] A critical finding whose proper fix is separate work can be deferred, and its triage says so.
- [x] apply-review's Step 2 reads the same criteria reference, and its behavior with a user is otherwise unchanged.
- [x] The default selection is the findings triaged apply. Reviews without triage fall back to today's heuristic.
- [x] The board shows deferred findings with make-a-card and dropped findings collapsed with their reasons. Either can be selected for an apply round by hand.
- [x] Tests cover default selection with triage, without triage, and with user overrides.
