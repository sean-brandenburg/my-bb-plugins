import type { Reporter } from "../report";
import { Vim, VimEditor } from "./adapter";
import { codeMirrorProvider } from "./codemirror-host";
import { UNSUPPORTED, type Claim, type HostProvider, type TextHost } from "./host";
import { logError } from "./log";
import { handleVimKey, hasNoPendingInput, isAppHistoryKey, isIdleNormalMode, vimState } from "./keys";
import type { VimModeOptions, VimScope } from "./options";
import { proseMirrorProvider } from "./prosemirror-host";
import { isEditable, ScrollMode, threadViewport } from "./scroll-mode";
import {
  EXCLUDED_CONTAINERS,
  PROMPTBOX,
  PROMPTBOX_TYPEAHEAD_MENU,
  PROMPTBOX_VOICE_ACTIVE_ATTRIBUTE,
  UI_ATTRIBUTE,
} from "./selectors";
import { textFieldProvider } from "./text-field-host";
import { VimUi } from "./ui";

// Asked in order; the first to claim a target decides it. CodeMirror keeps
// the inputs inside its editors and ProseMirror the fields in its node views.
const HOST_PROVIDERS: readonly HostProvider[] = [codeMirrorProvider, proseMirrorProvider, textFieldProvider];

interface Session {
  element: HTMLElement;
  provider: HostProvider;
  /** The editor behind `element` at attach time; a different one means a new session. */
  owner: unknown;
  host: TextHost;
  cm: VimEditor;
  ui: VimUi;
}

interface AttachTarget {
  element: HTMLElement;
  provider: HostProvider;
}

/** Keys an open completion popup handles instead of vim. */
const POPUP_KEYS = new Set(["Escape", "Enter", "Tab", "ArrowUp", "ArrowDown"]);

function claimTarget(target: HTMLElement, scope: VimScope): { provider: HostProvider; claim: Claim } | null {
  for (const provider of HOST_PROVIDERS) {
    const claim = provider.claim(target, scope);
    if (claim) return { provider, claim };
  }
  return null;
}

/**
 * Where focus on `target` attaches vim, or why it does not. Null for targets
 * that do not look editable, which are skipped without a log line.
 */
function resolveTarget(target: EventTarget | null, options: VimModeOptions): AttachTarget | { skip: string } | null {
  if (!(target instanceof HTMLElement)) return null;
  const claimed = claimTarget(target, options.scope);
  if (!claimed && !target.isContentEditable) return null;
  if (!options.enabled) return { skip: "disabled in settings" };
  const excluded = target.closest(EXCLUDED_CONTAINERS);
  if (excluded) return { skip: `inside excluded ${describe(excluded)}` };
  if (!claimed) return UNSUPPORTED;
  const { provider, claim } = claimed;
  return "element" in claim ? { element: claim.element, provider } : claim;
}

function describe(element: Element): string {
  const classes = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
  return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
}

/**
 * Installs vim editing on every supported text box in the document. Returns
 * a disposer that removes all listeners, DOM, and classes it added.
 */
