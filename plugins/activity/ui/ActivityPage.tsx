import { useRpc } from "@get-bb/plugin-sdk/app";
import { KeyHelp, returnToRow, runListMotion, runListScroll, useKeyScope } from "bb-vim-keys/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { KINDS, type Kind, type Summary, type SummaryItem, type TimelineBucket, type rpcContract } from "../contract";
import { computeFindings, type Emphasis, type Finding, matchesEmphasis } from "./findings";
import { formatAgo, formatCount, pluginName } from "./format";
import { HELP, KEYMAP, KIND_FILTERS, RANGES } from "./keys";
import { bucketOffset, bucketSpanLabel, bucketStart, bucketStarts, bucketWidth } from "./time";
import { Timeline } from "./Timeline";

const ITEM_LIMIT = 2000;
const DEFAULT_RANGE = 1;
/** Rows a kind shows inside a plugin before "more" has to be pressed. */
const SECTION_LIMIT = 6;
/** Plugins the share bar names before folding the rest into "other". */
const SHARE_SEGMENTS = 6;
/** Share below which a segment is too thin to carry its own label. */
const SHARE_LABEL_MIN = 0.09;

const KIND_NAMES: Readonly<Record<Kind, { one: string; many: string; section: string }>> = {
  route: { one: "page", many: "pages", section: "Pages" },
  click: { one: "control", many: "controls", section: "Clicks" },
  command: { one: "command", many: "commands", section: "Key commands" },
  key: { one: "key", many: "keys", section: "Other keys" },
};

/** Fixed hue per kind, the same everywhere a kind is named. */
const KIND_BADGE: Readonly<Record<Kind, string>> = {
  click: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  command: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  key: "bg-muted text-muted-foreground",
  route: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

/** The order kinds appear in under a plugin: where you went, what you pressed, what you typed. */
const SECTION_ORDER: readonly Kind[] = ["route", "click", "command", "key"];

/** Name, then a fixed block of numbers on the right: bar with count, mouse against keyboard, last used. */
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_11rem_7rem_4.5rem] items-center gap-x-4";

/** Bars take the hue of their kind's badge, so a glance tells pages from clicks from keys. */
const KIND_BAR: Readonly<Record<Kind, string>> = {
  click: "bg-sky-500/70",
  command: "bg-emerald-500/70",
  key: "bg-foreground/35",
  route: "bg-violet-500/70",
};

/** The rule down a kind's section inside a plugin, in the same hue. */
const KIND_RULE: Readonly<Record<Kind, string>> = {
  click: "border-sky-500/40",
  command: "border-emerald-500/40",
  key: "border-border",
  route: "border-violet-500/40",
};

interface Pin {
  start: number;
  bucketMs: number;
}

interface Section {
  kind: Kind;
  items: SummaryItem[];
  count: number;
}

interface Group {
  plugin: string | null;
  count: number;
  pointer: number;
  keyboard: number;
  sections: Section[];
}

interface Window {
  sinceMs: number | null;
  untilMs: number | null;
}

function useSummary(window: Window, kind: Kind | null, version: number) {
  const rpc = useRpc<typeof rpcContract>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    rpc.call("summary", { sinceMs: window.sinceMs, untilMs: window.untilMs, kind, plugin: null, limit: ITEM_LIMIT }).then(
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
  }, [rpc, window.sinceMs, window.untilMs, kind, version]);
  return { summary, error };
}

function useTimeline(sinceMs: number | null, kind: Kind | null, bucketMs: number, offsetMs: number, version: number) {
  const rpc = useRpc<typeof rpcContract>();
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    rpc.call("timeline", { sinceMs, untilMs: null, kind, plugin: null, bucketMs, offsetMs }).then(
      (result) => {
        if (id === request.current) setBuckets(result);
      },
      () => undefined,
    );
  }, [rpc, sinceMs, kind, bucketMs, offsetMs, version]);
  return buckets;
}

/** Every bucket from the range's first to now, with the server's counts dropped in and zeros elsewhere. */
function fillBuckets(counted: readonly TimelineBucket[], sinceMs: number | null, firstAt: number | null, now: number, bucketMs: number, offsetMs: number): TimelineBucket[] {
  const from = sinceMs ?? firstAt ?? now;
  const counts = new Map(counted.map((bucket) => [bucket.start, bucket.count]));
  return bucketStarts(Math.min(from, now), now, bucketMs, offsetMs).map((start) => ({ start, count: counts.get(start) ?? 0 }));
}

