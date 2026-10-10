export const SLOT_ATTRIBUTE = "data-composer-status-slot";
export const ANCHOR_ATTRIBUTE = "data-composer-status-anchor";
/** Marks the plugin's own pieces so container queries can drop them by priority. */
export const PART_ATTRIBUTE = "data-composer-status-part";
export type PartName = "model-picker" | "model" | "effort-separator" | "effort" | "limit" | "tokens-used";
const STYLE_ATTRIBUTE = "data-composer-status-bar";
// Phone widths keep bb's touch-sized footer.
const WIDE_VIEWPORT = "(min-width: 768px)";

// bb's composer markup has no plugin contract, so these selectors and the
// stylesheet below follow the shipped DOM; a bb update that renames them just
// leaves bb's normal footer.
export const COMPOSER = "[data-app-composer]";
const FOOTER = "[data-follow-up-composer-footer]";
const PERMISSION_BUTTON = 'button[aria-label="Permission mode"]';
const CONTEXT_BUTTON = 'button[aria-label^="Context window"]';
const LEFT = `${FOOTER} > div:first-child`;
const RIGHT = `${FOOTER} > div:last-child`;
const PROJECT = `${LEFT} > div > div[data-option-display]`;
const ENVIRONMENT = `${LEFT} > div > div:not([data-option-display])`;
const BRANCH = `${LEFT} [data-promptbox-hide-branch-compact]`;
const NEW_THREAD = `${LEFT} button[aria-label="New thread in this environment"]`;
const PERMISSION = `${RIGHT} ${PERMISSION_BUTTON}`;
const CONTEXT = `${RIGHT} ${CONTEXT_BUTTON}`;
const part = (name: PartName) => `[${PART_ATTRIBUTE}="${name}"]`;

// Layout: where the work happens on the left (project / environment, branch);
// on the right, usage (limit, context) and then the agent (model · effort,
// permission), so permission sits under the send button. CSS order does the
// arranging because these are bb's React nodes.
// Buttons wear an outlined chip; labels are plain text. Instead of truncating,
// narrower footers drop detail in priority order.
export const FOOTER_CSS = `
@media ${WIDE_VIEWPORT} {
  ${FOOTER} {
    container: composer-status / inline-size;
    gap: 0.5rem !important;
    /* Chips line up with the composer box's edges, not with its content. */
    padding-left: 0 !important;
    padding-right: 0 !important;
  }
  ${LEFT} > div {
    gap: 0.375rem !important;
    padding-right: 0 !important;
  }
  ${RIGHT} {
    gap: 0.375rem !important;
  }

  /* Labels: no chip padding, no pointer, quiet icons. */
  ${PROJECT},
  ${ENVIRONMENT},
  ${ENVIRONMENT} > div[data-option-display] {
    cursor: default !important;
    flex-shrink: 0 !important;
    gap: 0.25rem !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
  }
  ${PROJECT} [data-icon-root] {
    width: 0.875rem !important;
    height: 0.875rem !important;
    opacity: 0.6;
  }
  /* "my-bb-plugins / Worktree" reads as one location. */
  ${ENVIRONMENT} > [data-icon-root] {
    display: none !important;
  }
  ${ENVIRONMENT}::before {
    content: "/";
    color: var(--subtle-foreground);
  }

  /* Controls: an outlined chip at rest, bb's hover fill on hover. */
  ${BRANCH},
  ${PERMISSION},
  ${CONTEXT} {
    height: 1.375rem !important;
    margin: 0 !important;
    border-radius: 0.375rem !important;
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    flex-shrink: 0 !important;
  }
  /* The branch is reference, not a control you reach for: quiet text until
     hovered, when it shows the same outline as the other chips. */
  ${BRANCH} {
    flex: 0 1 auto !important;
    min-width: 5rem !important;
    gap: 0.25rem !important;
    padding: 0 0.375rem !important;
    box-shadow: none;
    color: var(--subtle-foreground) !important;
  }
  ${BRANCH}:hover {
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    color: var(--foreground) !important;
  }
  /* New threads start from the sidebar or the project picker. */
  ${NEW_THREAD} {
    display: none !important;
  }
  ${PERMISSION} {
    order: 4;
    padding: 0 0.25rem 0 0.5rem !important;
  }
  ${PERMISSION} [data-promptbox-full-label] {
    display: none !important;
  }
  ${PERMISSION} [data-promptbox-compact-label] {
    display: inline !important;
  }
  ${CONTEXT} {
    order: 2;
    width: auto !important;
    gap: 0.375rem !important;
    padding: 0 0.375rem 0 0.5rem !important;
  }
  /* The token count inside the chip says the same thing more precisely. */
  ${CONTEXT} > span[aria-hidden] {
    display: none !important;
  }
  ${CONTEXT} > svg {
    width: 0.875rem !important;
    height: 0.875rem !important;
  }

  [${SLOT_ATTRIBUTE}] {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
    font-size: 0.75rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  [${SLOT_ATTRIBUTE}="context"] {
    gap: 0;
  }
  [${SLOT_ATTRIBUTE}="usage"] {
    order: 1;
    color: var(--muted-foreground);
  }
  [${SLOT_ATTRIBUTE}="agent"] {
    order: 3;
    margin-left: 0.125rem;
    padding-left: 0.5rem;
    border-left: 1px solid var(--border-hairline);
    color: var(--muted-foreground);
  }
  ${part("effort")} {
    color: var(--subtle-foreground);
  }
  ${part("limit")} {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--warning-text);
  }
  ${part("limit")}[data-blocked] {
    color: var(--destructive);
  }
  @container composer-status (max-width: 680px) {
    ${ENVIRONMENT} { display: none !important; }
  }
  @container composer-status (max-width: 540px) {
    ${PROJECT} [data-promptbox-full-label],
    ${PROJECT} [data-promptbox-compact-label] { display: none !important; }
  }
  @container composer-status (max-width: 480px) {
    ${part("effort")},
    ${part("effort-separator")} { display: none !important; }
  }
  @container composer-status (max-width: 420px) {
    [${SLOT_ATTRIBUTE}="agent"] { display: none !important; }
  }
}
${COMPOSER} *:has(> [${ANCHOR_ATTRIBUTE}]) {
  display: none !important;
}
`;

