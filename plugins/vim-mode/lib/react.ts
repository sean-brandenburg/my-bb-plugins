import { type RefObject, useEffect, useRef } from "react";
import { bindKeyScope, type KeyScopeOptions } from "./scope.ts";

export * from "./index.ts";
export { KeyHelp, Kbd, useFocusReturn } from "./help.tsx";

/**
 * `bindKeyScope` for as long as `enabled` holds and the root is mounted. Callbacks may change on
 * every render; the rest of the options rebind the scope when they change, so keep the keymap
 * stable (a module constant).
 */
export function useKeyScope<C>(root: HTMLElement | null | RefObject<HTMLElement | null>, enabled: boolean, options: KeyScopeOptions<C>): void {
  const latest = useRef(options);
  latest.current = options;
  const { keymap, group, primary, alsoWithin, blockedBy, counts, timeoutMs, capture, takeFocus } = options;
  const hasTextEscape = options.onTextEscape !== undefined;
  const hasIntercept = options.intercept !== undefined;
  useEffect(() => {
    const node = root !== null && "current" in root ? root.current : root;
    if (!enabled || node === null) return;
    return bindKeyScope(node, {
      keymap,
      group,
      primary,
      alsoWithin,
      blockedBy,
      counts,
      timeoutMs,
      capture,
      takeFocus,
      onCommand: (command, context) => latest.current.onCommand(command, context),
      onTextEscape: hasTextEscape ? (field, event) => latest.current.onTextEscape?.(field, event) : undefined,
      intercept: hasIntercept ? (event, token) => latest.current.intercept?.(event, token) === true : undefined,
      onPending: (keys) => latest.current.onPending?.(keys),
    });
  }, [enabled, root, keymap, group, primary, alsoWithin, blockedBy, counts, timeoutMs, capture, takeFocus, hasTextEscape, hasIntercept]);
}
