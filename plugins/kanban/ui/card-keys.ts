import { useEffect, useRef } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { spatialStep, type Direction } from "./board-nav";

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
const STOPS =
  'a[href], button:not(:disabled), input:not(:disabled):not([readonly]):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled):not([readonly]), [contenteditable="true"]';
/** The text box the cursor rests on while focus stays on the card, so keys still move. */
const PARKED = "data-kanban-cursor";
/** Where the cursor starts when a card opens, if the card has it; otherwise the first stop. */
const INITIAL_STOP = "[data-kanban-initial-stop]";
/** The card's main text box, which `i` goes to when the cursor is on no text box. */
const MAIN_INPUT = "[data-kanban-main-input]";
const PREFIX_TIMEOUT_MS = 500;
const FOCUS_REQUEST_TTL_MS = 2000;

/** Whether keys typed at `element` are text, so j or Escape mean something there. */
export function isTextEntry(element: Element | null): boolean {
  if (element === null) return false;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type);
  return element.closest('textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

// A card opened from the keyboard takes focus once it renders; one opened with the mouse leaves
// focus where it is. The panel may already show the card, so a request also reaches mounted cards.
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

/** Puts the keyboard back on the board, on this card if the board shows it. */
export function focusBoard(ticketId: string): void {
  const board = document.querySelector<HTMLElement>("[data-kanban-board]");
  const card = board?.querySelector<HTMLElement>(`[data-ticket-id="${CSS.escape(ticketId)}"]`);
  (card ?? board)?.focus({ preventScroll: true });
  card?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export interface CardKeyHandlers {
  onThread: () => void;
  onDiff: () => void;
  onHelp: () => void;
  /** Back to the board with the card left open; absent where the card is a modal. */
  onBack?: () => void;
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
): { onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void; onFocus: (event: ReactFocusEvent<HTMLElement>) => void } {
  const pendingG = useRef(0);

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

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const root = rootRef.current;
    const target = event.target as HTMLElement;
    // Portaled popovers (the tag picker) bubble here through React but handle their own keys.
    if (root === null || !root.contains(target)) return;
    if (event.defaultPrevented || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
    if (isTextEntry(target)) {
      // With vim-mode, this is the second Escape: the first only entered vim's normal mode.
      if (event.key !== "Escape" || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      land(root, target);
      return;
    }
    const list = stops(root);
    const current = target === root ? parked(root) : (list.find((stop) => stop === target || stop.contains(target)) ?? null);
    const index = current === null ? -1 : list.indexOf(current);
    const boxes = () => list.map((stop) => stop.getBoundingClientRect());
    const step = (direction: Direction) => {
      const next = spatialStep(boxes(), index, direction);
      if (next !== null) go(next);
    };
    const go = (next: number) => {
      const stop = list[next];
      if (stop !== undefined) land(root, stop);
    };
    if (event.ctrlKey) {
      if (event.shiftKey || (event.key !== "d" && event.key !== "u")) return;
      event.preventDefault();
      const scroller = scrollParent(root);
      const direction = event.key === "d" ? 1 : -1;
      scroller.scrollBy({ top: (direction * scroller.clientHeight) / 2, behavior: "instant" });
      // Like vim, the cursor stays put unless the scroll took it out of view.
      const view = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      const inView = list.filter((stop) => {
        const rect = stop.getBoundingClientRect();
        return rect.top >= view.top && rect.bottom <= view.bottom;
      });
      if (current !== null && inView.includes(current)) return;
      const next = direction === 1 ? inView[0] : inView[inView.length - 1];
      if (next !== undefined) land(root, next);
      return;
    }
    if (event.key === "g") {
      event.preventDefault();
      if (event.timeStamp - pendingG.current > PREFIX_TIMEOUT_MS) {
        pendingG.current = event.timeStamp;
        return;
      }
      pendingG.current = 0;
      go(0);
      return;
    }
    pendingG.current = 0;
    switch (event.key) {
      case "j":
      case "ArrowDown":
        step("down");
        break;
      case "k":
      case "ArrowUp":
        step("up");
        break;
      case "l":
      case "ArrowRight":
        step("right");
        break;
      case "G":
        go(list.length - 1);
        break;
      case "Enter":
      case " ":
        // A focused button or checkbox presses itself.
        if (target !== root) return;
        if (current === null) return;
        type(root, current);
        break;
      case "i": {
        const field = (current !== null && isTextEntry(current) ? current : null) ?? root.querySelector<HTMLElement>(MAIN_INPUT);
        if (field === null) return;
        type(root, field);
        break;
      }
      case "h":
      case "ArrowLeft": {
        const next = spatialStep(boxes(), index, "left");
        if (next !== null) go(next);
        else if (handlers.onBack !== undefined) {
          unpark(root);
          handlers.onBack();
        } else return;
        break;
      }
      case "t":
        handlers.onThread();
        break;
      case "d":
        handlers.onDiff();
        break;
      case "?":
        handlers.onHelp();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // A click or a returning popover moves the real cursor; the parked one would be a second.
  const onFocus = (event: ReactFocusEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (root !== null && event.target !== root && root.contains(event.target)) unpark(root);
  };

  return { onKeyDown, onFocus };
}
