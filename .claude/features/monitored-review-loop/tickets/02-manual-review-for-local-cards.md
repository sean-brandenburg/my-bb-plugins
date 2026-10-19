# 02 — Manual review for local cards

**What to build:** Any card whose thread has committed work can be reviewed by hand, not just PR cards. Review, `bb kanban review` and the changes view's Review button start a hidden review thread in a fresh worktree of the card's project, checked out at the card thread's HEAD commit, reviewing it against its merge base. Re-review since the last reviewed commit works the same way. Apply on a local card sends the selected findings to the card's own thread, using apply-review's pre-selected mode, and the round is recorded the way PR apply rounds are today.

**Blocked by:** 01 — Reviews take a subject, not a PR.

**Status:** done

- [x] The Review button and `bb kanban review` are available on an ad hoc or Jira card whose thread has commits beyond its merge base, and disabled with a reason otherwise.
- [x] The review thread runs hidden in a fresh worktree at the card thread's HEAD commit and records that commit.
- [x] Findings persist on the card and render in the card panel and the changes view as they do for PR cards.
- [x] Re-review since the last reviewed commit carries findings forward and lists resolved ones.
- [x] Apply on a local card prompts the card's own thread with the selected findings and records the round, crossing off what it fixed and keeping skipped ones open.
- [x] Server tests cover spawning a local review, completing it, and applying it into the card thread.
