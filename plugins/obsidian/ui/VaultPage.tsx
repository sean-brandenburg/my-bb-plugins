import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { NUDGE, cx, enter, speed, useReplay } from "bb-motion";
import { experimental_useAppPanel, experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { errorMessage } from "../shared/errors";
import { targetFromSubpath } from "../shared/note-text";
import { NOTE_EXTENSION, dirname, extension, isNotePath, joinPath, normalizePath, type LinkKind } from "../shared/obsidian";
import { dateKeyOfDailyPath } from "../shared/daily";
import { DailyNoteActions, Dashboard, startRoutine } from "./daily";
import { ATTACHMENT_EXTENSIONS } from "./file-kinds";
import { decodeNotePath, requestNavigation, useOpenNote } from "./navigation";
import { focusEditor } from "./Editor";
import { VaultExplorer } from "./Explorer";
import { backlinksTab, outlineTab } from "./fixed-tabs";
import { copyToClipboard, useGlobalCommands } from "./global-keys";
import { KeysDialog } from "./KeysDialog";
import { obsidianUrl } from "./NoteHeader";
import { NoteView, type ViewMode } from "./NoteView";
import { flushOpenNotes, setCurrentNotePath, useLocalStorageState, usePanelTabRequests, useSearchQuery, useTitleFocusPath } from "./state";
import { useVaultActions } from "./vault-actions";
import { usePreviewBase, useVault, type VaultRpc } from "./vault-client";
import { editFieldAtCursor, fieldRowOf, focusRow, requestSurfaceFocus, runListCommand, useSurfaceFocusRequest, useVaultKeys } from "./vault-keys";
import type { PanelTab, VaultCommand } from "./vault-nav";

const RECENT_LIMIT = 12;

const PANEL_TABS = { outline: outlineTab, backlinks: backlinksTab } as const;

/** How far j and k scroll a note, matching vim-mode's scroll mode in threads. */
const LINE_STEP_PX = 60;

/** The open note's scrolling pane: the editor's scroller, or the reading view. */
function noteScroller(root: HTMLElement): HTMLElement | null {
  const body = [...root.querySelectorAll<HTMLElement>(".ob-note-body")].find((element) => element.getClientRects().length > 0);
  if (body === undefined) return null;
  return body.querySelector<HTMLElement>(".cm-scroller") ?? body;
}

function scrollNote(root: HTMLElement, command: VaultCommand): boolean {
  const scroller = noteScroller(root);
  if (scroller === null) return false;
  if (command.kind === "scroll") {
    scroller.scrollBy({ top: command.step * scroller.clientHeight * (command.amount === "half" ? 0.5 : 0.9) });
    return true;
  }
  if (command.kind !== "list") return false;
  switch (command.motion) {
    case "down":
      scroller.scrollBy({ top: LINE_STEP_PX });
      return true;
    case "up":
      scroller.scrollBy({ top: -LINE_STEP_PX });
      return true;
    case "top":
      scroller.scrollTo({ top: 0 });
      return true;
    case "bottom":
      scroller.scrollTo({ top: scroller.scrollHeight });
      return true;
    default:
      return false;
  }
}

function SetupScreen({ rpc, onConfigured }: { rpc: VaultRpc; onConfigured: () => void }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nudge = useReplay(NUDGE);
  const reject = (reason: string | null) => {
    setMessage(reason);
    nudge.play();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() === "" || pending) return;
    setPending(true);
    try {
      const result = await rpc.call("configure", { vaultPath: value.trim() });
      if (!result.ok) {
        reject(result.message);
        return;
      }
      if (result.message !== null) toast.message(result.message);
      onConfigured();
    } catch (cause) {
      reject(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={submit} className={cx("mx-auto mt-20 w-full max-w-lg space-y-3 px-4", enter.rise)}>
        <h2 className="text-lg font-semibold">Open an Obsidian vault</h2>
        <p className="text-sm text-muted-foreground">
          Enter the absolute path of your vault folder on the bb server machine. You can change it later in the plugin's settings.
        </p>
        <div className={cx("flex gap-2", nudge.className)} onAnimationEnd={nudge.onAnimationEnd}>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="/Users/me/Documents/My Vault"
            aria-label="Vault folder"
            autoFocus
          />
          <Button type="submit" disabled={pending || value.trim() === ""}>
            Open
          </Button>
        </div>
        {message === null ? null : (
          <p key={message} role="alert" className={cx("text-sm text-destructive", enter.rise, speed.fast)}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}

export function VaultPage({ subPath }: { subPath: string }) {
  const pluginId = experimental_usePluginId();
  const openNote = useOpenNote();
  const vault = useVault();
  const { rpc, status, tree, resolver, notePaths, error, refreshTree } = vault;
  const actions = useVaultActions(vault);
  const previewBase = usePreviewBase(rpc);
  const currentPath = subPath === "" ? null : decodeNotePath(subPath);
  const titleFocusPath = useTitleFocusPath();
  const [, setQuery] = useSearchQuery();

  const [mode, setMode] = useLocalStorageState<ViewMode>(`${pluginId}:mode`, "edit");
  const [sidebarOpen, setSidebarOpen] = useLocalStorageState<boolean>(`${pluginId}:sidebar`, true);
  const appPanel = experimental_useAppPanel();
  // Files live in the page's own left sidebar; outline and backlinks in bb's right panel.
  const openTab = useCallback(
    (tab: PanelTab) => (tab === "files" ? setSidebarOpen(true) : appPanel.openFixedTab({ surface: { kind: "current" }, tab: PANEL_TABS[tab] })),
    [appPanel, setSidebarOpen],
  );
  usePanelTabRequests(openTab);
  const global = useGlobalCommands();
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setCurrentNotePath(currentPath);
  }, [currentPath]);
  useEffect(() => () => setCurrentNotePath(null), []);

  /** Shows the file sidebar. */
  const showExplorer = useCallback(() => openTab("files"), [openTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setMode((current) => (current === "edit" ? "read" : "edit"));
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        showExplorer();
        requestSurfaceFocus("files", "search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setMode, showExplorer]);

  const { createNote, folderExists } = actions;

  const openLink = useCallback(
    (target: string, subpath: string | null, kind: LinkKind) => {
      if (currentPath === null) return;
      const navigationTarget = targetFromSubpath(subpath);
      if (target === "") {
        if (navigationTarget !== undefined) requestNavigation(currentPath, navigationTarget);
        return;
      }
      const resolved = resolver.resolve(target, currentPath, kind);
      if (resolved !== null) {
        openNote(resolved, { target: navigationTarget });
        return;
      }
      const base = kind === "markdown" ? normalizePath(joinPath(dirname(currentPath), target)) : normalizePath(target);
      if (base === null || base === "") return;
      // "Meeting 2024.01.05" is a note name, not a file with a ".05" extension.
      if (ATTACHMENT_EXTENSIONS.has(extension(base))) {
        toast.error(`${target} isn't in this vault.`);
        return;
      }
      const path = isNotePath(base) ? base : base + NOTE_EXTENSION;
      void createNote(path);
    },
    [currentPath, resolver, openNote, createNote],
  );

  const onDashboard = currentPath === null || folderExists(currentPath);

  useSurfaceFocusRequest("page", root, () => root?.focus({ preventScroll: true }));

  const onCommand = (command: VaultCommand): boolean => {
    if (root === null || status === null || status.vaultPath === null) return false;
    if (command.kind === "escape") {
      if (!command.fromField) return false;
      // After the field's own Escape handling, which may blur it on the next frame.
      const field = document.activeElement;
      requestAnimationFrame(() => {
        if (document.activeElement !== field && document.activeElement !== document.body) return;
        const row = fieldRowOf(field);
        if (row !== null) focusRow(row);
        else root.focus({ preventScroll: true });
      });
      return true;
    }
    if (command.kind === "sidebar") {
      if (sidebarOpen) setSidebarOpen(false);
      else {
        setSidebarOpen(true);
        requestSurfaceFocus("files");
      }
      return true;
    }
    // h steps left: across the home's buttons, then out into the file sidebar.
    if (command.kind === "list" && command.motion === "left") {
      if (onDashboard && runListCommand(root, command)) return true;
      setSidebarOpen(true);
      requestSurfaceFocus("files");
      return true;
    }
    if (onDashboard) {
      switch (command.kind) {
        case "list":
        case "scroll":
          return runListCommand(root, command);
        case "edit":
          if (editFieldAtCursor()) return true;
          root.querySelector<HTMLElement>(".ob-capture-input")?.focus();
          return true;
        case "newNote":
          actions.newNote(currentPath ?? "");
          return true;
        case "routine":
          void startRoutine(command.mode);
          return true;
        default:
          return global(command);
      }
    }
    const path = currentPath!;
    const isNote = isNotePath(path);
    switch (command.kind) {
      case "list":
      case "scroll":
        return scrollNote(root, command);
      case "edit":
        if (!isNote) return false;
        if (mode === "edit") return focusEditor(path);
        setMode("edit");
        // The editor re-measures once it's shown again.
        requestAnimationFrame(() => requestAnimationFrame(() => focusEditor(path)));
        return true;
      case "mode":
        if (!isNote) return false;
        setMode(mode === "edit" ? "read" : "edit");
        return true;
      case "rename": {
        const title = root.querySelector<HTMLInputElement>("input.ob-title-input");
        if (title === null) return false;
        title.focus();
        title.select();
        return true;
      }
      case "newNote":
        actions.newNote(dirname(path));
        return true;
      case "delete":
        actions.requestDelete(path);
        return true;
      case "copyPath":
        copyToClipboard(path, "vault path");
        return true;
      case "copyLink":
        if (!isNote) return false;
        copyToClipboard(`[[${resolver.linkTextFor(path)}]]`, "wikilink");
        return true;
      case "openInObsidian": {
        const link = document.createElement("a");
        link.href = obsidianUrl(status.vaultPath, path);
        link.click();
        return true;
      }
      case "routine":
        if (dateKeyOfDailyPath(status.dailyFolder, path) !== status.todayKey) return false;
        void flushOpenNotes().then(() => startRoutine(command.mode));
        return true;
      default:
        return global(command);
    }
  };
  useVaultKeys("page", root, onCommand);

  const recent = useMemo(
    () => (tree === null ? [] : tree.files.filter((file) => isNotePath(file.path)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, RECENT_LIMIT)),
    [tree],
  );

  if (status === null) {
    return <p className="p-6 text-sm text-muted-foreground">{error ?? "Loading vault…"}</p>;
  }
  if (status.vaultPath === null) {
    return <SetupScreen rpc={rpc} onConfigured={() => void refreshTree()} />;
  }

  return (
    <div className="ob-vault">
      {sidebarOpen ? (
        <aside className="ob-sidebar" aria-label="Vault files">
          <VaultExplorer
            vault={vault}
            actions={actions}
            onHide={() => {
              setSidebarOpen(false);
              requestSurfaceFocus("page");
            }}
          />
        </aside>
      ) : (
        <div className="ob-sidebar-rail">
          <Button variant="ghost" size="icon" className="size-7" aria-label="Show files (t)" onClick={() => setSidebarOpen(true)}>
            <Icon name="PanelLeftOpen" fallback="ChevronRight" className="size-4" />
          </Button>
        </div>
      )}
      <main ref={setRoot} tabIndex={-1} className="ob-main outline-none">
        {onDashboard ? (
          <Dashboard vault={vault} recent={recent} />
        ) : (
          <NoteView
            key={currentPath}
            path={currentPath}
            vaultPath={status.vaultPath}
            rpc={rpc}
            resolver={resolver}
            notePaths={notePaths}
            previewBase={previewBase}
            mode={mode}
            setMode={setMode}
            headerActions={({ flush }) => <DailyNoteActions path={currentPath} status={status} flush={flush} />}
            focusTitle={titleFocusPath === currentPath}
            onOpenLink={openLink}
            onTagClick={(tag) => {
              setQuery(`#${tag}`);
              showExplorer();
            }}
            onRename={actions.rename}
            onDelete={actions.requestDelete}
            onCreate={(path) => void createNote(path)}
          />
        )}
      </main>
      {actions.deleteDialog}
      <KeysDialog />
    </div>
  );
}
