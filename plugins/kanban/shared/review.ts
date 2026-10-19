import { z } from "zod";

/**
 * What a review covers: a pull request, fetched from GitHub, or a local commit, reviewed against its merge base with
 * the project's default branch (a ref that resolves in the project's repository). The local commit and branch are
 * pasted into shell commands in the prompt, so they are validated.
 */
const prSubjectSchema = z.object({ kind: z.literal("pr"), repo: z.string(), number: z.number().int(), url: z.string() });
const localSubjectSchema = z.object({
  kind: z.literal("local"),
  commit: z.string().regex(/^[0-9a-f]{7,40}$/iu),
  defaultBranch: z.string().regex(/^\w[\w./-]*$/u),
});
export const reviewSubjectSchema = z.discriminatedUnion("kind", [prSubjectSchema, localSubjectSchema]);
export type ReviewSubject = z.infer<typeof reviewSubjectSchema>;
export type PrReviewSubject = z.infer<typeof prSubjectSchema>;
const reviewSubjectKindSchema = z.enum([prSubjectSchema.shape.kind.value, localSubjectSchema.shape.kind.value]);

export const reviewApplySchema = z.object({
  threadId: z.string(),
  startedAt: z.number(),
  /** Set by `bb kanban review-applied` once the fixes are committed and pushed. */
  completedAt: z.number().nullable(),
  pushedCommit: z.string().nullable(),
  /** Finding ids handed to the apply round; null when a free-form review was passed whole. */
  findingIds: z.array(z.string()).nullable(),
  /** Whether the run was asked to push; `pushedCommit` is then the pushed sha, otherwise the local commit. Never set for a local review, whose fixes the card's own thread commits. */
  push: z.boolean(),
});

export const findingSeveritySchema = z.enum(["critical", "important", "minor"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

/** The verifier's confidence a finding needs to be reported rather than filtered; the code-review skill applies it. */
export const CONFIDENCE_BAR = 80;
/** The first report version whose findings went through the verify pass, so a missing confidence means unverified. */
export const VERIFIED_REPORT_VERSION = 2;

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
  /** 0–100: how sure the verifier is that the problem is real. It never measures importance: a real nit scores as high as a real bug. */
  confidence: z.number().int().min(0).max(100).nullable().default(null),
  /** The problem was already there before the change: none of its lines are in the diff and the change did not cause it. An unverified finding may say null, which means not pre-existing. */
  preExisting: z
    .boolean()
    .nullable()
    .default(false)
    .transform((value) => value ?? false),
  /** The verifier's one-line reason for its confidence. */
  verification: z.string().nullable().default(null),
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
  /** Findings the verifier scored below the confidence bar; kept for a look, never selected or applied. */
  filtered: z.array(findingSchema).default([]),
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

/** One persisted code review of a card's PR or local commits. `body` is the compiled findings. */
export const reviewSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  threadId: z.string(),
  /** A re-review only continues from a review of the same kind, and a local review is applied in the card's own thread. */
  subjectKind: reviewSubjectKindSchema,
  /** `failed`: the thread went idle without recording a commit or producing a report (setup problems, usually). */
  status: z.enum(["running", "completed", "failed"]),
  /** The PR head or local commit that was reviewed; the next review diffs from here. */
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
  /** Findings a completed apply round fixed, across every round, plus any the user marked by hand. */
  appliedFindingIds: z.array(z.string()),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
  apply: reviewApplySchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;
export const reviewSummarySchema = reviewSchema
  .omit({ body: true, report: true, selection: true, selectionOverrides: true, findingEdits: true, appliedFindingIds: true })
  .extend({
    hasBody: z.boolean(),
    /** Findings no apply round has fixed yet. */
    counts: severityCountsSchema.nullable(),
    appliedCount: z.number().int(),
    /** Selected findings still to apply. */
    selectedCount: z.number().int().nullable(),
    scores: reviewScoresSchema.nullable(),
  });
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

/**
 * How a review's findings stand, as the card panel lists them: the change's own (`introduced`) apart from the
 * pre-existing ones, and how many of its own are open, selected for the next apply round, and applied. Pre-existing
 * findings never count as selected, whatever the selection says.
 */
export function findingTallies(
  report: Pick<ReviewReport, "findings">,
  selection: Record<string, boolean>,
  appliedFindingIds: readonly string[],
): { introduced: Finding[]; preExisting: Finding[]; open: number; selected: number; applied: number } {
  const applied = new Set(appliedFindingIds);
  const introduced = report.findings.filter((finding) => !finding.preExisting);
  const open = introduced.filter((finding) => !applied.has(finding.id));
  return {
    introduced,
    preExisting: report.findings.filter((finding) => finding.preExisting),
    open: open.length,
    selected: open.filter((finding) => selection[finding.id] === true).length,
    applied: introduced.length - open.length,
  };
}
