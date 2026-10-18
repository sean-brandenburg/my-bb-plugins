import { experimental_Diff as Diff } from "@get-bb/plugin-sdk/app";
import { excerptPatch, refLabel, type NarrativePatchFile, type NarrativeRef } from "../../narrative";
import { cn } from "../utils";
import { useDiffPreferences } from "../state";
import { PRESS } from "../ui/motion";

/** A step's refs to one file, in the order the step first names each file. */
export interface StepExcerpt {
  path: string;
  refs: NarrativeRef[];
  file: NarrativePatchFile | null;
  patch: string | null;
}

export function stepExcerpts(refs: readonly NarrativeRef[], files: readonly NarrativePatchFile[]): StepExcerpt[] {
  const byPath = new Map<string, NarrativeRef[]>();
  for (const ref of refs) byPath.set(ref.path, [...(byPath.get(ref.path) ?? []), ref]);
  return [...byPath].map(([path, mine]) => {
    const file = files.find((entry) => entry.path === path || entry.previousPath === path) ?? null;
    return { path: file?.path ?? path, refs: mine, file, patch: file?.patch == null ? null : excerptPatch(file.patch, mine) };
  });
}

/** Each excerpt as a header that opens the lines in the files view, over just those lines of the patch. */
export function StepExcerpts({ excerpts, focused, onOpen }: { excerpts: StepExcerpt[]; focused: number; onOpen: (excerpt: StepExcerpt) => void }) {
  const { layout } = useDiffPreferences();
  return (
    <div className="flex flex-col gap-3">
      {excerpts.map((excerpt, index) => (
        <section
          key={excerpt.path}
          data-narrative-excerpt={index}
          className={cn("overflow-hidden rounded-md border border-border", index === focused && "ring-1 ring-primary/70")}
        >
          <button
            type="button"
            className={cn("flex w-full items-baseline gap-2 border-b border-border bg-muted/40 px-2 py-1 text-left text-xs hover:bg-state-hover", PRESS)}
            title="Open these lines in the files view (gf)"
            onClick={() => onOpen(excerpt)}
          >
            <code className="min-w-0 truncate">{excerpt.path}</code>
            <span className="shrink-0 text-muted-foreground">{excerpt.refs.map(refLabel).join(", ")}</span>
          </button>
          {excerpt.patch !== null ? (
            <Diff patch={excerpt.patch} path={excerpt.path} view={layout} className="text-xs" />
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {excerpt.file === null ? "This file is not in the diff the narrative was written against." : excerpt.file.patch === null ? "No text diff for this file (binary or too large)." : "These lines are outside the diff's hunks."}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