function groupItems(summary: Summary, query: string, emphasis: Emphasis | null, now: number): Group[] {
  const needle = query.trim().toLowerCase();
  const byPlugin = new Map<string | null, Group>();
  for (const item of summary.items) {
    if (needle !== "" && !item.label.toLowerCase().includes(needle) && !item.key.toLowerCase().includes(needle)) continue;
    let group = byPlugin.get(item.plugin);
    if (group === undefined) {
      group = { plugin: item.plugin, count: 0, pointer: 0, keyboard: 0, sections: SECTION_ORDER.map((kind) => ({ kind, items: [], count: 0 })) };
      byPlugin.set(item.plugin, group);
    }
    const section = group.sections[SECTION_ORDER.indexOf(item.kind)]!;
    section.items.push(item);
    section.count += item.count;
    group.count += item.count;
    group.pointer += item.pointer;
    group.keyboard += item.keyboard;
  }
  const groups = [...byPlugin.values()].sort((a, b) => b.count - a.count);
  for (const group of groups) {
    group.sections = group.sections.filter((section) => section.items.length > 0);
    if (emphasis !== null) {
      for (const section of group.sections) {
        section.items.sort((a, b) => Number(matchesEmphasis(b, emphasis, now)) - Number(matchesEmphasis(a, emphasis, now)) || b.count - a.count);
      }
    }
  }
  return groups;
}

/** The biggest count of each kind across every plugin, so bars of one kind compare across groups. */
function largestByKind(groups: readonly Group[]): Record<Kind, number> {
  const largest = Object.fromEntries(KINDS.map((kind) => [kind, 1])) as Record<Kind, number>;
  for (const group of groups) for (const section of group.sections) for (const item of section.items) largest[item.kind] = Math.max(largest[item.kind], item.count);
  return largest;
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-[5px] px-2 py-0.5 text-xs outline-none focus:ring-2 focus:ring-ring/60 ${pressed ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

/** A row of toggles that read as one control: a bordered strip the pressed one stands out of. */
function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
      {children}
    </div>
  );
}

function Chip({ onClear, children }: { onClear: () => void; children: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClear}
      aria-label={`${children}. Press to clear`}
      className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1.5 text-xs outline-none hover:bg-primary/20 focus:ring-2 focus:ring-ring/60"
    >
      <span>{children}</span>
      <span aria-hidden className="text-muted-foreground">
        ×
      </span>
    </button>
  );
}

/** Pointer against keyboard as two shades of one bar, numbers beside it in text. */
function ViaSplit({ pointer, keyboard, className = "" }: { pointer: number; keyboard: number; className?: string }) {
  const total = pointer + keyboard;
  if (total === 0) return <span className={className} />;
  return (
    <span className={`flex items-center gap-1.5 ${className}`} title={`${pointer} with the mouse, ${keyboard} from the keyboard`}>
      <span className="flex h-1.5 w-10 shrink-0 gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="h-full bg-foreground/80" style={{ width: `${(pointer / total) * 100}%` }} />
        <span className="h-full bg-foreground/30" style={{ width: `${(keyboard / total) * 100}%` }} />
      </span>
      <span className="truncate text-[11px] tabular-nums text-muted-foreground">
        {pointer}
        <span className="opacity-60"> / </span>
        {keyboard}
      </span>
    </span>
  );
}

