import type { DiffCommentTarget, FindingEdit, LineRange } from "../types";
import type { DiffThread } from "./comments/threads";
import type { InlineFinding, PlacedFinding } from "./findings/findings";

/** Where the new-comment form is open in a file: a line, a range ending at `line`, or (a null line) the whole file. */
export type ComposerAnchor = LineRange & {
  /** The box's text when it opens (a suggestion block for `I`), caret inside the block. */
  initialBody?: string;
};

export const WHOLE_FILE: ComposerAnchor = { line: null, side: "RIGHT", startLine: null, startSide: null };

/** What every renderer of a file's diff draws between its lines: comment threads, the new-comment form, and review findings. */
export interface PatchAnnotationProps {
  path: string;
  threads: DiffThread[];
  composer: ComposerAnchor | null;
  onStartComment: (anchor: ComposerAnchor) => void;
  onCancelComposer: () => void;
  onSubmitComposer: (body: string, target: DiffCommentTarget) => Promise<void>;
  findings: PlacedFinding[];
  onToggleFinding: (item: InlineFinding, selected: boolean) => void;
  onEditFinding: (item: InlineFinding, edit: FindingEdit | null) => Promise<void>;
}
