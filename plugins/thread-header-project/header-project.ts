export const HEADER_SLOT_ATTRIBUTE = "data-thread-header-project-slot";
export const HEADER_ANCHOR_ATTRIBUTE = "data-thread-header-project-anchor";
export const HEADER_NAME_ATTRIBUTE = "data-thread-header-project-name";
const HEADER_STYLE_ATTRIBUTE = "data-thread-header-project";
const FOOTER_STYLE_ATTRIBUTE = "data-thread-header-project-footer";
// Phone widths keep bb's stock footer, so the project stays there; the header
// label hides itself on bb's compact viewport.
const WIDE_VIEWPORT = "(min-width: 768px)";

// bb's header and footer markup has no plugin contract, so these selectors and
// the stylesheets below follow the shipped DOM; a bb update that renames them
// just leaves bb's normal header and footer labels.
export const HEADER_ROW = '[data-testid="app-page-header-content-row"]';
const TITLE_AREA = ":scope > div:first-child > div";
// Matches while renaming too, when bb swaps the title for an input.
const THREAD_TITLE = ".bb-thread-title, p input";
const FOOTER_LEFT = "[data-follow-up-composer-footer] > div:first-child";
const FOOTER_PROJECT = `${FOOTER_LEFT} > div > div[data-option-display]`;
const FOOTER_ENVIRONMENT = `${FOOTER_LEFT} > div > div:not([data-option-display])`;
export const FOOTER_LABELS = `${FOOTER_PROJECT}, ${FOOTER_ENVIRONMENT}`;

// The project sits in front of the thread title, so the header reads
// "my-bb-plugins › Thread title". The header-action slot only places
// the anchor; its host-wrapped group is hidden so it takes no room in the
// action row. Sizes match bb's title rather than inheriting the row's.
export const HEADER_CSS = `
[role="group"]:has(> [${HEADER_ANCHOR_ATTRIBUTE}]) {
  display: none !important;
}
[${HEADER_SLOT_ATTRIBUTE}] {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  margin-right: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  white-space: nowrap;
  color: var(--muted-foreground);
}
[${HEADER_SLOT_ATTRIBUTE}]:empty {
  display: none;
}
/* The separator belongs to the name so the two fade in together. */
[${HEADER_NAME_ATTRIBUTE}] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
[${HEADER_NAME_ATTRIBUTE}]::after {
  content: "›";
  color: var(--subtle-foreground);
}
`;

// The project reads in the thread header instead, and the footer's branch
// already says which environment.
export const FOOTER_LABELS_CSS = `
@media ${WIDE_VIEWPORT} {
  ${FOOTER_LABELS} {
    display: none !important;
  }
}
`;

/** Installs the header label and footer stylesheets; returns cleanup. */
export function mountThreadHeaderProject(doc: Document): () => void {
  const sheets: [marker: string, css: string][] = [
    [HEADER_STYLE_ATTRIBUTE, HEADER_CSS],
    [FOOTER_STYLE_ATTRIBUTE, FOOTER_LABELS_CSS],
  ];
  const styles = sheets.map(([marker, css]) => {
    const style = doc.createElement("style");
    style.setAttribute(marker, "");
    style.textContent = css;
    doc.head.append(style);
    return style;
  });
  return () => {
    for (const style of styles) style.remove();
  };
}

export type ShownProjects = WeakMap<Element, string>;

/**
 * Records which project a header row now labels (null: none) and says whether
 * that differs from what it labelled before, so the label should fade in.
 */
export function projectChanged(shown: ShownProjects, row: Element, projectId: string | null): boolean {
  const previous = shown.get(row);
  if (projectId === null) {
    shown.delete(row);
    return false;
  }
  shown.set(row, projectId);
  return previous !== projectId;
}

/**
 * The slot for the project label, first in the title area of the header row
 * that holds `anchor`. Null when that row has no thread title (bb renamed its
 * markup, or the header isn't a thread's).
 */
export function ensureHeaderSlot(anchor: Element): HTMLElement | null {
  const row = anchor.closest(HEADER_ROW);
  const titleArea = row?.querySelector<HTMLElement>(TITLE_AREA);
  if (!titleArea?.querySelector(THREAD_TITLE)) return null;
  let slot = titleArea.querySelector<HTMLElement>(`:scope > [${HEADER_SLOT_ATTRIBUTE}]`);
  if (slot === null) {
    slot = titleArea.ownerDocument.createElement("span");
    slot.setAttribute(HEADER_SLOT_ATTRIBUTE, "");
  }
  // Only move when out of place: each insert re-triggers the caller's observer.
  if (titleArea.firstChild !== slot) titleArea.insertBefore(slot, titleArea.firstChild);
  return slot;
}
