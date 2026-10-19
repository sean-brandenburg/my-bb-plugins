import { isMac, RAIL, railItems, railSlotLabel } from "./slots.js";

const TOP_BAR_HEIGHT_PX = 50;
/** Wide enough that bb never folds a footer icon into its More menu. */
const FOOTER_MEASURE_WIDTH_PX = 400;
const FOOTER_ICON_PX = 32;
const HEADER_GAP_PX = 20;
const PANEL_TOGGLE_GAP_PX = 8;
// Phone-width windows keep bb's stock drawer.
const WIDE_VIEWPORT = "(min-width: 768px)";
const STYLE_ATTRIBUTE = "data-slim-sidebar";
export const SLOT_ATTRIBUTE = "data-slim-sidebar-slot";
export const HELD_ATTRIBUTE = "data-slim-sidebar-held";
const FRAME_ATTRIBUTE = "data-slim-sidebar-frame";
const CLEAR_LEFT = "--slim-sidebar-clear-left";
const CLEAR_RIGHT = "--slim-sidebar-clear-right";
const ZOOM_PROPERTY = "--slim-sidebar-zoom";
const TOP_BAR_PROPERTY = "--slim-sidebar-top-bar";
// bb's zoom commands step in 10% increments.
const ZOOM_STEPS_PER_UNIT = 10;
// The rail and top bar stay the same size at any zoom so they keep lining up
// with the macOS window buttons, which the page zoom never scales.
const ZOOM = `var(${ZOOM_PROPERTY}, 1)`;
const UNZOOM = `zoom: calc(1 / ${ZOOM});`;
const unzoomed = (px: number) => `calc(${px}px / ${ZOOM})`;
// bb's page header paints bg-surface-scrim over the page's bg-background.
const HEADER_SURFACE = "linear-gradient(var(--surface-scrim), var(--surface-scrim)), var(--background)";

// bb's sidebar and header markup has no plugin contract, so these selectors and
// the stylesheet below follow the shipped DOM; a bb update that renames them
// just leaves bb's normal sidebar.
const LAYOUT_ROOT = '[data-testid="app-layout-root"]';
const SIDEBAR = '[data-side="left"][data-variant="sidebar"]';
// Settings, Plugins, and Skills swap their own list in beside the rail, and
// keep it.
const OWN_LIST = ["settings", "plugins", "skills"]
  .map((page) => `[data-testid="${page}-sidebar-body"]`)
  .join(", ");
export const SLIM = `${SIDEBAR}:has(${RAIL}):not(:has(${OWN_LIST}))`;
const FOOTER_ROW = '[data-testid="sidebar-footer-row"]';
const FOOTER_BODY = `${FOOTER_ROW} > [data-sidebar="collapsible-body"]`;
// A footer icon's disclosure (Provider usage) and More → Customize footer open
// at the bottom of the thread list, which the slim sidebar hides.
const FOOTER_PANEL_CONTENT =
  ':is([data-testid^="plugin-sidebar-footer-disclosure-"], [data-testid="sidebar-footer-customize-inline"])';
export const FOOTER_PANEL = `${SLIM}[data-state="expanded"] [data-testid="app-sidebar-body"] > div:has(${FOOTER_PANEL_CONTENT})`;
const RAIL_COLUMN = "(var(--bb-sidebar-control-size) + 2 * var(--bb-sidebar-rail-padding))";
// On macOS bb frames the page below a title bar holding back, forward, the
// sidebar toggle, and the right panel toggle.
const FRAMED = `${LAYOUT_ROOT}[data-framed]`;
const TITLE_BAR = '[data-testid="app-window-title-bar"]';
const TITLE_BAR_CONTROLS = `${TITLE_BAR} > div:has([data-sidebar="trigger"])`;
const PANEL_TOGGLE = '[data-testid="window-right-panel-toggle"]';
const SIDEBAR_TRIGGER_OVERLAY = '[data-testid="app-sidebar-trigger-overlay"]';
const HEADER_ROW = '[data-testid="app-page-header-content-row"]';

