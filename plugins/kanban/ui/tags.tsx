import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { PRESS, enter, exit, speed, type Arrival, useArrivals, useEntrance, usePresenceList, POPOVER_MOTION } from "bb-motion";
import type { Ticket } from "../shared/board";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { type Rpc } from "./data";
import type { RunAction } from "./actions";
import {  } from "./primitives";

const TAG_TONES = [
  { chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  { chip: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { chip: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  { chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  { chip: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
  { chip: "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300", dot: "bg-lime-500" },
] as const;

/** A tag keeps the same colour everywhere it appears. */
export function tagTone(tag: string): (typeof TAG_TONES)[number] {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TAG_TONES[hash % TAG_TONES.length]!;
}

const TAG_NAME = /^[a-z0-9][a-z0-9._-]*$/u;

function TagChip({
  tag,
  onRemove,
  arrival = null,
  exiting = false,
  onExited,
}: {
  tag: string;
  onRemove?: (tag: string) => void;
  arrival?: Arrival;
  exiting?: boolean;
  onExited?: () => void;
}) {
  const entrance = useEntrance(arrival === "new" ? enter.pop : undefined);
  return (
    <span
      onAnimationEnd={(event) => {
        if (exiting && event.target === event.currentTarget) onExited?.();
        else entrance.onAnimationEnd(event);
      }}
      className={cn("group/tag inline-flex h-5 max-w-full items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-none", tagTone(tag).chip, exiting ? exit.sink : entrance.className)}
    >
      <span className="truncate">{tag}</span>
      {onRemove !== undefined ? (
        <button
          type="button"
          aria-label={`Remove tag ${tag}`}
          className="-mr-1 flex size-3.5 items-center justify-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/15 focus-visible:opacity-100 focus-visible:outline-none"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(tag);
          }}
        >
          <Icon name="X" className="size-2.5" />
        </button>
      ) : null}
    </span>
  );
}

export function TagBadges({ tags, onRemove }: { tags: readonly string[]; onRemove?: (tag: string) => void }) {
  if (onRemove !== undefined) return <EditableTagBadges tags={tags} onRemove={onRemove} />;
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} />
      ))}
    </>
  );
}

/** Tags the user edits in place: added ones pop in, removed ones shrink away before the row closes up. */
function EditableTagBadges({ tags, onRemove }: { tags: readonly string[]; onRemove: (tag: string) => void }) {
  const arrival = useArrivals(tags);
  const { entries, onExited } = usePresenceList(tags, (tag) => tag);
  return (
    <>
      {entries.map((entry) => (
        <TagChip key={entry.key} tag={entry.key} onRemove={onRemove} arrival={arrival(entry.key)} exiting={entry.exiting} onExited={() => onExited(entry.key)} />
      ))}
    </>
  );
}

/** Searchable tag picker: tick existing tags on or off, or create one from the query. */
function TagPicker({ applied, suggestions, onChange }: { applied: readonly string[]; suggestions: readonly string[]; onChange: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const portalScope = usePortalScopeProps();
  const normalized = query.trim().replace(/^#/u, "").toLowerCase();
  const options = useMemo(() => [...new Set([...applied, ...suggestions])].sort().filter((tag) => tag.includes(normalized)), [applied, suggestions, normalized]);
  const canCreate = TAG_NAME.test(normalized) && !applied.includes(normalized) && !suggestions.includes(normalized);
  const rows: Array<{ kind: "tag" | "create"; tag: string }> = [...options.map((tag) => ({ kind: "tag" as const, tag })), ...(canCreate ? [{ kind: "create" as const, tag: normalized }] : [])];
  const active = Math.min(highlight, Math.max(0, rows.length - 1));
  const toggle = (tag: string) => {
    onChange(applied.includes(tag) ? applied.filter((entry) => entry !== tag) : [...applied, tag]);
  };
  const choose = (row: { kind: "tag" | "create"; tag: string }) => {
    if (row.kind === "create") {
      onChange([...applied, row.tag]);
      setQuery("");
      return;
    }
    toggle(row.tag);
  };
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
        setHighlight(0);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Edit tags"
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border px-1.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:border-solid data-[state=open]:border-ring data-[state=open]:text-foreground",
            applied.length === 0 && "px-2",
            PRESS,
          )}
        >
          <Icon name="Plus" className="size-3" />
          {applied.length === 0 ? "Add tag" : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...portalScope}
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className={cn("z-50 w-60 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg", POPOVER_MOTION)}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-2.5">
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              #
            </span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlight(Math.min(rows.length - 1, active + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlight(Math.max(0, active - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const row = rows[active];
                  if (row !== undefined) choose(row);
                } else if (event.key === "Backspace" && query === "" && applied.length > 0) {
                  onChange(applied.slice(0, -1));
                }
              }}
              placeholder={suggestions.length > 0 ? "Search or create a tag" : "Create a tag"}
              aria-label="Search tags"
              role="combobox"
              aria-expanded="true"
              aria-controls="kanban-tag-options"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none"
            />
          </div>
          <ul ref={listRef} id="kanban-tag-options" role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
            {rows.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">{normalized === "" ? "No tags yet. Type to create one." : "Tags use lowercase letters, digits, . - _"}</li>
            ) : null}
            {rows.map((row, index) => {
              const checked = row.kind === "tag" && applied.includes(row.tag);
              return (
                <li
                  key={`${row.kind}:${row.tag}`}
                  data-index={index}
                  role="option"
                  aria-selected={checked}
                  className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm", index === active && "bg-state-hover")}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                >
                  {row.kind === "create" ? (
                    <>
                      <Icon name="Plus" className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Create</span>
                      <TagChip tag={row.tag} />
                    </>
                  ) : (
                    <>
                      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {checked ? <Icon name="Check" className={cn("size-3", enter.pop, speed.fast)} /> : null}
                      </span>
                      <span className={cn("size-2 shrink-0 rounded-full", tagTone(row.tag).dot)} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{row.tag}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span>↑↓ move</span>
            <span>↵ toggle</span>
            <span className="ml-auto">esc close</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TagEditor({ ticket, rpc, run, suggestions }: { ticket: Ticket; rpc: Rpc; run: RunAction; suggestions: readonly string[] }) {
  // Toggles land faster than the board refetch; build each change on the last one sent, not the stale prop.
  const [applied, setApplied] = useState<readonly string[]>(ticket.tags);
  const synced = ticket.tags.join(",");
  useEffect(() => setApplied(ticket.tags), [synced]);
  const save = (tags: string[]) => {
    setApplied(tags);
    void run(() => rpc.call("ticket_set_tags", { id: ticket.id, tags }));
  };
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1">
      <TagBadges tags={applied} onRemove={(tag) => save(applied.filter((entry) => entry !== tag))} />
      <TagPicker applied={applied} suggestions={suggestions} onChange={save} />
    </div>
  );
}
