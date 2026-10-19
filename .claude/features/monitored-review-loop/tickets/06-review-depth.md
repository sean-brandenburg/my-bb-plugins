# 06 — Review depth

**What to build:** The code-review skill takes a depth that decides which finders run:

- **Quick:** correctness, CLAUDE.md compliance, scope and style.
- **Standard:** Quick plus testing and git history.
- **Deep:** Standard plus security, through the security reviewer and `/security-review`.

The storage reviewer still runs only when storage files change. Verify and triage run at every depth. Manual reviews get a depth picker that defaults to Standard, and the review shows which depth it ran.

**Blocked by:** 04 — Bug classes, not-covered list, style at every depth.

**Status:** done

- [x] The skill accepts a depth argument and spawns exactly that depth's finders. With no argument it runs Standard.
- [x] New git-history and CLAUDE.md-compliance finders exist, adapted from the official plugin.
- [x] The report records its depth, and the board shows it.
- [x] The Review button and `bb kanban review --depth` choose a depth. The default is Standard.
- [x] The depth picker has a keyboard path.
