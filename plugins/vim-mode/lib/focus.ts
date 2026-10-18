import { isShown } from "./targets.ts";

/**
 * Focuses what `find` returns once it is on screen, trying every frame for up to `timeoutMs`:
 * for focus that has to wait for a mount (a panel opening, a list loading, a row a re-render
 * replaced). Returns the function that stops trying.
 */
export function focusWhenShown(find: () => HTMLElement | null, options: { timeoutMs?: number; focus?: (element: HTMLElement) => void; view?: Window } = {}): () => void {
  const view = options.view ?? window;
  const deadline = view.performance.now() + (options.timeoutMs ?? 2000);
  let frame = 0;
  const attempt = () => {
    const element = find();
    if (isShown(element)) {
      if (options.focus !== undefined) options.focus(element);
      else element.focus({ preventScroll: true });
      return;
    }
    if (view.performance.now() < deadline) frame = view.requestAnimationFrame(attempt);
  };
  attempt();
  return () => view.cancelAnimationFrame(frame);
}
