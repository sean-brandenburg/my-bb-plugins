import {
  ANY_OVERLAY,
  bindKeys,
  type KeyHelpSection,
  type Keymap,
  mapKeymap,
  type Motion,
  renderKeyHelp,
  scrollPane,
  stepIndex,
} from "bb-vim-keys";

export const OWNED_ATTRIBUTE = "data-prompt-keys";
const PANEL_ATTRIBUTE = "data-prompt-keys-panel";
const STYLE_ATTRIBUTE = "data-prompt-keys-style";
// Opts the banner out of vim-mode: the "Other…" box's Escape has to reach
// these keys, and focus in the banner ends vim-mode's scroll mode.
const VIM_IGNORE_ATTRIBUTE = "data-vim-ignore";
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

type BannerCommand =
  /** Through a question's answers. */
  | { kind: "choice"; motion: Motion }
  | { kind: "scroll"; motion: Motion }
  /** Between a question's tabs, or across a decision's buttons. */
  | { kind: "step"; step: 1 | -1 }
  | { kind: "toggle" }
  | { kind: "own-answer" }
  | { kind: "pick" }
  | { kind: "escape" }
  | { kind: "help" };

const STEP_KEYS: Keymap<Motion> = { j: "down", k: "up", gg: "top", G: "bottom" };
const HALF_PAGE: Keymap<Motion> = { "<C-d>": "halfDown", "<C-u>": "halfUp" };
const scroll = (motion: Motion): BannerCommand => ({ kind: "scroll", motion });

const SHARED_KEYMAP: Keymap<BannerCommand> = {
  ...mapKeymap(HALF_PAGE, scroll),
  h: { kind: "step", step: -1 },
  l: { kind: "step", step: 1 },
  "<Esc>": { kind: "escape" },
  "?": { kind: "help" },
};

export const QUESTION_KEYMAP: Keymap<BannerCommand> = {
  ...SHARED_KEYMAP,
  ...mapKeymap(STEP_KEYS, (motion): BannerCommand => ({ kind: "choice", motion })),
  x: { kind: "toggle" },
  i: { kind: "own-answer" },
  "<CR>": { kind: "pick" },
};

// Enter stays with the focused button, which presses itself.
export const DECISION_KEYMAP: Keymap<BannerCommand> = {
  ...SHARED_KEYMAP,
  ...mapKeymap(STEP_KEYS, scroll),
};

