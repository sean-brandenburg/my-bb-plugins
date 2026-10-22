# 10 — Suggestions from the AI code review

**What to build:**
- `Finding.suggestion?: { file: string; startLine: number; endLine: number; replacement: string } | null` in
  `bb-diff-view/types` and kanban's review types. Kanban's findings parser (`server/reviews/findings.ts`) accepts the
  field (JSON `version` 6; earlier versions have none), validates it (lines inside the finding's file, integers), and
  keeps it through finding edits and carry-forward. Kanban's own review prompts (`server/reviews/prompts.ts`, the
  merged-report instructions) mention the field so merged reports keep it. Don't edit `~/.claude/skills/...`; the
  integrating session updates the code-review skill.
- The finding annotation (`findings/finding-annotation.tsx`) shows the suggestion under the fix as the same
  suggestion diff ticket 09 renders. `A` applies it now and `B` batches it, through `DiffSource.suggestions.apply`
  (ticket 09); applying a finding's suggestion marks the finding applied (kanban: add it to the review's
  `appliedFindingIds` through an RPC). `gs` posts it to the PR as a draft GitHub comment on its lines whose body is
  the finding's title and description followed by the ```` ```suggestion ```` block (PR hosts only).

Spec: decision 10.

**Blocked by:** 09 — Suggested changes in comments

**Status:** done

- [x] Types + parser (v6) + edits/carry-forward keep the suggestion; parser tested
- [x] Prompts mention the field
- [x] Finding annotation renders it; `A`, `B`, `gs` work; applying marks the finding applied
- [x] KEY_HELP and READMEs updated
