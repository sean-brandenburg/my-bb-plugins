import { useCallback, useEffect, useState } from "react";
import type { NarrativeStory } from "../../types";
import type { DiffSource } from "../source";

/** The source's narrative story, refetched with the view's refresh signal; null until loaded or when the source has none. */
export function useNarrativeStory(source: DiffSource, refreshSignal: unknown, enabled: boolean) {
  const [story, setStory] = useState<NarrativeStory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    const fetchStory = source.tour?.story;
    if (fetchStory === undefined || !enabled) return;
    fetchStory().then(
      (next) => {
        setStory(next);
        setError(null);
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [source, enabled]);
  useEffect(load, [load, refreshSignal]);
  return { story, error, reload: load };
}
