import type { RefObject } from "react";
import { experimental_Diff as Diff, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { DiffFile, HunkExplanation, SemanticChange, SymbolLookup } from "../types";
import { Badge } from "./ui/badge";
import { Button, COMPACT } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { cn } from "./utils";
import { useDiffPreferences } from "./state";
import { isGeneratedFile } from "./generated";
import { LazyMount } from "./lazy-mount";
import type { PatchAnnotationProps } from "./patch-annotations";
import { FileLevelComments } from "./comments/file-level-comments";
import { FindingAnnotation } from "./findings/finding-annotation";
import { StructuralPatch } from "./structural/structural-patch";
import { AnnotatedPatch } from "./text/annotated-patch";
import { DiffErrorBoundary } from "./text/diff-error-boundary";

/**
 * One changed file: a sticky header (collapse, name, stats, comment on file, viewed) over its whole-file findings and
 * its diff, mounted once scrolled near. Vendored files and files without a structural diff fall back to text.
 */
export function FileSection({
  file,
  sectionRef,
  scrollRoot,
  collapsed,
  viewed,
  onToggleCollapsed,
  onMarkViewed,
  onCommentOnFile,
  annotations,
  onOpenFile,
  explanations,
  onExplain,
  semantics,
  changedRanges,
}: {
  file: DiffFile;
  sectionRef: (node: HTMLElement | null) => void;
  scrollRoot: RefObject<HTMLElement | null>;
  collapsed: boolean;
  viewed: boolean;
  onToggleCollapsed: () => void;
  onMarkViewed: (viewed: boolean) => void;
  onCommentOnFile: () => void;
  annotations: PatchAnnotationProps;
  onOpenFile: (lookup: SymbolLookup, definition: SymbolLookup["definitions"][number]) => void;
  explanations: HunkExplanation[];
  onExplain: ((side: "old" | "new", startLine: number, endLine: number) => void) | null;
  semantics: SemanticChange[];
  changedRanges: Array<[number, number]>;
}) {
  const { layout, mode } = useDiffPreferences();
  return (
    <section ref={sectionRef} className="border-b border-border">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <Button type="button" variant="ghost" className={cn(COMPACT, "px-1.5")} onClick={onToggleCollapsed} aria-label={collapsed ? "Expand file" : "Collapse file"} aria-expanded={!collapsed}>
          <Icon name="ChevronDown" className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} />
        </Button>
        <code className="min-w-0 flex-1 truncate text-xs">
          {file.previousPath !== null ? `${file.previousPath} → ` : ""}
          {file.path}
        </code>
        {file.status !== "modified" ? <Badge>{file.status}</Badge> : null}
        {isGeneratedFile(file) ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground" title={file.vendored ? "Vendored; collapsed by default and shown as a text diff" : "Looks generated; collapsed by default"}>
            {file.vendored ? "vendored" : "generated"}
          </span>
        ) : null}
        <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
        <span className="text-xs tabular-nums text-red-600 dark:text-red-400">−{file.deletions}</span>
        <Button type="button" variant="secondary" className={COMPACT} onClick={onCommentOnFile}>
          <Icon name="MessageSquare" className="size-3.5" />
          Comment on file
        </Button>
        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={viewed} onCheckedChange={onMarkViewed} aria-label={`Mark ${file.path} as viewed`} />
          Viewed
        </label>
      </div>
      {collapsed
        ? null
        : annotations.findings
            .filter((entry) => entry.line === null)
            .map((entry) => (
              <div key={entry.item.finding.id} className="px-3">
                <FindingAnnotation item={entry.item} onToggle={(selected) => annotations.onToggleFinding(entry.item, selected)} onEdit={(edit) => annotations.onEditFinding(entry.item, edit)} />
              </div>
            ))}
      {collapsed ? null : (
        <LazyMount root={scrollRoot} estimateLines={file.additions + file.deletions + 6}>
          {() =>
            file.patch !== null && mode === "structural" && !file.vendored ? (
              <StructuralPatch
                key={`structural-${file.path}`}
                {...annotations}
                onOpenFile={onOpenFile}
                explanations={explanations}
                onExplain={onExplain}
                semantics={semantics}
                changedRanges={changedRanges}
              />
            ) : file.patch !== null ? (
              <DiffErrorBoundary key={file.path} fallback={<Diff patch={file.patch} path={file.path} view={layout} className="text-xs" />}>
                <AnnotatedPatch key={file.path} {...annotations} patch={file.patch} />
              </DiffErrorBoundary>
            ) : (
              <>
                <FileLevelComments
                  path={file.path}
                  threads={annotations.threads}
                  composing={annotations.composer !== null}
                  composeTarget={annotations.composeTarget}
                  onSubmit={annotations.onSubmitComposer}
                  onCancel={annotations.onCancelComposer}
                />
                <p className="p-4 text-sm text-muted-foreground">No text diff for this file (binary or too large).</p>
              </>
            )
          }
        </LazyMount>
      )}
    </section>
  );
}
