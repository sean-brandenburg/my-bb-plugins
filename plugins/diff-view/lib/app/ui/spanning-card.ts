// The chrome shared by every row that spans the diff under a line: a comment thread, a review finding, the comment
// box, a hunk's explanation, a symbol peek. One card shape, with a rule down its left in the row's own hue (amber for
// something unsent, sky for GitHub, the severity for a finding), so a reader tells them apart by the rule and the
// header and never by a different box.

export const SPANNING_CARD = "my-1 min-w-0 max-w-full overflow-hidden rounded-md border border-border border-l-2 bg-card text-sm";

/** The card's first row: what it is and where, tinted so it reads as the card's name rather than its body. */
export const CARD_HEADER = "flex min-w-0 items-center gap-2 bg-muted/40 px-2.5 py-1 text-xs";

export const CARD_BODY = "flex flex-col gap-1.5 px-2.5 pb-2 pt-1.5";

/** The keys the card takes, shown under it while the cursor is on it. */
export const CARD_FOOTER = "border-t border-border/60 bg-muted/20 px-2.5 py-1 font-mono text-[10px] text-muted-foreground";
