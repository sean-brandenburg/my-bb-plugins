---
name: narrative-review
description: Write a narrative code review of a diff. This is an ordered walk through the change in steps. Each step explains a group of lines and why they exist, with mermaid diagrams where structure or flow needs a picture. Every changed line appears in at least one step. When the code has moved on since an earlier narrative, the review adds a revision chapter that explains the delta and why it was made. Use when a kanban narrative thread asks for a narrative review or tour, or when the user asks for a narrative, guided, or story-style walkthrough of a change.
---

# Narrative code review

A narrative review is read one step at a time, like a guided tour. Each step pairs
your explanation with the exact lines it talks about. The reader sees only those
lines and your words, so the steps must tell the change as a story: they say what
the change is for and how its parts fit, then cover the details.

## The contract

1. **Exhaustive.** Every added line (new side) and every deleted line (old side) of
   the diff is in at least one step's `refs`. The board checks this and shows the
   reader any line you missed in a step marked "Not narrated", so gaps are visible.
2. **Lines may repeat.** If a line matters to two parts of the story, reference it
   in both. For example, a call site can appear in the API step and again in the
   error-handling step. Repeating lines is encouraged when it helps the reader.
3. **Read-only.** Never change code, commit, push, or post to GitHub.

## Process

1. Read the whole diff and the code around it before writing anything. Use
   `git grep` to find call sites and read the tests. Know what the change is for
   before you decide how to tell it.
2. Plan the story arc. A good order is usually:
   - **Why**: the entry point or the user-visible behavior.
   - **Shape**: new types, schemas, data model or interfaces.
   - **Flow**: the main path through the new logic, in call order.
   - **Edges**: error paths, concurrency, migrations, security-sensitive code.
   - **Tests**: what they prove and what they leave out.
   - **Mechanical**: renames, wiring, generated files and lockfiles, grouped into
     one or two short steps at the end.
3. Write the steps (see the step sections below).
4. Check coverage: `bb kanban narrative-check --report-stdin < narrative.json`.
   It lists every uncovered range with its lines, and any path that isn't in the
   diff. Fix them and re-run until it passes. Write the file in your scratch
   space, not in the repository.
5. End your final message with the JSON in the fenced block your prompt names.

## Writing a step

- **One idea per step.** A step usually covers 5–60 changed lines. Split a large
  hunk across several steps when it does several things. Merge tiny related
  edits across files into one step when they make one point: "the three call
  sites switch to the new signature."
- **`title`**: a short claim, not a file name. Write "Retries back off
  exponentially, capped at 30s", not "client.go".
- **`body`**: Markdown, about 40–200 words. Say what the lines do and why they're
  there, how they connect to earlier steps, and what a reviewer should check
  closely: invariants, failure modes, anything surprising. Don't paraphrase the
  code line by line. The reader sees the lines next to your text.
- **`refs`**: `{ "path", "side": "new"|"old", "startLine", "endLine" }`. Use new-side
  numbers for added and context lines. Use old-side numbers for deleted lines,
  taken from the `-a,b` half of the hunk header. A hunk that replaces lines needs
  two refs, one per side. A ref may include unchanged lines inside a hunk when
  the step discusses them. Lines outside the diff's hunks can't be shown.
  `"startLine": null` refers to the whole file. Use it for binary files,
  lockfiles and generated files.
- **`id`**: a short slug that is stable for the same idea, e.g. `retry-backoff`. A
  later revision reuses the id when it re-tells the same step.

## Diagrams

Put a fenced `mermaid` block in a step's `body` when a picture explains more than
prose does:

- a call or message sequence across files or services (`sequenceDiagram`);
- a state machine or lifecycle (`stateDiagram-v2`);
- a data model or how types relate (`classDiagram`, `erDiagram`);
- a decision flow with several branches (`flowchart`).

Keep a diagram under about 15 nodes, and name nodes after the identifiers in the
code. Put the diagram in the step about that structure, usually early in the
arc, not in a separate step. Mermaid syntax pitfalls:

- Quote any label that contains punctuation: `A["parse(input)"]`.
- Don't put `end` as a bare word in a flowchart label.
- Use `-->` for edges.
- Don't wrap the block in HTML.

Most changes need zero to three diagrams. Don't add one for a linear change.

## The summary, reading order and watch-outs

The report's `summary` is 2–4 sentences on what the change does and why.
`readingOrder` lists every changed file once, each with:

- `role`: `key`, `supporting` or `mechanical`;
- `risk`: 1–5, how closely to read it;
- `note`: one sentence;
- `changes`: the semantic labels.

Your prompt gives the exact rules for these. `watchOut` lists anything risky or
easy to miss. These feed the board's tour strip and its review-attention level,
so fill them in as carefully as the steps.

## Revision chapter (when the code moved since an earlier narrative)

Your prompt says so when there is an earlier narrative. Then:

1. Run `bb kanban narrative-context` to print the earlier narrative's steps and
   the **delta**: what changed between the earlier head and the current one.
2. Find out **why** it changed:
   - the commit messages between the two heads;
   - the review findings and comments the prompt lists as addressed;
   - the earlier steps those lines belonged to.
3. Write `revision`: `{ "summary", "steps" }`. The `summary` explains the
   revision as a whole, for example "addresses the two review findings on retry
   handling and renames X". Each revision step explains one part of the delta:
   - what changed, and why;
   - the earlier step it revises, named by title;
   - `affects`: the ids of the new narrative's steps where the result shows up.

   Revision step `refs` point into the **delta's** line numbers, not the full
   diff's. Every line of the delta must be covered, and `narrative-check` checks
   this too. Describe in the body anything the delta deleted that the new code
   no longer has.
4. Then write the full new `steps` for the current diff, as for a first
   narrative. Reuse an earlier step's `id`, title and wording when its lines are
   unchanged, with line numbers updated. Rewrite the steps the delta touched.

The reader steps from the old narrative, through the revision chapter, into the
new narrative.
