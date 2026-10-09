export const TITLE_CLICK_DELAY_MS = 250;
// Phone-width windows keep bb's stock top bar.
const WIDE_VIEWPORT = "(min-width: 768px)";
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

export const MINIMAL_TOP_BAR_CSS = `
@media ${WIDE_VIEWPORT} {
  /* Top-bar clutter with keyboard equivalents: open in editor/terminal is
     Cmd+O, close pane is Cmd+W. */
  button[aria-label^="Open workspace in "],
  button[aria-label="Choose another app to open workspace"],
  button[aria-label="Close pane"] {
    display: none !important;
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
  }
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
 * A single click on a header title opens the thread menu. It waits briefly so
 * a double-click still reaches bb's rename. Radix opens on pointerdown, so the
 * hidden trigger gets one.
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
  const wide = win.matchMedia(WIDE_VIEWPORT);
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      hideCommitButtons(doc, wide.matches);
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "class"],
  });
  wide.addEventListener("change", schedule);
  schedule();
  const removeTitleMenu = installTitleMenu(doc, win);
  return () => {
    observer.disconnect();
    wide.removeEventListener("change", schedule);
    if (frame !== 0) win.cancelAnimationFrame(frame);
    style.remove();
    hideCommitButtons(doc, false);
    removeTitleMenu();
  };
}
