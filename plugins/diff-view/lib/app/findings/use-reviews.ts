import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { FindingEdit, Review } from "../../types";
import { errorMessage } from "../format";
import type { DiffSource } from "../source";
import type { InlineFinding } from "./findings";

/** The source's reviews, if it has any, and the selection and rewording of their findings. */
export function useReviews(source: DiffSource, refreshSignal: unknown) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const loadReviews = useCallback(() => {
    if (source.reviews === undefined) setReviews([]);
    else source.reviews.list().then(setReviews, () => setReviews([]));
  }, [source]);
  useEffect(loadReviews, [loadReviews, refreshSignal]);
  const replaceReview = (updated: Review) => setReviews((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
  const toggleFinding = (item: InlineFinding, selected: boolean) => {
    source.reviews?.setSelection(item.reviewId, item.finding.id, selected).then(replaceReview, (cause: unknown) => toast.error(errorMessage(cause)));
  };
  const editFinding = async (item: InlineFinding, edit: FindingEdit | null) => {
    if (source.reviews === undefined) return;
    try {
      replaceReview(await source.reviews.editFinding(item.reviewId, item.finding.id, edit));
    } catch (cause) {
      toast.error(errorMessage(cause));
      throw cause;
    }
  };
  return { reviews, toggleFinding, editFinding };
}
