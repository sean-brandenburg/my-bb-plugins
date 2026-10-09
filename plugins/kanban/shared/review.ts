import { z } from "zod";

export const reviewApplySchema = z.object({
  threadId: z.string(),
  startedAt: z.number(),
  /** Set by `bb kanban review-applied` once the fixes are committed and pushed. */
  completedAt: z.number().nullable(),
  pushedCommit: z.string().nullable(),
  /** Finding ids handed to the apply round; null when a free-form review was passed whole. */
  findingIds: z.array(z.string()).nullable(),
  /** Whether the run was asked to push; `pushedCommit` is then the pushed sha, otherwise the local commit. */
  push: z.boolean(),
});

export const findingSeveritySchema = z.enum(["critical", "important", "minor"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const findingSchema = z.object({
  id: z.string(),
  severity: findingSeveritySchema,
  title: z.string(),
  description: z.string().default(""),
  fix: z.string().nullable().default(null),
  locations: z
    .array(
      z.object({
        file: z.string(),
        startLine: z.number().int().nullable().default(null),
        endLine: z.number().int().nullable().default(null),
      }),
    )
    .default([]),
  flaggedBy: z.array(z.string()).default([]),
  category: z.string().nullable().default(null),
  /** 1–5: how much it matters to fix before merge. */
  importance: z.number().int().min(1).max(5).nullable().default(null),
  /** 1–5: how well the fix stays inside the PR's scope (1 = separate piece of work). */
  scopeFit: z.number().int().min(1).max(5).nullable().default(null),
  /** `<reviewId>/<findingId>` of the earlier finding a re-review found still unaddressed and carried forward. */
  carriedFrom: z.string().nullable().default(null),
});
export type Finding = z.infer<typeof findingSchema>;

export const selectionSchema = z.record(z.string(), z.boolean());
/** Reviewer edits to a finding's wording; applied over the report before it is shown or handed to the apply thread. */
export const findingEditSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10_000).optional(),
  fix: z.string().max(10_000).nullable().optional(),
});
export type FindingEdit = z.infer<typeof findingEditSchema>;
export const findingEditsSchema = z.record(z.string(), findingEditSchema);

/** The machine-readable report the code-review skill appends as a ```json review-findings block. */
export const reviewReportSchema = z.object({
  version: z.number().int(),
  summary: z.string().default(""),
  commit: z.string().nullable().default(null),
  range: z.string().nullable().default(null),
  reviewers: z.array(z.string()).default([]),
  skippedReviewers: z.array(z.object({ name: z.string(), reason: z.string().default("") })).default([]),
  skippedFiles: z.array(z.string()).default([]),
  findings: z.array(findingSchema),
  /** Set by re-reviews: `findings` also holds every earlier finding still open, so older reviews are superseded. */
  carriesForward: z.boolean().default(false),
  /** Earlier findings (`<reviewId>/<findingId>`) a re-review found addressed at the reviewed commit. */
  resolved: z.array(z.object({ id: z.string(), title: z.string().default(""), note: z.string().default("") })).default([]),
});
export type ReviewReport = z.infer<typeof reviewReportSchema>;

export const severityCountsSchema = z.object({
  critical: z.number().int(),
  important: z.number().int(),
  minor: z.number().int(),
});
export type SeverityCounts = z.infer<typeof severityCountsSchema>;

/** Ticket-level roll-up of the per-finding scores: the worst importance and the typical scope fit. */
export const reviewScoresSchema = z.object({
  maxImportance: z.number().int().min(1).max(5),
  meanScopeFit: z.number().min(1).max(5),
  /** Mean importance, for sorting and tooltips. */
  meanImportance: z.number().min(1).max(5),
  scored: z.number().int(),
});
export type ReviewScores = z.infer<typeof reviewScoresSchema>;

/** One persisted code review of a PR card. `body` is the compiled findings. */
export const reviewSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  threadId: z.string(),
  /** `failed`: the thread went idle without recording a commit or producing a report (setup problems, usually). */
  status: z.enum(["running", "completed", "failed"]),
  /** PR head commit that was reviewed; the next review diffs from here. */
  commitSha: z.string().nullable(),
  baseRef: z.string().nullable(),
  headRef: z.string().nullable(),
  /** Commit the previous review ended at, when this was an incremental review. */
  sinceCommitSha: z.string().nullable(),
  body: z.string().nullable(),
  /** Parsed from the body's review-findings block; null for free-form reviews. */
  report: reviewReportSchema.nullable(),
  /** Effective per-finding selection for the apply round: user overrides merged over the heuristic. */
  selection: selectionSchema,
  /** Only the findings the user explicitly toggled. */
  selectionOverrides: selectionSchema,
  /** Wording changes the user made per finding; `report.findings` already has them applied. */
  findingEdits: findingEditsSchema,
  createdAt: z.number(),
  completedAt: z.number().nullable(),
  apply: reviewApplySchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;
export const reviewSummarySchema = reviewSchema
  .omit({ body: true, report: true, selection: true, selectionOverrides: true, findingEdits: true })
  .extend({
    hasBody: z.boolean(),
    counts: severityCountsSchema.nullable(),
    selectedCount: z.number().int().nullable(),
    scores: reviewScoresSchema.nullable(),
  });
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;