export function mountVimMode(getOptions: () => VimModeOptions, report: Reporter = () => {}): () => void {
  const sessions = new Map<HTMLElement, Session>();
  let active: Session | null = null;
  // The session that most recently had focus. Focus that returns to it from
  // outside the page (another window or app) keeps its mode.
  let lastActive: Session | null = null;
  // Set when focus moves from an editor into its own `:`/`/` prompt. The
  // prompt is removed before focus returns, so relatedTarget cannot say so.
  let returningFromPrompt: Session | null = null;
  let lastKey = "";
  const scrollMode = new ScrollMode(returnToTextBox);

  function sessionFor({ element, provider }: AttachTarget): Session | null {
    const owner = provider.editorFor(element);
    const existing = sessions.get(element);
    if (existing) {
      if (existing.owner === owner) return existing;
      dispose(existing);
    }
    if (!owner) return null;
    const host = provider.create(element, owner);
    const cm = new VimEditor(host);
    Vim.enterVimMode(cm as never);
    const session = { element, provider, owner, host, cm, ui: new VimUi(cm) };
    sessions.set(element, session);
    return session;
  }

  function dispose(session: Session): void {
    if (sessions.get(session.element) === session) sessions.delete(session.element);
    if (active === session) active = null;
    if (lastActive === session) lastActive = null;
    for (const step of [
      () => session.ui.destroy(),
      () => Vim.leaveVimMode(session.cm as never),
      () => session.cm.dispose(),
      () => session.host.destroy(),
    ]) {
      try {
        step();
      } catch (error) {
        logError(error);
      }
    }
  }

  /**
   * Runs one handler step. An exception would otherwise leave vim's state
   * half-updated for the rest of the page's life, so the session is rebuilt
   * from the editor's current text instead.
   */
  function guarded(session: Session | null, step: () => void): void {
    try {
      step();
    } catch (error) {
      logError("recovering from an error", error);
      report("error", `recovered from: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      if (!session) return;
      const element = session.element;
      const wasActive = active === session;
      dispose(session);
      if (wasActive && document.activeElement === element) {
        try {
          activate(element, null);
        } catch (retryError) {
          logError(retryError);
        }
      }
    }
  }

  // Editors bb has unmounted (another thread's prompt box, a closed note)
  // are dropped here; their objects can throw on access, so only the element
  // captured at attach time and the editor's identity are consulted.
  function pruneDetached(): void {
    for (const session of [...sessions.values()]) {
      let stale = !session.element.isConnected;
      if (!stale) {
        try {
          stale = session.provider.editorFor(session.element) !== session.owner;
        } catch {
          stale = true;
        }
      }
      if (stale) dispose(session);
    }
  }

  function resetMode(session: Session): void {
    const { cm } = session;
    const vim = vimState(cm);
    if (!vim) return;
    cm.sync();
    if (vim.visualMode) Vim.exitVisualMode(cm as never, false);
    if (getOptions().startInInsertMode) {
      if (!vim.insertMode) Vim.handleKey(cm as never, "i", "mapping");
    } else if (vim.insertMode) {
      Vim.exitInsertMode(cm as never, true);
    }
  }

  function isOwnUi(node: EventTarget | null): boolean {
    return node instanceof Element && !!node.closest(`[${UI_ATTRIBUTE}]`);
  }

  function activate(target: EventTarget | null, relatedTarget: EventTarget | null): void {
    const options = getOptions();
    if (isOwnUi(target)) return;
    const resolved = resolveTarget(target, options);
    if (!resolved || "skip" in resolved) {
      if (resolved && target instanceof Element) report("info", `skip ${describe(target)}: ${resolved.skip}`);
      active?.ui.hide();
      active = null;
      return;
    }
    pruneDetached();
    const { element } = resolved;
    const isNew = !sessions.has(element);
    const session = sessionFor(resolved);
    if (!session) {
      report("info", `skip ${describe(element)}: could not create a host`);
      return;
    }
    if (isNew) report("info", `attach ${resolved.provider.kind} ${describe(element)}`);
    if (active && active !== session) active.ui.hide();
    const returning =
      active === session ||
      returningFromPrompt === session ||
      isOwnUi(relatedTarget) ||
      (relatedTarget === null && lastActive === session);
    scrollMode.exit();
    active = session;
    lastActive = session;
    returningFromPrompt = null;
    if (!returning) resetMode(session);
    session.ui.show();
  }

  function onFocusIn(event: FocusEvent): void {
    guarded(active, () => activate(event.target, event.relatedTarget));
  }

  /**
   * Escape in idle normal mode still reaches bb (cancelling a message edit,
   * say). Afterwards a text box on a thread page is left for scroll mode.
   */
  function leaveTextBox(session: Session): void {
    const { element } = session;
    setTimeout(() => {
      if (!element.isConnected || !threadViewport(element)) return;
      if (document.activeElement === element) element.blur();
      if (document.activeElement && document.activeElement !== document.body) return;
      scrollMode.enter(element);
    }, 0);
  }

  /**
   * Focus leaving a thread page's text box for anything vim doesn't attach to
   * enters scroll mode, paused until focus is back on the page. Popups like
   * the project picker drop focus on the page when they close, and without
   * scroll mode nothing there would answer `i`.
   */
  function enterScrollModeAfterLeaving(element: HTMLElement): void {
    setTimeout(() => {
      if (active || !element.isConnected || !threadViewport(element)) return;
      // The window lost focus; it comes back to this text box.
      if (document.activeElement === element) return;
      scrollMode.enter(element);
    }, 0);
  }

  /** Focuses the text box scroll mode was entered from, or else the page's prompt box, in insert mode. */
  function returnToTextBox(viewport: HTMLElement): void {
    const last = lastActive?.element;
    const target =
      last?.isConnected && threadViewport(last) === viewport
        ? last
        : viewport.querySelector<HTMLElement>(`${PROMPTBOX} [contenteditable="true"]`);
    if (!target) return;
    target.focus();
    const session = active;
    if (!session || session.element !== target) return;
    guarded(session, () => {
      const vim = vimState(session.cm);
      if (vim && !vim.insertMode) {
        session.cm.sync();
        if (vim.visualMode) Vim.exitVisualMode(session.cm as never, false);
        Vim.handleKey(session.cm as never, "i", "mapping");
      }
      session.ui.schedule();
    });
  }

  function onFocusOut(event: FocusEvent): void {
    if (!active) return;
    if (isOwnUi(event.relatedTarget)) {
      if (event.target === active.element) returningFromPrompt = active;
      return;
    }
    if (isOwnUi(event.target)) return;
    if (event.target === active.element) {
      const { element } = active;
      active.ui.hide();
      active = null;
      enterScrollModeAfterLeaving(element);
    }
  }

  /** Where a key goes: vim, bb, or bb and then out of the text box. */
  function route(event: KeyboardEvent, session: Session): "vim" | "app" | "leave" {
    const vim = vimState(session.cm);
    if (!vim || event.metaKey) return "app";
    const promptbox = session.element.closest(PROMPTBOX);
    const popupOpen = !!promptbox?.querySelector(PROMPTBOX_TYPEAHEAD_MENU) || !!session.host.completionOpen?.();
    if (popupOpen && POPUP_KEYS.has(event.key)) return "app";
    if (event.key === "Escape" && promptbox?.hasAttribute(PROMPTBOX_VOICE_ACTIVE_ATTRIBUTE)) return "app";
    // Ctrl+O / Ctrl+I are bb's back and forward (vim's jump list at app scope),
    // so they leave the text box whenever no vim command is half typed.
    if (isAppHistoryKey(event) && !vim.visualMode && hasNoPendingInput(vim)) return "app";
    // With nothing pending, Enter keeps its app meaning (send) instead of
    // vim's cursor-down, and Escape leaves the text box.
    const plainKey = !event.shiftKey && !event.ctrlKey && !event.altKey;
    if (!plainKey || !isIdleNormalMode(vim)) return "vim";
    if (event.key === "Enter") return "app";
    return event.key === "Escape" ? "leave" : "vim";
  }

  function onKeyDown(event: KeyboardEvent): void {
    lastKey = event.key;
    if (!getOptions().enabled) {
      active?.ui.hide();
      active = null;
      scrollMode.exit();
      return;
    }
    if (scrollMode.isActive && !isEditable(event.target) && scrollMode.handleKey(event)) return;
    // Focus events can be missed (for example when the window regains focus
    // in Electron), so a key in an unattached text box attaches it.
    if (!active || event.target !== active.element) {
      guarded(active, () => activate(event.target, null));
    }
    const session = active;
    if (!session || event.target !== session.element) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (!session.host.isEditable()) return;
    guarded(session, () => {
      session.cm.sync();
      const destination = route(event, session);
      if (destination === "leave") leaveTextBox(session);
      if (destination !== "vim") return;
      // Like vim, a message stays up only until the next command.
      if (!session.cm.state.dialog?.querySelector("input")) session.cm.state.currentNotificationClose?.();
      if (handleVimKey(session.cm, event)) event.stopImmediatePropagation();
      session.ui.schedule();
    });
  }

  // Normal mode must not insert text that arrives without a usable keydown
  // (dead keys, dictation). A dead-key character is fed to vim instead.
  function onBeforeInput(event: InputEvent): void {
    const session = active;
    if (!session || event.target !== session.element || session.cm.isApplying) return;
    const vim = vimState(session.cm);
    if (!vim || vim.insertMode) return;
    if (event.inputType !== "insertText" && event.inputType !== "insertCompositionText") return;
    event.preventDefault();
    if (event.data && [...event.data].length === 1 && (lastKey === "Dead" || lastKey === "Process")) {
      guarded(session, () => {
        Vim.handleKey(session.cm as never, event.data!, "user");
        session.ui.schedule();
      });
    }
  }

  const reposition = () => active?.ui.schedule();

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  window.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("beforeinput", onBeforeInput, true);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);

  guarded(null, () => activate(document.activeElement, null));

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("beforeinput", onBeforeInput, true);
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    scrollMode.dispose();
    for (const session of [...sessions.values()]) dispose(session);
  };
}
