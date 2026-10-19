import { z } from "zod";
import { attentionLevelSchema, classifiedFileSchema, type AttentionLevel, type ClassifiedFile } from "./loop";
import type { NarrativeReport } from "./tour";

export type FileRole = ClassifiedFile["role"];

export const planFileSchema = z.object({
  path: z.string(),
  role: classifiedFileSchema.shape.role,
  risk: z.number().int().nullable(),
  note: z.string(),
  viewed: z.boolean(),
});
export type PlanFile = z.infer<typeof planFileSchema>;

/** What the handoff brief asks the user to read at the card's attention level. */
export const readingPlanSchema = z.object({
  level: attentionLevelSchema.nullable(),
  /** Where the files' roles come from: the narrative's reading order, else the classify pass. */
  source: z.enum(["narrative", "classify"]).nullable(),
  /** The files to read, in reading order: none at Glance, key files at Read, key and supporting at Scrutinize. */
  files: z.array(planFileSchema),
  /** The rest of the diff, collapsed: every mechanical file, and the supporting ones below Scrutinize. */
  skipped: z.array(planFileSchema),
  /** Accept waits until every plan file is marked viewed. */
  gated: z.boolean(),
  unviewed: z.array(z.string()),
  /** A narrative with steps exists, so the plan opens in its stepper. */
  narrated: z.boolean(),
});
export type ReadingPlan = z.infer<typeof readingPlanSchema>;

const READ_ROLES: Record<AttentionLevel, ReadonlySet<FileRole>> = {
  glance: new Set(),
  read: new Set(["key"]),
  scrutinize: new Set(["key", "supporting"]),
};

/**
 * The plan over the current diff's files, so a file a later round reverted can't hold Accept back. A file neither the
 * narrative nor the classify pass scored, such as one a fix round added, counts as supporting.
 */
export function readingPlan({
  level,
  diffPaths,
  narrative,
  classified,
  viewed,
}: {
  level: AttentionLevel | null;
  diffPaths: readonly string[];
  narrative: NarrativeReport | null;
  classified: readonly ClassifiedFile[] | null;
  viewed: ReadonlySet<string>;
}): ReadingPlan {
  const inDiff = new Set(diffPaths);
  const order = narrative?.readingOrder.filter((entry) => inDiff.has(entry.path)) ?? [];
  const scored = [...(classified ?? [])].filter((entry) => inDiff.has(entry.path)).sort((a, b) => b.risk - a.risk);
  const byPath = new Map<string, PlanFile>();
  for (const entry of [...order, ...scored]) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, { path: entry.path, role: entry.role, risk: entry.risk, note: entry.note, viewed: viewed.has(entry.path) });
  }
  for (const path of diffPaths) if (!byPath.has(path)) byPath.set(path, { path, role: "supporting", risk: null, note: "", viewed: viewed.has(path) });
  const all = [...byPath.values()];
  const roles = level === null ? READ_ROLES.scrutinize : READ_ROLES[level];
  const files = all.filter((file) => roles.has(file.role));
  return {
    level,
    source: order.length > 0 ? "narrative" : scored.length > 0 ? "classify" : null,
    files,
    skipped: all.filter((file) => !roles.has(file.role)),
    gated: level === "scrutinize",
    unviewed: files.filter((file) => !file.viewed).map((file) => file.path),
    narrated: (narrative?.steps.length ?? 0) > 0,
  };
}
