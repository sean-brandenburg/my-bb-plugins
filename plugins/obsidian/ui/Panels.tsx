import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { STAGGER, cx, enter, stagger } from "bb-motion";
import type { Backlinks } from "../contract";
import type { rpcContract } from "../rpc-contract";
import { errorMessage } from "../shared/errors";
import { isNotePath, noteTitle, parseHeadings } from "../shared/obsidian";
import { FileMatches } from "./FileMatches";
import { LoadingLines } from "./Loading";
import { decodeNotePath, requestNavigation, useOpenNote } from "./navigation";
import { useGlobalCommands } from "./global-keys";
import { useLiveDoc } from "./state";
import { readRows, focusRow, requestSurfaceFocus, runListCommand, useSurfaceFocusRequest, useVaultKeys, type Surface } from "./vault-keys";
import { useVaultChanges } from "./vault-client";

function useCurrentNote(subPath: string): string | null {
  const path = subPath === "" ? null : decodeNotePath(subPath);
  return path !== null && isNotePath(path) ? path : null;
}

function PanelMessage({ children }: { children: string }) {
  return <p className="px-3 py-3 text-xs text-muted-foreground">{children}</p>;
}

/** A panel tab's rows under j/k; Escape hands the keys back to the note. */
function PanelKeys({ surface, children }: { surface: Surface; children: ReactNode }) {
  const global = useGlobalCommands();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useSurfaceFocusRequest(surface, root, () => {
    if (root === null) return;
    const row = readRows(root).elements[0];
    if (row !== undefined) focusRow(row);
    else root.focus({ preventScroll: true });
  });
  useVaultKeys(surface, root, (command) => {
    if (root === null) return false;
    if (command.kind === "list" || command.kind === "scroll") return runListCommand(root, command);
    if (command.kind === "escape" && !command.fromField) {
      requestSurfaceFocus("page");
      return true;
    }
    return global(command);
  });
  return (
    <div ref={setRoot} tabIndex={-1} className="h-full outline-none">
      {children}
    </div>
  );
}

export function OutlinePanel({ subPath }: { subPath: string }) {
  return (
    <PanelKeys surface="outline">
      <Outline subPath={subPath} />
    </PanelKeys>
  );
}

export function BacklinksPanel({ subPath }: { subPath: string }) {
  return (
    <PanelKeys surface="backlinks">
      <BacklinksList subPath={subPath} />
    </PanelKeys>
  );
}

function Outline({ subPath }: { subPath: string }) {
  const path = useCurrentNote(subPath);
  const content = useLiveDoc(path);
  const headings = useMemo(() => (content === null ? [] : parseHeadings(content)), [content]);
  if (path === null) return <PanelMessage>Open a note to see its outline.</PanelMessage>;
  if (headings.length === 0) return <PanelMessage>No headings in this note.</PanelMessage>;
  const minLevel = Math.min(...headings.map((heading) => heading.level));
  // Headings are keyed by line and remount as lines shift while typing, so only a note switch animates.
  return (
    <nav key={path} aria-label="Outline" className={cx("ob-panel-list", enter.fade)}>
      {headings.map((heading) => (
        <button
          key={`${heading.line}`}
          type="button"
          className="ob-outline-item"
          data-nav-row="item"
          style={{ paddingLeft: `${0.75 + (heading.level - minLevel) * 0.85}rem` }}
          // From the keys, focus stays here so j/k can carry on through the headings.
          onClick={(event) => requestNavigation(path, { line: heading.line }, event.detail !== 0)}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}

function BacklinksList({ subPath }: { subPath: string }) {
  const path = useCurrentNote(subPath);
  const rpc = useRpc<typeof rpcContract>();
  const openNote = useOpenNote();
  const [data, setData] = useState<Backlinks | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (path === null) return;
    rpc.call("backlinks", { path }).then(
      (next) => {
        setData(next);
        setError(null);
      },
      (cause) => setError(errorMessage(cause)),
    );
  }, [rpc, path]);

  useEffect(() => {
    setData(null);
    refresh();
  }, [refresh]);
  useVaultChanges(() => refresh());

  if (path === null) return <PanelMessage>Open a note to see what links to it.</PanelMessage>;
  if (error !== null) return <PanelMessage>{error}</PanelMessage>;
  if (data === null) return <LoadingLines className="px-3 py-3" />;
  if (data.backlinks.length === 0) return <PanelMessage>{`No notes link to ${noteTitle(path)}.`}</PanelMessage>;
  return (
    <div className="ob-panel-list">
      <p className="px-3 pb-1 pt-3 text-xs text-muted-foreground">
        {data.backlinks.length} linked mention{data.backlinks.length === 1 ? "" : "s"}
      </p>
      {data.backlinks.map((backlink, index) => (
        <FileMatches
          key={backlink.path}
          className={cx(enter.rise, STAGGER)}
          style={stagger(index)}
          path={backlink.path}
          matches={backlink.matches}
          onOpen={(path, line, fromKeys) => {
            openNote(path, { target: line === undefined ? undefined : { line }, focus: !fromKeys });
            if (fromKeys) requestSurfaceFocus("page");
          }}
        />
      ))}
    </div>
  );
}
