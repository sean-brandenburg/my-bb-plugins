import {
  experimental_useProviders,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreads,
  type PluginHomepageSectionProps,
  type PluginSidebarThread,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import { cx, enter, speed, STAGGER, stagger } from "bb-motion";
import { GLYPH, Glyph, useNerdFont } from "bb-nerd-font";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { WorktreeRow } from "../rpc-contract.js";
import { canCleanUp } from "../worktree.js";
import { cursorRow, moveAcross, moveToMatch, pageColumn } from "./cursor.js";
import { useNow, useProjectNames, useTurnStarts, useWorktrees } from "./data.js";
import { formatAgo, formatSpan, plural, shortBranch } from "./format.js";
import { type LimitStatus, SAMPLED_THREADS, useLimitWindows } from "./limits.js";
import { ATTENTION_LABEL, type Attention, groupThreads } from "./threads.js";
import { focusRow, Kbd, KeyHelp, type KeyHelpSection, type Keymap, readRows, runListMotion, useKeyScope } from "bb-vim-keys/react";

type Command =
  | "down"
  | "up"
  | "top"
  | "bottom"
  | "pageDown"
  | "pageUp"
  | "left"
  | "right"
  | "open"
  | "cleanUp"
  | "confirm"
  | "next"
  | "previous"
  | "search"
  | "refresh"
  | "compose"
  | "help"
  | "escape";

const KEYMAP: Keymap<Command> = {
  j: "down",
  "<Down>": "down",
  k: "up",
  "<Up>": "up",
  gg: "top",
  G: "bottom",
  "<C-d>": "pageDown",
  "<C-u>": "pageUp",
  h: "left",
  "<Left>": "left",
  l: "right",
  "<Right>": "right",
  "<CR>": "open",
  o: "open",
  dd: "cleanUp",
  y: "confirm",
  n: "next",
  N: "previous",
  "/": "search",
  r: "refresh",
  i: "compose",
  "?": "help",
  "<Esc>": "escape",
};

export const HELP: readonly KeyHelpSection[] = [
  {
    title: "Move",
    keys: [
      { keys: ["j", "k"], action: "Next and previous row" },
      { keys: ["h", "l"], action: "Across columns" },
      { keys: ["gg", "G"], action: "First and last row" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down and up" },
    ],
  },
  {
    title: "Act",
    keys: [
      { keys: ["Enter", "o"], action: "Open the thread" },
      { keys: ["dd"], action: "Clean up an unused worktree, then y to confirm" },
      { keys: ["r"], action: "Recheck worktrees" },
      { keys: ["/"], action: "Search rows" },
      { keys: ["n", "N"], action: "Next and previous match" },
      { keys: ["i"], action: "Back to the composer" },
      { keys: ["?"], action: "Show these keys" },
      { keys: ["Esc"], action: "Close, cancel, or clear the search" },
    ],
  },
];

const MAX_NEEDS_YOU = 8;
const MAX_RUNNING = 6;
const MAX_WORKTREES = 8;
const NOTICE_MS = 6000;
const COMPOSER_INPUT = '[data-promptbox] [contenteditable="true"]';

type Tone = "amber" | "red" | "green" | "blue" | "muted";

const DOT: Readonly<Record<Tone, string>> = {
  amber: "bg-amber-500",
  red: "bg-red-500",
  green: "bg-emerald-500",
  blue: "bg-sky-500 animate-pulse",
  muted: "bg-muted-foreground/40",
};

const ATTENTION_TONE: Readonly<Record<Attention, Tone>> = { input: "amber", failed: "red", "queue-failed": "red", done: "green" };
const LIMIT_TONE: Readonly<Record<LimitStatus, Tone>> = { allowed: "green", warning: "amber", blocked: "red", unknown: "muted" };
const LIMIT_LABEL: Readonly<Record<LimitStatus, string>> = { allowed: "OK", warning: "Nearly used", blocked: "Reached", unknown: "Unknown" };

interface RowAction {
  open(): void;
  cleanUp?: () => void;
}

function matchesQuery(query: string, ...texts: (string | null | undefined)[]): boolean {
  if (query === "") return false;
  const needle = query.toLowerCase();
  return texts.some((text) => text?.toLowerCase().includes(needle) === true);
}

export function Dashboard({ projectId }: PluginHomepageSectionProps) {
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const navigate = useBbNavigate();
  const { providers } = experimental_useProviders();
  const projects = useProjectNames();
  const nerdFont = useNerdFont();
  const now = useNow(30_000);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [help, setHelp] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => groupThreads(sidebar.threads, projectId), [sidebar.threads, projectId]);
  const running = groups.running.slice(0, MAX_RUNNING);
  const turnStarts = useTurnStarts(running.map((thread) => thread.id));

  const sampled = useMemo(() => [...sidebar.threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SAMPLED_THREADS), [sidebar.threads]);
  const limits = useLimitWindows(
    sampled.map((thread) => thread.id),
    sampled[0]?.updatedAt ?? 0,
  );

  const liveThreads = useMemo(
    () =>
      sidebar.threads
        .map((thread) => thread.id)
        .sort()
        .join(","),
    [sidebar.threads],
  );
  const worktrees = useWorktrees(liveThreads);
  const worktreeRows = (worktrees.rows ?? []).filter((row) => projectId === null || row.projectId === projectId);
  const heldByPlugin = new Map<string, number>();
  for (const entry of worktrees.held) {
    if (projectId !== null && entry.projectId !== projectId) continue;
    const plugin = entry.pluginId ?? "plugin";
    heldByPlugin.set(plugin, (heldByPlugin.get(plugin) ?? 0) + entry.count);
  }

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (searching) searchInput.current?.focus();
  }, [searching]);

  const projectLabel = (id: string) => (projectId === null ? (projects.get(id) ?? null) : null);
  const providerName = (id: string) => providers.find((provider) => provider.id === id)?.displayName ?? id;

  const rowActions = new Map<string, RowAction>();
  const openThread = (thread: PluginSidebarThread) => actions.open(thread.id);

  const cleanUp = (row: WorktreeRow) => {
    setConfirming(null);
    worktrees.cleanUp(row.environmentId).then(
      () => setNotice(`Cleaned up ${row.branchName === null ? "the worktree" : shortBranch(row.branchName)}.`),
      (failure: unknown) => setNotice(failure instanceof Error ? failure.message : String(failure)),
    );
  };

  const runCommand = (command: Command): boolean => {
    if (root === null) return false;
    const current = cursorRow(root);
    const action = current === null ? undefined : rowActions.get(current.dataset.rowId ?? "");
    if (confirming !== null) {
      const row = worktreeRows.find((candidate) => candidate.environmentId === confirming);
      if (command === "confirm" && row !== undefined) cleanUp(row);
      else setConfirming(null);
      return true;
    }
    switch (command) {
      case "down":
      case "up":
      case "top":
      case "bottom":
        return runListMotion(root, command);
      case "pageDown":
        return pageColumn(root, 1);
      case "pageUp":
        return pageColumn(root, -1);
      case "left":
        return moveAcross(root, -1);
      case "right":
        return moveAcross(root, 1);
      case "open":
        return runListMotion(root, "open");
      case "cleanUp":
        if (action?.cleanUp === undefined) return false;
        action.cleanUp();
        return true;
      case "confirm":
        return false;
      case "next":
        return moveToMatch(root, 1);
      case "previous":
        return moveToMatch(root, -1);
      case "search":
        setSearching(true);
        return true;
      case "refresh":
        worktrees.refresh();
        return true;
      case "compose":
        root.ownerDocument.querySelector<HTMLElement>(COMPOSER_INPUT)?.focus();
        return true;
      case "help":
        setHelp((open) => !open);
        return true;
      case "escape":
        if (help) setHelp(false);
        else if (query !== "") setQuery("");
        else return false;
        return true;
    }
  };

  useKeyScope(root, true, {
    keymap: KEYMAP,
    onCommand: (command) => runCommand(command),
    onTextEscape: (field) => {
      if (field !== searchInput.current) return false;
      setSearching(false);
      setQuery("");
      root?.focus({ preventScroll: true });
      return true;
    },
  });

  const finishSearch = () => {
    setSearching(false);
    requestAnimationFrame(() => {
      if (root === null) return;
      const first = readRows(root).elements.find((row) => row.dataset.match === "true");
      if (first !== undefined) focusRow(first);
      else root.focus({ preventScroll: true });
    });
  };

  let rowIndex = 0;
  const row = (props: {
    id: string;
    action: RowAction;
    tone: Tone;
    title: string;
    detail?: string | null;
    project?: string | null;
    meta: ReactNode;
    tooltip?: string;
    matched: boolean;
    trailing?: ReactNode;
    children?: ReactNode;
  }) => {
    rowActions.set(props.id, props.action);
    const index = rowIndex++;
    return (
      <div
        key={props.id}
        data-nav-row="item"
        data-row-id={props.id}
        data-match={props.matched ? "true" : undefined}
        tabIndex={-1}
        title={props.tooltip}
        onClick={() => props.action.open()}
        className={cx(
          "group/row flex min-w-0 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
          "hover:bg-accent/50 focus:bg-accent data-[match=true]:ring-1 data-[match=true]:ring-inset data-[match=true]:ring-amber-500/60",
          enter.fade,
          speed.fast,
          STAGGER,
        )}
        style={stagger(index)}
      >
        {props.children ?? (
          <>
            <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", DOT[props.tone])} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-foreground">{props.title}</span>
              <span className="flex min-w-0 gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0 tabular-nums">{props.meta}</span>
                {props.detail ? <span className="truncate">· {props.detail}</span> : null}
                {props.project ? <span className="ml-auto shrink-0 truncate pl-2">{props.project}</span> : null}
              </span>
            </span>
            {props.trailing}
          </>
        )}
      </div>
    );
  };

  const needsYouRows = groups.needsYou.slice(0, MAX_NEEDS_YOU).map(({ thread, attention }) =>
    row({
      id: `thread:${thread.id}`,
      action: { open: () => openThread(thread) },
      tone: ATTENTION_TONE[attention],
      title: thread.displayTitle,
      project: projectLabel(thread.projectId),
      meta: (
        <>
          {ATTENTION_LABEL[attention]} · {formatAgo(thread.latestAttentionAt, now)}
        </>
      ),
      matched: matchesQuery(query, thread.displayTitle, ATTENTION_LABEL[attention]),
    }),
  );

  const runningRows = running.map((thread) => {
    const started = turnStarts.get(thread.id);
    const work = [
      thread.activity.backgroundAgents > 0 ? plural(thread.activity.backgroundAgents, "agent") : null,
      thread.activity.backgroundCommands > 0 ? plural(thread.activity.backgroundCommands, "command") : null,
      thread.activity.workflows > 0 ? plural(thread.activity.workflows, "workflow") : null,
      thread.queuedWork === "waiting" ? "queued" : null,
    ].filter((part) => part !== null);
    return row({
      id: `thread:${thread.id}`,
      action: { open: () => openThread(thread) },
      tone: "blue",
      title: thread.displayTitle,
      detail: work.length === 0 ? null : work.join(", "),
      project: projectLabel(thread.projectId),
      meta: started === undefined ? thread.runtimeStatus : formatSpan(now - started),
      tooltip: started === undefined ? undefined : `Turn started ${formatAgo(started, now)}`,
      matched: matchesQuery(query, thread.displayTitle),
    });
  });

  const worktreeRowNodes = worktreeRows.slice(0, MAX_WORKTREES).map((worktree) => {
    const branch = worktree.branchName === null ? null : shortBranch(worktree.branchName);
    const title = worktree.thread?.title ?? branch ?? worktree.path;
    const cleanable = canCleanUp(worktree);
    const open = () => {
      if (worktree.thread === null) return;
      if (worktree.thread.archived) navigate.toThread(worktree.thread.id);
      else actions.open(worktree.thread.id);
    };
    const askCleanUp = cleanable ? () => setConfirming(worktree.environmentId) : undefined;
    const meta =
      worktree.tree === "dirty"
        ? `${plural(worktree.changedFiles, "file")} +${worktree.insertions} −${worktree.deletions}`
        : worktree.tree === "unknown"
          ? "status unknown"
          : `idle ${formatSpan(now - worktree.lastActiveAt)}`;
    const id = `worktree:${worktree.environmentId}`;
    return row({
      id,
      action: { open, cleanUp: askCleanUp },
      tone: worktree.tree === "dirty" ? "amber" : "muted",
      title,
      detail: worktree.tree === "dirty" ? (worktree.unused ? "uncommitted, no live thread" : "uncommitted") : "unused",
      project: projectLabel(worktree.projectId),
      meta,
      tooltip: `${worktree.branchName ?? "detached"}\n${worktree.path}`,
      matched: matchesQuery(query, title, branch),
      trailing: askCleanUp ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            askCleanUp();
          }}
          className="shrink-0 rounded px-1.5 text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover/row:opacity-100 group-focus/row:opacity-100"
        >
          Clean up
        </button>
      ) : null,
      children:
        confirming === worktree.environmentId ? (
          <span className="flex min-w-0 flex-1 items-center gap-2" onClick={(event) => event.stopPropagation()}>
            <span className="min-w-0 flex-1 truncate text-foreground">Remove the worktree for {branch ?? title}?</span>
            <button type="button" className="shrink-0 rounded px-1.5 text-xs text-red-500 hover:bg-red-500/10" onClick={() => cleanUp(worktree)}>
              Remove <Kbd className="ml-1">y</Kbd>
            </button>
            <button type="button" className="shrink-0 rounded px-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setConfirming(null)}>
              Cancel <Kbd className="ml-1">n</Kbd>
            </button>
          </span>
        ) : undefined,
    });
  });

  const providerCount = new Set(limits.windows.map((window) => window.providerId)).size;

  return (
    <div ref={setRoot} tabIndex={-1} data-dashboard="" className="@container flex flex-col gap-3 outline-none">
      {searching || query !== "" ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
          <span className="font-mono text-muted-foreground">/</span>
          {searching ? (
            <input
              ref={searchInput}
              data-vim-ignore=""
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finishSearch();
                }
              }}
              placeholder="Search threads and worktrees"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{query}</span>
          )}
          <span className="text-xs text-muted-foreground">{searching ? "Enter to jump, Esc to clear" : "n / N to step, Esc to clear"}</span>
        </div>
      ) : null}
      {help ? (
        <div className={cx("rounded-lg border border-border p-4", enter.fade, speed.fast)}>
          <KeyHelp sections={HELP} />
        </div>
      ) : null}
      <div className="grid gap-x-6 gap-y-4 @2xl:grid-cols-2">
        <div data-nav-column="" className="flex min-w-0 flex-col gap-4">
          <Group title="Needs you" count={groups.needsYou.length} shown={needsYouRows.length} empty="Nothing is waiting on you.">
            {needsYouRows}
          </Group>
          <Group title="Running" count={groups.running.length} shown={runningRows.length} empty="No thread is working right now.">
            {runningRows}
          </Group>
        </div>
        <div data-nav-column="" className="flex min-w-0 flex-col gap-4">
          <Group title="Usage limits" count={0} shown={limits.windows.length} empty={limits.loaded ? "No limits reported by recent threads." : "Loading…"}>
            {limits.windows.map((window) => (
              <div key={window.key} className="flex items-center gap-2 px-2 py-1.5 text-sm" title={`Reported ${formatAgo(window.reportedAt, now)}`}>
                {nerdFont ? (
                  <Glyph glyph={window.status === "blocked" ? GLYPH.timerSandFull : GLYPH.timerSand} className={cx("shrink-0 text-[13px]", window.status === "allowed" ? "text-muted-foreground" : window.status === "warning" ? "text-amber-500" : "text-red-500")} />
                ) : (
                  <span className={cx("size-2 shrink-0 rounded-full", DOT[LIMIT_TONE[window.status]])} aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {providerCount > 1 ? `${providerName(window.providerId)} · ` : ""}
                  {window.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {LIMIT_LABEL[window.status]}
                  {window.resetsAtMs === null ? "" : ` · resets in ${formatSpan(window.resetsAtMs - now)}`}
                </span>
              </div>
            ))}
          </Group>
          <Group
            title="Worktrees"
            count={worktreeRows.length}
            shown={worktreeRowNodes.length}
            empty={worktrees.error ?? (worktrees.rows === null ? "Checking worktrees…" : "No worktree has changes or sits unused.")}
            footer={[...heldByPlugin].map(([plugin, count]) => (
              <p key={plugin} className="px-2 py-1 text-xs text-muted-foreground">
                {plural(count, "worktree")} kept by hidden {plugin} threads
              </p>
            ))}
          >
            {worktreeRowNodes}
          </Group>
        </div>
      </div>
      {notice !== null ? <p className={cx("px-2 text-xs text-muted-foreground", enter.fade, speed.fast)}>{notice}</p> : null}
      <p className="px-2 text-xs text-muted-foreground [text-shadow:0_1px_2px_var(--background)]">
        <Kbd>Esc</Kbd> out of the composer, then <Kbd>j</Kbd> <Kbd>k</Kbd> to move · <Kbd>?</Kbd> for keys
      </p>
    </div>
  );
}

function Group(props: { title: string; count: number; shown: number; empty: string; footer?: ReactNode; children: ReactNode }) {
  const hidden = props.count - props.shown;
  return (
    <section className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border/60 bg-background/80 p-2 backdrop-blur-sm">
      <h3 className="flex items-baseline gap-2 px-2 pt-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.title}
        {props.count > 0 ? <span className="tabular-nums">{props.count}</span> : null}
      </h3>
      {props.shown === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">{props.empty}</p> : props.children}
      {hidden > 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">{hidden} more</p> : null}
      {props.footer}
    </section>
  );
}
