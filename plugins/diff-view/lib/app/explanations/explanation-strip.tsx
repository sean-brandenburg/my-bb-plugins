import { useContext, useState } from "react";
import { Markdown, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { HunkExplanation } from "../../types";
import { cn } from "../utils";
import { CHEVRON, FAST, PRESS, enter, useOpenedSinceMount } from "../ui/motion";
import { DiffCommentsContext } from "../comments/context";

/** An agent's explanation of a hunk, as a collapsible strip under the hunk header. */
export function ExplanationStrip({ explanation }: { explanation: HunkExplanation }) {
  const [open, setOpen] = useState(true);
  const { onOpenThread } = useContext(DiffCommentsContext);
  const firstLine = (explanation.body ?? "").split("\n").find((line) => line.trim() !== "") ?? "";
  const reveal = useOpenedSinceMount(open) ? cn(enter.rise, FAST) : undefined;
  return (
    <div className={cn("my-0.5 border-l-2 border-sky-500/60 pl-2 text-sm", enter.fade)}>
      <div className="flex items-center gap-2 text-xs">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open} data-bbm-open={open}>
          <Icon name="ChevronRight" className={cn("size-3 shrink-0 text-muted-foreground", CHEVRON)} />
          <span className="shrink-0 text-muted-foreground">explanation</span>
          {!open ? <span className="min-w-0 flex-1 truncate text-foreground">{firstLine}</span> : null}
        </button>
        <button type="button" className={cn("shrink-0 text-muted-foreground hover:text-foreground", PRESS)} onClick={() => onOpenThread(explanation.threadId)}>
          thread
        </button>
      </div>
      {open ? <Markdown content={explanation.body ?? ""} className={cn("pb-1.5 text-sm", reveal)} /> : null}
    </div>
  );
}
