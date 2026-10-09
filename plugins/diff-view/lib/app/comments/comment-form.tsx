import { useContext, useState } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { DiffCommentTarget, DiffSide } from "../../types";
import { Button, COMPACT } from "../ui/button";
import { cn } from "../utils";
import { FAST, PRESS, enter } from "../ui/motion";
import { useDiffSource } from "../source";
import { DiffCommentsContext } from "./context";

function CommentTargetToggle({ target, onChange, canPostToGithub, githubAllowed }: { target: DiffCommentTarget; onChange: (target: DiffCommentTarget) => void; canPostToGithub: boolean; githubAllowed: boolean }) {
  const { labels } = useDiffSource();
  if (!canPostToGithub) return null;
  const option = (value: DiffCommentTarget, label: string, title: string, disabled: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={target === value}
      disabled={disabled}
      title={title}
      className={cn("rounded px-1.5 py-0.5 disabled:opacity-40", PRESS, target === value ? "bg-state-active text-foreground" : "text-muted-foreground hover:text-foreground")}
      onClick={() => onChange(value)}
    >
      {label}
    </button>
  );
  return (
    <span role="radiogroup" aria-label="Where this comment goes" className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5 text-[11px]">
      {option("local", "Local", labels.localTarget, false)}
      {option("github", "GitHub PR", githubAllowed ? "Queued as a draft and posted to the pull request when you press Post" : labels.localOnlyThread, !githubAllowed)}
    </span>
  );
}

export function DiffCommentForm({
  path,
  line,
  side,
  defaultTarget,
  githubAllowed = true,
  reply = false,
  onSubmit,
  onCancel,
}: {
  path: string;
  line: number | null;
  side: DiffSide;
  defaultTarget: DiffCommentTarget;
  githubAllowed?: boolean;
  reply?: boolean;
  onSubmit: (body: string, target: DiffCommentTarget) => Promise<void>;
  onCancel: () => void;
}) {
  const { canPostToGithub } = useContext(DiffCommentsContext);
  const { labels } = useDiffSource();
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<DiffCommentTarget>(canPostToGithub && githubAllowed ? defaultTarget : "local");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (body.trim() === "") return;
    setPending(true);
    try {
      await onSubmit(body.trim(), target);
      setBody("");
      onCancel();
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={cn("my-1 flex flex-col gap-2 rounded-md border bg-card p-2.5 text-sm", enter.drop, FAST, target === "github" ? "border-sky-500/50" : "border-primary/40")}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon name="MessageSquare" className="size-3.5" />
        {reply ? <span>Reply</span> : (
          <>
            <span className="truncate font-mono">{path}</span>
            <code>{line === null ? "whole file" : `${side === "LEFT" ? "old " : ""}line ${line}`}</code>
          </>
        )}
        <span className="ml-auto">
          <CommentTargetToggle target={target} onChange={setTarget} canPostToGithub={canPostToGithub} githubAllowed={githubAllowed} />
        </span>
      </div>
      <textarea
        autoFocus
        value={body}
        rows={reply ? 2 : 3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
          if (event.key === "Escape") onCancel();
        }}
        placeholder={target === "github" ? "Comment for the PR (⌘↩ to add, Esc to cancel)" : "What should the agent change here? (⌘↩ to add, Esc to cancel)"}
        aria-label="Comment"
        className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-auto text-[11px] text-muted-foreground">{target === "github" ? "Draft until you post it to the PR" : labels.localHint}</span>
        <Button type="button" variant="ghost" className={COMPACT} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="secondary" className={COMPACT} disabled={pending || body.trim() === ""} onClick={() => void submit()}>
          {target === "github" ? (reply ? "Add reply to drafts" : "Add to GitHub drafts") : reply ? "Reply" : "Add comment"}
        </Button>
      </div>
    </div>
  );
}
