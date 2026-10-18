import { narrativeCoverage, refsForUncovered, type NarrativeCoverage, type NarrativePatchFile } from "../../narrative";
import type { NarrativeStep, NarrativeStory } from "../../types";
import { shortSha } from "../format";

/** The id of the step the view adds for lines the agent's steps skipped. */
export const UNCOVERED_STEP_ID = "__not-narrated";

/**
 * One run of steps read in order: a narrative of the change at one head, or the revision between two heads. Each
 * chapter opens on its summary (step index -1), then its steps.
 */
export interface NarrativeChapter {
  key: string;
  kind: "narrative" | "revision";
  narrativeId: string;
  /** The newest narrative's chapter, which describes the code as it is now unless the story is stale. */
  current: boolean;
  title: string;
  summary: string;
  notes: string[];
  /** The patches the steps' refs point into: the diff at that head, or the delta between two heads. */
  files: NarrativePatchFile[];
  steps: NarrativeStep[];
  coverage: NarrativeCoverage | null;
}

export interface StepAddress {
  chapter: number;
  /** -1 is the chapter's summary page. */
  step: number;
}

function headLabel(head: string | null, dirty: boolean): string {
  if (head === null) return "the working tree";
  return `${shortSha(head)}${dirty ? " + uncommitted" : ""}`;
}

function withUncovered(steps: NarrativeStep[], files: NarrativePatchFile[], what: string): { steps: NarrativeStep[]; coverage: NarrativeCoverage } {
  const coverage = narrativeCoverage(files, steps.flatMap((step) => step.refs));
  if (coverage.uncovered.length === 0) return { steps, coverage };
  const missed = coverage.changedLines - coverage.coveredLines;
  const extra: NarrativeStep = {
    id: UNCOVERED_STEP_ID,
    title: "Not narrated",
    body: `The steps above skip ${missed} changed line${missed === 1 ? "" : "s"} of ${what}. They are here so nothing goes unread.`,
    refs: refsForUncovered(coverage.uncovered),
    affects: [],
  };
  return { steps: [...steps, extra], coverage };
}

/** The story as chapters in reading order: each narrative, preceded by the revision that led to it from the one before. */
export function buildChapters(story: NarrativeStory): NarrativeChapter[] {
  const chapters: NarrativeChapter[] = [];
  const last = story.revisions.length - 1;
  story.revisions.forEach((revision, index) => {
    const report = revision.narrative.report;
    if (report === null) return;
    const previous = index > 0 ? story.revisions[index - 1] : undefined;
    if (report.revision !== null && previous !== undefined) {
      const files = revision.delta?.files ?? [];
      const { steps, coverage } = revision.delta === null ? { steps: report.revision.steps, coverage: null } : withUncovered(report.revision.steps, files, "the delta");
      chapters.push({
        key: `${revision.narrative.id}:revision`,
        kind: "revision",
        narrativeId: revision.narrative.id,
        current: false,
        title: `What changed: ${headLabel(previous.head, previous.dirty)} → ${headLabel(revision.head, revision.dirty)}`,
        summary: report.revision.summary,
        notes: [
          ...(revision.delta === null ? ["The board could not measure the delta between these heads, so these steps show no code."] : []),
          ...(revision.delta?.note == null ? [] : [revision.delta.note]),
        ],
        files,
        steps,
        coverage,
      });
    }
    const { steps, coverage } = withUncovered(report.steps, revision.files, "the diff");
    chapters.push({
      key: `${revision.narrative.id}:narrative`,
      kind: "narrative",
      narrativeId: revision.narrative.id,
      current: index === last,
      title: `${index === last ? "Narrative" : "Earlier narrative"} at ${headLabel(revision.head, revision.dirty)}`,
      summary: report.summary,
      notes: report.watchOut,
      files: revision.files,
      steps,
      coverage,
    });
  });
  return chapters;
}

/** Where to open: the remembered step if it still exists, else the newest revision chapter (the news), else the newest narrative. */
export function initialAddress(chapters: readonly NarrativeChapter[], saved: { chapterKey: string; stepId: string | null } | null): StepAddress | null {
  if (chapters.length === 0) return null;
  if (saved !== null) {
    const chapter = chapters.findIndex((entry) => entry.key === saved.chapterKey);
    if (chapter !== -1) {
      const step = saved.stepId === null ? -1 : chapters[chapter]!.steps.findIndex((entry) => entry.id === saved.stepId);
      return { chapter, step: Math.max(-1, step) };
    }
  }
  const lastIndex = chapters.length - 1;
  const before = chapters[lastIndex - 1];
  if (before?.kind === "revision" && before.narrativeId === chapters[lastIndex]!.narrativeId) return { chapter: lastIndex - 1, step: -1 };
  return { chapter: lastIndex, step: -1 };
}

/** Every page in reading order: each chapter's summary, then its steps. */
export function pages(chapters: readonly NarrativeChapter[]): StepAddress[] {
  return chapters.flatMap((chapter, index) => [{ chapter: index, step: -1 }, ...chapter.steps.map((_, step) => ({ chapter: index, step }))]);
}

export function movePage(chapters: readonly NarrativeChapter[], at: StepAddress, by: number): StepAddress {
  const all = pages(chapters);
  const here = all.findIndex((page) => page.chapter === at.chapter && page.step === at.step);
  return all[Math.max(0, Math.min(all.length - 1, (here === -1 ? 0 : here) + by))] ?? at;
}

export function moveChapter(chapters: readonly NarrativeChapter[], at: StepAddress, by: 1 | -1): StepAddress {
  // Back from inside a chapter goes to its own start first, as [[ does in vim.
  if (by === -1 && at.step > -1) return { chapter: at.chapter, step: -1 };
  return { chapter: Math.max(0, Math.min(chapters.length - 1, at.chapter + by)), step: -1 };
}

/** The current narrative's step a revision step points at with `affects`. */
export function affectedAddress(chapters: readonly NarrativeChapter[], from: StepAddress, stepId: string): StepAddress | null {
  const narrativeId = chapters[from.chapter]?.narrativeId;
  const chapter = chapters.findIndex((entry) => entry.kind === "narrative" && entry.narrativeId === narrativeId);
  if (chapter === -1) return null;
  const step = chapters[chapter]!.steps.findIndex((entry) => entry.id === stepId);
  return step === -1 ? null : { chapter, step };
}

/** Files of a chapter whose every step has been read, for marking them viewed. */
export function narratedFiles(chapter: NarrativeChapter, visited: ReadonlySet<string>): string[] {
  const steps = new Map<string, string[]>();
  for (const step of chapter.steps) for (const ref of step.refs) steps.set(ref.path, [...(steps.get(ref.path) ?? []), step.id]);
  return [...steps].filter(([, ids]) => ids.every((id) => visited.has(id))).map(([path]) => path);
}

/** Steps whose title or body mention the query, in reading order. */
export function searchSteps(chapters: readonly NarrativeChapter[], query: string): StepAddress[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return pages(chapters).filter(({ chapter, step }) => {
    if (step === -1) return false;
    const entry = chapters[chapter]!.steps[step]!;
    return entry.title.toLowerCase().includes(needle) || entry.body.toLowerCase().includes(needle);
  });
}