/** Installs the footer stylesheet; returns cleanup. */
export function mountComposerStatusBar(doc: Document): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = FOOTER_CSS;
  doc.head.append(style);
  return () => style.remove();
}

export type SlotName = "agent" | "usage" | "context";
export type FooterSlots = Partial<Record<SlotName, HTMLElement>>;

// Each slot keeps its place next to the bb control it belongs with: agent
// before permission mode, usage before the context ring, and the token count
// inside the ring's button.
export function ensureFooterSlots(composerRoot: Element): FooterSlots {
  const footer = composerRoot.querySelector(FOOTER);
  const left = footer?.firstElementChild;
  const right = footer?.lastElementChild;
  if (!(left instanceof HTMLElement) || !(right instanceof HTMLElement) || left === right) {
    return {};
  }
  const permission = right.querySelector(`:scope > ${PERMISSION_BUTTON}`);
  const context = right.querySelector<HTMLElement>(`:scope > ${CONTEXT_BUTTON}`);
  const slots: FooterSlots = {
    agent: placeSlot(right, "agent", permission ?? right.firstChild, "div"),
    usage: placeSlot(right, "usage", context, "div"),
  };
  if (context !== null) slots.context = placeSlot(context, "context", context.firstChild, "span");
  return slots;
}

function placeSlot(
  parent: HTMLElement,
  name: SlotName,
  before: Node | null,
  tag: "div" | "span",
): HTMLElement {
  let slot = parent.querySelector<HTMLElement>(`:scope > [${SLOT_ATTRIBUTE}="${name}"]`);
  if (slot === null) {
    slot = parent.ownerDocument.createElement(tag);
    slot.setAttribute(SLOT_ATTRIBUTE, name);
  }
  // Only move when out of place: each insert re-triggers the caller's observer.
  const placed = slot.parentNode === parent && slot.nextSibling === before;
  if (!placed && slot !== before) parent.insertBefore(slot, before);
  return slot;
}
