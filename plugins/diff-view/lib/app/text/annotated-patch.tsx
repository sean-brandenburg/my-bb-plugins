import { useMemo } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { PatchDiff, useWorkerPool } from "@pierre/diffs/react";
import type { DiffLineAnnotation } from "@pierre/diffs/react";
import type { DiffSide } from "../../types";
import { useDiffPreferences } from "../state";
import { useHostPierreThemes } from "../theme";
import type { PatchAnnotationProps } from "../patch-annotations";
import { DiffCommentForm } from "../comments/comment-form";
import { FileLevelComments } from "../comments/file-level-comments";
import { DiffThreadView } from "../comments/thread-view";
import type { DiffThread } from "../comments/threads";
import { FindingAnnotation } from "../findings/finding-annotation";
import type { InlineFinding } from "../findings/findings";

type AnnotationMeta = { kind: "thread"; thread: DiffThread } | { kind: "composer" } | { kind: "finding"; finding: InlineFinding };
type PierreSide = "deletions" | "additions";

function toPierreSide(side: DiffSide): PierreSide {
  return side === "LEFT" ? "deletions" : "additions";
}

function fromPierreSide(side: PierreSide): DiffSide {
  return side === "deletions" ? "LEFT" : "RIGHT";
}

/**
 * Pierre's diff renderer used directly (the host's Diff wrapper exposes no line
 * events): a "+" gutter button on hover starts a comment on that line, and
 * comments render inline as line annotations.
 */
export function AnnotatedPatch({
  path,
  patch,
  findings,
  onToggleFinding,
  onEditFinding,
  threads,
  composer,
  composeTarget,
  onStartComment,
  onCancelComposer,
  onSubmitComposer,
}: PatchAnnotationProps & { patch: string }) {
  const { layout, wrap } = useDiffPreferences();
  const { mode: themeMode } = useCodeTheme();
  const themes = useHostPierreThemes();
  const workerPool = useWorkerPool();
  // GitHub patches lack the `diff --git` header Pierre expects; synthesize one for the file.
  const fullPatch = useMemo(
    () => (patch.startsWith("diff --git") ? patch : `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch}`),
    [patch, path],
  );
  const annotations = useMemo<DiffLineAnnotation<AnnotationMeta>[]>(() => {
    const list: DiffLineAnnotation<AnnotationMeta>[] = threads
      .filter((thread): thread is DiffThread & { line: number } => thread.line !== null)
      .map((thread) => ({ side: toPierreSide(thread.side), lineNumber: thread.line, metadata: { kind: "thread", thread } }));
    if (composer !== null && composer.line !== null) {
      list.push({ side: toPierreSide(composer.side), lineNumber: composer.line, metadata: { kind: "composer" } });
    }
    for (const entry of findings) {
      if (entry.line !== null) list.push({ side: "additions", lineNumber: entry.line, metadata: { kind: "finding", finding: entry.item } });
    }
    return list;
  }, [threads, composer, findings]);
  const selected = composer !== null && composer.line !== null ? { start: composer.line, end: composer.line, side: toPierreSide(composer.side), endSide: toPierreSide(composer.side) } : undefined;
  const options = useMemo(
    () => ({
      diffStyle: layout,
      theme: themes,
      themeType: themeMode,
      disableFileHeader: true,
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      lineHoverHighlight: "both" as const,
      enableGutterUtility: true,
      onGutterUtilityClick: (range: { start: number; side?: PierreSide }) => onStartComment(range.start, fromPierreSide(range.side ?? "additions")),
      onLineNumberClick: (props: { lineNumber: number; annotationSide: PierreSide }) => onStartComment(props.lineNumber, fromPierreSide(props.annotationSide)),
    }),
    [layout, themes, themeMode, wrap, onStartComment],
  );
  return (
    <>
      <FileLevelComments
        path={path}
        threads={threads.filter((thread) => thread.line === null)}
        composing={composer !== null && composer.line === null}
        composeTarget={composeTarget}
        onSubmit={onSubmitComposer}
        onCancel={onCancelComposer}
      />
      <PatchDiff<AnnotationMeta>
        patch={fullPatch}
        options={options}
        lineAnnotations={annotations}
        {...(selected === undefined ? {} : { selectedLines: selected })}
        disableWorkerPool={workerPool === undefined}
        className="text-xs"
        renderAnnotation={(annotation) => {
          if (annotation.metadata.kind === "composer") {
            return <DiffCommentForm path={path} line={composer?.line ?? null} side={composer?.side ?? "RIGHT"} defaultTarget={composeTarget} onSubmit={onSubmitComposer} onCancel={onCancelComposer} />;
          }
          if (annotation.metadata.kind === "finding") {
            const item = annotation.metadata.finding;
            return <FindingAnnotation item={item} onToggle={(selected) => onToggleFinding(item, selected)} onEdit={(edit) => onEditFinding(item, edit)} />;
          }
          return <DiffThreadView thread={annotation.metadata.thread} />;
        }}
      />
    </>
  );
}
