import { useRef, useState } from "react";
import { Markdown, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { cn } from "../utils";
import { useDiffSource } from "../source";
import { CHEVRON, FAST, PRESS, STAGGER, enter, stagger } from "../ui/motion";
import { runListMotion, useKeyHandler } from "../ui/vim-keys";
import { OUTSIDE_FINDINGS_KEYMAP, type OutsideFindingsCommand } from "../keys/keymap";
import { SEVERITY_DOT, SEVERITY_LABEL, findingLocationLabel, type ListedFinding } from "./findings";

/** The selector the review keys use to hand the keyboard to this list. */
export const OUTSIDE_FINDINGS = "[data-outside-findings]";

const MAKE_CARD_TITLE = "Add a card for this finding, carrying its title, description, fix and locations";

const listedKey = (entry: ListedFinding) => `${entry.reviewId}:${entry.finding.id}`;

/** Make a card, or open the one made; disabled while the request runs so two presses can't race. */
function CardButton({ entry, onMakeCard }: { entry: ListedFinding; onMakeCard: (entry: ListedFinding) => Promise<string | null> }) {
  const { source } = useDiffSource();
  const [card, setCard] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const className = cn("shrink-0 rounded border border-border px-1.5 py-px hover:bg-state-hover disabled:opacity-50", PRESS);
  if (card !== null && source.reviews?.openCard !== undefined) {
    const open = source.reviews.openCard;
    return (
      <button type="button" className={className} onClick={() => open(card)}>
        Open card
      </button>
    );
  }
  return (
    <button
      type="button"
      className={className}
      title={MAKE_CARD_TITLE}
      disabled={making}
      onClick={() => {
        setMaking(true);
        void onMakeCard(entry)
          .then(setCard)
          .finally(() => setMaking(false));
      }}
    >
      {card !== null ? "Card made" : "Make a card"}
    </button>
  );
}

function ListedRow({ entry, index, onMakeCard }: { entry: ListedFinding; index: number; onMakeCard: ((entry: ListedFinding) => Promise<string | null>) | null }) {
  const { finding } = entry;
  const [open, setOpen] = useState(false);
  const where = finding.locations.map(findingLocationLabel).join(", ");
  return (
    <li style={stagger(index)} className={cn("flex flex-col", enter.fade, FAST, STAGGER)}>
      <div data-nav-row="toolbar" className="flex min-w-0 items-center gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none" aria-expanded={open} data-bbm-open={open} onClick={() => setOpen(!open)}>
          <Icon name="ChevronRight" className={cn("size-3 shrink-0 text-muted-foreground", CHEVRON)} />
          <span className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT[finding.severity])} title={SEVERITY_LABEL[finding.severity]} />
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{finding.id}</span>
          <span className="min-w-0 truncate text-foreground">{finding.title}</span>
          {where !== "" ? <span className="min-w-0 shrink truncate font-mono text-[11px] text-muted-foreground">{where}</span> : null}
        </button>
        {finding.confidence != null ? (
          <span className="shrink-0 tabular-nums text-muted-foreground" title="How sure the review's verifier is that it is real (0–100); it does not measure importance">
            confidence {finding.confidence}
          </span>
        ) : null}
        {onMakeCard !== null ? <CardButton entry={entry} onMakeCard={onMakeCard} /> : null}
      </div>
      {open ? (
        <div className={cn("flex flex-col gap-1 py-1 pl-5 text-sm", enter.rise, FAST)}>
          {finding.verification != null && finding.verification !== "" ? <p className="text-xs text-muted-foreground">Verifier: {finding.verification}</p> : null}
          {finding.description !== "" ? <Markdown content={finding.description} /> : <p className="text-xs text-muted-foreground">No description.</p>}
          {finding.fix !== null && finding.fix !== "" ? (
            <div className="flex gap-1.5">
              <Icon name="diff-view-wrench" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <Markdown content={finding.fix} className="min-w-0 flex-1" />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function GroupToggle({ open, onToggle, label, title }: { open: boolean; onToggle: () => void; label: string; title: string }) {
  return (
    <button type="button" className={cn("inline-flex items-center gap-1 rounded px-1 font-medium hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none", PRESS)} aria-expanded={open} data-bbm-open={open} title={title} onClick={onToggle}>
      <Icon name="ChevronRight" className={cn("size-3 text-muted-foreground", CHEVRON)} />
      {label}
    </button>
  );
}

/**
 * The findings that have no place in the diff: pre-existing ones, which can become cards of their own, and the ones the
 * verifier filtered out, folded under their count. It moves with its own list keys; Escape hands the keyboard back.
 */
export function OutsideFindings({
  preExisting,
  filtered,
  filteredOpen,
  onFilteredOpen,
  onMakeCard,
  onLeave,
}: {
  preExisting: readonly ListedFinding[];
  filtered: readonly ListedFinding[];
  filteredOpen: boolean;
  onFilteredOpen: (open: boolean) => void;
  /** Resolves to the card's id, or null when it could not be made; null when the source cannot make cards. */
  onMakeCard: ((entry: ListedFinding) => Promise<string | null>) | null;
  onLeave: () => void;
}) {
  const { labels } = useDiffSource();
  const [preExistingOpen, setPreExistingOpen] = useState(true);
  const sectionRef = useRef<HTMLElement | null>(null);
  // Before the review keys, so j and k move here; Enter is the focused button's own click.
  const onKeyDown = useKeyHandler<OutsideFindingsCommand>({
    keymap: OUTSIDE_FINDINGS_KEYMAP,
    onCommand: (command) => {
      const section = sectionRef.current;
      if (section === null) return false;
      switch (command.kind) {
        case "list":
          return runListMotion(section, command.motion);
        case "leave":
          onLeave();
          return;
      }
    },
  });
  return (
    <section ref={sectionRef} data-outside-findings="" aria-label="Findings outside the diff" className={cn("flex flex-col gap-0.5 border-b border-border px-3 py-1 text-xs", enter.fade)} onKeyDown={onKeyDown}>
      <div data-nav-row="toolbar" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        {preExisting.length > 0 ? (
          <GroupToggle
            open={preExistingOpen}
            onToggle={() => setPreExistingOpen(!preExistingOpen)}
            label={`${preExisting.length} pre-existing`}
            title="Findings already in the code before this change: never applied with it, but each can become a card of its own"
          />
        ) : null}
        {filtered.length > 0 ? <GroupToggle open={filteredOpen} onToggle={() => onFilteredOpen(!filteredOpen)} label={`${filtered.length} filtered`} title={`${labels.filteredFindings} (gF)`} /> : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">gp to reach these</span>
      </div>
      {preExisting.length > 0 && preExistingOpen ? (
        <ul aria-label="Pre-existing findings" className="flex flex-col">
          {preExisting.map((entry, index) => (
            <ListedRow key={listedKey(entry)} entry={entry} index={index} onMakeCard={onMakeCard} />
          ))}
        </ul>
      ) : null}
      {filtered.length > 0 && filteredOpen ? (
        <ul aria-label="Filtered findings" className="flex flex-col opacity-70">
          {filtered.map((entry, index) => (
            <ListedRow key={listedKey(entry)} entry={entry} index={index} onMakeCard={null} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
