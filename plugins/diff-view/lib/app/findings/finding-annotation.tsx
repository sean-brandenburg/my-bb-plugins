import { useContext, useState, type KeyboardEvent } from "react";
import { Markdown, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { FindingEdit, FindingSeverity } from "../../types";
import { Button, COMPACT } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { cn } from "../utils";
import { CHEVRON, FAST, OPACITY_TRANSITION, PRESS, enter, useOpenedSinceMount } from "../ui/motion";
import { SEVERITY_DOT, SEVERITY_LABEL, type InlineFinding } from "./findings";
import { useFindingControls, useIsFocused, useIsReading } from "../keys/review-keys-context";
import { Badge } from "../ui/badge";
import { SuggestionsContext } from "../suggestions/context";
import { SuggestionDiff } from "../suggestions/suggestion-diff";
import { findingSuggestionLabel } from "../suggestions/finding-suggestion";

const SUGGESTION_BUTTON = cn("rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground disabled:opacity-50", PRESS);

const SEVERITY_BORDER: Record<FindingSeverity, string> = { critical: "border-red-500/70", important: "border-amber-500/70", minor: "border-border" };

/**
 * A review finding under the line it is about: one quiet strip (checkbox, severity, title) that expands to the details,
 * description and fix, with inline editing of the wording the apply thread will receive. It stays a single line until
 * opened, or while the keyboard cursor is on it.
 */
export function FindingAnnotation({
  item,
  anchorId,
  entrance = true,
  onToggle,
  onEdit,
}: {
  item: InlineFinding;
  /** This placement's id among the review keys' anchors. */
  anchorId: string;
  /** Read once, at mount: false when the finding was already on screen and only remounted. */
  entrance?: boolean;
  onToggle: (selected: boolean) => void;
  onEdit: (edit: FindingEdit | null) => Promise<void>;
}) {
  const { finding } = item;
  const [entering] = useState(entrance);
  // Null follows the keyboard cursor; a click, Enter or za pins it open or closed.
  const [open, setOpen] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FindingEdit>({ title: finding.title, description: finding.description, fix: finding.fix });
  const [saving, setSaving] = useState(false);
  const suggestions = useContext(SuggestionsContext);
  const suggestion = suggestions.forFinding(item);
  const applicable = suggestion?.item ?? null;
  const inBatch = applicable !== null && suggestions.batch.some((entry) => entry.id === applicable.id);
  const posted = suggestion !== null && suggestions.posted.has(suggestion.id);
  const canPost = suggestions.post !== null && suggestion !== null && !suggestion.applied && !posted && suggestion.current !== null;
  const beginEdit = () => {
    setDraft({ title: finding.title, description: finding.description, fix: finding.fix });
    setEditing(true);
    setOpen(true);
  };
  const focused = useIsFocused("finding", anchorId);
  const reading = useIsReading("finding", anchorId);
  const expanded = editing || (open ?? reading);
  const toggle = () => setOpen(!expanded);
  const save = async () => {
    setSaving(true);
    try {
      await onEdit({ title: draft.title.trim(), description: draft.description, fix: draft.fix === null || draft.fix.trim() === "" ? null : draft.fix });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  useFindingControls(anchorId, { toggle, edit: beginEdit });
  const onFieldKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && draft.title.trim() !== "") void save();
  };
  const field = "w-full rounded-md border border-border bg-background px-2 py-1 text-xs";
  const reveal = useOpenedSinceMount(expanded) ? cn(enter.rise, FAST) : undefined;
  const meta = [
    SEVERITY_LABEL[finding.severity],
    finding.locations.length > 1 ? `${finding.locations.length} instances` : null,
    item.carriedFrom !== null ? `still open from ${item.carriedFrom}` : null,
    item.edited ? "reworded by you" : null,
    item.overridden ? (item.selected ? "included by you" : "excluded by you") : null,
  ].filter((part) => part !== null);
  // The review's scores, for the id's tooltip: they shaped the triage and rarely change what the reader does.
  const scores = [
    finding.importance !== null && finding.scopeFit !== null ? `importance ${finding.importance}/5 · scope fit ${finding.scopeFit}/5` : null,
    finding.confidence != null ? `verifier confidence ${finding.confidence}` : null,
    finding.class != null && finding.class !== "" ? `class: ${finding.class}` : null,
  ].filter((part) => part !== null);
  return (
    <div data-finding-anchor="" className={cn("my-0.5 min-w-0 max-w-full break-words border-l-2 pl-2 text-sm [&_pre]:max-w-full [&_pre]:overflow-x-auto", entering && [enter.fade, FAST], OPACITY_TRANSITION, SEVERITY_BORDER[finding.severity], !item.selected && "opacity-60", focused && "rounded-r-md ring-1 ring-primary/70")}>
      <div className="flex items-center gap-2 py-0.5 text-xs">
        <Checkbox checked={item.selected} onCheckedChange={(checked) => onToggle(checked === true)} aria-label={`${item.selected ? "Exclude" : "Include"} ${finding.id} in the apply round`} className="size-3.5" />
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={toggle} aria-expanded={expanded} data-bbm-open={expanded}>
          <Icon name="ChevronRight" className={cn("size-3 shrink-0 text-muted-foreground", CHEVRON)} />
          <span className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT[finding.severity])} title={SEVERITY_LABEL[finding.severity]} />
          <span className="min-w-0 flex-1 truncate text-foreground">{finding.title}</span>
        </button>
        {item.isNew ? <span className="shrink-0 rounded border border-sky-500/50 px-1 text-[10px] text-sky-700 dark:text-sky-300" title="Reported since you last looked">new</span> : null}
        {item.touched ? <span className="shrink-0 rounded border border-amber-500/50 px-1 text-[10px] text-amber-700 dark:text-amber-300" title="These lines changed since you last looked">touched</span> : null}
      </div>
      {/* Mounted while folded: it opens as the cursor passes, and mounting it then restyles the whole page under bb
          themes with broad :has() rules. */}
      {!editing ? (
        <div className={cn("flex flex-col gap-1 pb-1.5 text-sm", reveal, !expanded && "hidden")}>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="min-w-0">
              <span className={cn("font-mono", scores.length > 0 && "cursor-help underline decoration-dotted underline-offset-2")} title={scores.length > 0 ? scores.join("\n") : undefined}>
                {finding.id}
              </span>
              {" · "}
              {meta.join(" · ")}
            </span>
            <button type="button" className={cn("ml-auto rounded px-1 hover:bg-state-hover hover:text-foreground", PRESS)} onClick={beginEdit}>
              Edit
            </button>
          </div>
          {finding.description !== "" ? <Markdown content={finding.description} /> : <p className="text-muted-foreground">No description.</p>}
          {finding.fix !== null && finding.fix !== "" ? (
            <div className="flex gap-1.5">
              <Icon name="diff-view-wrench" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <Markdown content={finding.fix} className="min-w-0 flex-1" />
            </div>
          ) : null}
          {suggestion !== null ? (
            <div className="flex flex-col gap-1">
              <SuggestionDiff
                expected={suggestion.current}
                replacement={suggestion.replacement}
                startLine={suggestion.suggestion.startLine}
                label={`Suggested change · ${findingSuggestionLabel(suggestion.suggestion)}`}
                badge={suggestion.applied ? <Badge tone="success">applied</Badge> : inBatch ? <Badge tone="accent">in batch</Badge> : posted ? <Badge tone="outline">draft on GitHub</Badge> : undefined}
              />
              {(applicable !== null && suggestions.apply !== null) || canPost ? (
                <div className="flex flex-wrap gap-1.5">
                  {applicable !== null && suggestions.apply !== null ? (
                    <>
                      <button type="button" className={SUGGESTION_BUTTON} disabled={suggestions.busy} title="Apply this suggestion to the code now and mark the finding applied (A)" onClick={() => void suggestions.apply?.([applicable])}>
                        Apply suggestion
                      </button>
                      <button type="button" aria-pressed={inBatch} className={cn(SUGGESTION_BUTTON, inBatch && "bg-state-active text-foreground")} title="Apply it with others in one go: Commit N suggestions above the diff, or gB (B)" onClick={() => suggestions.toggleBatch(applicable)}>
                        {inBatch ? "Remove from batch" : "Add to batch"}
                      </button>
                    </>
                  ) : null}
                  {canPost ? (
                    <button type="button" className={SUGGESTION_BUTTON} title="Post it to the pull request as a draft suggestion comment (gs)" onClick={() => void suggestions.post?.(item, suggestion)}>
                      Post to PR
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {item.edited ? (
            <button type="button" className={cn("self-start text-xs text-muted-foreground hover:underline", PRESS)} onClick={() => void onEdit(null)}>
              Revert to the reviewer's wording
            </button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        // Escape cancels the edit like the Cancel button and hands the keyboard back to the diff; ⌘↩ saves.
        <div data-escape-cancels="always" className={cn("flex flex-col gap-1.5 pb-1.5", enter.fade, FAST)}>
          <input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} onKeyDown={onFieldKeyDown} className={field} aria-label="Finding title" />
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} onKeyDown={onFieldKeyDown} rows={4} className={cn(field, "font-mono")} aria-label="Finding description" placeholder="Description (Markdown)" />
          <textarea value={draft.fix ?? ""} onChange={(event) => setDraft({ ...draft, fix: event.target.value })} onKeyDown={onFieldKeyDown} rows={3} className={cn(field, "font-mono")} aria-label="Suggested fix" placeholder="Suggested fix (optional)" />
          <div className="flex gap-2">
            <Button type="button" className={COMPACT} disabled={saving || draft.title.trim() === ""} onClick={() => void save()}>
              Save
            </Button>
            <Button type="button" variant="ghost" className={COMPACT} data-escape-cancel="" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <p className={cn("pb-1 font-mono text-[10px] text-muted-foreground", enter.fade, FAST, !focused && "hidden")}>
        {[
          applicable !== null && suggestions.apply !== null ? "A apply suggestion" : null,
          applicable !== null && suggestions.apply !== null ? (inBatch ? "B unbatch" : "B batch") : null,
          canPost ? "gs post to PR" : null,
          item.selected ? "x exclude" : "x include",
          editing ? null : "e edit",
          expanded ? "↩ fold" : "↩ unfold",
          "c next",
        ]
          .filter((hint) => hint !== null)
          .join(" · ")}
      </p>
    </div>
  );
}
