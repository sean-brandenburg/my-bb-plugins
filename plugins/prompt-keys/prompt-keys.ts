export const OWNED_ATTRIBUTE = "data-prompt-keys";
const PANEL_ATTRIBUTE = "data-prompt-keys-panel";
const STYLE_ATTRIBUTE = "data-prompt-keys-style";
// Opts the banner out of vim-mode: the "Other…" box's Escape has to reach
// these keys, and focus in the banner ends vim-mode's scroll mode.
const VIM_IGNORE_ATTRIBUTE = "data-vim-ignore";
const G_TIMEOUT_MS = 1000;
// How soon after an Escape keydown a prompt box blur counts as caused by it.
const ESCAPE_BLUR_MS = 500;
const LINE_STEP_PX = 40;

// bb's pending-interaction banners have no plugin contract, so these selectors
// follow the shipped DOM; a bb update that renames them just leaves the
// banners without these keys.
const QUESTION = '[data-testid="user-question-banner"]';
const BANNER = `section${QUESTION}, section[data-testid="approval-banner"], section[data-testid="plan-review-banner"]`;
const TOGGLE = ":scope > div > button[aria-expanded]";
// The banner sits above the prompt box inside the thread's composer.
const COMPOSER = "[data-app-composer]";
const PROMPT_EDITOR = '[data-promptbox] [contenteditable="true"]';
const QUESTION_FORM = 'div[tabindex="-1"]';
const CHOICES = "fieldset button[aria-pressed]";
// While one of these is open, the keys belong to it.
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]';

const QUESTION_KEYS: [string, string][] = [
  ["j  k", "Next or previous answer"],
  ["gg  G", "First or last answer"],
  ["h  l", "Previous or next question"],
  ["Enter", "Pick the answer and go on"],
  ["Space  x", "Pick or toggle the answer"],
  ["i", "Type your own answer"],
  ["Ctrl-D Ctrl-U", "Scroll the question"],
  ["Esc", "Back to the answers, then fold"],
  ["?", "Show these keys"],
];

const DECISION_KEYS: [string, string][] = [
  ["h  l", "Move across the buttons"],
  ["Enter", "Press the button"],
  ["j  k", "Scroll the details"],
  ["Ctrl-D Ctrl-U", "Half a page down or up"],
  ["gg  G", "Top or bottom"],
  ["Esc", "Fold the banner"],
  ["?", "Show these keys"],
];

export const PROMPT_KEYS_CSS = `
[${OWNED_ATTRIBUTE}] fieldset button[aria-pressed]:focus {
  outline: none;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ring) 55%, transparent);
}
/* bb's 1px inset ring disappears on its solid primary buttons (Approve,
   Allow once), so the keyboard cursor gets an outline outside the button. */
[${OWNED_ATTRIBUTE}] button:not(fieldset button[aria-pressed]):focus-visible {
  outline: 2px solid color-mix(in oklab, var(--foreground) 70%, transparent);
  outline-offset: 2px;
}
[${PANEL_ATTRIBUTE}] {
  position: fixed;
  z-index: 50;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--popover, var(--background));
  font-size: 12px;
  color: var(--muted-foreground);
  pointer-events: none;
}
[${PANEL_ATTRIBUTE}] div {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
[${PANEL_ATTRIBUTE}] span:first-child {
  flex: 0 0 auto;
  min-width: 96px;
  color: var(--foreground);
  white-space: pre;
}
`;

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    !!target.closest("[contenteditable='true']")
  );
}

const isQuestion = (banner: Element) => banner.matches(QUESTION);
const isExpanded = (banner: Element) => banner.hasAttribute("data-expanded");
const toggleOf = (banner: Element) => banner.querySelector<HTMLButtonElement>(TOGGLE);
const enabled = (button: HTMLButtonElement) => !button.disabled && !button.matches(":disabled");
const pressed = (button: Element) => button.getAttribute("aria-pressed") === "true";

/** The banner's collapsible body, which scrolls when the details run long. */
function contentOf(banner: Element): HTMLElement | null {
  const id = toggleOf(banner)?.getAttribute("aria-controls");
  if (!id) return null;
  const content = banner.ownerDocument.getElementById(id);
  return content && banner.contains(content) ? content : null;
}

const formOf = (banner: Element) => contentOf(banner)?.querySelector<HTMLElement>(QUESTION_FORM) ?? null;

function choicesOf(form: Element): HTMLButtonElement[] {
  return [...form.querySelectorAll<HTMLButtonElement>(CHOICES)].filter(enabled);
}

