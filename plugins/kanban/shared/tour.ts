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
/** Lines of one file a narrative step shows; a null `startLine` is the whole file. */
export const narrativeRefSchema = z.object({
  path: z.string(),
  side: z.enum(["old", "new"]).default("new"),
  startLine: z.number().int().min(1).nullable().default(null),
  endLine: z.number().int().min(1).nullable().default(null),
});
/** One stop of the narrative review: what a group of lines does and why, with an optional mermaid diagram in `body`. */
export const narrativeStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().default(""),
  refs: z.array(narrativeRefSchema).default([]),
  /** In a revision chapter: ids of the new narrative's steps this change shows up in. */
  affects: z.array(z.string()).default([]),
});
export type NarrativeStep = z.infer<typeof narrativeStepSchema>;
/** The chapter that walks from the previous narrative to this one: every line that changed between the two heads, and why. */
export const narrativeRevisionChapterSchema = z.object({
  summary: z.string(),
  steps: z.array(narrativeStepSchema).default([]),
});
/** The machine-readable tour an agent appends as a ```json kanban-narrative block. */
export const narrativeReportSchema = z.object({
  version: z.number().int().default(1),
  summary: z.string(),
  readingOrder: z.array(narrativeFileSchema).default([]),
  watchOut: z.array(z.string()).default([]),
  /** Version 2: the exhaustive walk through the diff, every changed line in at least one step. */
  steps: z.array(narrativeStepSchema).default([]),
  revision: narrativeRevisionChapterSchema.nullable().default(null),
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

/** A file's patch as the narrative saw it; null for a binary or oversized file. */
export const narrativePatchFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.string(),
  patch: z.string().nullable(),
});
/** What changed between the previous narrative's head and this one's, restricted to the files either diff touches. */
export const narrativeDeltaSchema = z.object({
  fromHead: z.string().nullable(),
  toHead: z.string().nullable(),
  files: z.array(narrativePatchFileSchema),
  /** Caveats about how the delta was measured (an uncommitted earlier head, say). */
  note: z.string().nullable(),
});
export type NarrativeDelta = z.infer<typeof narrativeDeltaSchema>;
/** One narrative with the diff it was written against, so it can still be read after the head moves. */
export const narrativeRevisionSchema = z.object({
  narrative: narrativeSchema,
  /** PR head sha, or the checkout's HEAD commit for a local card. */
  head: z.string().nullable(),
  /** The checkout had uncommitted changes, so `head` alone does not name the code. */
  dirty: z.boolean(),
  previousId: z.string().nullable(),
  files: z.array(narrativePatchFileSchema),
  delta: narrativeDeltaSchema.nullable(),
});
export type NarrativeRevision = z.infer<typeof narrativeRevisionSchema>;
/** Every narrative of a card that has steps, oldest first, plus whether the diff moved past the newest. */
export const narrativeStorySchema = z.object({
  revisions: z.array(narrativeRevisionSchema),
  running: narrativeSchema.nullable(),
  stale: z.boolean(),
});
export type NarrativeStory = z.infer<typeof narrativeStorySchema>;

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