function ShareBar({ plugins, total }: { plugins: Summary["plugins"]; total: number }) {
  if (total === 0 || plugins.length === 0) return null;
  const named = plugins.slice(0, SHARE_SEGMENTS);
  const rest = plugins.slice(SHARE_SEGMENTS).reduce((sum, row) => sum + row.count, 0);
  const segments = rest > 0 ? [...named, { plugin: "other", count: rest }] : named;
  const small = segments.filter((segment) => segment.count / total < SHARE_LABEL_MIN);
  return (
    <div className="flex flex-col gap-1.5" aria-label="Share of events per plugin">
      <div className="flex gap-px overflow-hidden rounded-md">
        {segments.map((segment, index) => {
          const share = segment.count / total;
          return (
            <div key={segment.plugin ?? "\u0000bb"} className="flex min-w-0 flex-col gap-1" style={{ width: `${share * 100}%` }}>
              <span className="block h-2.5" style={{ backgroundColor: `color-mix(in oklab, var(--primary) ${Math.max(25, 85 - index * 14)}%, var(--muted))` }} aria-hidden />
              {share >= SHARE_LABEL_MIN ? (
                <span className="truncate text-xs">
                  {pluginName(segment.plugin)} <span className="tabular-nums text-muted-foreground">{Math.round(share * 100)}%</span>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {small.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {small.map((segment, index) => (
            <span key={segment.plugin ?? "\u0000bb"}>
              {index > 0 ? ", " : ""}
              {pluginName(segment.plugin)} <span className="tabular-nums">{Math.max(1, Math.round((segment.count / total) * 100))}%</span>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function Findings({ findings, onApply }: { findings: readonly Finding[]; onApply: (finding: Finding) => void }) {
  if (findings.length === 0) return null;
  return (
    <section className="grid gap-2 sm:grid-cols-2" aria-label="Findings">
      {findings.map((finding) => (
        <button
          key={finding.id}
          type="button"
          data-nav-row="item"
          tabIndex={-1}
          onClick={() => onApply(finding)}
          className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-left outline-none hover:border-primary/50 hover:bg-accent/40 focus:border-primary focus:bg-accent/40"
        >
          <span className="min-w-0 leading-snug">
            <span className="font-semibold tabular-nums">{finding.lead}</span> <span className="text-muted-foreground">{finding.rest}</span>
          </span>
          <span className="shrink-0 text-xs text-primary">{finding.hint} ↵</span>
        </button>
      ))}
    </section>
  );
}

function ItemRow({ item, now, largest, emphasis }: { item: SummaryItem; now: number; largest: number; emphasis: Emphasis | null }) {
  const marked = emphasis !== null && matchesEmphasis(item, emphasis, now);
  const mono = item.kind === "command" || item.kind === "key";
  return (
    <div
      data-nav-row="item"
      tabIndex={-1}
      aria-label={`${item.label}, ${formatCount(item.count)} ${item.count === 1 ? "use" : "uses"}, last ${formatAgo(item.lastAt, now)}`}
      className={`${ROW_GRID} -mx-2 rounded-md px-2 py-1 outline-none hover:bg-accent/50 focus:bg-accent ${emphasis !== null && !marked ? "opacity-45" : ""}`}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        {marked ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
        <span className={`min-w-0 truncate text-[13px] ${mono ? "font-mono" : ""}`}>{item.label}</span>
        {item.key !== item.label ? <span className="min-w-0 truncate text-[11px] text-muted-foreground">{item.key}</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className={`block h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${KIND_BAR[item.kind]}`} style={{ width: `${(item.count / largest) * 100}%` }} />
        </span>
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">{formatCount(item.count)}</span>
      </span>
      {item.kind === "click" ? <ViaSplit pointer={item.pointer} keyboard={item.keyboard} className="min-w-0" /> : <span />}
      <span className="truncate text-right text-[11px] tabular-nums text-muted-foreground">{formatAgo(item.lastAt, now)}</span>
    </div>
  );
}

function KindSection({ section, expanded, onExpand, now, largest, emphasis }: { section: Section; expanded: boolean; onExpand: () => void; now: number; largest: number; emphasis: Emphasis | null }) {
  const names = KIND_NAMES[section.kind];
  const shown = expanded ? section.items : section.items.slice(0, SECTION_LIMIT);
  const hidden = section.items.length - shown.length;
  return (
    <div className={`flex flex-col gap-0.5 border-l-2 pl-3 ${KIND_RULE[section.kind]}`}>
      <div className="mb-0.5 flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className={`rounded px-1.5 py-px text-[10px] font-medium ${KIND_BADGE[section.kind]}`}>{names.section}</span>
        <span className="tabular-nums">
          {formatCount(section.count)} across {section.items.length} {section.items.length === 1 ? names.one : names.many}
        </span>
      </div>
      {shown.map((item) => (
        <ItemRow key={`${item.kind}\u0000${item.key}`} item={item} now={now} largest={largest} emphasis={emphasis} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          data-nav-row="item"
          tabIndex={-1}
          onClick={onExpand}
          className="-mx-2 rounded-md px-2 py-0.5 text-left text-xs text-primary/80 outline-none hover:bg-accent/50 focus:bg-accent"
        >
          {hidden} more {hidden === 1 ? names.one : names.many}
        </button>
      ) : null}
    </div>
  );
}

function PluginGroup({
  group,
  total,
  open,
  onToggle,
  expanded,
  onExpand,
  now,
  largest,
  emphasis,
}: {
  group: Group;
  total: number;
  open: boolean;
  onToggle: () => void;
  expanded: ReadonlySet<string>;
  onExpand: (kind: Kind) => void;
  now: number;
  largest: Record<Kind, number>;
  emphasis: Emphasis | null;
}) {
  const share = total === 0 ? 0 : Math.round((group.count / total) * 100);
  return (
    <section data-nav-group className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        data-nav-row="group"
        aria-expanded={open}
        tabIndex={-1}
        onClick={onToggle}
        className={`${ROW_GRID} w-full bg-muted/50 px-3 py-2 text-left outline-none hover:bg-muted focus:bg-accent ${open ? "border-b border-border" : ""}`}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-3 shrink-0 text-xs text-muted-foreground" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span className="truncate font-semibold">{pluginName(group.plugin)}</span>
        </span>
        <span className="text-right text-xs tabular-nums">
          {formatCount(group.count)} <span className="text-muted-foreground">events, {share}%</span>
        </span>
        <ViaSplit pointer={group.pointer} keyboard={group.keyboard} className="min-w-0" />
        <span />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 py-2.5">
          {group.sections.map((section) => (
            <KindSection
              key={section.kind}
              section={section}
              expanded={expanded.has(`${group.plugin ?? ""}\u0000${section.kind}`)}
              onExpand={() => onExpand(section.kind)}
              now={now}
              largest={largest[section.kind]}
              emphasis={emphasis}
            />
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
  const [pin, setPin] = useState<Pin | null>(null);
  const [emphasis, setEmphasis] = useState<Emphasis | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string | null>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [help, setHelp] = useState(false);
  const [version, refresh] = useReducer((count: number) => count + 1, 0);

  const rangeMs = RANGES[range]!.ms;
  const kind = KIND_FILTERS[kindIndex]!.kind;
  // "Now" is taken once per query so a rerender does not move every window and age by a few milliseconds.
  const now = useMemo(() => Date.now(), [rangeMs, kind, pin, version]);
  const window = useMemo<Window>(
    () => (pin === null ? { sinceMs: rangeMs === null ? null : now - rangeMs, untilMs: null } : { sinceMs: pin.start, untilMs: pin.start + pin.bucketMs }),
    [pin, rangeMs, now],
  );
  const { summary, error } = useSummary(window, kind, version);
  const firstAt = summary?.firstAt ?? null;
  // A log younger than the range fills the strip from its first event instead of leaving most columns empty.
  const stripFrom = rangeMs === null ? null : Math.max(now - rangeMs, firstAt ?? 0);
  const bucketMs = bucketWidth(stripFrom === null ? null : now - stripFrom, firstAt, now);
  const offsetMs = bucketOffset(bucketMs, now);
  const stripSince = useMemo(() => (stripFrom === null ? null : bucketStart(stripFrom, bucketMs, offsetMs)), [stripFrom, bucketMs, offsetMs]);
  const counted = useTimeline(stripSince, kind, bucketMs, offsetMs, version);
  const buckets = useMemo(() => fillBuckets(counted, stripSince, firstAt, now, bucketMs, offsetMs), [counted, stripSince, firstAt, now, bucketMs, offsetMs]);

  const groups = useMemo(() => (summary === null ? [] : groupItems(summary, query, emphasis, now)), [summary, query, emphasis, now]);
  const largest = useMemo(() => largestByKind(groups), [groups]);
  const findings = useMemo(() => (summary === null ? [] : computeFindings(summary, buckets, bucketMs, rangeMs, now, pin?.start ?? null)), [summary, buckets, bucketMs, rangeMs, now, pin]);
  const lastAt = summary === null ? null : summary.items.reduce((latest, item) => Math.max(latest, item.lastAt), 0);

  const toggle = useCallback((plugin: string | null) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(plugin)) next.delete(plugin);
      else next.add(plugin);
      return next;
    });
  }, []);
  const expand = useCallback((plugin: string | null, sectionKind: Kind) => {
    setExpanded((current) => new Set(current).add(`${plugin ?? ""}\u0000${sectionKind}`));
  }, []);
  const pickRange = useCallback((index: number) => {
    setRange(index);
    setPin(null);
  }, []);
  const pinBucket = useCallback(
    (start: number | null) => {
      setPin(start === null ? null : { start, bucketMs });
    },
    [bucketMs],
  );
  const apply = useCallback(
    (finding: Finding) => {
      const action = finding.action;
      if (action.type === "pin") {
        pinBucket(pin?.start === action.start ? null : action.start);
        return;
      }
      const index = KIND_FILTERS.findIndex((option) => option.kind === action.kind);
      setKindIndex(index < 0 ? 0 : index);
      setEmphasis(action.emphasis);
      setQuery("");
    },
    [pin, pinBucket],
  );

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
          pickRange(Number(command.slice(-1)) - 1);
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
          else if (emphasis !== null) setEmphasis(null);
          else if (pin !== null) setPin(null);
          else if (query !== "") setQuery("");
          else return false;
          return true;
        default:
          return runListMotion(list, command, { count });
      }
    },
  });

  const emphasisLabel = emphasis === "mouse-only" ? "Mouse-only controls first" : emphasis === "stale" ? "Unused for two weeks first" : null;

  return (
    <div ref={root} tabIndex={-1} className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm outline-none" aria-label="Activity">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          {summary !== null ? (
            <p className="truncate text-sm tabular-nums text-muted-foreground">
              <span className="text-base font-semibold text-foreground">{formatCount(summary.total)} events</span>
              {pin !== null ? " in the pinned stretch" : summary.firstAt === null ? "" : ` since ${new Date(summary.firstAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              {lastAt === null || lastAt === 0 ? "" : `, last ${formatAgo(lastAt, now)}`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Reading the log…</p>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">? for keys</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div data-nav-row="toolbar" className="flex flex-wrap items-center gap-2" aria-label="Range and kind">
            <Segmented label="Range">
              {RANGES.map((option, index) => (
                <Toggle key={option.label} pressed={index === range} onClick={() => pickRange(index)}>
                  {option.label}
                </Toggle>
              ))}
            </Segmented>
            <Segmented label="Kind">
              {KIND_FILTERS.map((option, index) => (
                <Toggle key={option.label} pressed={index === kindIndex} onClick={() => setKindIndex(index)}>
                  {option.label}
                </Toggle>
              ))}
            </Segmented>
          </div>
          <div data-nav-row="field" tabIndex={-1} className="-mx-1.5 min-w-48 flex-1 rounded-md px-1.5 py-0.5 outline-none focus:bg-accent">
            <input
              ref={filterBox}
              data-vim-ignore
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name ( / )"
              aria-label="Filter rows"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/60"
            />
          </div>
        </div>
      </header>
      {help ? (
        <section className="rounded-md border border-border bg-muted/40 p-3" aria-label="Keys">
          <KeyHelp sections={HELP} />
        </section>
      ) : null}
      {buckets.length > 1 || pin !== null || emphasisLabel !== null || (summary !== null && summary.total > 0) ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3" aria-label="Overview">
          {buckets.length > 1 ? <Timeline buckets={buckets} bucketMs={bucketMs} offsetMs={offsetMs} pinned={pin?.start ?? null} onPin={pinBucket} /> : null}
          {pin !== null || emphasisLabel !== null ? (
            <div data-nav-row="toolbar" className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
              {pin !== null ? <Chip onClear={() => setPin(null)}>{`Only ${bucketSpanLabel(pin.start, pin.bucketMs)}`}</Chip> : null}
              {emphasisLabel !== null ? <Chip onClear={() => setEmphasis(null)}>{emphasisLabel}</Chip> : null}
              <span className="text-xs text-muted-foreground">Esc clears</span>
            </div>
          ) : null}
          {summary !== null && summary.total > 0 ? (
            <>
              <Findings findings={findings} onApply={apply} />
              <ShareBar plugins={summary.plugins} total={summary.total} />
            </>
          ) : null}
        </section>
      ) : null}
      {error !== null ? <p className="text-xs text-red-600 dark:text-red-400">Couldn't read the log: {error}</p> : null}
      {summary !== null && summary.total === 0 ? (
        <p className="text-muted-foreground">{pin === null ? "Nothing recorded in this range. Clicks, key commands, and pages are logged as you use bb." : "Nothing happened in that stretch."}</p>
      ) : null}
      {summary !== null && summary.total > 0 ? (
        <>
          {groups.length === 0 ? <p className="text-muted-foreground">Nothing matches the filter.</p> : null}
          {groups.length > 0 ? (
            <div className={`${ROW_GRID} -mb-2 px-3 text-[11px] text-muted-foreground`} aria-hidden>
              <span>Plugin and control</span>
              <span className="text-right">Uses</span>
              <span>Mouse / keyboard</span>
              <span className="text-right">Last used</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <PluginGroup
                key={group.plugin ?? "\u0000bb"}
                group={group}
                total={summary.total}
                open={!closed.has(group.plugin)}
                onToggle={() => toggle(group.plugin)}
                expanded={expanded}
                onExpand={(sectionKind) => expand(group.plugin, sectionKind)}
                now={now}
                largest={largest}
                emphasis={emphasis}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
