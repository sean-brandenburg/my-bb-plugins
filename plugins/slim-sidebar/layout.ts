import { isMac, RAIL, railItems, railSlotLabel } from "./slots.js";

/** Wide enough that bb never folds a footer icon into its More menu. */
const FOOTER_MEASURE_WIDTH_PX = 400;
const FOOTER_ICON_PX = 32;
// Phone-width windows keep bb's stock drawer.
const WIDE_VIEWPORT = "(min-width: 768px)";
const STYLE_ATTRIBUTE = "data-slim-sidebar";
export const SLOT_ATTRIBUTE = "data-slim-sidebar-slot";
export const HELD_ATTRIBUTE = "data-slim-sidebar-held";

// bb's sidebar markup has no plugin contract, so these selectors and the
// stylesheet below follow the shipped DOM; a bb update that renames them just
// leaves bb's normal sidebar.
const SIDEBAR = '[data-side="left"][data-variant="sidebar"]';
// Settings, Plugins, and Skills swap their own list in beside the rail, and
// keep it.
const OWN_LIST = ["settings", "plugins", "skills"]
  .map((page) => `[data-testid="${page}-sidebar-body"]`)
  .join(", ");
export const SLIM = `${SIDEBAR}:has(${RAIL}):not(:has(${OWN_LIST}))`;
const FOOTER_ROW = '[data-testid="sidebar-footer-row"]';
const FOOTER_BODY = `${FOOTER_ROW} > [data-sidebar="collapsible-body"]`;
const RAIL_COLUMN = "(var(--bb-sidebar-control-size) + 2 * var(--bb-sidebar-rail-padding))";

export const SLIM_SIDEBAR_CSS = `
@media ${WIDE_VIEWPORT} {
  ${SLIM}[data-state="expanded"] > :is([data-sidebar="gap"], [data-sidebar="panel"]) {
    --sidebar-width: var(--sidebar-rail-width) !important;
  }
  ${SLIM} [data-testid="nav-rail-sidebar-body"] {
    visibility: hidden !important;
  }
  /* Cmd+\\ hides the rail too, the way bb hides a sidebar that has no rail. */
  ${SLIM}[data-state="collapsed"] > [data-sidebar="gap"] {
    width: 0 !important;
  }
  ${SLIM}[data-state="collapsed"] > [data-sidebar="panel"] {
    left: calc(var(--sidebar-rail-width) * -1) !important;
    visibility: hidden !important;
    transition: left 200ms linear, width 200ms linear, visibility 0s linear 200ms !important;
  }
  /* The footer's own icons sit beside Settings, in the part of the footer
     the rail hides, so they stack above it instead. */
  ${SLIM} ${FOOTER_ROW} {
    flex-direction: column-reverse;
  }
  ${SLIM} ${FOOTER_BODY} > div {
    width: auto !important;
  }
  /* Inside the macOS window frame that part is the bottom of the thread
     list's card; the rail itself has no fill there. */
  ${SLIM} ${FOOTER_BODY} {
    border-color: transparent !important;
    border-radius: 0 !important;
    background-color: transparent !important;
  }
  /* Outside the frame the rail has a darker fill of its own. */
  [data-testid="app-layout-root"]:not([data-framed]) > ${SLIM} ${FOOTER_BODY} {
    background-color: var(--surface-recessed) !important;
  }
  /* bb shows as many footer icons as fit across the footer's width and folds
     the rest into a More menu. A wide, click-through list keeps them all
     visible while they stack. */
  ${SLIM} ${FOOTER_BODY} [data-sidebar="footer"] {
    align-items: flex-start;
    padding: 8px 0 0 calc(${RAIL_COLUMN} / 2 - ${FOOTER_ICON_PX / 2}px);
  }
  ${SLIM} ${FOOTER_BODY} ul[data-sidebar="menu"] {
    flex-direction: column !important;
    align-items: flex-start !important;
    width: ${FOOTER_MEASURE_WIDTH_PX}px !important;
    max-width: none !important;
    pointer-events: none;
  }
  ${SLIM} ${FOOTER_BODY} li[data-sidebar="menu-item"] {
    flex: none;
    min-width: 0;
  }
  ${SLIM} ${FOOTER_BODY} :is(a, button) {
    pointer-events: auto;
  }
  /* The update badges are labelled pills sized for the full sidebar; in the
     rail they shrink to icon circles, and the tooltip still names the update. */
  ${SLIM} ${FOOTER_BODY} :has(> [data-testid^="sidebar-updates-badge"]) {
    flex-direction: column;
    max-width: none;
  }
  ${SLIM} [data-testid^="sidebar-updates-badge"] {
    width: ${FOOTER_ICON_PX}px;
    height: ${FOOTER_ICON_PX}px;
    justify-content: center;
    gap: 0;
    padding: 0;
    font-size: 0;
  }
  ${SLIM} [data-testid="sidebar-updates-badge-providers"] > svg:not(.animate-spin),
  ${SLIM} [data-testid="sidebar-updates-badge-providers"]:has(> svg.animate-spin) > span {
    display: none;
  }
  ${SLIM} [data-testid="sidebar-updates-badge-providers"] > span {
    flex-wrap: wrap;
    justify-content: center;
  }
}
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
  animation: slim-sidebar-pill 120ms ease-out;
}
@keyframes slim-sidebar-pill {
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

/** Installs the stylesheet and keeps the rail numbered; returns cleanup. */
export function mountSlimSidebar(doc: Document, win: Window): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = SLIM_SIDEBAR_CSS;
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
