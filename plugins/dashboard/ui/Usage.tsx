import { experimental_useSidebarThreads, experimental_useSidebarThreadActions, useRpc } from "@get-bb/plugin-sdk/app";
import { cx, enter, speed } from "bb-motion";
import { KeyHelp, type KeyHelpSection, type Keymap, runListMotion, useKeyScope } from "bb-vim-keys/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { rpcContract, Usage as UsageData, UsageSession } from "../rpc-contract.js";
import { type LimitStatus, type Tokens, totalTokens } from "../usage-model.js";
import { describeTokens, formatClock, formatDay, formatSpan, formatTokens } from "./format.js";

type Command = "down" | "up" | "top" | "bottom" | "left" | "right" | "open" | "refresh" | "compose" | "help" | "escape";

const KEYMAP: Keymap<Command> = {
  j: "down",
  "<Down>": "down",
  k: "up",
  "<Up>": "up",
  gg: "top",
  G: "bottom",
  h: "left",
  "<Left>": "left",
  l: "right",
  "<Right>": "right",
  "<CR>": "open",
  o: "open",
  r: "refresh",
  i: "compose",
  "?": "help",
  "<Esc>": "escape",
};

export const HELP: readonly KeyHelpSection[] = [
  {
    title: "Move",
    keys: [
      { keys: ["j", "k"], action: "Next and previous row, from the project bar down" },
      { keys: ["h", "l"], action: "Along the project bar and the days" },
      { keys: ["gg", "G"], action: "First and last row" },
    ],
  },
  {
    title: "Act",
    keys: [
      { keys: ["Enter", "o"], action: "Open the thread, or the picker under the cursor" },
      { keys: ["r"], action: "Reread usage" },
      { keys: ["i"], action: "Back to the composer" },
      { keys: ["?"], action: "Show these keys" },
    ],
  },
];

/** bb's bar under the new-thread composer: the project picker and permission mode. */
export const FOOTER = "[data-new-thread-footer]";
const COMPOSER_INPUT = '[data-promptbox] [contenteditable="true"]';
const POLL_MS = 60_000;
/** A finished turn writes its transcript a moment after bb's thread record changes. */
const SETTLE_MS = 3000;

const LIMIT_DOT: Readonly<Record<LimitStatus, string>> = {
  allowed: "bg-emerald-500",
  warning: "bg-amber-500",
  blocked: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};
const LIMIT_LABEL: Readonly<Record<LimitStatus, string>> = { allowed: "OK", warning: "Nearly used", blocked: "Reached", unknown: "Unknown" };

type Readout = { title: string; tokens: Tokens } | null;

function useUsage(version: number) {
  const rpc = useRpc<typeof rpcContract>();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const loaded = useRef(false);
  const load = useCallback(
    (refresh: boolean) => {
      const id = ++request.current;
      rpc.call("usage", { refresh }).then(
        (result) => {
          if (id !== request.current) return;
          setUsage(result);
          setError(null);
        },
        (failure: unknown) => {
          if (id === request.current) setError(failure instanceof Error ? failure.message : String(failure));
        },
      );
    },
    [rpc],
  );
  useEffect(() => {
    const timer = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const first = !loaded.current;
    loaded.current = true;
    const timer = setTimeout(() => load(!first), first ? 0 : SETTLE_MS);
    return () => clearTimeout(timer);
  }, [load, version]);
  return { usage, error, refresh: () => load(true) };
}

/** The nearest ancestor holding both the dashboard and bb's composer bar, so one cursor spans them. */
function navContainer(root: HTMLElement): HTMLElement {
  for (let node = root.parentElement; node !== null; node = node.parentElement) {
    if (node.querySelector(FOOTER) !== null) return node;
  }
  return root;
}

/** Tags bb's composer bar as a row of buttons the cursor can step along, while the dashboard is up. */
function useFooterRow(root: HTMLElement | null) {
  useEffect(() => {
    const footer = root?.ownerDocument.querySelector<HTMLElement>(FOOTER);
    if (!footer || footer.dataset.navRow !== undefined) return;
    footer.dataset.navRow = "toolbar";
    return () => {
      delete footer.dataset.navRow;
    };
  }, [root]);
}

