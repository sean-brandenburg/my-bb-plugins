export const TITLE_CLICK_DELAY_MS = 250;
const STYLE_ATTRIBUTE = "data-minimal-top-bar";
const HIDDEN_ATTRIBUTE = "data-minimal-top-bar-hidden";

// bb's top bar markup has no plugin contract, so these selectors and the
// stylesheet below follow the shipped DOM; a bb update that renames them just
// leaves bb's normal top bar.
const HEADER_ROW = '[data-testid="app-page-header-content-row"]';
const THREAD_TITLE = ".bb-thread-title";
// Matches while renaming too, when bb swaps the title for an input.
const TITLE_ROW = `${HEADER_ROW}:has(${THREAD_TITLE}, p input)`;
const TITLE_GROUP = `${TITLE_ROW} div:has(> div > p > ${THREAD_TITLE})`;
const MENU_TRIGGER = 'button[aria-label="Thread actions"]';
const WORKFLOW_ACTION =
  "[data-thread-header-workflow-actions] [data-thread-header-responsive-action]";
// The Settings, Plugins, and Skills pages mount their page list in the
// sidebar, even while it is collapsed to the rail.
const LIST_PAGE_SIDEBAR =
  '[data-side="left"][data-collapsible="rail"]:has([data-testid="settings-sidebar-body"], [data-testid="plugins-sidebar-body"], [data-testid="skills-sidebar-body"])';
// bb only renders this element at desktop widths; compact windows get a
// drawer, which is itself the panel.
const EXPANDED_SIDEBAR =
  '[data-side="left"][data-variant="sidebar"][data-state="expanded"]:not([data-sidebar])';
const SIDEBAR_TRIGGER = '[data-sidebar="trigger"]';

export const MINIMAL_TOP_BAR_CSS = `
/* Top-bar clutter with keyboard equivalents: open in editor/terminal is
   Cmd+O, close pane is Cmd+W. */
button[aria-label^="Open workspace in "],
button[aria-label="Choose another app to open workspace"],
button[aria-label="Close pane"] {
  display: none !important;
}
/* The thread list is replaced by the Project switcher's picker, so nothing
   should open or close the sidebar (see collapseSidebar). */
${SIDEBAR_TRIGGER} {
  display: none !important;
}
/* Without the toggle a sidebar collapsed to the rail can't reopen, so the
   pages whose list is their navigation show it beside the rail anyway. */
${LIST_PAGE_SIDEBAR} > [data-sidebar="gap"],
${LIST_PAGE_SIDEBAR} > [data-sidebar="panel"] {
  width: var(--sidebar-width) !important;
}
${LIST_PAGE_SIDEBAR} [data-testid="nav-rail-sidebar-body"],
${LIST_PAGE_SIDEBAR} [data-testid="sidebar-footer-row"] > :not(:first-child) {
  visibility: visible !important;
}
[${HIDDEN_ATTRIBUTE}] {
  display: none !important;
}
/* Thread titles sit centered in the top bar. A click on the title opens
   the thread menu (see installTitleMenu), so bb's ⋯ trigger is hidden but
   kept at the title's end, where the menu anchors. */
${TITLE_ROW} > div:first-child {
  justify-content: center;
}
${TITLE_ROW} input {
  text-align: center;
}
${TITLE_GROUP} {
  gap: 0 !important;
}
${TITLE_GROUP} > span:has(> ${MENU_TRIGGER}) {
  width: 0;
  overflow: visible;
}
${TITLE_GROUP} ${MENU_TRIGGER} {
  opacity: 0;
  pointer-events: none;
}
${TITLE_ROW} ${THREAD_TITLE} {
  cursor: pointer;
  transition: transform var(--bbm-duration-fast) var(--bbm-ease-out);
}
/* The menu opens only once the double-click window has passed, so the
   title answers the press itself. Half the usual press depth, because the
   title is wide and a full one squeezes it visibly. */
${TITLE_ROW} ${THREAD_TITLE}:active {
  transform: scale(calc((1 + var(--bbm-scale-press)) / 2));
  transition-duration: var(--bbm-duration-instant);
}
`;

/**
 * bb's Commit button carries no label of its own, only its text, so it is
 * found by that inside the header's workflow actions.
 */
function hideCommitButtons(doc: Document, hide: boolean) {
  for (const action of doc.querySelectorAll(WORKFLOW_ACTION)) {
    const isCommit =
      action.querySelector("button")?.textContent?.trim() === "Commit";
    if (hide && isCommit) action.setAttribute(HIDDEN_ATTRIBUTE, "");
    else action.removeAttribute(HIDDEN_ATTRIBUTE);
  }
}

/**
 * Keeps the sidebar collapsed to the rail. bb remembers it open, opens it by
 * default, and opens it on its sidebar.toggle key, so the hidden toggle is
 * pressed whenever it shows; that also saves the collapsed state.
 */
function collapseSidebar(doc: Document) {
  if (doc.querySelector(EXPANDED_SIDEBAR) === null) return;
  doc.querySelector<HTMLElement>(SIDEBAR_TRIGGER)?.click();
}

/**
 * A single click on a header title opens the thread menu. It waits briefly so
 * a double-click still reaches bb's rename. Wide windows get a radix dropdown,
 * which opens on pointerdown; compact ones get a sheet, which opens on click.
 */
function installTitleMenu(doc: Document, win: Window): () => void {
  let timer = 0;
  const cancel = () => {
    if (timer !== 0) win.clearTimeout(timer);
    timer = 0;
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const title = target?.closest(THREAD_TITLE);
    const row = title?.closest(HEADER_ROW);
    if (!title || !row) return;
    cancel();
    if (event.detail > 1) return;
    timer = win.setTimeout(() => {
      timer = 0;
      const trigger = row.querySelector<HTMLButtonElement>(MENU_TRIGGER);
      if (!trigger || title.closest("p")?.querySelector("input")) return;
      trigger.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
      if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
    }, TITLE_CLICK_DELAY_MS);
  };
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("dblclick", cancel, true);
  return () => {
    cancel();
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("dblclick", cancel, true);
  };
}

/** Installs the stylesheet and keeps the Commit button hidden; returns cleanup. */
export function mountMinimalTopBar(doc: Document, win: Window): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = MINIMAL_TOP_BAR_CSS;
  doc.head.append(style);
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      hideCommitButtons(doc, true);
      collapseSidebar(doc);
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "class"],
  });
  schedule();
  const removeTitleMenu = installTitleMenu(doc, win);
  return () => {
    observer.disconnect();
    if (frame !== 0) win.cancelAnimationFrame(frame);
    style.remove();
    hideCommitButtons(doc, false);
    removeTitleMenu();
  };
}
