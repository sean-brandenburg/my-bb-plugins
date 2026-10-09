import { useEffect, useState } from "react";
import { POP, enter, speed, useArrivals, usePresenceList } from "bb-motion";
import type { Column } from "../shared/board";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type Rpc } from "./data";
import { slugify } from "./format";
import { toastError } from "./actions";
import { MotionListItem } from "./primitives";

export function ColumnsDialog({
  open,
  onOpenChange,
  columns,
  rpc,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  rpc: Rpc;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Column[]>(columns);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  // The row just moved up or down, which pops where it lands.
  const [movedId, setMovedId] = useState<string | null>(null);
  useEffect(() => {
    if (open) setDraft(columns);
  }, [open, columns]);
  const arrival = useArrivals(open ? draft.map((column) => column.id) : null);
  // The column whose options are showing below its row.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const update = (id: string, patch: Partial<Column>) => setDraft(draft.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const setHideAfterDays = (id: string, raw: string) => {
    const days = Number.parseInt(raw, 10);
    update(id, { hideAfterDays: Number.isNaN(days) ? null : Math.min(Math.max(days, 1), 365) });
  };
  const rows = usePresenceList(draft, (column) => column.id);
  const move = (index: number, delta: number) => {
    if (index < 0) return;
    const next = [...draft];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setDraft(next);
    setMovedId(next[target]!.id);
  };
  const save = async () => {
    setPending(true);
    try {
      await rpc.call("columns_set", { columns: draft });
      onOpenChange(false);
      onChanged();
    } catch (cause) {
      toastError(cause);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Columns</DialogTitle>
          <DialogDescription>
            Cards in a removed column move to the first column. Agents refer to columns by id.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {rows.entries.map(({ key, item: column, exiting }, index) => (
            <MotionListItem
              key={key}
              arrival={arrival(key)}
              index={index}
              exiting={exiting}
              onExited={() => rows.onExited(key)}
              onAnimationEnd={() => setMovedId((current) => (current === key ? null : current))}
              className={cn("flex flex-col gap-2", movedId === key && POP)}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={column.name}
                  aria-label={`Name of column ${column.id}`}
                  onChange={(event) => update(column.id, { name: event.target.value })}
                />
                <code className="w-24 shrink-0 truncate text-xs text-muted-foreground">{column.id}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-7", column.hideAfterDays != null ? "text-primary" : "text-muted-foreground")}
                  aria-label={`Options for column ${column.name}`}
                  aria-expanded={expandedId === column.id}
                  onClick={() => setExpandedId(expandedId === column.id ? null : column.id)}
                >
                  <Icon name="Settings" className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Move up" onClick={() => move(draft.indexOf(column), -1)}>
                  <Icon name="ChevronUp" className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Move down" onClick={() => move(draft.indexOf(column), 1)}>
                  <Icon name="ChevronDown" className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove column ${column.name}`}
                  disabled={draft.length <= 1}
                  onClick={() => setDraft(draft.filter((entry) => entry.id !== column.id))}
                >
                  <Icon name="X" className="size-4" />
                </Button>
              </div>
              {expandedId === column.id ? (
                <label className={cn("flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-sm", enter.rise, speed.fast)}>
                  <span className="min-w-0 flex-1">Hide cards that have been in this column for more than</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    value={column.hideAfterDays ?? ""}
                    placeholder="never"
                    aria-label={`Days before cards in ${column.name} are hidden`}
                    onChange={(event) => setHideAfterDays(column.id, event.target.value)}
                    className="h-8 w-20"
                  />
                  <span>days</span>
                </label>
              ) : null}
            </MotionListItem>
          ))}
        </ul>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (name === "") return;
            let id = slugify(name, `col-${draft.length + 1}`);
            while (draft.some((column) => column.id === id)) id = `${id}-2`;
            setDraft([...draft, { id, name }]);
            setNewName("");
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New column name"
            aria-label="New column name"
          />
          <Button type="submit" variant="secondary" disabled={newName.trim() === "" || draft.length >= 12}>
            Add
          </Button>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || draft.some((column) => column.name.trim() === "")} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
