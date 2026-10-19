import { useEffect, useRef, useState, type ReactNode } from "react";
import { enter, speed } from "bb-motion";
import { useKeyHandler } from "bb-vim-keys/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { dirname, isNotePath, noteTitle, type LinkResolver } from "../shared/obsidian";
import type { SaveState } from "./useNoteDocument";
import { NAME_BOX_KEYMAP } from "./vault-nav";

export type ViewMode = "edit" | "read";

export function obsidianUrl(vaultPath: string, path: string): string {
  return `obsidian://open?path=${encodeURIComponent(`${vaultPath.replace(/\/+$/, "")}/${path}`)}`;
}

function TitleInput({ path, focus, onRename }: { path: string; focus: boolean; onRename: (name: string) => void }) {
  const title = noteTitle(path);
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    if (!focus) return;
    ref.current?.focus();
    ref.current?.select();
  }, [focus, path]);
  const commit = () => {
    const next = value.trim();
    if (next === "" || next === title) {
      setValue(title);
      return;
    }
    onRename(next);
  };
  const keys = useKeyHandler({
    keymap: NAME_BOX_KEYMAP,
    isText: () => false,
    leaveToPressables: false,
    onCommand: (command) => {
      if (command === "commit") {
        ref.current?.blur();
        return true;
      }
      setValue(title);
      // A frame later, so the blur's commit sees the title put back rather than the typed name.
      requestAnimationFrame(() => ref.current?.blur());
      // Escape goes on to the page's keys, which put the cursor back once the title lets go.
      return false;
    },
  });
  return (
    <input
      ref={ref}
      value={value}
      aria-label="Note title"
      data-vim-ignore
      className="ob-title-input"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={keys}
    />
  );
}

const SAVE_LABELS: Record<SaveState, string> = { saved: "Saved", dirty: "Edited", saving: "Saving…", conflict: "Conflict", error: "Save failed" };

function SaveIndicator({ state }: { state: SaveState }) {
  const [shown, setShown] = useState(state);
  const [changes, setChanges] = useState(0);
  if (shown !== state) {
    setShown(state);
    setChanges(changes + 1);
  }
  // The live region stays mounted so screen readers announce changes; only the label remounts.
  // A note opening as "Saved" doesn't animate; a save landing pops.
  const animation = changes === 0 ? undefined : state === "saved" ? enter.pop : cn(enter.fade, speed.fast);
  return (
    <span className={cn("ob-save-state", (state === "conflict" || state === "error") && "text-destructive")} aria-live="polite">
      <span key={changes} className={cn("inline-block", animation)}>
        {SAVE_LABELS[state]}
      </span>
    </span>
  );
}

/** Breadcrumb, editable title, save state, view toggle, and the note's actions menu. */
export function NoteHeader(props: {
  path: string;
  vaultPath: string;
  resolver: LinkResolver;
  saveState: SaveState;
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  focusTitle: boolean;
  /** Extra buttons placed between the save state and the view toggle. */
  actions?: ReactNode;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const { path } = props;
  const isNote = isNotePath(path);
  return (
    <div className={cn("ob-note-header", enter.fade, speed.fast)}>
      <div className="min-w-0 flex-1">
        {dirname(path) === "" ? null : <div className="ob-breadcrumb">{dirname(path).split("/").join(" / ")}</div>}
        {isNote ? (
          <TitleInput path={path} focus={props.focusTitle} onRename={props.onRename} />
        ) : (
          <div className="ob-title-input">{path.split("/").pop()}</div>
        )}
      </div>
      {isNote ? <SaveIndicator state={props.saveState} /> : null}
      {props.actions}
      {isNote ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={props.mode === "edit" ? "Switch to reading view" : "Switch to editing view"}
          onClick={() => props.setMode(props.mode === "edit" ? "read" : "edit")}
        >
          <Icon name={props.mode === "edit" ? "Eye" : "Edit"} className="size-4" />
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Note actions">
            <Icon name="MoreHorizontal" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={obsidianUrl(props.vaultPath, path)}>
              <Icon name="ExternalLink" aria-hidden />
              Open in Obsidian
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(path)}>
            <Icon name="Copy" aria-hidden />
            Copy vault path
          </DropdownMenuItem>
          {isNote ? (
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(`[[${props.resolver.linkTextFor(path)}]]`)}>
              <Icon name="Link" aria-hidden />
              Copy wikilink
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={props.onDelete}>
            <Icon name="Trash2" aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
