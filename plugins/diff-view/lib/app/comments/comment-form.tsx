import { useContext, useEffect, useRef, useState } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { DiffCommentTarget } from "../../types";
import { longLineLabel } from "../../line-range";
import { suggestionBlock, suggestionCaret, suggestionLines } from "../../suggestions";
import { Button, COMPACT } from "../ui/button";
import { cn } from "../utils";
import { FAST, enter } from "../ui/motion";
import { useDiffSource } from "../source";
import type { ComposerAnchor } from "../patch-annotations";
import { SuggestionsContext } from "../suggestions/context";
import { DiffCommentsContext } from "./context";
import { returnToDiff } from "../keys/review-keys-context";

/** ⌘⇧S (Ctrl-Shift-S off a Mac) in a comment box inserts a suggestion block. */
function isSuggestChord(event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; key: string }): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "s";
}

export function DiffCommentForm({
  path,
  range,
  githubAllowed = true,
  reply = false,
  onSubmit,
  onCancel,
}: {
  path: string;
  range: ComposerAnchor;
  /** False where GitHub cannot take the comment (a reply in a local-only thread); it then stays local whatever the view's target. */
  githubAllowed?: boolean;
  reply?: boolean;
  onSubmit: (body: string, target: DiffCommentTarget) => Promise<void>;
  onCancel: () => void;
}) {
  const { canPostToGithub, target: viewTarget } = useContext(DiffCommentsContext);
  const { linesAt } = useContext(SuggestionsContext);
  const { labels } = useDiffSource();
  const [body, setBody] = useState(range.initialBody ?? "");
  const target: DiffCommentTarget = canPostToGithub && githubAllowed && viewTarget === "github" ? "github" : "local";
  const [pending, setPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Where the caret goes once the box has focus; the view focuses it a beat after it mounts.
  const caret = useRef<number | null>(range.initialBody === undefined ? null : suggestionCaret(range.initialBody));
  const placeCaret = () => {
    const box = textareaRef.current;
    if (box === null || caret.current === null) return;
    box.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  };
  // `I` again on an open, empty box (a new composer anchor) refills it for the new lines.
  const seeded = useRef(range);
  useEffect(() => {
    if (range === seeded.current) return;
    seeded.current = range;
    if (range.initialBody === undefined) return;
    setBody(range.initialBody);
    caret.current = suggestionCaret(range.initialBody);
  }, [range]);
  useEffect(() => {
    if (document.activeElement === textareaRef.current) placeCaret();
  });
  const lines = suggestionLines(range);
  const suggestable = lines === null ? null : linesAt(path, lines.startLine, lines.endLine);
  const insertSuggestion = () => {
    const box = textareaRef.current;
    if (suggestable === null || box === null) return;
    const block = suggestionBlock(suggestable);
    const at = box.selectionStart ?? body.length;
    const before = body.slice(0, at);
    const lead = before === "" || before.endsWith("\n") ? "" : "\n";
    const next = `${before}${lead}${block}\n${body.slice(box.selectionEnd ?? at)}`;
    setBody(next);
    caret.current = before.length + lead.length + suggestionCaret(block);
    box.focus();
  };
  const submit = async () => {
    if (body.trim() === "") return;
    setPending(true);
    try {
      await onSubmit(body.trim(), target);
      setBody("");
      returnToDiff(textareaRef.current);
      onCancel();
    } finally {
      setPending(false);
    }
  };
  return (
    <div data-comment-form={reply ? "reply" : "new"} data-escape-cancels="empty" className={cn("my-1 flex min-w-0 max-w-full flex-col gap-2 rounded-md border bg-card p-2.5 text-sm", enter.drop, FAST, target === "github" ? "border-sky-500/50" : "border-primary/40")}>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Icon name="MessageSquare" className="size-3.5" />
        {reply ? <span>Reply</span> : (
          <>
            <span className="truncate font-mono">{path}</span>
            <code>{longLineLabel(range) ?? "whole file"}</code>
          </>
        )}
        {canPostToGithub ? <span className={cn("ml-auto shrink-0", target === "github" && "text-sky-700 dark:text-sky-300")}>{target === "github" ? "GitHub PR" : "Local"}</span> : null}
      </div>
      <textarea
        ref={textareaRef}
        autoFocus
        value={body}
        rows={Math.min(12, Math.max(reply ? 2 : 3, body.split("\n").length + 1))}
        onChange={(event) => setBody(event.target.value)}
        onFocus={placeCaret}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
          else if (isSuggestChord(event) && suggestable !== null) {
            event.preventDefault();
            event.stopPropagation();
            insertSuggestion();
          }
        }}
        placeholder={target === "github" ? "Comment for the PR (⌘↩ to add, Esc to cancel)" : "What should the agent change here? (⌘↩ to add, Esc to cancel)"}
        aria-label="Comment"
        className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="mr-auto min-w-0 text-[11px] text-muted-foreground">{target === "github" ? "Draft until you post it to the PR" : viewTarget === "github" && canPostToGithub ? labels.localOnlyThread : labels.localHint}</span>
        {suggestable !== null ? (
          <span title="Insert a suggestion block holding these lines, to edit into the change you mean (⌘⇧S)">
            <Button type="button" variant="ghost" className={COMPACT} onClick={insertSuggestion}>
              <Icon name="diff-view-diff" className="size-3.5" />
              Suggest
            </Button>
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className={COMPACT}
          data-escape-cancel=""
          onClick={(event) => {
            returnToDiff(event.currentTarget);
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="button" variant="secondary" className={COMPACT} disabled={pending || body.trim() === ""} onClick={() => void submit()}>
          {target === "github" ? (reply ? "Add reply to drafts" : "Add to GitHub drafts") : reply ? "Reply" : "Add comment"}
        </Button>
      </div>
    </div>
  );
}