export function Usage(_props: { projectId: string | null }) {
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const version = useMemo(() => sidebar.threads.reduce((latest, thread) => Math.max(latest, thread.updatedAt), 0), [sidebar.threads]);
  const { usage, error, refresh } = useUsage(version);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [help, setHelp] = useState(false);
  const [readout, setReadout] = useState<Readout>(null);
  useFooterRow(root);

  const runCommand = (command: Command): boolean => {
    if (root === null) return false;
    const container = navContainer(root);
    switch (command) {
      case "down":
      case "up":
      case "top":
      case "bottom":
      case "left":
      case "right":
        return runListMotion(container, command);
      case "open": {
        // bb's pickers are Radix triggers, which open on a key or pointer press rather than a click.
        const active = root.ownerDocument.activeElement;
        if (active instanceof HTMLButtonElement && active.closest(FOOTER) !== null) {
          active.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
          return true;
        }
        return runListMotion(container, "open");
      }
      case "refresh":
        refresh();
        return true;
      case "compose":
        root.ownerDocument.querySelector<HTMLElement>(COMPOSER_INPUT)?.focus();
        return true;
      case "help":
        setHelp((open) => !open);
        return true;
      case "escape":
        if (!help) return false;
        setHelp(false);
        return true;
    }
  };

  useKeyScope(root, true, { keymap: KEYMAP, alsoWithin: FOOTER, onCommand: (command) => runCommand(command) });

  const now = usage?.scannedAt ?? Date.now();
  const window = usage?.window ?? null;
  const today = usage?.days[usage.days.length - 1] ?? null;
  const shown: Readout = readout ?? (window !== null ? { title: "This window", tokens: window.tokens } : today !== null ? { title: "Today", tokens: today.tokens } : null);
  const show = (next: Readout) => () => setReadout(next);
  const clear = () => setReadout(null);

  return (
    <div
      ref={setRoot}
      tabIndex={-1}
      data-dashboard=""
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-3 text-sm outline-none backdrop-blur-sm"
    >
      {help ? (
        <div className={cx("border-b border-border/60 pb-3", enter.fade, speed.fast)}>
          <KeyHelp sections={HELP} />
        </div>
      ) : null}
      {usage === null ? (
        <p className="text-muted-foreground">{error ?? "Reading Claude Code's transcripts…"}</p>
      ) : (
        <>
          {usage.limits.length === 0 && window === null ? <p className="text-muted-foreground">No usage limit reported yet.</p> : null}
          {usage.limits.map((limit) => (
            <div key={limit.key} className="flex items-center gap-2">
              <span className={cx("size-2 shrink-0 rounded-full", LIMIT_DOT[limit.status])} aria-hidden />
              <span className="text-foreground">{limit.label}</span>
              <span className="text-muted-foreground">
                {LIMIT_LABEL[limit.status]}
                {limit.resetsAtMs === null ? "" : ` · resets in ${formatSpan(limit.resetsAtMs - now)}`}
              </span>
            </div>
          ))}
          {window !== null ? <WindowSessions window={window} onShow={show} onClear={clear} onOpen={(session) => session.threadId !== null && actions.open(session.threadId)} /> : null}
          <DayChart days={usage.days} onShow={show} onClear={clear} />
          <p className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground" aria-live="polite">
            {shown === null ? null : (
              <>
                <span className="shrink-0 text-foreground">{shown.title}</span>
                <span className="min-w-0 truncate">{describeTokens(shown.tokens)}</span>
              </>
            )}
            <span className="ml-auto shrink-0">? keys</span>
          </p>
        </>
      )}
    </div>
  );
}

