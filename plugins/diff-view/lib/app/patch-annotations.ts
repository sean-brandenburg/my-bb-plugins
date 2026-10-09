import type { DiffCommentTarget, DiffSide, FindingEdit } from "../types";
import type { DiffThread } from "./comments/threads";
import type { InlineFinding, PlacedFinding } from "./findings/findings";

/** Where the new-comment form is open in a file; a null line is the whole file. */
export interface ComposerAnchor {
  line: number | null;
  side: DiffSide;
}

/** What every renderer of a file's diff draws between its lines: comment threads, the new-comment form, and review findings. */
export interface PatchAnnotationProps {
  path: string;
  threads: DiffThread[];
  composer: ComposerAnchor | null;
  composeTarget: DiffCommentTarget;
  onStartComment: (line: number | null, side: DiffSide) => void;
  onCancelComposer: () => void;
  onSubmitComposer: (body: string, target: DiffCommentTarget) => Promise<void>;
  findings: PlacedFinding[];
  onToggleFinding: (item: InlineFinding, selected: boolean) => void;
  onEditFinding: (item: InlineFinding, edit: FindingEdit | null) => Promise<void>;
}
