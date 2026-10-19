## Change Summary
Commit ec243b0 changes one effect in `NarrativeOutline` (plugins/diff-view/lib/app/narrative/narrative-view.tsx). The effect used to be an expression-bodied arrow, `useEffect(() => currentRef.current?.scrollIntoView(...), [address])`, and now has a block body, so the callback returns nothing. `scrollIntoView` already returned `undefined`, so runtime behaviour does not change; the edit makes the "no cleanup" intent explicit. The correctness, style, security and testing reviewers ran. The storage reviewer was skipped because no storage files changed, and the spec reviewer was skipped because no `.claude/features/` directory matches the branch. No generated files were in the diff.

## Review Findings

No findings.

### Filtered (Confidence Below 80)
- **X1** (confidence 50) `plugins/diff-view/lib/app/keys/overlays.tsx:14`, `plugins/diff-view/lib/app/use-diff-result.ts:29` — Same expression-bodied useEffect pattern remains elsewhere in diff-view/lib. Verifier: At HEAD, overlays.tsx:14 `useEffect(() => ref.current?.focus({ preventScroll: true }), [])` and use-diff-result.ts:29 `useEffect(() => reload(false), [reload])` are both still expression-bodied, and both return undefined (focus returns void; reload is a void useCallback). So the inconsistency is real, but no CLAUDE.md or AGENTS.md rule asks for block-bodied effects, so this is a matter of taste. Both lines are identical at ec243b0~1, and the commit touched only narrative-view.tsx. (flagged by: style, testing)

Reviewed commit: 1daed545c6fdde096752b41ed48580efd2c1db47
Range: ec243b0~1..ec243b0

```json review-findings
{
  "version": 2,
  "summary": "Commit ec243b0 changes one effect in `NarrativeOutline` (plugins/diff-view/lib/app/narrative/narrative-view.tsx). The effect used to be an expression-bodied arrow, `useEffect(() => currentRef.current?.scrollIntoView(...), [address])`, and now has a block body, so the callback returns nothing. `scrollIntoView` already returned `undefined`, so runtime behaviour does not change; the edit makes the \"no cleanup\" intent explicit. The correctness, style, security and testing reviewers ran. The storage reviewer was skipped because no storage files changed, and the spec reviewer was skipped because no `.claude/features/` directory matches the branch. No generated files were in the diff.",
  "commit": "1daed545c6fdde096752b41ed48580efd2c1db47",
  "range": "ec243b0~1..ec243b0",
  "reviewers": ["correctness", "security", "style", "testing"],
  "skippedReviewers": [
    { "name": "storage", "reason": "no storage files changed" },
    { "name": "spec", "reason": "no .claude/features directory matches the branch" }
  ],
  "skippedFiles": [],
  "findings": [],
  "filtered": [
    {
      "id": "X1",
      "severity": "minor",
      "title": "Same expression-bodied useEffect pattern remains elsewhere in diff-view/lib",
      "description": "The commit's rationale is that an expression-bodied effect hands the call's result back to React as a cleanup. Two effects in the same library still use that shape: overlays.tsx:14 `useEffect(() => ref.current?.focus({ preventScroll: true }), [])` and use-diff-result.ts:29 `useEffect(() => reload(false), [reload])`. Both return undefined today, so this is about consistency and readability, not a runtime bug: the library now has two styles for an effect with no cleanup, and nothing stops the pattern from coming back.",
      "fix": "Give those two effects block bodies too, so an expression-bodied effect arrow in diff-view/lib always means it returns a cleanup; optionally add a lint or grep guard against expression-bodied useEffect callbacks.",
      "locations": [
        { "file": "plugins/diff-view/lib/app/keys/overlays.tsx", "startLine": 14, "endLine": 14 },
        { "file": "plugins/diff-view/lib/app/use-diff-result.ts", "startLine": 29, "endLine": 29 }
      ],
      "flaggedBy": ["style", "testing"],
      "category": "style",
      "importance": null,
      "scopeFit": null,
      "confidence": 50,
      "preExisting": true,
      "verification": "At HEAD, overlays.tsx:14 `useEffect(() => ref.current?.focus({ preventScroll: true }), [])` and use-diff-result.ts:29 `useEffect(() => reload(false), [reload])` are both still expression-bodied, and both return undefined (focus returns void; reload is a void useCallback). So the inconsistency is real, but no CLAUDE.md or AGENTS.md rule asks for block-bodied effects, so this is a matter of taste. Both lines are identical at ec243b0~1, and the commit touched only narrative-view.tsx."
    }
  ]
}
```