export const SLIM_SIDEBAR_CSS = `
@media ${WIDE_VIEWPORT} {
  ${SLIM}[data-state="expanded"] > :is([data-sidebar="gap"], [data-sidebar="panel"]) {
    --sidebar-width: calc(var(--sidebar-rail-width) / ${ZOOM}) !important;
  }
  /* The panel itself stays at page zoom: it is sized to the window's height,
     which zoom would inflate. */
  ${SIDEBAR} > [data-sidebar="panel"] > * {
    ${UNZOOM}
    --bb-app-chrome-row-height: ${TOP_BAR_HEIGHT_PX}px !important;
  }
  ${SLIM} [data-testid="nav-rail-sidebar-body"] {
    visibility: hidden !important;
  }
  /* Cmd+\\ hides the rail too, the way bb hides a sidebar that has no rail. */
  ${SLIM}[data-state="collapsed"] > [data-sidebar="gap"] {
    width: 0 !important;
  }
  ${SLIM}[data-state="collapsed"] > [data-sidebar="panel"] {
    left: calc(var(--sidebar-width) * -1) !important;
    visibility: hidden !important;
    transition: left 200ms linear, width 200ms linear, visibility 0s linear 200ms !important;
  }

  /* No title bar: the page header is the top bar, as before bb 0.46, so a
     side panel reaches the top of the window again. */
  ${FRAMED} {
    --bb-window-title-bar-height: 0px !important;
    --bb-window-frame-lip: 0px !important;
  }
  ${FRAMED} > main[data-sidebar="inset"] {
    border: 0 !important;
    border-radius: 0 !important;
  }
  /* The title bar's controls float over the top bar. Back, forward, and the
     sidebar toggle hide but stay mounted, because History keys' Ctrl+O /
     Ctrl+I click them and their box marks where the window buttons end. */
  ${TITLE_BAR} {
    ${UNZOOM}
    --bb-window-title-bar-height: ${TOP_BAR_HEIGHT_PX}px !important;
    pointer-events: none;
  }
  ${TITLE_BAR} > div {
    pointer-events: auto;
  }
  ${TITLE_BAR_CONTROLS},
  ${SIDEBAR_TRIGGER_OVERLAY} {
    visibility: hidden !important;
    pointer-events: none !important;
  }
  /* The rail, and the Settings, Plugins, and Skills lists beside it, start
     below the window buttons. */
  ${FRAMED} ${RAIL} {
    padding-top: ${TOP_BAR_HEIGHT_PX}px;
  }
  ${FRAMED} [data-testid="nav-rail-sidebar-body"] {
    margin-top: ${TOP_BAR_HEIGHT_PX}px;
  }

  /* One seamless frame: the rail wears the page header's surface, and the
     lines between rail, top bar, and page go away. */
  ${SIDEBAR} > [data-sidebar="panel"] {
    background: ${HEADER_SURFACE} !important;
    border-right-color: transparent !important;
  }
  ${SIDEBAR} :is(${RAIL}, ${FOOTER_ROW} > div) {
    background: transparent !important;
  }
  [${FRAME_ATTRIBUTE}] {
    height: ${unzoomed(TOP_BAR_HEIGHT_PX)} !important;
    border-bottom-color: transparent !important;
    background: ${HEADER_SURFACE} !important;
  }
  /* The new-thread page has no page header, only a see-through drag strip
     over its backdrop, so the strip stands in as the top bar. */
  [data-testid="root-compose-main-window-drag-strip"] {
    background: ${HEADER_SURFACE};
  }
  /* One top-bar height for every page, centered on the macOS window buttons
     (about 25px down). The root value is a plain length, set from script,
     because bb parses it as a number to place its find bar. */
  :root {
    --bb-app-chrome-row-height: var(${TOP_BAR_PROPERTY}, ${TOP_BAR_HEIGHT_PX}px) !important;
  }
  [${FRAME_ATTRIBUTE}] ${HEADER_ROW} {
    ${UNZOOM}
    --bb-app-chrome-row-height: ${TOP_BAR_HEIGHT_PX}px !important;
    height: ${TOP_BAR_HEIGHT_PX}px !important;
    transform: none !important;
    padding-left: var(${CLEAR_LEFT}, 0px) !important;
    padding-right: var(${CLEAR_RIGHT}, 0px) !important;
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
     list's card. */
  ${SLIM} ${FOOTER_BODY} {
    border-color: transparent !important;
    border-radius: 0 !important;
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
  /* So it floats as a card beside the rail, above the footer. The list's
     clip-path would clip it even though it is fixed. */
  ${FOOTER_PANEL} {
    visibility: visible;
    position: fixed;
    left: calc(var(--sidebar-rail-width) + 4px);
    bottom: 8px;
    width: 280px;
    padding: 0 !important;
    overflow: hidden;
    border: 1px solid var(--sidebar-border);
    border-radius: 0.5rem;
    background: var(--sidebar);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  }
  ${FOOTER_PANEL} [data-testid^="plugin-sidebar-footer-disclosure-"] {
    border: 0;
    border-radius: 0;
  }
  ${SLIM}:has(${FOOTER_PANEL_CONTENT}) [data-testid="nav-rail-sidebar-body"] {
    clip-path: none !important;
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

/**
 * bb's zoom factor, read from how much wider the window is than its CSS
 * viewport since bb only reports zoom when it changes. Browsers put their own
 * chrome in that difference, so only bb's desktop app is measured.
 */
export function pageZoom(win: Window): number {
  if (!("bbDesktop" in win) || win.innerWidth <= 0) return 1;
  const steps = Math.round((win.outerWidth / win.innerWidth) * ZOOM_STEPS_PER_UNIT);
  return steps > 0 ? steps / ZOOM_STEPS_PER_UNIT : 1;
}

function applyZoom(doc: Document, zoom: number) {
  const root = doc.documentElement.style;
  if (zoom === 1) {
    root.removeProperty(ZOOM_PROPERTY);
    root.removeProperty(TOP_BAR_PROPERTY);
    return;
  }
  root.setProperty(ZOOM_PROPERTY, String(zoom));
  root.setProperty(TOP_BAR_PROPERTY, `${TOP_BAR_HEIGHT_PX / zoom}px`);
}

/**
 * How far a top-bar row must indent from each side so its content clears the
 * controls floating over the top bar: the macOS window buttons on the left,
 * the right panel toggle on the right. Positions are in page pixels; the
 * indents are in the row's own, which zoom keeps at screen size.
 */
export function headerClearance(
  header: { left: number; right: number },
  padding: { left: number; right: number },
  controls: { leftEnd: number | null; rightStart: number | null },
  zoom = 1,
): { left: number; right: number } {
  const clear = (overlap: number, gap: number) => Math.max(0, Math.ceil(overlap * zoom + gap));
  return {
    left: controls.leftEnd === null ? 0 : clear(controls.leftEnd - (header.left + padding.left), HEADER_GAP_PX),
    right:
      controls.rightStart === null
        ? 0
        : clear(header.right - padding.right - controls.rightStart, PANEL_TOGGLE_GAP_PX),
  };
}

function setClearance(row: HTMLElement, property: string, px: number) {
  if (px > 0) row.style.setProperty(property, `${px}px`);
  else row.style.removeProperty(property);
}

const headerOf = (row: HTMLElement) => row.parentElement ?? row;

function clearRow(row: HTMLElement) {
  headerOf(row).removeAttribute(FRAME_ATTRIBUTE);
  row.style.removeProperty(CLEAR_LEFT);
  row.style.removeProperty(CLEAR_RIGHT);
}

/** Where a visible control floating over the top bar starts and ends, in page pixels. */
function controlBox(doc: Document, selector: string): DOMRect | null {
  const control = doc.querySelector(selector);
  if (control === null || control.getClientRects().length === 0) return null;
  return control.getBoundingClientRect();
}

/**
 * Marks the page headers in the top row as the top bar and indents them clear
 * of the controls that float over it.
 */
export function arrangeHeaders(doc: Document, isWide: boolean, zoom = 1): void {
  const rows = [...doc.querySelectorAll<HTMLElement>(HEADER_ROW)];
  if (!isWide) {
    rows.forEach(clearRow);
    return;
  }
  const topRowBottom = TOP_BAR_HEIGHT_PX / zoom;
  // The hidden back button sits just past the window buttons, so its left
  // edge is where header content may start.
  const back = controlBox(doc, `${FRAMED} ${TITLE_BAR_CONTROLS}`);
  const panelToggle = controlBox(doc, `${FRAMED} ${PANEL_TOGGLE}`);
  for (const row of rows) {
    const header = headerOf(row);
    const box = header.getBoundingClientRect();
    if (box.top >= topRowBottom) {
      clearRow(row);
      continue;
    }
    header.setAttribute(FRAME_ATTRIBUTE, "");
    const style = getComputedStyle(header);
    const clearance = headerClearance(
      box,
      { left: Number.parseFloat(style.paddingLeft) || 0, right: Number.parseFloat(style.paddingRight) || 0 },
      {
        leftEnd: back?.left ?? null,
        rightStart: panelToggle !== null && panelToggle.left < box.right ? panelToggle.left : null,
      },
      zoom,
    );
    setClearance(row, CLEAR_LEFT, clearance.left);
    setClearance(row, CLEAR_RIGHT, clearance.right);
  }
}

/** Installs the stylesheet and keeps the rail numbered and the top bar arranged; returns cleanup. */
export function mountSlimSidebar(doc: Document, win: Window): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = SLIM_SIDEBAR_CSS;
  doc.head.append(style);
  const wide = win.matchMedia(WIDE_VIEWPORT);
  const platform = win.navigator.platform;
  const mac = isMac(platform);
  const modifier = mac ? "Meta" : "Control";
  let held = false;
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      const zoom = pageZoom(win);
      applyZoom(doc, zoom);
      arrangeHeaders(doc, wide.matches, zoom);
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
  // data-state and class changes move headers: the sidebar collapsing, a
  // panel opening.
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "class"],
  });
  win.addEventListener("keydown", onKeyDown, true);
  win.addEventListener("keyup", onKeyUp, true);
  win.addEventListener("blur", release);
  win.addEventListener("resize", schedule);
  wide.addEventListener("change", schedule);
  schedule();
  return () => {
    observer.disconnect();
    win.removeEventListener("keydown", onKeyDown, true);
    win.removeEventListener("keyup", onKeyUp, true);
    win.removeEventListener("blur", release);
    win.removeEventListener("resize", schedule);
    wide.removeEventListener("change", schedule);
    if (frame !== 0) win.cancelAnimationFrame(frame);
    style.remove();
    applyZoom(doc, 1);
    doc.querySelectorAll<HTMLElement>(HEADER_ROW).forEach(clearRow);
    doc.querySelectorAll(`[${SLOT_ATTRIBUTE}]`).forEach((item) => item.removeAttribute(SLOT_ATTRIBUTE));
    doc.querySelectorAll(`[${HELD_ATTRIBUTE}]`).forEach((rail) => rail.removeAttribute(HELD_ATTRIBUTE));
  };
}
