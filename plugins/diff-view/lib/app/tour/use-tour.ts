import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { TourState } from "../../types";
import { errorMessage } from "../format";
import type { DiffSource } from "../source";

/** The source's tour, if it has one, and starting a new one. */
export function useTour(source: DiffSource, refreshSignal: unknown) {
  const [tour, setTour] = useState<TourState | null>(null);
  const [busy, setBusy] = useState(false);
  const loadTour = useCallback(() => {
    if (source.tour === undefined) setTour(null);
    else source.tour.get().then(setTour, () => setTour(null));
  }, [source]);
  useEffect(loadTour, [loadTour, refreshSignal]);
  const generate = async () => {
    if (source.tour === undefined) return;
    setBusy(true);
    try {
      const narrative = await source.tour.generate();
      setTour({ narrative, stale: false });
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return { tour, busy, generate };
}
