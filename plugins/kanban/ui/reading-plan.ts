import type { ReadingPlan, PlanFile } from "../shared/reading-plan";
import type { NarrativeStep, NarrativeStory } from "../shared/tour";

/** The step the plan adds for what it leaves out, so the stepper says what it skipped rather than hiding it. */
export const OUTSIDE_PLAN_STEP_ID = "__outside-plan";

const ROLE_LABEL: Record<PlanFile["role"], string> = { key: "Key", supporting: "Supporting", mechanical: "Mechanical" };

function outsidePlanStep(skipped: readonly PlanFile[]): NarrativeStep | null {
  if (skipped.length === 0) return null;
  const roles = (["supporting", "mechanical"] as const).map((role) => [role, skipped.filter((file) => file.role === role)] as const).filter(([, files]) => files.length > 0);
  const body = roles.map(([role, files]) => `**${ROLE_LABEL[role]}** (${files.length}): ${files.map((file) => `\`${file.path}\``).join(", ")}`).join("\n\n");
  return { id: OUTSIDE_PLAN_STEP_ID, title: `Outside the reading plan: ${skipped.length} file${skipped.length === 1 ? "" : "s"}, collapsed`, body, refs: [], affects: [] };
}

/**
 * The story cut down to the plan's files. Their patches go too, so the stepper's "Not narrated" step doesn't bring the
 * skipped files' lines back; a step keeps only its refs into plan files, and goes when it has none left.
 */
export function planStory(story: NarrativeStory, plan: ReadingPlan): NarrativeStory {
  const inPlan = new Set(plan.files.map((file) => file.path));
  const keepFile = (file: { path: string; previousPath: string | null }) => inPlan.has(file.path) || (file.previousPath !== null && inPlan.has(file.previousPath));
  const cut = <T extends { path: string; previousPath: string | null }>(files: readonly T[]) => {
    const kept = files.filter(keepFile);
    return { kept, paths: new Set(kept.flatMap((file) => (file.previousPath === null ? [file.path] : [file.path, file.previousPath]))) };
  };
  const steps = (list: readonly NarrativeStep[], paths: ReadonlySet<string>) =>
    list.flatMap((step) => {
      if (step.refs.length === 0) return [step];
      const refs = step.refs.filter((ref) => paths.has(ref.path));
      return refs.length === 0 ? [] : [{ ...step, refs }];
    });
  const outside = outsidePlanStep(plan.skipped);
  return {
    ...story,
    revisions: story.revisions.map((revision) => {
      const report = revision.narrative.report;
      const files = cut(revision.files);
      const delta = revision.delta === null ? null : cut(revision.delta.files);
      return {
        ...revision,
        files: files.kept,
        delta: revision.delta === null ? null : { ...revision.delta, files: delta!.kept },
        narrative: {
          ...revision.narrative,
          report:
            report === null
              ? null
              : {
                  ...report,
                  steps: [...steps(report.steps, files.paths), ...(outside === null ? [] : [outside])],
                  revision: report.revision === null ? null : { ...report.revision, steps: steps(report.revision.steps, delta?.paths ?? new Set()) },
                },
        },
      };
    }),
  };
}

/** The changes page's sub-path for a card, in the plan's stepper or the whole diff. */
export function diffSubPath(ticketId: string, plan: boolean): string {
  return `diff/${ticketId}${plan ? "/plan" : ""}`;
}
