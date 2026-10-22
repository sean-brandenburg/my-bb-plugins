import { useContext, useMemo, useState } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { DiffFile, DiffResult } from "../types";
import { errorMessage } from "./format";
import { useDiffSource } from "./source";
import { Button, COMPACT } from "./ui/button";
import { enter } from "./ui/motion";
import { cn } from "./utils";
import { usePublishNavModel, type FileNavModel } from "./keys/review-keys-context";
import { CommitRangeContext } from "./commits/commit-picker";

/** What a truncated diff leaves out, above the diff rather than only as the file tree's small note. */
export function TruncationBanner({ diff }: { diff: DiffResult }) {
  return (
    <p role="status" className={cn("flex items-start gap-2 border-b border-border bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300", enter.fade)}>
      <Icon name="AlertTriangle" className="mt-0.5 size-3.5 shrink-0" />
      <span>{diff.truncatedNote ?? "This diff is truncated; some of its changes are missing."}</span>
    </p>
  );
}

type LoadState = { kind: "idle" } | { kind: "loading" } | { kind: "failed"; message: string } | { kind: "empty" };

/**
 * Stands in for the text diff of a file the diff came without a patch for: binary files say so, and a text file too
 * large for the diff offers to load its patch (the button, or Enter with the cursor on the file).
 */
export function PatchPlaceholder({ file, onLoaded }: { file: DiffFile; onLoaded: (patch: string) => void }) {
  const { source } = useDiffSource();
  const range = useContext(CommitRangeContext);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const loadable = source.loadPatch !== undefined && file.binary !== true && state.kind !== "empty";
  const load = () => {
    if (source.loadPatch === undefined || state.kind === "loading") return;
    setState({ kind: "loading" });
    source.loadPatch(file.path, range).then(
      (patch) => {
        if (patch === null) setState({ kind: "empty" });
        else onLoaded(patch);
      },
      (cause: unknown) => setState({ kind: "failed", message: errorMessage(cause) }),
    );
  };
  const loadRef = useLatest(load);
  // No rows, so the cursor stays on the file's header, where Enter loads the patch.
  const model = useMemo<FileNavModel>(
    () => ({ rows: [], cutToHunk: false, element: () => null, ...(loadable ? { loadPatch: () => loadRef.current() } : {}) }),
    [loadable, loadRef],
  );
  usePublishNavModel(file.path, model);
  if (file.binary === true) return <p className="p-4 text-sm text-muted-foreground">Binary file</p>;
  if (source.loadPatch === undefined) return <p className="p-4 text-sm text-muted-foreground">No text diff for this file (binary or too large).</p>;
  if (state.kind === "empty") return <p className="p-4 text-sm text-muted-foreground">No text changes to show.</p>;
  const changed = file.additions + file.deletions;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-4 text-sm text-muted-foreground">
      <span>This file's diff is too large to show up front.</span>
      <span title="Enter on the file header does the same">
        <Button type="button" variant="outline" className={COMPACT} disabled={state.kind === "loading"} onClick={load}>
          {state.kind === "loading" ? "Loading diff…" : changed > 0 ? `Load diff (${changed.toLocaleString()} lines changed)` : "Load diff"}
        </Button>
      </span>
      {state.kind === "failed" ? <span className="text-destructive">{state.message}</span> : null}
    </div>
  );
}

function useLatest<T>(value: T): { readonly current: T } {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}
