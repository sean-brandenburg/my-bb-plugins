import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Markdown, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { NarrativeRef } from "../../narrative";
import type { NarrativeStep, NarrativeStory } from "../../types";
import { cn } from "../utils";
import { readPreference, writePreference } from "../state";
import { FAST, PRESS, enter } from "../ui/motion";
import { useKeyScope } from "../ui/vim-keys";
import { KeyHelp, Picker } from "../keys/overlays";
import { NARRATIVE_KEYMAP, NARRATIVE_KEY_HELP, type NarrativeCommand } from "./narrative-keymap";
import { UNCOVERED_STEP_ID, affectedAddress, buildChapters, initialAddress, moveChapter, movePage, narratedFiles, pages, searchSteps, type NarrativeChapter, type StepAddress } from "./chapters";
import { StepExcerpts, stepExcerpts, type StepExcerpt } from "./step-excerpts";

/** Approximate height of one line of step text, for turning j/k into a scroll. */
const LINE_PX = 20;
const MAX_COUNT = 999;

function readJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * The narrative review: the agent's walk through the change one step at a time, each step's explanation over just the
 * lines it covers. Chapters run oldest first, so a reader who read an earlier narrative steps on through what changed
 * since into the current one.
 */
export function NarrativeView({
  rootRef,
  active,
  instanceKey,
  story,
  error,
  generating,
  onGenerate,
  onOpenThread,
  currentPaths,
  viewed,
  onMarkViewed,
  onOpenRef,
  onCommentRef,
  onFiles,
  notify,
}: {
  rootRef: RefObject<HTMLElement | null>;
  /** Takes the view's keys: the narrative mode is showing and no overlay of the host's is up. */
  active: boolean;
  instanceKey: string;
  story: NarrativeStory | null;
  error: string | null;
  generating: boolean;
  onGenerate: () => void;
  onOpenThread: (threadId: string) => void;
  /** Paths in the diff as it is now; refs elsewhere cannot be opened in the files view. */
  currentPaths: ReadonlySet<string>;
  viewed: ReadonlySet<string>;
  onMarkViewed: (path: string) => void;
  onOpenRef: (ref: NarrativeRef) => void;
  onCommentRef: (ref: NarrativeRef) => void;
  onFiles: () => void;
  notify: (message: string) => void;
}) {
  const chapters = useMemo(() => (story === null ? [] : buildChapters(story)), [story]);
  const positionKey = `narrativeAt:${instanceKey}` as const;
  const readKey = `narrativeRead:${instanceKey}` as const;
  const [address, setAddressState] = useState<StepAddress | null>(null);
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set(readJson<string[]>(readPreference(readKey), [])));
  const [excerpt, setExcerpt] = useState(0);
  const [outline, setOutlineState] = useState(() => readPreference("narrativeOutline") !== "false");
  const [overlay, setOverlay] = useState<"help" | "search" | null>(null);
  const [lastSearch, setLastSearch] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // A new story (a narrative finished, or the view opened on another subject) re-resolves where to stand.
  useEffect(() => {
    setAddressState((current) => {
      if (current !== null && chapters[current.chapter] !== undefined && current.step < chapters[current.chapter]!.steps.length) return current;
      return initialAddress(chapters, readJson<{ chapterKey: string; stepId: string | null } | null>(readPreference(positionKey), null));
    });
  }, [chapters, positionKey]);

  const chapter = address === null ? null : (chapters[address.chapter] ?? null);
  const step = chapter === null || address === null || address.step < 0 ? null : (chapter.steps[address.step] ?? null);
  const excerpts = useMemo(() => (step === null || chapter === null ? [] : stepExcerpts(step.refs, chapter.files)), [step, chapter]);

  const go = (next: StepAddress | null) => {
    if (next === null) return;
    setAddressState(next);
    setExcerpt(0);
    scrollRef.current?.scrollTo({ top: 0 });
    const target = chapters[next.chapter];
    if (target === undefined) return;
    const stepId = next.step < 0 ? null : (target.steps[next.step]?.id ?? null);
    writePreference(positionKey, JSON.stringify({ chapterKey: target.key, stepId }));
  };

  // A step counts as read once it has been on screen.
  useEffect(() => {
    if (chapter === null || step === null) return;
    const key = `${chapter.key}/${step.id}`;
    setRead((current) => {
      if (current.has(key)) return current;
      const next = new Set(current).add(key);
      writePreference(readKey, JSON.stringify([...next]));
      return next;
    });
  }, [chapter, step, readKey]);

  const readInChapter = useMemo(() => {
    if (chapter === null) return new Set<string>();
    return new Set([...read].filter((key) => key.startsWith(`${chapter.key}/`)).map((key) => key.slice(chapter.key.length + 1)));
  }, [read, chapter]);
  const narratedUnviewed = chapter?.current === true && story?.stale === false ? narratedFiles(chapter, readInChapter).filter((path) => currentPaths.has(path) && !viewed.has(path)) : [];

  const setOutline = (open: boolean) => {
    setOutlineState(open);
    writePreference("narrativeOutline", String(open));
  };
  const canTouchCurrentDiff = (excerptEntry: StepExcerpt | undefined): excerptEntry is StepExcerpt => {
    if (excerptEntry === undefined) {
      notify("This step shows no code");
      return false;
    }
    if (!currentPaths.has(excerptEntry.path)) {
      notify(`${excerptEntry.path} is not in the current diff`);
      return false;
    }
    return true;
  };

  const run = (command: NarrativeCommand, count: number) => {
    if (address === null) {
      if (command.kind === "generate") onGenerate();
      else if (command.kind === "files") onFiles();
      else if (command.kind === "help") setOverlay("help");
      return;
    }
    const scroller = scrollRef.current;
    switch (command.kind) {
      case "step":
        go(movePage(chapters, address, command.direction * count));
        return;
      case "chapter":
        go(moveChapter(chapters, address, command.direction));
        return;
      case "first":
        go(pages(chapters)[0] ?? null);
        return;
      case "last":
        go(pages(chapters).at(-1) ?? null);
        return;
      case "scroll":
        scroller?.scrollBy({ top: command.lines * count * LINE_PX });
        return;
      case "page":
        scroller?.scrollBy({ top: command.fraction * count * (scroller.clientHeight || 0) });
        return;
      case "excerpt": {
        if (excerpts.length === 0) {
          notify("This step shows no code");
          return;
        }
        const next = Math.max(0, Math.min(excerpts.length - 1, excerpt + command.direction * count));
        setExcerpt(next);
        scroller?.querySelector(`[data-narrative-excerpt="${next}"]`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      case "openExcerpt": {
        const entry = excerpts[excerpt];
        if (chapter?.kind === "revision") notify("Revision steps point into the delta; gf opens a current narrative step's lines");
        else if (canTouchCurrentDiff(entry)) onOpenRef(entry.refs[0]!);
        return;
      }
      case "comment": {
        const entry = excerpts[excerpt];
        if (chapter?.current !== true || story?.stale !== false) notify("Comments go on the current diff: comment from the current narrative's steps");
        else if (canTouchCurrentDiff(entry)) onCommentRef(entry.refs[0]!);
        return;
      }
      case "affected": {
        const id = step?.affects[0];
        if (id === undefined) notify("This step names no step of the new narrative");
        else go(affectedAddress(chapters, address, id));
        return;
      }
      case "viewed":
        if (narratedUnviewed.length === 0) notify("No file has had all of its steps read yet");
        else {
          for (const path of narratedUnviewed) onMarkViewed(path);
          notify(`Marked ${narratedUnviewed.length} file${narratedUnviewed.length === 1 ? "" : "s"} viewed`);
        }
        return;
      case "outline":
        setOutline(!outline);
        return;
      case "search":
        setOverlay("search");
        return;
      case "searchNext": {
        if (lastSearch === null) {
          notify("Search steps with / first");
          return;
        }
        const all = pages(chapters);
        const here = all.findIndex((page) => page.chapter === address.chapter && page.step === address.step);
        const hits = searchSteps(chapters, lastSearch).map((hit) => all.findIndex((page) => page.chapter === hit.chapter && page.step === hit.step));
        // Wraps past either end, as vim's search does.
        const order = command.direction === 1 ? [...hits.filter((index) => index > here), ...hits.filter((index) => index <= here)] : [...hits.filter((index) => index < here).reverse(), ...hits.filter((index) => index >= here).reverse()];
        const target = order[Math.min(count, order.length) - 1];
        if (target === undefined) notify(`No step matches “${lastSearch}”`);
        else go(all[target] ?? null);
        return;
      }
      case "generate":
        onGenerate();
        return;
      case "files":
        onFiles();
        return;
      case "help":
        setOverlay("help");
        return;
    }
  };

  useKeyScope(rootRef, active && overlay === null, {
    keymap: NARRATIVE_KEYMAP,
    group: "diff-view",
    counts: true,
    onCommand: (command, { count }) => run(command, Math.min(count ?? 1, MAX_COUNT)),
  });

  const closeOverlay = () => {
    setOverlay(null);
    rootRef.current?.focus({ preventScroll: true });
  };
  const total = pages(chapters).length;
  const position = address === null ? 0 : pages(chapters).findIndex((page) => page.chapter === address.chapter && page.step === address.step) + 1;
  const running = story?.running ?? null;

  return (
    <div className="relative flex min-h-0 flex-1">
      {outline && chapters.length > 0 ? (
        <NarrativeOutline chapters={chapters} address={address} read={read} onGo={go} />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-8 flex-wrap items-center gap-2 border-b border-border px-3 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Narrative review</span>
          {chapter !== null ? <span className="min-w-0 truncate">{chapter.title}</span> : null}
          {total > 0 ? <span className="tabular-nums">{position} / {total}</span> : null}
          {story?.stale === true ? <span className="rounded border border-amber-500/50 px-1 text-[10px] text-amber-700 dark:text-amber-300" title="The code moved since the newest narrative">stale</span> : null}
          <span className="ml-auto flex items-center gap-1">
            {running !== null ? (
              <button type="button" className={cn("rounded px-1.5 py-0.5 hover:bg-state-hover hover:text-foreground", PRESS)} onClick={() => onOpenThread(running.threadId)}>
                Writing… thread
              </button>
            ) : (
              <button type="button" className={cn("rounded px-1.5 py-0.5 hover:bg-state-hover hover:text-foreground disabled:opacity-50", PRESS)} disabled={generating} title="U" onClick={onGenerate}>
                {generating ? "Starting…" : chapters.length === 0 ? "Write narrative" : story?.stale === true ? "Write update" : "Rewrite"}
              </button>
            )}
            <button type="button" className={cn("rounded px-1.5 py-0.5 hover:bg-state-hover hover:text-foreground disabled:opacity-40", PRESS)} disabled={address === null || position <= 1} title="Previous step (h)" aria-label="Previous step" onClick={() => address !== null && go(movePage(chapters, address, -1))}>
              <Icon name="ChevronLeft" className="size-3.5" />
            </button>
            <button type="button" className={cn("rounded px-1.5 py-0.5 hover:bg-state-hover hover:text-foreground disabled:opacity-40", PRESS)} disabled={address === null || position >= total} title="Next step (l)" aria-label="Next step" onClick={() => address !== null && go(movePage(chapters, address, 1))}>
              <Icon name="ChevronRight" className="size-3.5" />
            </button>
            <button type="button" className={cn("rounded px-1 hover:bg-state-hover hover:text-foreground", PRESS)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setOverlay("help")}>
              ⌨
            </button>
            <button type="button" className={cn("rounded px-1.5 py-0.5 hover:bg-state-hover hover:text-foreground", PRESS)} title="Back to the files (S)" onClick={onFiles}>
              Files
            </button>
          </span>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {error !== null ? <p className={cn("px-4 py-3 text-sm text-destructive", enter.fade)}>{error}</p> : null}
          {story === null && error === null ? <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p> : null}
          {story !== null && chapters.length === 0 ? (
            <div className={cn("flex flex-col items-start gap-2 px-4 py-6 text-sm", enter.fade)}>
              <p className="text-muted-foreground">
                {running !== null
                  ? "An agent is writing the narrative; it shows here when the thread finishes."
                  : "No narrative yet. An agent walks through the change step by step, every changed line in at least one step, with diagrams where they help."}
              </p>
              {running === null ? (
                <button type="button" className={cn("rounded border border-border px-2 py-1 text-xs hover:bg-state-hover disabled:opacity-50", PRESS)} disabled={generating} onClick={onGenerate}>
                  {generating ? "Starting…" : "Write narrative (U)"}
                </button>
              ) : null}
            </div>
          ) : null}
          {chapter !== null && address !== null ? (
            <div key={`${chapter.key}:${address.step}`} className={cn("mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4", enter.fade, FAST)}>
              {step === null ? (
                <ChapterIntro chapter={chapter} stale={chapter.current && story?.stale === true} onGo={(index) => go({ chapter: address.chapter, step: index })} />
              ) : (
                <StepPage
                  chapter={chapter}
                  step={step}
                  index={address.step}
                  excerpts={excerpts}
                  focusedExcerpt={excerpt}
                  onOpenExcerpt={(entry) => {
                    if (chapter.kind === "revision") notify("Revision steps point into the delta, not the current diff");
                    else if (canTouchCurrentDiff(entry)) onOpenRef(entry.refs[0]!);
                  }}
                  affected={(id) => {
                    const target = affectedAddress(chapters, address, id);
                    return target === null ? null : { title: chapters[target.chapter]!.steps[target.step]!.title, go: () => go(target) };
                  }}
                />
              )}
              {narratedUnviewed.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Every step of {narratedUnviewed.map((path) => path.split("/").pop()).join(", ")} is read.{" "}
                  <button type="button" className="underline" onClick={() => run({ kind: "viewed" }, 1)}>
                    Mark {narratedUnviewed.length === 1 ? "it" : "them"} viewed (v)
                  </button>
                </p>
              ) : null}
              <PageFooter chapters={chapters} address={address} onGo={go} />
            </div>
          ) : null}
        </div>
      </div>
      {overlay === "help" ? <KeyHelp onClose={closeOverlay} sections={NARRATIVE_KEY_HELP} /> : null}
      {overlay === "search" ? (
        <Picker
          label="Search steps"
          placeholder="Search step titles and text…"
          initialQuery={lastSearch ?? ""}
          rank={(query) =>
            searchSteps(chapters, query).map((hit) => ({
              id: `${hit.chapter}:${hit.step}`,
              label: chapters[hit.chapter]!.steps[hit.step]!.title,
              detail: <span className="shrink-0 text-muted-foreground">{chapters[hit.chapter]!.kind === "revision" ? "revision" : chapters[hit.chapter]!.current ? "current" : "earlier"}</span>,
            }))
          }
          onPick={(id, query) => {
            closeOverlay();
            setLastSearch(query.trim() === "" ? null : query);
            const [chapterIndex, stepIndex] = id.split(":").map(Number);
            go({ chapter: chapterIndex!, step: stepIndex! });
          }}
          onClose={closeOverlay}
        />
      ) : null}
    </div>
  );
}

function ChapterIntro({ chapter, stale, onGo }: { chapter: NarrativeChapter; stale: boolean; onGo: (step: number) => void }) {
  const coverage = chapter.coverage;
  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{chapter.kind === "revision" ? "Revision" : chapter.current ? "Current narrative" : "Earlier narrative"}</p>
      <h2 className="text-base font-semibold">{chapter.title}</h2>
      {stale ? (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">The code moved since this narrative was written. U writes an update that explains what changed.</p>
      ) : null}
      <Markdown content={chapter.summary} className="text-sm" />
      {chapter.notes.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {chapter.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : null}
      {coverage !== null ? (
        <p className="text-xs text-muted-foreground">
          {coverage.uncovered.length === 0
            ? `The steps cover all ${coverage.changedLines} changed line${coverage.changedLines === 1 ? "" : "s"}.`
            : `The steps cover ${coverage.coveredLines} of ${coverage.changedLines} changed lines; the last step shows the rest.`}
        </p>
      ) : null}
      <ol className="flex flex-col gap-0.5 text-sm">
        {chapter.steps.map((entry, index) => (
          <li key={`${entry.id}-${index}`} className="flex items-baseline gap-2">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <button type="button" className={cn("min-w-0 text-left hover:underline", entry.id === UNCOVERED_STEP_ID && "text-amber-700 dark:text-amber-300")} onClick={() => onGo(index)}>
              {entry.title}
            </button>
          </li>
        ))}
      </ol>
      {chapter.steps.length > 0 ? <p className="text-xs text-muted-foreground">l starts the first step.</p> : null}
    </>
  );
}

function StepPage({
  chapter,
  step,
  index,
  excerpts,
  focusedExcerpt,
  onOpenExcerpt,
  affected,
}: {
  chapter: NarrativeChapter;
  step: NarrativeStep;
  index: number;
  excerpts: StepExcerpt[];
  focusedExcerpt: number;
  onOpenExcerpt: (excerpt: StepExcerpt) => void;
  affected: (id: string) => { title: string; go: () => void } | null;
}) {
  const uncovered = step.id === UNCOVERED_STEP_ID;
  const links = step.affects.map(affected).filter((link) => link !== null);
  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {chapter.kind === "revision" ? "What changed" : "Step"} {index + 1} of {chapter.steps.length}
      </p>
      <h2 className={cn("text-base font-semibold", uncovered && "text-amber-700 dark:text-amber-300")}>{step.title}</h2>
      {step.body !== "" ? <Markdown content={step.body} className="text-sm" /> : null}
      {links.length > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
          Shows up in
          {links.map((link, position) => (
            <button key={position} type="button" className={cn("rounded border border-border px-1.5 py-px text-foreground hover:bg-state-hover", PRESS)} title={position === 0 ? "ga" : undefined} onClick={link.go}>
              {link.title}
            </button>
          ))}
        </p>
      ) : null}
      <StepExcerpts excerpts={excerpts} focused={focusedExcerpt} onOpen={onOpenExcerpt} />
    </>
  );
}

