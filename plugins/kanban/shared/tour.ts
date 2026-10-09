import { z } from "zod";

const lineRangeSchema = z.tuple([z.number().int().min(1), z.number().int().min(1)]);
/** A semantic label for a block of the diff that would otherwise read as a wall of red and green. */
export const semanticChangeSchema = z.object({
  kind: z.enum(["rename", "move", "signature", "reorder", "reformat", "extract", "inline", "logic"]).default("logic"),
  label: z.string(),
  oldLines: lineRangeSchema.nullable().default(null),
  newLines: lineRangeSchema.nullable().default(null),
});
export type SemanticChange = z.infer<typeof semanticChangeSchema>;
/** One entry of the change tour: a file, how much attention it needs, and why. */
export const narrativeFileSchema = z.object({
  path: z.string(),
  role: z.enum(["key", "supporting", "mechanical"]).default("supporting"),
  note: z.string().default(""),
  /** New-side line numbers worth looking at first, if any. */
  lines: z.array(z.number().int().min(1)).default([]),
  /** 1 = skim, 5 = read every line (behaviour, concurrency, auth, migrations, error paths). */
  risk: z.number().int().min(1).max(5).nullable().default(null),
  changes: z.array(semanticChangeSchema).default([]),
});
/** The machine-readable tour an agent appends as a ```json kanban-narrative block. */
export const narrativeReportSchema = z.object({
  version: z.number().int().default(1),
  summary: z.string(),
  readingOrder: z.array(narrativeFileSchema).default([]),
  watchOut: z.array(z.string()).default([]),
});
export type NarrativeReport = z.infer<typeof narrativeReportSchema>;
export const narrativeSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  threadId: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  /** Diff head the tour describes; a different current head marks it stale. */
  headSha: z.string().nullable(),
  report: narrativeReportSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
});
export type Narrative = z.infer<typeof narrativeSchema>;

/** An agent's explanation of one hunk, keyed by the lines it covers on one side of the diff at one head. */
export const hunkExplanationSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  path: z.string(),
  side: z.enum(["old", "new"]),
  startLine: z.number().int(),
  endLine: z.number().int(),
  headSha: z.string().nullable(),
  threadId: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  body: z.string().nullable(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
});
export type HunkExplanation = z.infer<typeof hunkExplanationSchema>;

/** A thread a code review button started; they run hidden, so the changes view lists them. */
export const codeReviewThreadSchema = z.object({
  threadId: z.string(),
  kind: z.enum(["review", "apply", "apply-comments", "narrative", "explain"]),
  label: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  startedAt: z.number(),
});
export type CodeReviewThread = z.infer<typeof codeReviewThreadSchema>;
