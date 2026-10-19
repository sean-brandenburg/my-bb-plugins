# 13 — Brief decisions

**What to build:** The brief's actions:

- **Accept:** on a local card, prompts the card thread to land the change using the project's finishing steps, and moves the card to Done when it reports landed. On a PR card, ends the loop as accepted, leaving merging to me.
- **Send back:** my diff comments go to the card thread as a round I own, which doesn't count toward the cap.
- **Rethink:** stops the loop and asks the card thread to reconsider the approach and propose a new one. The round count resets when the new plan is approved or the next ready arrives.
- **Pull a finding back in:** a deferred or dropped finding starts a round I own.
- **Decide a dispute:** uphold it, which sends it back to fix, or close it.

**Blocked by:** 12 — Handoff brief.

**Status:** done

- [x] Each action is a reducer event with tests, and the human rounds are counted apart from the cap.
- [x] Accept on a local card sends a land prompt and moves the card to Done on a landed report. Accept on a PR card marks it accepted and doesn't post to GitHub.
- [x] Send back is disabled with no unsent diff comments, and otherwise starts a fixing round with them.
- [x] Rethink pauses the loop until the card thread reports a new plan or ready. (No plan report exists yet, so it resumes at the next ready; the round count resets when Rethink is pressed, which comes to the same.)
- [x] Dispute decisions update the finding and route it.
- [x] Every action has a key and appears in the card's `?` list.
