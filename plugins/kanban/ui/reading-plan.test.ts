import { describe, expect, it } from "vitest";
import { readingPlan } from "../shared/reading-plan";
import { narrativeReportSchema, type NarrativeStory } from "../shared/tour";
import { OUTSIDE_PLAN_STEP_ID, planStory } from "./reading-plan";

const classified = [
  { path: "src/auth.ts", risk: 5, role: "key" as const, lines: 40, note: "token refresh" },
  { path: "src/client.ts", risk: 3, role: "supporting" as const, lines: 20, note: "" },
  { path: "pnpm-lock.yaml", risk: 1, role: "mechanical" as const, lines: 300, note: "" },
  { path: "src/removed.ts", risk: 4, role: "key" as const, lines: 5, note: "" },
];
const diffPaths = ["src/auth.ts", "src/client.ts", "pnpm-lock.yaml", "src/new.ts"];
const plan = (level: "glance" | "read" | "scrutinize", viewed: string[] = [], narrative: Parameters<typeof readingPlan>[0]["narrative"] = null) =>
  readingPlan({ level, diffPaths, narrative, classified, viewed: new Set(viewed) });

describe("readingPlan", () => {
  it("reads nothing at Glance, key files at Read, key and supporting at Scrutinize, mechanical never", () => {
    expect(plan("glance").files).toEqual([]);
    expect(plan("read").files.map((file) => file.path)).toEqual(["src/auth.ts"]);
    // A file the classify pass never saw counts as supporting; one no longer in the diff drops out.
    const scrutinize = plan("scrutinize");
    expect(scrutinize.files.map((file) => file.path)).toEqual(["src/auth.ts", "src/client.ts", "src/new.ts"]);
    expect(scrutinize.skipped.map((file) => file.path)).toEqual(["pnpm-lock.yaml"]);
    expect(scrutinize.source).toBe("classify");
  });

  it("gates Accept only at Scrutinize, on the plan files not yet viewed", () => {
    expect(plan("read")).toMatchObject({ gated: false });
    expect(plan("scrutinize", ["src/auth.ts", "pnpm-lock.yaml"])).toMatchObject({ gated: true, unviewed: ["src/client.ts", "src/new.ts"] });
  });

  it("takes roles and order from the narrative's reading order over the classify pass", () => {
    const narrative = narrativeReportSchema.parse({ summary: "", readingOrder: [{ path: "src/client.ts", role: "key", risk: 4 }], steps: [{ id: "s1", title: "Client", refs: [{ path: "src/client.ts" }] }] });
    const read = plan("read", [], narrative);
    expect(read).toMatchObject({ source: "narrative", narrated: true });
    expect(read.files.map((file) => file.path)).toEqual(["src/client.ts", "src/auth.ts"]);
  });
});

describe("planStory", () => {
  it("keeps the plan files' steps, refs and patches, and collapses the rest into one step", () => {
    const report = narrativeReportSchema.parse({
      summary: "",
      steps: [
        { id: "auth", title: "Auth", refs: [{ path: "src/auth.ts" }, { path: "src/client.ts" }] },
        { id: "lock", title: "Lockfile", refs: [{ path: "pnpm-lock.yaml" }] },
        { id: "intro", title: "Why", refs: [] },
      ],
    });
    const story: NarrativeStory = {
      running: null,
      stale: false,
      revisions: [
        {
          narrative: { id: "n1", ticketId: "t1", threadId: "th1", status: "completed", headSha: null, report, error: null, createdAt: 0, completedAt: 0 },
          head: null,
          dirty: false,
          previousId: null,
          delta: null,
          files: diffPaths.map((path) => ({ path, previousPath: null, status: "modified", patch: "@@ -1 +1 @@\n-a\n+b\n" })),
        },
      ],
    };
    const cut = planStory(story, plan("read"));
    const revision = cut.revisions[0]!;
    expect(revision.files.map((file) => file.path)).toEqual(["src/auth.ts"]);
    expect(revision.narrative.report!.steps.map((step) => step.id)).toEqual(["auth", "intro", OUTSIDE_PLAN_STEP_ID]);
    expect(revision.narrative.report!.steps[0]!.refs.map((ref) => ref.path)).toEqual(["src/auth.ts"]);
    expect(revision.narrative.report!.steps.at(-1)!.body).toContain("pnpm-lock.yaml");
  });
});
