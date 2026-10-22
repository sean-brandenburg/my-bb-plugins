// A step's code, cut from the chapter's patches, and the view's annotations cut to those lines. Pure, for the tests.
import { excerptPatch, fileForRef, type NarrativePatchFile, type NarrativeRef } from "../../narrative";
import type { DiffThread } from "../comments/threads";
import type { PlacedFinding } from "../findings/findings";
import type { ComposerAnchor } from "../patch-annotations";
import { patchRows } from "../text/patch-rows";

/** A step's refs to one file, in the order the step first names each file. */
export interface StepExcerpt {
  path: string;
  refs: NarrativeRef[];
  file: NarrativePatchFile | null;
  patch: string | null;
}

export function stepExcerpts(refs: readonly NarrativeRef[], files: readonly NarrativePatchFile[]): StepExcerpt[] {
  // Keyed by the file a ref resolves to, so a renamed file's old and new names make one excerpt.
  const byPath = new Map<string, { file: NarrativePatchFile | null; refs: NarrativeRef[] }>();
  for (const ref of refs) {
    const file = fileForRef(files, ref.path);
    const key = file?.path ?? ref.path;
    byPath.set(key, { file, refs: [...(byPath.get(key)?.refs ?? []), ref] });
  }
  return [...byPath].map(([path, { file, refs: mine }]) => ({ path, refs: mine, file, patch: file?.patch == null ? null : excerptPatch(file.patch, mine) }));
}

/**
 * The file's threads, findings and open comment box that fall on lines the excerpt shows. Pierre is handed only
 * annotations on lines it renders; a comment on a line the step leaves out stays with the files view. File-level
 * threads (and a file-level comment box) belong to every excerpt of the file, as its header is where they live.
 * Whole-file findings are left out: they would repeat under every step that touches the file.
 */
export function excerptAnnotations(
  patch: string,
  threads: readonly DiffThread[],
  findings: readonly PlacedFinding[],
  composer: ComposerAnchor | null,
): { threads: DiffThread[]; findings: PlacedFinding[]; composer: ComposerAnchor | null } {
  const { at } = patchRows(patch);
  const shows = (side: "LEFT" | "RIGHT", line: number) => at.has(`${side}:${line}`);
  return {
    threads: threads.filter((thread) => thread.line === null || shows(thread.side, thread.line)),
    findings: findings.filter((entry) => entry.line !== null && shows("RIGHT", entry.line)),
    composer: composer === null || composer.line === null || shows(composer.side, composer.line) ? composer : null,
  };
}
