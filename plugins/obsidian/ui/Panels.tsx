import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { STAGGER, cx, enter, stagger } from "bb-motion";
import type { Backlinks } from "../contract";
import type { rpcContract } from "../rpc-contract";
import { errorMessage } from "../shared/errors";
import { isNotePath, noteTitle, parseHeadings } from "../shared/obsidian";
import { FileMatches } from "./FileMatches";
import { LoadingLines } from "./Loading";
import { decodeNotePath, requestNavigation, useOpenNote } from "./navigation";
import { useLiveDoc } from "./state";
import { useVaultChanges } from "./vault-client";

function useCurrentNote(subPath: string): string | null {
  const path = subPath === "" ? null : decodeNotePath(subPath);
  return path !== null && isNotePath(path) ? path : null;
}

function PanelMessage({ children }: { children: string }) {
  return <p className="px-3 py-3 text-xs text-muted-foreground">{children}</p>;
}

export function OutlinePanel({ subPath }: { subPath: string }) {
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
          style={{ paddingLeft: `${0.75 + (heading.level - minLevel) * 0.85}rem` }}
          onClick={() => requestNavigation(path, { line: heading.line })}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}

export function BacklinksPanel({ subPath }: { subPath: string }) {
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
          onOpen={(path, line) => openNote(path, { target: line === undefined ? undefined : { line } })}
        />
      ))}
    </div>
  );
}
