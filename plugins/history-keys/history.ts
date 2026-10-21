// bb's markup has no plugin contract, so these selectors follow the shipped
// DOM; a bb update that renames them leaves the keys stepping the window's
// history instead.
const HISTORY_BUTTON = {
  back: 'button[aria-label="Go back"]',
  forward: 'button[aria-label="Go forward"]',
} as const;

export type HistoryDirection = keyof typeof HISTORY_BUTTON;

// Clicking bb's own back/forward buttons keeps bb's history rules (and does
// nothing when they are disabled).
export function stepHistory(
  doc: Document,
  win: Window,
  direction: HistoryDirection,
) {
  const button = doc.querySelector<HTMLButtonElement>(
    HISTORY_BUTTON[direction],
  );
  if (button === null) {
    if (direction === "back") win.history.back();
    else win.history.forward();
    return;
  }
  if (!button.disabled) button.click();
}
