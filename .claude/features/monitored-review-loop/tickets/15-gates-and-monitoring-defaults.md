# 15 — Gates and monitoring defaults

**What to build:** When a card is monitored I choose three gates:

- **Plan approval:** the card thread proposes a plan and waits for my approval or edits before building.
- **Findings approval:** each round's apply findings wait for me to approve or deselect them before the fix prompt goes out.
- **Auto-accept:** at Glance, with no critical or important finding and no escalated dispute open, the card is accepted without stopping at Needs you. Open minors are listed on the accepted card with make-a-card.

Defaults: plan approval on for Jira cards and off for ad hoc cards, findings approval off, auto-accept off. A source or tag can make new cards monitored by default, and a card's own flag always wins.

**Blocked by:** 13 — Brief decisions.

**Status:** done

- [x] The gate options are chosen when monitoring is turned on, in one step that has a keyboard path, with the defaults above.
- [x] The plan gate holds the loop in planning until I approve or edit, and the approval reaches the card thread.
- [x] The findings gate shows the round's apply set for approval before the fix prompt is sent.
- [x] Auto-accept fires only at Glance with no critical or important finding and no escalated dispute open, and never at Read or Scrutinize. Open minors are listed on the card.
- [x] Source and tag monitoring defaults apply to new cards only, and the card flag overrides them.
- [x] Reducer tests cover each gate on and off, and auto-accept's conditions.
