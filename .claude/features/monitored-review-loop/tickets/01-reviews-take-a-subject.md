# 01 — Reviews take a subject, not a PR

**What to build:** Prefactor. Code review, re-review and apply work from a review subject instead of assuming a PR. The subject is either a PR (today's fetch of the PR head against its base) or a local commit (a commit diffed against its merge base with the project's default branch). The PR-only guards in review spawning and in the review and apply prompts become branches per subject kind. PR reviews behave exactly as they do today. Local subjects are representable but not yet reachable from the UI.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Review and apply prompt building and review spawning take a subject, with PR and local-commit variants.
- [x] Every existing PR review, re-review and apply test passes unchanged.
- [x] Prompt-building tests cover a local subject: a worktree checked out detached at the commit, and the range from its merge base with the default branch.
- [x] No user-visible change.
