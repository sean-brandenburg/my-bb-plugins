Short answer: no, the later rounds were mostly waste, and the kanban review loop never actually ran. The board didn't drive a single fix round on either card. The card threads looped themselves, with no cap, no triage and no memory, because every review came back in a format the board can't parse.

What actually happened
The custom code-review skill the plugin depends on is missing on this machine. The README and spec expect it at ~/.claude/skills/code-review, but that directory doesn't exist (only synced/ and todoist-cli/ do). The review prompt in plugins/kanban/server/reviews/prompts.ts:123 just names "the code-review skill", so each review thread invoked Claude Code's built-in /code-review instead. That skill emits a bare JSON array under the review-findings fence; the board's parser at plugins/kanban/server/agent-output.ts:38 needs the {version, findings: [{id, severity, triage, ...}]} object. All 13 completed reviews failed to parse.

From there the loop did exactly what its code says:

Unparseable report counts as a failed thread, so the reducer retried the review once (reducer.ts, THREAD_RETRIES = 1). That's why db18a80, 2d94aa0, e250ebb and 3c3b45e were each reviewed twice, the second starting seconds after the first finished. Then the loop stopped in loop-error.
The card thread was never told any of this. Both cards' loop state show rounds: [] and round: 0 after 5 and 7 checked commits. No fix prompt ever went out.
bb's child-completed notifications filled the gap. Every checks, classify, review and narrative thread is spawned with the card thread as parent, so bb posted each one's final message into the card thread. The card thread read the 10 findings, fixed them, committed, ran bb kanban ready again, and the loop started a fresh full deep review each time (full because rounds was empty). It also reported ready while the previous review was still running, so several reviews were of a commit already superseded. The card thread said so itself each round: "That review covered the older commit, half its points were already fixed."
The three threads bb reported as "failed" at 03:07 hit the usage limit. They found nothing wrong with the code.
Cost by role across both cards, from each thread's own token counter (the background /code-review agent inside each review thread is not included, so reviews are undercounted):

Role	Threads	Total tokens
Card threads	2	10.8M
Checks	13	4.8M
Reviews	16	2.4M+
Narrative	1	1.6M
Classify	2	0.2M
Were the rounds worth it?
Round one on each card was useful: real correctness bugs (marked-known words showing as "Struggling", Talk prompt wording changing against the card's intent, hidden-tab time counting as active). After that, returns dropped fast:

Every review returned ten findings, whatever the commit. That's the built-in skill's finding cap filling up, not the change having exactly ten problems. A loop that waits for "zero findings" can't converge under that regime.
The two reviews of the same commit overlapped by only about 40%. A deep review surfaces a different ten from a larger pool each time, so each round "found new things" that were already there.
The same unfixed items were re-reported every round. The card thread decided some were out of scope or the user's call, but with no triage or dispute recorded, nothing stopped the next full review re-flagging them:
Finding	Times reported
Whole session rewritten on every event (instrument.ts)	7
Every sync reprocesses every session (backup.ts)	5
Startup loads and re-derives the whole log (main.tsx)	3
Whole evidence log in the sync snapshot (backup.ts)	3
Mistakes page still uses old earWords	2
Rounds four onward were mostly efficiency, simplification and design notes, with correctness items that were variations on earlier ones.
What to tune
In order of payoff:

Restore or ship the custom skill, and fail loudly without it. Monitoring should refuse to start (or the review prompt should embed the exact JSON schema) when ~/.claude/skills/code-review is absent. A non-empty body that doesn't parse should not be retried: a format failure fails the same way twice, so the retry in reducer.ts only pays off for threads that crashed.
Stop the self-loop through parent notifications. Either spawn the board's worker threads without parentThreadId (see loop.ts spawnChecks/spawnClassify and reviews.startReview), or add to the builder contract in plugins/kanban/server/loop/prompts.ts:28 that child-completed notices are informational and only board prompts start a round. This one change would have cut both runs to one review cycle plus whatever the reducer chose.
Hold ready while a review is running. Today a new ready during reviewing discards the in-flight review's result. Either queue the ready until the review completes or stop the review thread when a newer commit arrives.
Don't let a deep review fill a cap. For rounds after the first, ask for critical and important findings only, and treat "no important or critical open" as converged. Minors already fall through to openFindings at the cap anyway.
Make checks cheap. Thirteen runs of one command cost more than all the reviews, because each checks thread spent 60–100 seconds rediscovering worktree setup (missing dictionary files, sandbox EPERM, pnpm bootstrap). Set the project check command in the card panel so it includes setup, or run the command directly instead of through an agent thread.
Only spawn the narrative at a real stop. needsYou in reducer.ts spawns one for any reason, including loop-error. The 1.6M-token narrative here was written at a loop error and was stale within minutes because the card thread kept committing.
I've left the code untouched. I recorded the missing-skill fact in memory so future analysis starts there.
