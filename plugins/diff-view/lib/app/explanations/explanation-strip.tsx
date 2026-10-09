import { useContext, useState } from "react";
import { Markdown, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { HunkExplanation } from "../../types";
import { cn } from "../utils";
import { DiffCommentsContext } from "../comments/context";

/** An agent's explanation of a hunk, as a collapsible strip under the hunk header. */
export function ExplanationStrip({ explanation }: { explanation: HunkExplanation }) {
  const [open, setOpen] = useState(true);
  const { onOpenThread } = useContext(DiffCommentsContext);
  const firstLine = (explanation.body ?? "").split("\n").find((line) => line.trim() !== "") ?? "";
  return (
    <div className="my-0.5 border-l-2 border-sky-500/60 pl-2 text-sm">
      <div className="flex items-center gap-2 text-xs">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <Icon name="ChevronDown" className={cn("size-3 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span className="shrink-0 text-muted-foreground">explanation</span>
          {!open ? <span className="min-w-0 flex-1 truncate text-foreground">{firstLine}</span> : null}
        </button>
        <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onOpenThread(explanation.threadId)}>
          thread
        </button>
      </div>
      {open ? <Markdown content={explanation.body ?? ""} className="pb-1.5 text-sm" /> : null}
    </div>
  );
}