// Answers sit in a wrapper that also holds their preview; bb's own "Other…"
// choice is the only one placed straight in the list.
function otherChoice(choices: HTMLButtonElement[]): HTMLButtonElement | null {
  const first = choices[0];
  const last = choices.at(-1);
  const list = last?.parentElement;
  if (!first || !last || last === first || !list) return null;
  return list !== first.parentElement && list.contains(first) ? last : null;
}

// bb draws a round mark for one-answer questions and a square one for many.
const isMultiSelect = (choice: Element) => !choice.querySelector(":scope > span")?.classList.contains("rounded-full");

/** The question tabs bb shows when it asks more than one question at once. */
function tabsOf(form: Element): HTMLButtonElement[] {
  return [...form.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].filter(
    (button) => !button.closest("fieldset"),
  );
}

/** Next on every question but the last, where it becomes Submit answer. */
function primaryOf(form: Element): HTMLButtonElement | null {
  const buttons = form.lastElementChild?.querySelectorAll<HTMLButtonElement>("button");
  return buttons?.[buttons.length - 1] ?? null;
}

/** Deny, Allow for session, Allow once, or the plan review's choices. */
function decisionsOf(banner: Element): HTMLButtonElement[] {
  const footer = contentOf(banner)?.lastElementChild;
  if (!footer) return [];
  return [...footer.querySelectorAll<HTMLButtonElement>(":scope > button")].filter(enabled);
}

function scrollBy(banner: Element, amount: (content: HTMLElement) => number) {
  const content = contentOf(banner);
  if (content) content.scrollTop += amount(content);
}

function reveal(element: HTMLElement, banner: Element) {
  const content = contentOf(banner);
  if (!content) return;
  const box = content.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (rect.top < box.top) content.scrollTop -= box.top - rect.top;
  else if (rect.bottom > box.bottom) content.scrollTop += rect.bottom - box.bottom;
}

/**
 * Vim keys for the banners bb shows above the prompt box when a thread waits
 * on you: questions, tool approvals, and plan reviews. Focus moves into a
 * banner when it appears (unless you're typing a prompt), the keys act on the
 * banner that holds focus, and focus goes back to the prompt box once it's
 * answered.
 */
