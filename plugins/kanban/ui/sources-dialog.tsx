import { useEffect, useState } from "react";
import { OPACITY_TRANSITION, enter } from "bb-motion";
import type { Source, SourceKind } from "../shared/board";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseQuickAdd, parseTagList, slugify } from "./format";
import { type Rpc, type ProjectOption } from "./data";
import { Badge, MotionListItem, Select } from "./primitives";
import { TagBadges } from "./tags";
import { toastError } from "./actions";
import { useArrivals, usePresenceList } from "./motion";

const SOURCE_KIND_LABELS: Record<SourceKind, string> = { "github-search": "GitHub search", "jira-jql": "Jira (JQL)" };

function newSource(kind: SourceKind, id: string): Source {
  const base = { id, name: kind === "jira-jql" ? "Jira issues" : "GitHub search", tags: [], doneWhenGone: false, enabled: true, projectId: null };
  return kind === "jira-jql"
    ? { ...base, kind, jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC" }
    : { ...base, kind, query: "" };
}

function sourceQuery(source: Source): string {
  return source.kind === "github-search" ? source.query : source.jql;
}

function withQuery(source: Source, value: string): Source {
  return source.kind === "github-search" ? { ...source, query: value } : { ...source, jql: value };
}

export function SourcesDialog({
  open,
  onOpenChange,
  sources,
  projects,
  jiraSite,
  rpc,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: Source[];
  projects: ProjectOption[];
  jiraSite: string | null;
  rpc: Rpc;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Source[]>(sources);
  const [newKind, setNewKind] = useState<SourceKind>("github-search");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) setDraft(sources);
  }, [open, sources]);
  const update = (id: string, patch: (source: Source) => Source) =>
    setDraft(draft.map((source) => (source.id === id ? patch(source) : source)));
  const save = async () => {
    setPending(true);
    try {
      await rpc.call("sources_set", {
        sources: draft.map((source) => ({
          ...source,
          tags: parseQuickAdd(source.tags.map((tag) => `#${tag}`).join(" ")).tags,
        })),
      });
      onOpenChange(false);
      onChanged();
    } catch (cause) {
      toastError(cause);
    } finally {
      setPending(false);
    }
  };
  const hasJira = draft.some((source) => source.kind === "jira-jql");
  const arrival = useArrivals(open ? draft.map((source) => source.id) : null);
  const rows = usePresenceList(draft, (source) => source.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ticket sources</DialogTitle>
          <DialogDescription>
            Each source is a saved search; every result becomes a card carrying the source's tags. Saving runs a sync. The two
            defaults are ordinary sources you can edit or remove.
          </DialogDescription>
        </DialogHeader>
        {hasJira && jiraSite === null ? (
          <p role="alert" className={cn("rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300", enter.drop)}>
            Jira sources need the Jira site URL, account email, and API token in the plugin settings (Settings → Installed plugins → Kanban).
          </p>
        ) : null}
        <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {rows.entries.map(({ key, item: source, exiting }, index) => (
            <MotionListItem
              key={key}
              arrival={arrival(key)}
              index={index}
              exiting={exiting}
              onExited={() => rows.onExited(key)}
              className={cn("flex flex-col gap-3 rounded-md border border-border p-3", OPACITY_TRANSITION, !source.enabled && "opacity-60")}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0">
                  <Badge tone="accent">{SOURCE_KIND_LABELS[source.kind]}</Badge>
                </span>
                <Input
                  value={source.name}
                  aria-label={`Name of source ${source.id}`}
                  placeholder="Source name"
                  className="h-8 min-w-0 flex-1 font-medium"
                  onChange={(event) => update(source.id, (entry) => ({ ...entry, name: event.target.value }))}
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={source.enabled}
                    onCheckedChange={(checked) => update(source.id, (entry) => ({ ...entry, enabled: checked === true }))}
                    aria-label="Enabled"
                  />
                  Enabled
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove source ${source.name}`}
                  onClick={() => setDraft(draft.filter((entry) => entry.id !== source.id))}
                >
                  <Icon name="X" className="size-4" />
                </Button>
              </div>
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-sm">
                <dt className="pt-1.5 text-xs text-muted-foreground">{source.kind === "github-search" ? "GitHub query" : "JQL"}</dt>
                <dd>
                  <Input
                    value={sourceQuery(source)}
                    aria-label={`${source.kind === "github-search" ? "GitHub search query" : "JQL"} for ${source.name}`}
                    placeholder={
                      source.kind === "github-search"
                        ? "is:pr is:open author:@me archived:false"
                        : "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
                    }
                    className="h-8 font-mono text-xs"
                    onChange={(event) => update(source.id, (entry) => withQuery(entry, event.target.value))}
                  />
                </dd>
                <dt className="pt-1.5 text-xs text-muted-foreground">Tags</dt>
                <dd className="flex flex-wrap items-center gap-1">
                  <TagBadges tags={source.tags} onRemove={(tag) => update(source.id, (entry) => ({ ...entry, tags: entry.tags.filter((value) => value !== tag) }))} />
                  <input
                    placeholder={source.tags.length === 0 ? "Add tag and press Enter" : "+ tag"}
                    aria-label={`Add tag to ${source.name}`}
                    className="h-7 min-w-32 flex-1 rounded border border-dashed border-border bg-transparent px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== ",") return;
                      event.preventDefault();
                      const input = event.target as HTMLInputElement;
                      const tags = parseTagList(input.value);
                      if (tags.length === 0) return;
                      update(source.id, (entry) => ({ ...entry, tags: [...new Set([...entry.tags, ...tags])] }));
                      input.value = "";
                    }}
                  />
                </dd>
                <dt className="pt-1.5 text-xs text-muted-foreground">Threads run in</dt>
                <dd>
                  <Select
                    aria-label={`Project for ${source.name} threads`}
                    value={source.projectId ?? ""}
                    className="h-8"
                    onChange={(value) => update(source.id, (entry) => ({ ...entry, projectId: value === "" ? null : value }))}
                  >
                    <option value="">{source.kind === "github-search" ? "Project matching the repo's remote, else the fallback setting" : "The fallback project setting"}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </dd>
                <dt className="pt-1.5 text-xs text-muted-foreground">When an item leaves this search</dt>
                <dd>
                  <Select
                    aria-label={`What happens when an item leaves ${source.name}`}
                    value={source.doneWhenGone ? "done" : "keep"}
                    className="h-8"
                    onChange={(value) => update(source.id, (entry) => ({ ...entry, doneWhenGone: value === "done" }))}
                  >
                    <option value="keep">Keep the card where it is</option>
                    <option value="done">Move the card to Done</option>
                  </Select>
                </dd>
              </dl>
              <p className="text-[11px] text-muted-foreground">
                Source id <code>{source.id}</code> is fixed at creation; cards remember which source made them by this id, and <code>bb kanban sources</code> lists it.
              </p>
            </MotionListItem>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Add</span>
          <Select aria-label="New source type" value={newKind} onChange={(value) => setNewKind(value as SourceKind)} className="h-8 max-w-48">
            {(Object.keys(SOURCE_KIND_LABELS) as SourceKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {SOURCE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            disabled={draft.length >= 20}
            onClick={() => {
              let id = slugify(`${newKind === "jira-jql" ? "jira" : "github"} ${draft.length + 1}`, `source-${draft.length + 1}`);
              while (draft.some((source) => source.id === id)) id = `${id}-2`;
              setDraft([...draft, newSource(newKind, id)]);
            }}
          >
            <Icon name="Plus" className="size-4" />
            Add source
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || draft.some((source) => source.name.trim() === "" || sourceQuery(source).trim() === "")}
            onClick={() => void save()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