function PageFooter({ chapters, address, onGo }: { chapters: NarrativeChapter[]; address: StepAddress; onGo: (address: StepAddress) => void }) {
  const previous = movePage(chapters, address, -1);
  const next = movePage(chapters, address, 1);
  const label = (at: StepAddress) => (at.step < 0 ? chapters[at.chapter]!.title : chapters[at.chapter]!.steps[at.step]!.title);
  const same = (a: StepAddress, b: StepAddress) => a.chapter === b.chapter && a.step === b.step;
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
      {!same(previous, address) ? (
        <button type="button" className={cn("flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-state-hover hover:text-foreground", PRESS)} onClick={() => onGo(previous)}>
          <Icon name="ChevronLeft" className="size-3 shrink-0" />
          <span className="truncate">{label(previous)}</span>
        </button>
      ) : null}
      {!same(next, address) ? (
        <button type="button" className={cn("ml-auto flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-state-hover hover:text-foreground", PRESS)} onClick={() => onGo(next)}>
          <span className="truncate">{label(next)}</span>
          <Icon name="ChevronRight" className="size-3 shrink-0" />
        </button>
      ) : null}
    </div>
  );
}

/** Chapters and their steps beside the step, in wide views; the read ones are ticked. */
function NarrativeOutline({ chapters, address, read, onGo }: { chapters: NarrativeChapter[]; address: StepAddress | null; read: ReadonlySet<string>; onGo: (address: StepAddress) => void }) {
  const currentRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => currentRef.current?.scrollIntoView({ block: "nearest" }), [address]);
  return (
    <nav aria-label="Narrative outline" className="hidden w-64 shrink-0 overflow-y-auto border-r border-border py-2 text-xs @3xl:block">
      {chapters.map((chapter, chapterIndex) => {
        const here = address?.chapter === chapterIndex;
        return (
          <section key={chapter.key} className="mb-2">
            <button
              ref={here && address?.step === -1 ? currentRef : undefined}
              type="button"
              className={cn("w-full px-3 py-1 text-left font-medium hover:bg-state-hover", here && address?.step === -1 && "bg-state-active", chapter.kind === "revision" && "text-sky-700 dark:text-sky-300")}
              onClick={() => onGo({ chapter: chapterIndex, step: -1 })}
            >
              {chapter.title}
            </button>
            <ol>
              {chapter.steps.map((step, stepIndex) => {
                const current = here && address?.step === stepIndex;
                const done = read.has(`${chapter.key}/${step.id}`);
                return (
                  <li key={`${step.id}-${stepIndex}`}>
                    <button
                      ref={current ? currentRef : undefined}
                      type="button"
                      className={cn("flex w-full items-baseline gap-1.5 px-3 py-0.5 pl-4 text-left hover:bg-state-hover", current ? "bg-state-active text-foreground" : "text-muted-foreground", step.id === UNCOVERED_STEP_ID && "text-amber-700 dark:text-amber-300")}
                      onClick={() => onGo({ chapter: chapterIndex, step: stepIndex })}
                    >
                      <span className="w-3 shrink-0 text-center">{done ? "✓" : ""}</span>
                      <span className="min-w-0 truncate">{step.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}