export const QUESTION_KEYS: KeyHelpSection[] = [
  {
    title: "",
    keys: [
      { keys: ["j", "k"], action: "Next or previous answer" },
      { keys: ["gg", "G"], action: "First or last answer" },
      { keys: ["h", "l"], action: "Previous or next question" },
      { keys: ["Enter"], action: "Pick the answer and go on" },
      { keys: ["Space", "x"], action: "Pick or toggle the answer" },
      { keys: ["i"], action: "Type your own answer" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Scroll the question" },
      { keys: ["Esc"], action: "Back to the answers, then fold" },
      { keys: ["?"], action: "Show these keys" },
    ],
  },
];

export const DECISION_KEYS: KeyHelpSection[] = [
  {
    title: "",
    keys: [
      { keys: ["h", "l"], action: "Move across the buttons" },
      { keys: ["Enter"], action: "Press the button" },
      { keys: ["j", "k"], action: "Scroll the details" },
      { keys: ["Ctrl-d", "Ctrl-u"], action: "Half a page down or up" },
      { keys: ["gg", "G"], action: "Top or bottom" },
      { keys: ["Esc"], action: "Fold the banner" },
      { keys: ["?"], action: "Show these keys" },
    ],
  },
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
[${PANEL_ATTRIBUTE}] [data-key-help-row] {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
[${PANEL_ATTRIBUTE}] [data-key-help-row] > span:first-child {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  min-width: 96px;
  color: var(--foreground);
}
[${PANEL_ATTRIBUTE}] kbd {
  font: inherit;
}
`;

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

function scrollBanner(banner: Element, motion: Motion) {
  const content = contentOf(banner);
  if (content) scrollPane(content, motion, { line: LINE_STEP_PX });
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
  let panel: { element: HTMLElement; banner: Element } | null = null;
  let scan = 0;
  let escapeAt = -Infinity;
  // The banner the key being handled acts on, found by `accepts` before the
  // keymap is picked and the command run.
  let keyBanner: HTMLElement | null = null;

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
    element.append(renderKeyHelp(doc, isQuestion(banner) ? QUESTION_KEYS : DECISION_KEYS));
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

  const questionCommand = (banner: HTMLElement, command: BannerCommand): boolean => {
    const moves = command.kind === "choice" || command.kind === "step" || command.kind === "toggle" || command.kind === "own-answer";
    if (moves && unfold(banner, () => placeCursor(banner))) return true;
    const form = formOf(banner);
    if (!form) return false;
    const choices = choicesOf(form);
    const at = choices.findIndex((choice) => choice === doc.activeElement);
    switch (command.kind) {
      case "choice": {
        const next = stepIndex(choices.length, at < 0 ? null : at, command.motion);
        if (next !== null) focus(choices[next], banner);
        return true;
      }
      case "step": {
        const tabs = tabsOf(form);
        const current = tabs.findIndex(pressed);
        const next = tabs[current + command.step];
        if (current < 0 || !next) return false;
        next.click();
        afterRender(() => placeCursor(banner));
        return true;
      }
      case "toggle":
        if (at < 0) return false;
        choices[at]!.click();
        return true;
      case "own-answer":
        typeOwnAnswer(banner, form, choices);
        return true;
      case "pick": {
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

  const decisionCommand = (banner: HTMLElement, command: BannerCommand): boolean => {
    const enterRow = (fromEnd: boolean) => {
      const decisions = decisionsOf(banner);
      focus(fromEnd ? decisions.at(-1) : decisions[0], banner);
    };
    if (command.kind === "step" && unfold(banner, () => enterRow(command.step < 0))) return true;
    if (command.kind === "scroll" && unfold(banner, () => {})) return true;
    if (command.kind === "scroll") {
      scrollBanner(banner, command.motion);
      return true;
    }
    if (command.kind !== "step") return false;
    const decisions = decisionsOf(banner);
    const at = decisions.findIndex((button) => button === doc.activeElement);
    if (at < 0) enterRow(command.step < 0);
    else focus(decisions[Math.max(0, Math.min(decisions.length - 1, at + command.step))], banner);
    return true;
  };

  /** The banner a key with nothing focused goes to: the one last used, or the only one. */
  const fallbackBanner = (): HTMLElement | null => {
    if (last?.banner.isConnected) return last.banner;
    const banners = doc.querySelectorAll<HTMLElement>(BANNER);
    return banners.length === 1 ? banners[0]! : null;
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
      if (!doc.querySelector(ANY_OVERLAY) && mayTakeFocus(banner)) placeCursor(banner);
    }
  };

  const observer = new MutationObserver(() => {
    if (scan === 0) scan = win.requestAnimationFrame(check);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  check();

  const unbindKeys = bindKeys<BannerCommand>(win, {
    capture: true,
    // The focusout below needs to know an Escape was pressed even when vim-mode or bb took it.
    observe: (event) => {
      if (event.key === "Escape") escapeAt = win.performance.now();
    },
    // Enter on a focused answer picks it and goes on, rather than pressing it.
    leaveToPressables: false,
    accepts: (element) => {
      keyBanner = element ? element.closest<HTMLElement>(BANNER) : doc.querySelector(ANY_OVERLAY) ? null : fallbackBanner();
      return keyBanner !== null;
    },
    keymap: () => (keyBanner !== null && isQuestion(keyBanner) ? QUESTION_KEYMAP : DECISION_KEYMAP),
    // Escape leaves "Other…" for the answers instead of folding the banner.
    onTextEscape: (field, event) => {
      if (event.shiftKey || !keyBanner || !isQuestion(keyBanner) || !field.matches("fieldset textarea")) return false;
      const form = formOf(keyBanner);
      focus(otherChoice(form ? choicesOf(form) : []) ?? form, keyBanner);
    },
    onUnbound: closePanel,
    onCommand: (command) => {
      const banner = keyBanner!;
      if (command.kind === "escape") {
        if (!panel) return false;
        closePanel();
        return;
      }
      if (command.kind === "help") {
        togglePanel(banner);
        return;
      }
      if (command.kind === "scroll" && (command.motion === "halfDown" || command.motion === "halfUp")) {
        scrollBanner(banner, command.motion);
        return;
      }
      closePanel();
      return isQuestion(banner) ? questionCommand(banner, command) : decisionCommand(banner, command);
    },
  });

  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("focusout", onFocusOut, true);

  return () => {
    observer.disconnect();
    if (scan !== 0) win.cancelAnimationFrame(scan);
    unbindKeys();
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
