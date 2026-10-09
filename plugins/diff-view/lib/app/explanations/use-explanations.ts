import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { HunkExplanation } from "../../types";
import { errorMessage } from "../format";
import type { DiffSource } from "../source";

export type ExplainHunk = (path: string, side: "old" | "new", startLine: number, endLine: number) => void;

/** The source's hunk explanations, if it has any; `explainHunk` is null when it cannot explain. */
export function useExplanations(source: DiffSource, refreshSignal: unknown): { explanations: HunkExplanation[]; explainHunk: ExplainHunk | null } {
  const [explanations, setExplanations] = useState<HunkExplanation[]>([]);
  const loadExplanations = useCallback(() => {
    if (source.explanations === undefined) setExplanations([]);
    else source.explanations.list().then(setExplanations, () => setExplanations([]));
  }, [source]);
  useEffect(loadExplanations, [loadExplanations, refreshSignal]);
  const { explanations: api } = source;
  const explainHunk: ExplainHunk | null =
    api === undefined
      ? null
      : (path, side, startLine, endLine) => {
          api.explain(path, side, startLine, endLine).then(
            (explanation) => setExplanations((current) => [...current.filter((entry) => entry.id !== explanation.id), explanation]),
            (cause: unknown) => toast.error(errorMessage(cause)),
          );
        };
  return { explanations, explainHunk };
}
