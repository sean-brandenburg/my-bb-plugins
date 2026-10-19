import { useEffect } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { isTextEntry, overlayOver, scrollKeepingCursor, scrollParent, spatialStep, useKeyHandler } from "bb-vim-keys/react";
import { CARD_KEYMAP } from "./board-nav";
import { BLOCKED_BY, stepOpenMenu } from "./board-keys";

const STOPS =
  'a[href], button:not(:disabled), input:not(:disabled):not([readonly]):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled):not([readonly]), [contenteditable="true"]';
/** The text box the cursor rests on while focus stays on the card, so keys still move. */
const PARKED = "data-kanban-cursor";
/** Where the cursor starts when a card opens, if the card has it; otherwise the first stop. */
const INITIAL_STOP = "[data-kanban-initial-stop]";
/** The card's main text box, which `i` goes to when the cursor is on no text box. */
const MAIN_INPUT = "[data-kanban-main-input]";
const FOCUS_REQUEST_TTL_MS = 2000;

// A card opened from the keyboard, or while another card is showing, takes focus once it renders;
// one opened with the mouse onto an empty panel leaves focus where it is. The panel may already
// show the card, so a request also reaches mounted cards.
let focusRequest: { ticketId: string; at: number } | null = null;
const focusListeners = new Set<() => void>();

export function requestCardFocus(ticketId: string): void {
  focusRequest = { ticketId, at: Date.now() };
  for (const listener of focusListeners) listener();
}

function takeFocusRequest(ticketId: string): boolean {
  if (focusRequest === null || focusRequest.ticketId !== ticketId || Date.now() - focusRequest.at > FOCUS_REQUEST_TTL_MS) return false;
  focusRequest = null;
  return true;
}

const CARD = "[data-kanban-card]";

/** Whether an open card is on screen, in the right panel or a dialog. */
export function cardShown(): boolean {
  return Array.from(document.querySelectorAll(CARD)).some((card) => card.getClientRects().length > 0);
}

/** Puts the keyboard back on the board, on this card if the board shows it. */
export function focusBoard(ticketId: string): void {
  const board = document.querySelector<HTMLElement>("[data-kanban-board]");
  const card = board?.querySelector<HTMLElement>(`[data-ticket-id="${CSS.escape(ticketId)}"]`);
  (card ?? board)?.focus({ preventScroll: true });
  card?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export interface CardKeyHandlers {
  onThread: () => void;
  onDiff: () => void;
  onMonitor: () => void;
  onHelp: () => void;
  /** Back to the board with the card left open; absent where the card is a modal. */
  onBack?: () => void;
  /** Escape outside a text box; absent where the card is a modal, whose own Escape closes it. */
  onEscape?: () => void;
}

/**
 * Vim-style keys inside an open card. Buttons and links take real focus as the cursor reaches
 * them, so Enter and Space press them; a text box only gets a highlight until `i` or Enter starts
 * typing in it, and Escape leaves it again. Spread the returned props on the card's root.
 */
export function useCardKeys(
  rootRef: RefObject<HTMLElement | null>,
  ticketId: string,
  focusOnMount: boolean,
  handlers: CardKeyHandlers,
): {
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => boolean;
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  /** Leaves a text box for the keys with the cursor still on it, as Escape does. */
  leave: (field: HTMLElement) => void;
} {
  const stops = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(STOPS)).filter((stop) => stop.getClientRects().length > 0);
  const parked = (root: HTMLElement) => root.querySelector<HTMLElement>(`[${PARKED}]`);
  const unpark = (root: HTMLElement) => parked(root)?.removeAttribute(PARKED);
  const land = (root: HTMLElement, stop: HTMLElement) => {
    unpark(root);
    if (isTextEntry(stop)) {
      stop.setAttribute(PARKED, "");
      root.focus({ preventScroll: true });
    } else {
      stop.focus({ preventScroll: true });
    }
    stop.scrollIntoView({ block: "nearest" });
  };
  const type = (root: HTMLElement, field: HTMLElement) => {
    unpark(root);
    field.focus();
    if (field instanceof HTMLSelectElement) {
      try {
        field.showPicker();
      } catch {
        // Focused is enough: the arrows change a select's value.
      }
    } else if (field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && field.type === "text")) {
      field.setSelectionRange(field.value.length, field.value.length);
    }
  };

  useEffect(() => {
    const focusFirst = () => {
      const root = rootRef.current;
      if (root === null) return;
      const list = stops(root);
      const first = list.find((stop) => stop.matches(INITIAL_STOP)) ?? list[0];
      if (first !== undefined) land(root, first);
      else root.focus({ preventScroll: true });
    };
    if (takeFocusRequest(ticketId) || focusOnMount) focusFirst();
    const onRequest = () => {
      if (takeFocusRequest(ticketId)) focusFirst();
    };
    focusListeners.add(onRequest);
    return () => {
      focusListeners.delete(onRequest);
    };
  }, [ticketId]);

  const onKeyDown = useKeyHandler({
    keymap: CARD_KEYMAP,
    // Portaled popovers (the tag picker) bubble here through React but handle their own keys.
    accepts: (target) => target !== null && rootRef.current?.contains(target) === true,
    blocked: () => rootRef.current === null || overlayOver(rootRef.current, BLOCKED_BY),
    intercept: stepOpenMenu,
    get self() {
      return rootRef.current ?? undefined;
    },
    onTextEscape: (field) => {
      if (rootRef.current === null) return false;
      land(rootRef.current, field);
    },
    onCommand: (command, { target }) => {
      const root = rootRef.current!;
      const list = stops(root);
      const current = target === root ? parked(root) : (list.find((stop) => stop === target || stop.contains(target)) ?? null);
      const index = current === null ? -1 : list.indexOf(current);
      const go = (next: number) => {
        const stop = list[next];
        if (stop !== undefined) land(root, stop);
      };
      switch (command.kind) {
        case "step": {
          const next = spatialStep(list.map((stop) => stop.getBoundingClientRect()), index, command.direction);
          if (next !== null) go(next);
          else if (command.direction === "left") {
            if (handlers.onBack === undefined) return false;
            unpark(root);
            handlers.onBack();
          }
          return;
        }
        case "first":
          go(0);
          return;
        case "last":
          go(list.length - 1);
          return;
        case "scroll": {
          const scroller = scrollParent(root) ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
          // Like vim, the cursor stays put unless the scroll took it out of view.
          const next = scrollKeepingCursor(scroller, list, current, command.direction);
          if (next !== null && next !== current) land(root, next);
          return;
        }
        case "press":
          // A focused button or checkbox presses itself.
          if (target !== root || current === null) return false;
          type(root, current);
          return;
        case "type": {
          const field = (current !== null && isTextEntry(current) ? current : null) ?? root.querySelector<HTMLElement>(MAIN_INPUT);
          if (field === null) return false;
          type(root, field);
          return;
        }
        case "thread":
          handlers.onThread();
          return;
        case "diff":
          handlers.onDiff();
          return;
        case "monitor":
          handlers.onMonitor();
          return;
        case "help":
          handlers.onHelp();
          return;
        case "close":
          if (handlers.onEscape === undefined) return false;
          handlers.onEscape();
          return;
      }
    },
  });

  // A click or a returning popover moves the real cursor; the parked one would be a second.
  const onFocus = (event: ReactFocusEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (root !== null && event.target !== root && root.contains(event.target)) unpark(root);
  };

  const leave = (field: HTMLElement) => {
    const root = rootRef.current;
    if (root !== null) land(root, field);
  };

  return { onKeyDown, onFocus, leave };
}
