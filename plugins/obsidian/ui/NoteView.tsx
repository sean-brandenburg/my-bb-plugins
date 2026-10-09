import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isNotePath, noteTitle, type LinkKind, type LinkResolver } from "../shared/obsidian";
import { Editor } from "./Editor";
import { isImagePath } from "./file-kinds";
import { useNavigationRequest } from "./navigation";
import { NoteHeader, obsidianUrl, type ViewMode } from "./NoteHeader";
import { Reader } from "./Reader";
import { useLiveDoc } from "./state";
import { useNoteDocument } from "./useNoteDocument";
import { previewUrl, type VaultRpc } from "./vault-client";

export type { ViewMode } from "./NoteHeader";

interface NoteViewProps {
  path: string;
  vaultPath: string;
  rpc: VaultRpc;
  resolver: LinkResolver;
  notePaths: readonly string[];
  previewBase: string | null;
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  focusTitle: boolean;
  /** Extra header buttons; `flush` saves pending edits first. */
  headerActions?: (note: { flush: () => Promise<void> }) => ReactNode;
  onOpenLink: (target: string, subpath: string | null, kind: LinkKind) => void;
  onTagClick: (tag: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onCreate: (path: string) => void;
}

export function NoteView(props: NoteViewProps) {
  const { path, rpc } = props;
  const isNote = isNotePath(path);
  const note = useNoteDocument({ path, vaultPath: props.vaultPath, rpc });
  const liveContent = useLiveDoc(path);
  const navigationRequest = useNavigationRequest(path);

  const header = (
    <NoteHeader
      path={path}
      vaultPath={props.vaultPath}
      resolver={props.resolver}
      saveState={note.saveState}
      mode={props.mode}
      setMode={props.setMode}
      focusTitle={props.focusTitle}
      actions={props.headerActions?.({ flush: note.flush })}
      onRename={(name) => props.onRename(path, name)}
      onDelete={() => props.onDelete(path)}
    />
  );

  if (!isNote) {
    return (
      <div className="ob-note">
        {header}
        <div className="ob-note-body flex items-start justify-center overflow-auto p-6">
          {isImagePath(path) && props.previewBase !== null ? (
            <img src={previewUrl(props.previewBase, path)} alt={path} className="max-w-full rounded-md" />
          ) : (
            <p className="text-sm text-muted-foreground">
              This file type can't be shown here.{" "}
              <a className="ob-link" href={obsidianUrl(props.vaultPath, path)}>
                Open it in Obsidian
              </a>
              .
            </p>
          )}
        </div>
      </div>
    );
  }

  if (note.loadError !== null) {
    return (
      <div className="ob-note">
        <div className="mx-auto mt-16 max-w-md space-y-3 px-4 text-center text-sm">
          {note.loadError.missing ? (
            <>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{noteTitle(path)}</span> doesn't exist yet.
              </p>
              <Button size="sm" onClick={() => props.onCreate(path)}>
                Create note
              </Button>
            </>
          ) : (
            <p className="text-destructive">{note.loadError.message}</p>
          )}
        </div>
      </div>
    );
  }

  if (note.doc === null) {
    return (
      <div className="ob-note">
        {header}
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="ob-note">
      {header}
      {note.draft !== null ? (
        <div role="alert" className="ob-conflict">
          <span>You have unsaved changes to this note from an earlier session. Restoring them replaces what's on disk now.</span>
          <Button size="sm" variant="outline" onClick={note.discardDraft}>
            Discard
          </Button>
          <Button size="sm" onClick={note.restoreDraft}>
            Restore my changes
          </Button>
        </div>
      ) : null}
      {note.saveState === "conflict" ? (
        <div role="alert" className="ob-conflict">
          <span>This note changed on disk while you were editing it.</span>
          <Button size="sm" variant="outline" onClick={() => void note.load()}>
            Load disk version
          </Button>
          <Button size="sm" onClick={() => void note.keepMine()}>
            Keep my version
          </Button>
        </div>
      ) : null}
      <div className={cn("ob-note-body", props.mode !== "edit" && "hidden")}>
        <Editor
          path={path}
          content={note.doc.content}
          version={note.doc.version}
          resolver={props.resolver}
          notePaths={props.notePaths}
          target={props.mode === "edit" ? navigationRequest : null}
          onChange={note.onChange}
          onOpenLink={(link) => props.onOpenLink(link.target, link.subpath, link.kind)}
        />
      </div>
      {props.mode === "read" ? (
        <div className="ob-note-body overflow-y-auto">
          <Reader
            path={path}
            content={liveContent ?? note.doc.content}
            resolver={props.resolver}
            rpc={rpc}
            previewBase={props.previewBase}
            target={navigationRequest}
            onOpenLink={(link) => props.onOpenLink(link.target, link.subpath, link.kind)}
            onTagClick={props.onTagClick}
            onChange={note.onReaderChange}
          />
        </div>
      ) : null}
    </div>
  );
}
