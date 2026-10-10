import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { STAGGER, cx, enter, speed, stagger } from "bb-motion";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { SearchResults } from "../contract";
import { errorMessage } from "../shared/errors";
import { basename, dirname, isNotePath } from "../shared/obsidian";
import { FileMatches } from "./FileMatches";
import { FileTree, type FileTreeActions } from "./FileTree";
import { LoadingLines } from "./Loading";
import { useOpenNote } from "./navigation";
import { copyToClipboard, useGlobalCommands } from "./global-keys";
import { getSearchStops, setSearchStopIndex, setSearchStops, useLocalStorageState, useSearchQuery } from "./state";
import { editFieldAtCursor, fieldRowOf, focusRow, readRows, requestSurfaceFocus, runListCommand, useSurfaceFocusRequest, useVaultKeys } from "./vault-keys";
import { canMoveInto, type SearchStop, type VaultCommand } from "./vault-nav";
import type { VaultActions } from "./vault-actions";
import type { Vault } from "./vault-client";

const SEARCH_DEBOUNCE_MS = 200;

function searchStops(results: SearchResults): SearchStop[] {
  return results.results.flatMap((result) =>
    result.matches.length === 0 ? [{ path: result.path }] : result.matches.map((match) => ({ path: result.path, line: match.line })),
  );
}

function SearchResultsList({
  query,
  results,
  onOpen,
}: {
  query: string;
  results: SearchResults | null;
  onOpen: (path: string, line: number | undefined, fromKeys: boolean) => void;
}) {
  if (results === null) return <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>;
  if (results.results.length === 0) return <p className={cx("px-3 py-2 text-xs text-muted-foreground", enter.fade)}>No matches for “{query}”.</p>;
  return (
    <div className="ob-search-results">
      {results.results.map((result, index) => (
        <FileMatches
          key={result.path}
          path={result.path}
          matches={result.matches}
          onOpen={onOpen}
          className={cx(enter.rise, speed.fast, STAGGER)}
          style={stagger(index)}
        />
      ))}
      {results.truncated ? <p className="px-3 py-2 text-xs text-muted-foreground">More results not shown; refine your search.</p> : null}
    </div>
  );
}

