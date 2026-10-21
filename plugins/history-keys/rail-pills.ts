import { isMac, RAIL, railItems, railSlotLabel } from "./slots.js";

const STYLE_ATTRIBUTE = "data-history-keys";
export const SLOT_ATTRIBUTE = "data-history-keys-slot";
export const HELD_ATTRIBUTE = "data-history-keys-held";

export const RAIL_PILLS_CSS = `
${RAIL} [${SLOT_ATTRIBUTE}] {
  position: relative;
}
/* After bb's shortcut pill on its thread rows, but opaque and smaller so it
   reads over an icon. */
${RAIL}[${HELD_ATTRIBUTE}] [${SLOT_ATTRIBUTE}]::after {
  content: attr(${SLOT_ATTRIBUTE});
  position: absolute;
  right: -6px;
  bottom: -4px;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--popover);
  color: var(--muted-foreground);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  animation: history-keys-pill 120ms ease-out;
}
@keyframes history-keys-pill {
  from { opacity: 0; }
}
`;

/** Numbers the rail's items for their Mod+digit shortcut and shows the numbers while the modifier is held. */
export function labelRail(doc: Document, platform: string, held: boolean): void {
  const items = railItems(doc);
  for (const stale of doc.querySelectorAll<HTMLElement>(`[${SLOT_ATTRIBUTE}]`)) {
    if (!items.includes(stale as HTMLButtonElement)) stale.removeAttribute(SLOT_ATTRIBUTE);
  }
  items.forEach((item, index) => {
    const label = railSlotLabel(index, platform);
    if (label === null) item.removeAttribute(SLOT_ATTRIBUTE);
    else if (item.getAttribute(SLOT_ATTRIBUTE) !== label) item.setAttribute(SLOT_ATTRIBUTE, label);
  });
  const rail = doc.querySelector(RAIL);
  if (rail !== null && rail.hasAttribute(HELD_ATTRIBUTE) !== held) {
    rail.toggleAttribute(HELD_ATTRIBUTE, held);
  }
}

/** Installs the pill stylesheet and keeps the rail numbered; returns cleanup. */
export function mountRailPills(doc: Document, win: Window): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = RAIL_PILLS_CSS;
  doc.head.append(style);
  const platform = win.navigator.platform;
  const mac = isMac(platform);
  const modifier = mac ? "Meta" : "Control";
  let held = false;
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      labelRail(doc, platform, held);
    });
  };
  const hold = (next: boolean) => {
    if (held === next) return;
    held = next;
    schedule();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === modifier) hold(!event.altKey && !event.shiftKey);
    else if (!(mac ? event.metaKey : event.ctrlKey)) hold(false);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === modifier) hold(false);
  };
  const release = () => hold(false);
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  win.addEventListener("keydown", onKeyDown, true);
  win.addEventListener("keyup", onKeyUp, true);
  win.addEventListener("blur", release);
  schedule();
  return () => {
    observer.disconnect();
    win.removeEventListener("keydown", onKeyDown, true);
    win.removeEventListener("keyup", onKeyUp, true);
    win.removeEventListener("blur", release);
    if (frame !== 0) win.cancelAnimationFrame(frame);
    style.remove();
    doc.querySelectorAll(`[${SLOT_ATTRIBUTE}]`).forEach((item) => item.removeAttribute(SLOT_ATTRIBUTE));
    doc.querySelectorAll(`[${HELD_ATTRIBUTE}]`).forEach((rail) => rail.removeAttribute(HELD_ATTRIBUTE));
  };
}
