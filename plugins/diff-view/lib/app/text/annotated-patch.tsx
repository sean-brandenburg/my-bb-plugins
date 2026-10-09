import { useEffect, useMemo, useRef } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { PatchDiff, useWorkerPool } from "@pierre/diffs/react";
import type { DiffSide } from "../../types";
import { useDiffPreferences } from "../state";
import { useHostPierreThemes } from "../theme";
import type { PatchAnnotationProps } from "../patch-annotations";
import { DiffCommentForm } from "../comments/comment-form";
import { FileLevelComments } from "../comments/file-level-comments";
import { DiffThreadView } from "../comments/thread-view";
import { FindingAnnotation } from "../findings/finding-annotation";
import { buildLineAnnotations, toPierreSide, type AnnotationMeta, type PierreSide } from "./line-annotations";

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
  const annotations = useMemo(() => buildLineAnnotations(threads, composer, findings), [threads, composer, findings]);
  // A key already on screen at the last commit that mounts again was shifted to another slot, not added.
  const committedKeys = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    committedKeys.current = new Set(annotations.map((annotation) => annotation.metadata.key));
  }, [annotations]);
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
        renderAnnotation={({ metadata }) => {
          if (metadata.kind === "composer") {
            return <DiffCommentForm key={metadata.key} path={path} line={composer?.line ?? null} side={composer?.side ?? "RIGHT"} defaultTarget={composeTarget} onSubmit={onSubmitComposer} onCancel={onCancelComposer} />;
          }
          if (metadata.kind === "finding") {
            const item = metadata.finding;
            return <FindingAnnotation key={metadata.key} item={item} entrance={!committedKeys.current.has(metadata.key)} onToggle={(selected) => onToggleFinding(item, selected)} onEdit={(edit) => onEditFinding(item, edit)} />;
          }
          return <DiffThreadView key={metadata.key} thread={metadata.thread} />;
        }}
      />
    </>
  );
}
