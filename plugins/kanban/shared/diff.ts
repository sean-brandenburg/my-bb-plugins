import { z } from "zod";

export const diffSideSchema = z.enum(["LEFT", "RIGHT"]);

/** What changed between the head the reviewer last looked at and the current one. */
export const diffDeltaSchema = z.object({
  fromSha: z.string(),
  toSha: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      status: z.string(),
      additions: z.number().int(),
      deletions: z.number().int(),
      /** New-side line ranges touched since `fromSha`. */
      ranges: z.array(z.tuple([z.number().int(), z.number().int()])),
    }),
  ),
});
export type DiffDelta = z.infer<typeof diffDeltaSchema>;

export const diffFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  /** Unified patch for this one file; null for binary or oversized files. */
  patch: z.string().nullable(),
  /** Under a vendored tree (vendor/, node_modules/, third_party/, …): never given a structural diff. */
  vendored: z.boolean(),
});
export type DiffFile = z.infer<typeof diffFileSchema>;

export const ticketDiffSchema = z.object({
  source: z.enum(["pr", "environment", "none"]),
  files: z.array(diffFileSchema),
  /** What the diff was taken against: the PR base branch or the environment's merge base. */
  baseRef: z.string().nullable(),
  baseSha: z.string().nullable(),
  headSha: z.string().nullable(),
  truncated: z.boolean(),
  message: z.string().nullable(),
  fetchedAt: z.number(),
  /** Vendored files left out of `files` by the "Hide vendored files" setting; null when nothing was hidden. */
  hiddenVendored: z.object({ files: z.number().int(), additions: z.number().int(), deletions: z.number().int() }).nullable(),
});
export type TicketDiff = z.infer<typeof ticketDiffSchema>;

/** difftastic's JSON output, trimmed to what the viewer renders. Line numbers are 1-based here. */
export const structuralChangeSchema = z.object({
  start: z.number().int(),
  end: z.number().int(),
  highlight: z.string(),
});
export const structuralLineSchema = z.object({
  line: z.number().int(),
  changes: z.array(structuralChangeSchema),
});
export const structuralDiffSchema = z.object({
  available: z.boolean(),
  /** Why the structural diff is unavailable: difftastic missing, binary file, parse failure. */
  reason: z.string().nullable(),
  language: z.string().nullable(),
  status: z.enum(["unchanged", "changed", "created", "deleted"]).nullable(),
  oldText: z.string(),
  newText: z.string(),
  /** Every row of the side-by-side view, old and new line numbers; a null side is a blank cell. Covers the whole file. */
  aligned: z.array(z.tuple([z.number().int().nullable(), z.number().int().nullable()])),
  /** Changed spans per side, keyed by line; lines absent here are unchanged. */
  oldChanges: z.array(structuralLineSchema),
  newChanges: z.array(structuralLineSchema),
});
export type StructuralDiff = z.infer<typeof structuralDiffSchema>;

export const symbolDefinitionSchema = z.object({
  path: z.string(),
  line: z.number().int().nullable(),
  snippet: z.string(),
  /** Source around the definition for an inline peek: `lines[0]` is line `startLine`. Null when only GitHub search was available. */
  context: z.object({ startLine: z.number().int(), lines: z.array(z.string()) }).nullable().default(null),
});
export const symbolLookupSchema = z.object({
  symbol: z.string(),
  definitions: z.array(symbolDefinitionSchema),
  /** How to open a result: a bb environment (file preview at the line) or a GitHub blob URL base. */
  open: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("environment"), environmentId: z.string() }),
    z.object({ kind: z.literal("github"), repo: z.string(), sha: z.string() }),
    z.object({ kind: z.literal("none") }),
  ]),
  searched: z.enum(["workspace", "github", "none"]),
});
export type SymbolLookup = z.infer<typeof symbolLookupSchema>;
export const symbolUsagesSchema = z.object({
  symbol: z.string(),
  usages: z.array(z.object({ path: z.string(), line: z.number().int(), snippet: z.string() })),
  open: symbolLookupSchema.shape.open,
  searched: z.enum(["workspace", "none"]),
  truncated: z.boolean(),
});
export type SymbolUsages = z.infer<typeof symbolUsagesSchema>;