function WindowSessions(props: {
  window: NonNullable<UsageData["window"]>;
  onShow: (readout: Readout) => () => void;
  onClear: () => void;
  onOpen: (session: UsageSession) => void;
}) {
  const { window } = props;
  const largest = Math.max(1, ...window.sessions.map((session) => totalTokens(session.tokens)));
  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span>
          This window{window.estimated ? " (estimated)" : ""} · since {formatClock(window.startMs)}
        </span>
        <span className="ml-auto tabular-nums text-foreground">{formatTokens(totalTokens(window.tokens))}</span>
      </h3>
      {window.sessions.map((session) => {
        const total = totalTokens(session.tokens);
        const readout = { title: session.title, tokens: session.tokens };
        return (
          <div
            key={session.key}
            data-nav-row="item"
            tabIndex={-1}
            onClick={() => props.onOpen(session)}
            onFocus={props.onShow(readout)}
            onBlur={props.onClear}
            onMouseEnter={props.onShow(readout)}
            onMouseLeave={props.onClear}
            className={cx(
              "-mx-1.5 flex flex-col gap-1 rounded-md px-1.5 py-1 outline-none hover:bg-accent/50 focus:bg-accent",
              session.threadId === null ? "cursor-default" : "cursor-pointer",
            )}
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate text-foreground">{session.title}</span>
              {session.project ? <span className="shrink-0 text-xs text-muted-foreground">{session.project}</span> : null}
              {session.threadId === null ? <span className="shrink-0 text-xs text-muted-foreground">outside bb</span> : null}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{formatTokens(total)}</span>
            </span>
            <span className="h-1 w-full rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-sky-500/70" style={{ width: `${(total / largest) * 100}%` }} />
            </span>
          </div>
        );
      })}
      {window.others.count > 0 ? (
        <p className="text-xs text-muted-foreground">
          {window.others.count} more · {formatTokens(totalTokens(window.others.tokens))}
        </p>
      ) : null}
    </section>
  );
}

function DayChart(props: { days: UsageData["days"]; onShow: (readout: Readout) => () => void; onClear: () => void }) {
  const pointer = useRef(false);
  const largest = Math.max(1, ...props.days.map((day) => totalTokens(day.tokens)));
  const last = props.days.length - 1;
  if (props.days.every((day) => totalTokens(day.tokens) === 0)) return <p className="text-xs text-muted-foreground">No Claude Code usage in the last {props.days.length} days.</p>;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs text-muted-foreground">Last {props.days.length} days</h3>
      <div
        data-nav-row="toolbar"
        className="flex h-14 items-end gap-0.5 border-b border-border/60"
        onPointerDown={() => {
          pointer.current = true;
        }}
        onFocus={(event) => {
          // The cursor arriving from another row lands on today, the day most worth reading; a click keeps its own day.
          const arriving = !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget));
          if (arriving && !pointer.current) event.currentTarget.querySelector<HTMLElement>("button:last-of-type")?.focus({ preventScroll: true });
          pointer.current = false;
        }}
      >
        {props.days.map((day, index) => {
          const total = totalTokens(day.tokens);
          const readout = { title: index === last ? "Today" : formatDay(day.day), tokens: day.tokens };
          return (
            <button
              key={day.day}
              type="button"
              tabIndex={-1}
              aria-label={`${readout.title}: ${formatTokens(total)} tokens`}
              onFocus={props.onShow(readout)}
              onBlur={props.onClear}
              onMouseEnter={props.onShow(readout)}
              onMouseLeave={props.onClear}
              className="group/day flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
            >
              <span
                className={cx(
                  "block w-full max-w-6 rounded-t",
                  index === last ? "bg-sky-500" : "bg-foreground/20 group-hover/day:bg-foreground/35 group-focus/day:bg-foreground/35",
                  "group-focus/day:ring-2 group-focus/day:ring-ring/60",
                )}
                style={{ height: total === 0 ? 0 : `max(2px, ${(total / largest) * 100}%)` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{props.days[0] === undefined ? "" : formatDay(props.days[0].day)}</span>
        <span>Today</span>
      </div>
    </section>
  );
}