/** Vault header, search, and file tree. */
export function VaultExplorer({ vault, actions, onHide }: { vault: Vault; actions: VaultActions; onHide: () => void }) {
  const pluginId = experimental_usePluginId();
  const openNote = useOpenNote();
  const global = useGlobalCommands();
  const { rpc, status, tree, resolver, error } = vault;
  const { currentPath, folderExists } = actions;
  const [expanded, setExpanded] = useLocalStorageState<string[]>(`${pluginId}:expanded`, []);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [cutPath, setCutPath] = useState<string | null>(null);
  const [query, setQuery] = useSearchQuery();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    setResults(null);
    if (trimmed === "") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      rpc.call("search", { query: trimmed }).then(
        (next) => !cancelled && setResults(next),
        (cause) => !cancelled && toast.error(errorMessage(cause)),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rpc, query]);

  useEffect(() => {
    if (results !== null) setSearchStops(searchStops(results));
  }, [results]);

  const currentFolder = currentPath === null ? "" : folderExists(currentPath) ? currentPath : dirname(currentPath);

  const treeActions: FileTreeActions = useMemo(
    () => ({
      open: (path) => openNote(path),
      newNote: actions.newNote,
      newFolder: async (folder) => {
        const path = await actions.newFolder(folder);
        if (path === null) return;
        setExpanded((current) => [...new Set([...current, folder, path].filter(Boolean))]);
        setRenaming(path);
      },
      rename: actions.rename,
      remove: actions.requestDelete,
      move: actions.move,
    }),
    [openNote, actions, setExpanded],
  );

  /**
   * Opens a search match. From the keys, the page takes them so n and N carry on from it; a
   * click puts the caret in the editor at the match, as before.
   */
  const openMatch = useCallback(
    (path: string, line: number | undefined, fromKeys: boolean) => {
      const { stops } = getSearchStops();
      // A file's name button counts as its first match.
      const index = stops.findIndex((stop) => stop.path === path && (line === undefined || stop.line === line));
      setSearchStopIndex(index === -1 ? null : index);
      openNote(path, { target: line === undefined ? undefined : { line }, focus: !fromKeys });
      if (fromKeys) requestSurfaceFocus("page");
    },
    [openNote],
  );

  /** The open note's row, else the first row under the buttons and text boxes. */
  const startIndex = (elements: HTMLElement[]) => {
    const current = elements.findIndex((element) => element.dataset.path === currentPath);
    return current !== -1 ? current : Math.max(elements.findIndex((element) => element.dataset.navRow !== "toolbar" && element.dataset.navRow !== "field"), 0);
  };

  const focusList = () => {
    const body = bodyRef.current;
    if (body === null) return;
    const { elements } = readRows(body);
    const row = elements[startIndex(elements)];
    if (row !== undefined) focusRow(row);
    else root?.focus({ preventScroll: true });
  };

  /** Expands the folders holding `path` so its row shows. */
  const expandTo = (path: string) => {
    const ancestors: string[] = [];
    for (let folder = dirname(path); folder !== ""; folder = dirname(folder)) ancestors.push(folder);
    if (ancestors.some((folder) => !expanded.includes(folder))) setExpanded((current) => [...new Set([...current, ...ancestors])]);
  };

  /** Shows the open note's row and puts the cursor on it. */
  const revealCurrent = () => {
    if (currentPath !== null) expandTo(currentPath);
    requestAnimationFrame(focusList);
  };

  useSurfaceFocusRequest("files", root, (intent) => {
    if (intent === "search") {
      searchRef.current?.focus();
      searchRef.current?.select();
    } else {
      revealCurrent();
    }
  });

  /** The file or folder under the cursor: a tree row or a search result. */
  const cursorPath = (): string | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || root === null || !root.contains(active)) return null;
    return active.closest<HTMLElement>("[data-path]")?.dataset.path ?? null;
  };
  const folderAt = (path: string | null) => (path === null ? currentFolder : folderExists(path) ? path : dirname(path));

  const onCommand = (command: VaultCommand): boolean => {
    const body = bodyRef.current;
    const path = cursorPath();
    switch (command.kind) {
      case "list":
      case "scroll":
        if (root === null) return false;
        // The whole sidebar, so k from the top row climbs to the buttons above the search box.
        return runListCommand(root, command, {
          start: startIndex,
          onActivate(row, motion) {
            const rowPath = row.getAttribute("role") === "treeitem" ? row.dataset.path : undefined;
            if (rowPath === undefined || folderExists(rowPath) || motion !== "open") {
              row.click();
              return;
            }
            openNote(rowPath);
            requestSurfaceFocus("page");
          },
        });
      case "edit":
        if (editFieldAtCursor()) return true;
        searchRef.current?.focus();
        return true;
      case "newNote":
        treeActions.newNote(folderAt(path));
        return true;
      case "newFolder":
        void treeActions.newFolder(folderAt(path));
        return true;
      case "rename":
        if (path === null) return false;
        // A search result renames in the tree, which the search was covering.
        if (query !== "") {
          setQuery("");
          expandTo(path);
        }
        setRenaming(path);
        return true;
      case "delete":
        if (path === null) return false;
        actions.requestDelete(path);
        return true;
      case "copyPath":
        if (path === null) return false;
        copyToClipboard(path, "path");
        return true;
      case "copyLink":
        if (path === null || !isNotePath(path)) return false;
        copyToClipboard(`[[${resolver.linkTextFor(path)}]]`, "wikilink");
        return true;
      case "cut":
        if (path === null) return false;
        setCutPath(path);
        toast.message(`Cut ${basename(path)}`, { description: "Press p on a folder or a file in it to move it there; Esc cancels." });
        return true;
      case "paste": {
        if (cutPath === null) return false;
        const folder = folderAt(path);
        if (!canMoveInto(cutPath, folder)) {
          toast.message(folder === dirname(cutPath) ? `${basename(cutPath)} is already there.` : "A folder can't move into itself.");
          return true;
        }
        actions.move(cutPath, folder);
        setCutPath(null);
        return true;
      }
      case "sidebar":
        onHide();
        return true;
      case "collapseAll":
        setExpanded([]);
        requestAnimationFrame(focusList);
        return true;
      case "escape":
        if (command.fromField) {
          const field = document.activeElement;
          requestAnimationFrame(() => {
            if (document.activeElement !== field && document.activeElement !== document.body) return;
            const row = fieldRowOf(field);
            if (row !== null) focusRow(row);
            else focusList();
          });
          return true;
        }
        if (cutPath !== null) {
          setCutPath(null);
          return true;
        }
        if (query !== "") {
          setQuery("");
          requestAnimationFrame(focusList);
          return true;
        }
        requestSurfaceFocus("page");
        return true;
      default:
        return global(command);
    }
  };
  useVaultKeys("files", root, onCommand);

  return (
    <div ref={setRoot} tabIndex={-1} className="ob-explorer outline-none">
      <div className="ob-sidebar-header">
        <span className="truncate text-sm font-semibold" title={status?.vaultPath ?? undefined}>
          {status?.vaultName ?? "Vault"}
        </span>
        <div className="flex shrink-0 items-center" data-nav-row="toolbar">
          <Button variant="ghost" size="icon" className="size-7" aria-label="New note" onClick={() => treeActions.newNote(currentFolder)}>
            <Icon name="EditFile" fallback="Plus" className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label="New folder" onClick={() => void treeActions.newFolder(currentFolder)}>
            <Icon name="FolderPlus" className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Collapse all folders" onClick={() => setExpanded([])}>
            <Icon name="ChevronsUp" fallback="ChevronUp" className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Hide files (t)" onClick={onHide}>
            <Icon name="PanelLeftClose" fallback="ChevronLeft" className="size-4" />
          </Button>
        </div>
      </div>
      <div className="px-2 pb-2">
        <div className="relative" data-nav-row="field" tabIndex={-1}>
          <Icon name="Search" className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusList();
              }
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                const trimmed = query.trim();
                if (trimmed === "") return;
                // Enter can beat the debounce; search right away instead of waiting on it.
                const ready = results !== null ? Promise.resolve(results) : rpc.call("search", { query: trimmed });
                ready.then(
                  (found) => {
                    const stops = searchStops(found);
                    setSearchStops(stops);
                    if (stops.length === 0) toast.message(`No matches for “${trimmed}”.`);
                    else openMatch(stops[0]!.path, stops[0]!.line, true);
                  },
                  (cause) => toast.error(errorMessage(cause)),
                );
              }
            }}
            placeholder="Search vault"
            aria-label="Search vault"
            data-vim-ignore
            className="ob-search-input"
          />
        </div>
      </div>
      <div ref={bodyRef} className="ob-sidebar-body">
        {error !== null ? <p className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
        {query.trim() !== "" ? (
          <SearchResultsList query={query.trim()} results={results} onOpen={openMatch} />
        ) : tree === null ? (
          <LoadingLines lines={6} className="px-3 py-2" />
        ) : (
          <FileTree
            tree={tree}
            currentPath={currentPath}
            expanded={expanded}
            setExpanded={setExpanded}
            renaming={renaming}
            setRenaming={setRenaming}
            cutPath={cutPath}
            actions={treeActions}
          />
        )}
      </div>
    </div>
  );
}
