import { useRpc } from "@get-bb/plugin-sdk/app";
import { KeyHelp, returnToRow, runListMotion, runListScroll, useKeyScope } from "bb-vim-keys/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Kind, Summary, SummaryItem, rpcContract } from "../contract";
import { formatAgo, formatCount, pluginName } from "./format";
import { HELP, KEYMAP, KIND_FILTERS, RANGES } from "./keys";

const ITEM_LIMIT = 2000;
const DEFAULT_RANGE = 1;

const KIND_BADGE: Readonly<Record<Kind, { text: string; className: string }>> = {
  click: { text: "click", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  command: { text: "keys", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  key: { text: "key", className: "bg-muted text-muted-foreground" },
  route: { text: "page", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
};

interface Group {
  plugin: string | null;
  count: number;
  items: SummaryItem[];
}

function useSummary(range: number, kindIndex: number, version: number) {
  const rpc = useRpc<typeof rpcContract>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    const ms = RANGES[range]!.ms;
    rpc.call("summary", { sinceMs: ms === null ? null : Date.now() - ms, kind: KIND_FILTERS[kindIndex]!.kind, plugin: null, limit: ITEM_LIMIT }).then(
      (result) => {
        if (id !== request.current) return;
        setSummary(result);
        setError(null);
      },
      (reason: unknown) => {
        if (id !== request.current) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
  }, [rpc, range, kindIndex, version]);
  return { summary, error };
}

function groupItems(summary: Summary, query: string): Group[] {
  const needle = query.trim().toLowerCase();
  const byPlugin = new Map<string | null, Group>();
  for (const item of summary.items) {
    if (needle !== "" && !item.label.toLowerCase().includes(needle) && !item.key.toLowerCase().includes(needle)) continue;
    let group = byPlugin.get(item.plugin);
    if (group === undefined) {
      group = { plugin: item.plugin, count: 0, items: [] };
      byPlugin.set(item.plugin, group);
    }
    group.items.push(item);
    group.count += item.count;
  }
  return [...byPlugin.values()].sort((a, b) => b.count - a.count);
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-xs outline-none focus:ring-2 focus:ring-ring/60 ${pressed ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}

function ItemRow({ item, now, largest }: { item: SummaryItem; now: number; largest: number }) {
  const badge = KIND_BADGE[item.kind];
  const via = item.kind === "click" && item.keyboard > 0 ? `${item.pointer} mouse · ${item.keyboard} keyboard` : null;
  return (
    <div data-nav-row="item" tabIndex={-1} className="-mx-1.5 flex flex-col gap-0.5 rounded-md px-1.5 py-1 outline-none hover:bg-accent/50 focus:bg-accent">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`shrink-0 rounded px-1 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}>{badge.text}</span>
        <span className={`min-w-0 truncate ${item.kind === "command" || item.kind === "key" ? "font-mono" : ""}`}>{item.label}</span>
        {item.key !== item.label ? <span className="min-w-0 truncate text-xs text-muted-foreground">{item.key}</span> : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatAgo(item.lastAt, now)}</span>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums">{formatCount(item.count)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-1 flex-1 rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-sky-500/70" style={{ width: `${(item.count / largest) * 100}%` }} />
        </span>
        {via !== null ? <span className="shrink-0 text-[10px] text-muted-foreground">{via}</span> : null}
      </div>
    </div>
  );
}

function PluginGroup({ group, open, onToggle, now, total }: { group: Group; open: boolean; onToggle: () => void; now: number; total: number }) {
  const largest = Math.max(1, ...group.items.map((item) => item.count));
  return (
    <section data-nav-group className="flex flex-col gap-1">
      <button
        type="button"
        data-nav-row="group"
        aria-expanded={open}
        tabIndex={-1}
        onClick={onToggle}
        className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent/50 focus:bg-accent"
      >
        <span className="w-3 text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
        <span className="font-medium">{pluginName(group.plugin)}</span>
        <span className="text-xs text-muted-foreground">
          {group.items.length} {group.items.length === 1 ? "thing" : "things"}
        </span>
        <span className="ml-auto h-1 w-24 rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-foreground/40" style={{ width: `${(group.count / Math.max(1, total)) * 100}%` }} />
        </span>
        <span className="w-12 text-right text-xs tabular-nums">{formatCount(group.count)}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-0.5 pl-5">
          {group.items.map((item) => (
            <ItemRow key={`${item.kind}\u0000${item.key}`} item={item} now={now} largest={largest} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ActivityPage() {
  const root = useRef<HTMLDivElement>(null);
  const filterBox = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [kindIndex, setKindIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<ReadonlySet<string | null>>(() => new Set());
  const [help, setHelp] = useState(false);
  const [version, refresh] = useReducer((count: number) => count + 1, 0);
  const { summary, error } = useSummary(range, kindIndex, version);
  const now = Date.now();
  const groups = useMemo(() => (summary === null ? [] : groupItems(summary, query)), [summary, query]);

  const toggle = useCallback((plugin: string | null) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(plugin)) next.delete(plugin);
      else next.add(plugin);
      return next;
    });
  }, []);

  useKeyScope(root, true, {
    keymap: KEYMAP,
    takeFocus: true,
    onTextEscape: (field) => returnToRow(field, root.current),
    onCommand: (command, { count }) => {
      const list = root.current;
      if (list === null) return false;
      switch (command) {
        case "scroll-down":
          return runListScroll(list, 1, 0.5, { count });
        case "scroll-up":
          return runListScroll(list, -1, 0.5, { count });
        case "range-1":
        case "range-2":
        case "range-3":
        case "range-4":
          setRange(Number(command.slice(-1)) - 1);
          return true;
        case "cycle-kind":
          setKindIndex((index) => (index + 1) % KIND_FILTERS.length);
          return true;
        case "filter":
          filterBox.current?.focus();
          filterBox.current?.select();
          return true;
        case "refresh":
          refresh();
          return true;
        case "help":
          setHelp((open) => !open);
          return true;
        case "escape":
          if (help) setHelp(false);
          else if (query !== "") setQuery("");
          else return false;
          return true;
        default:
          return runListMotion(list, command, { count });
      }
    },
  });

  return (
    <div ref={root} tabIndex={-1} className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm outline-none" aria-label="Activity">
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold">Activity</h2>
          {summary !== null ? (
            <span className="text-xs text-muted-foreground">
              {formatCount(summary.total)} events{summary.firstAt === null ? "" : ` · logging since ${new Date(summary.firstAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </span>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">? for keys</span>
        </div>
        <div data-nav-row="toolbar" className="flex flex-wrap items-center gap-1.5" aria-label="Range and kind">
          {RANGES.map((option, index) => (
            <Toggle key={option.label} pressed={index === range} onClick={() => setRange(index)}>
              {option.label}
            </Toggle>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {KIND_FILTERS.map((option, index) => (
            <Toggle key={option.label} pressed={index === kindIndex} onClick={() => setKindIndex(index)}>
              {option.label}
            </Toggle>
          ))}
        </div>
        <div data-nav-row="field" tabIndex={-1} className="-mx-1.5 rounded-md px-1.5 py-0.5 outline-none focus:bg-accent">
          <input
            ref={filterBox}
            data-vim-ignore
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name ( / )"
            aria-label="Filter rows"
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/60"
          />
        </div>
      </header>
      {help ? (
        <section className="rounded-md border border-border bg-muted/40 p-3" aria-label="Keys">
          <KeyHelp sections={HELP} />
        </section>
      ) : null}
      {error !== null ? <p className="text-xs text-red-600 dark:text-red-400">Couldn't read the log: {error}</p> : null}
      {summary !== null && summary.total === 0 ? <p className="text-muted-foreground">Nothing recorded in this range. Clicks, key commands, and pages are logged as you use bb.</p> : null}
      {summary !== null && summary.total > 0 && groups.length === 0 ? <p className="text-muted-foreground">Nothing matches the filter.</p> : null}
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <PluginGroup key={group.plugin ?? "\u0000bb"} group={group} open={!closed.has(group.plugin)} onToggle={() => toggle(group.plugin)} now={now} total={summary?.total ?? 0} />
        ))}
      </div>
    </div>
  );
}