export function mountPromptKeys(doc: Document, win: Window): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = PROMPT_KEYS_CSS;
  doc.head.append(style);

  const seen = new WeakSet<Element>();
  // Where focus was in a banner, so a bb re-render that drops the focused
  // node, or the banner going away, can put it back somewhere useful.
  let last: { banner: HTMLElement; element: Element; composer: Element | null } | null = null;
  let pendingG = 0;
  let panel: { element: HTMLElement; banner: Element } | null = null;
  let scan = 0;
  let escapeAt = -Infinity;

  const afterRender = (run: () => void) => win.requestAnimationFrame(() => run());

  const closePanel = () => {
    panel?.element.remove();
    panel = null;
  };

  const togglePanel = (banner: HTMLElement) => {
    const open = panel?.banner === banner;
    closePanel();
    if (open) return;
    const element = doc.createElement("div");
    element.setAttribute(PANEL_ATTRIBUTE, "");
    element.setAttribute("aria-hidden", "true");
    element.classList.add("bbm-rise-in", "bbm-near", "bbm-fast");
    for (const [key, action] of isQuestion(banner) ? QUESTION_KEYS : DECISION_KEYS) {
      const row = doc.createElement("div");
      row.append(
        Object.assign(doc.createElement("span"), { textContent: key }),
        Object.assign(doc.createElement("span"), { textContent: action }),
      );
      element.append(row);
    }
    const rect = banner.getBoundingClientRect();
    element.style.left = `${rect.left}px`;
    element.style.bottom = `${win.innerHeight - rect.top + 8}px`;
    doc.body.append(element);
    panel = { element, banner };
  };

  const focus = (element: HTMLElement | null | undefined, banner: HTMLElement) => {
    if (!element) return;
    element.focus({ preventScroll: true });
    reveal(element, banner);
  };

  /** Where focus lands in a banner: the picked (or first) answer, or the fold toggle. */
  const cursorTarget = (banner: HTMLElement): HTMLElement | null => {
    const toggle = toggleOf(banner);
    if (!isExpanded(banner) || !isQuestion(banner)) return toggle;
    const form = formOf(banner);
    if (!form) return toggle;
    const choices = choicesOf(form);
    if (choices.length === 0) return form.querySelector<HTMLElement>("fieldset textarea") ?? form;
    return choices.find(pressed) ?? choices[0]!;
  };

  const placeCursor = (banner: HTMLElement) => {
    if (banner.isConnected) focus(cursorTarget(banner), banner);
  };

  /** Opens a folded banner, then runs `then` once bb has drawn its body. */
  const unfold = (banner: HTMLElement, then: () => void): boolean => {
    if (isExpanded(banner)) return false;
    toggleOf(banner)?.click();
    afterRender(then);
    return true;
  };

  const typeOwnAnswer = (banner: HTMLElement, form: HTMLElement, choices: HTMLButtonElement[]) => {
    const other = otherChoice(choices);
    if (other && !pressed(other)) other.click();
    afterRender(() => formOf(banner)?.querySelector<HTMLElement>("fieldset textarea")?.focus());
  };

  const questionKey = (banner: HTMLElement, key: string, wasG: boolean): boolean => {
    if (["j", "k", "h", "l", "G", "g", "x", "i"].includes(key) && unfold(banner, () => placeCursor(banner))) return true;
    const form = formOf(banner);
    if (!form) return false;
    const choices = choicesOf(form);
    const active = doc.activeElement;
    const at = choices.findIndex((choice) => choice === active);
    const step = (index: number) => focus(choices[Math.max(0, Math.min(choices.length - 1, index))], banner);
    switch (key) {
      case "j":
        step(at < 0 ? 0 : at + 1);
        return true;
      case "k":
        step(at < 0 ? choices.length - 1 : at - 1);
        return true;
      case "g":
        if (!wasG) {
          pendingG = win.setTimeout(() => (pendingG = 0), G_TIMEOUT_MS);
          return true;
        }
        step(0);
        return true;
      case "G":
        step(choices.length - 1);
        return true;
      case "h":
      case "l": {
        const tabs = tabsOf(form);
        const current = tabs.findIndex(pressed);
        const next = tabs[current + (key === "l" ? 1 : -1)];
        if (current < 0 || !next) return false;
        next.click();
        afterRender(() => placeCursor(banner));
        return true;
      }
      case "x":
        if (at < 0) return false;
        choices[at]!.click();
        return true;
      case "i":
        typeOwnAnswer(banner, form, choices);
        return true;
      case "Enter": {
        if (at < 0) return false;
        const choice = choices[at]!;
        if (choice === otherChoice(choices)) {
          typeOwnAnswer(banner, form, choices);
          return true;
        }
        if (!isMultiSelect(choice) && !pressed(choice)) choice.click();
        // bb's Next and Submit read the answers from their last render, so
        // they're pressed only once the pick has been drawn.
        afterRender(() => {
          const primary = formOf(banner) && primaryOf(formOf(banner)!);
          if (!primary || !enabled(primary)) return;
          primary.click();
          afterRender(() => placeCursor(banner));
        });
        return true;
      }
      default:
        return false;
    }
  };

  const decisionKey = (banner: HTMLElement, key: string, wasG: boolean): boolean => {
    const enterRow = (fromEnd: boolean) => {
      const decisions = decisionsOf(banner);
      focus(fromEnd ? decisions.at(-1) : decisions[0], banner);
    };
    if (["h", "l"].includes(key) && unfold(banner, () => enterRow(key === "h"))) return true;
    if (["j", "k", "g", "G"].includes(key) && unfold(banner, () => {})) return true;
    switch (key) {
      case "h":
      case "l": {
        const decisions = decisionsOf(banner);
        const at = decisions.findIndex((button) => button === doc.activeElement);
        if (at < 0) enterRow(key === "h");
        else focus(decisions[Math.max(0, Math.min(decisions.length - 1, at + (key === "l" ? 1 : -1)))], banner);
        return true;
      }
      case "j":
      case "k":
        scrollBy(banner, () => (key === "j" ? LINE_STEP_PX : -LINE_STEP_PX));
        return true;
      case "g":
        if (!wasG) {
          pendingG = win.setTimeout(() => (pendingG = 0), G_TIMEOUT_MS);
          return true;
        }
        scrollBy(banner, (content) => -content.scrollTop);
        return true;
      case "G":
        scrollBy(banner, (content) => content.scrollHeight);
        return true;
      default:
        return false;
    }
  };

  /** The banner a key with nothing focused goes to: the one last used, or the only one. */
  const fallbackBanner = (): HTMLElement | null => {
    if (last?.banner.isConnected) return last.banner;
    const banners = doc.querySelectorAll<HTMLElement>(BANNER);
    return banners.length === 1 ? banners[0]! : null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") escapeAt = win.performance.now();
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.altKey) return;
    const target = event.target;
    let banner = target instanceof Element ? target.closest<HTMLElement>(BANNER) : null;
    if (!banner) {
      if (target !== doc.body && target !== doc.documentElement) return;
      if (doc.querySelector(OVERLAY)) return;
      banner = fallbackBanner();
      if (!banner) return;
    }
    if (isEditable(target)) {
      // Escape leaves "Other…" for the answers instead of folding the banner.
      const plain = !event.ctrlKey && !event.shiftKey;
      if (event.key !== "Escape" || !plain || !isQuestion(banner) || !target.matches("fieldset textarea")) return;
      event.preventDefault();
      event.stopPropagation();
      const form = formOf(banner);
      const choices = form ? choicesOf(form) : [];
      focus(otherChoice(choices) ?? form, banner);
      return;
    }
    const wasG = pendingG !== 0;
    if (pendingG !== 0) win.clearTimeout(pendingG);
    pendingG = 0;
    let key: string | null = event.key;
    if (event.ctrlKey) key = event.key === "d" || event.key === "u" ? `C-${event.key}` : null;
    if (key === null) return;
    let handled: boolean;
    if (key === "Escape" && panel) {
      closePanel();
      handled = true;
    } else if (key === "?") {
      togglePanel(banner);
      handled = true;
    } else if (key === "C-d" || key === "C-u") {
      const sign = key === "C-d" ? 1 : -1;
      scrollBy(banner, (content) => (sign * content.clientHeight) / 2);
      handled = true;
    } else {
      closePanel();
      handled = isQuestion(banner) ? questionKey(banner, key, wasG) : decisionKey(banner, key, wasG);
    }
    if (!handled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const banner = target.closest<HTMLElement>(BANNER);
    if (banner) last = { banner, element: target, composer: banner.closest(COMPOSER) };
    else last = null;
    if (panel && panel.banner !== banner) closePanel();
  };

  // Escaping the prompt box while a banner waits goes to the banner. vim-mode
  // and bb both blur the box on Escape, vim-mode a moment later.
  const onFocusOut = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || event.relatedTarget !== null || !target.closest(PROMPT_EDITOR)) return;
    if (win.performance.now() - escapeAt > ESCAPE_BLUR_MS) return;
    const banner = target.closest(COMPOSER)?.querySelector<HTMLElement>(BANNER);
    if (!banner) return;
    win.setTimeout(() => {
      if (doc.activeElement === doc.body && banner.isConnected) placeCursor(banner);
    }, 0);
  };

  /** True while focus is nowhere, or in this banner's own empty prompt box. */
  const mayTakeFocus = (banner: HTMLElement): boolean => {
    const active = doc.activeElement;
    if (!active || active === doc.body) return true;
    const editor = active.closest(PROMPT_EDITOR);
    return !!editor && editor.closest(COMPOSER) === banner.closest(COMPOSER) && editor.textContent?.trim() === "";
  };

  const check = () => {
    scan = 0;
    const nothingFocused = doc.activeElement === doc.body || doc.activeElement === null;
    if (last && !last.element.isConnected && nothingFocused) {
      const { banner, composer } = last;
      last = null;
      if (banner.isConnected) placeCursor(banner);
      else if (composer?.isConnected) composer.querySelector<HTMLElement>(PROMPT_EDITOR)?.focus();
    }
    if (panel && !panel.banner.isConnected) closePanel();
    for (const banner of doc.querySelectorAll<HTMLElement>(BANNER)) {
      if (seen.has(banner)) continue;
      seen.add(banner);
      banner.setAttribute(OWNED_ATTRIBUTE, "");
      banner.setAttribute(VIM_IGNORE_ATTRIBUTE, "");
      if (!doc.querySelector(OVERLAY) && mayTakeFocus(banner)) placeCursor(banner);
    }
  };

  const observer = new MutationObserver(() => {
    if (scan === 0) scan = win.requestAnimationFrame(check);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  check();

  win.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("focusout", onFocusOut, true);

  return () => {
    observer.disconnect();
    if (scan !== 0) win.cancelAnimationFrame(scan);
    if (pendingG !== 0) win.clearTimeout(pendingG);
    win.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("focusin", onFocusIn, true);
    doc.removeEventListener("focusout", onFocusOut, true);
    closePanel();
    for (const banner of doc.querySelectorAll(`[${OWNED_ATTRIBUTE}]`)) {
      banner.removeAttribute(OWNED_ATTRIBUTE);
      banner.removeAttribute(VIM_IGNORE_ATTRIBUTE);
    }
    style.remove();
  };
}
