import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { cx, enter, exit, speed, stagger, STAGGER, usePresence } from "bb-motion";

const SettledContext = createContext<RefObject<boolean>>({ current: true });

/**
 * Elements rendered in this subtree's first commit ride whatever entrance the
 * subtree itself plays; ones that mount later (an added row, an opened
 * section) play their own. Without this, nested entrances stack and things
 * deep in a freshly shown form travel twice as far.
 */
export function EntranceScope({ children }: { children: ReactNode }) {
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);
  return <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>;
}

/** True when this component mounted after its scope's first commit, i.e. in response to the user. */
export function useLateMount(): boolean {
  const settled = useContext(SettledContext);
  const [late] = useState(() => settled.current);
  return late;
}

const LATE_ENTRANCE = cx(enter.rise, speed.fast);

/** A block that rises in when it appears in response to the user, but not with its surroundings. */
export function Appear({ className, children }: { className?: string; children: ReactNode }) {
  const late = useLateMount();
  return (
    <div className={cx(className, late && LATE_ENTRANCE)}>
      <EntranceScope>{children}</EntranceScope>
    </div>
  );
}

/**
 * Stable keys for a list stored as bare values. Index keys would make removing
 * item 2 unmount the last row instead, so its exit would play on the wrong one.
 * Call `forget(index)` just before removing that item from the data.
 */
export function useListKeys(length: number): { keys: readonly number[]; forget: (index: number) => void } {
  const next = useRef(0);
  const keys = useRef<number[]>([]);
  while (keys.current.length < length) keys.current.push(next.current++);
  keys.current.length = length;
  return {
    keys: keys.current,
    forget: (index) => {
      keys.current.splice(index, 1);
    },
  };
}

/**
 * A removable list item: rises in when added, and on removal plays its exit
 * before `onRemove` drops it from the data. `cascadeIndex` makes items present
 * when the list first shows cascade in.
 */
export function PresenceItem({
  className,
  cascadeIndex,
  onRemove,
  children,
}: {
  className?: string;
  cascadeIndex?: number;
  onRemove: () => void;
  children: (remove: () => void) => ReactNode;
}) {
  const late = useLateMount();
  const [removing, setRemoving] = useState(false);
  const presence = usePresence(!removing);
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;
  useEffect(() => {
    if (!presence.mounted) removeRef.current();
  }, [presence.mounted]);
  const cascades = !late && cascadeIndex !== undefined;
  return (
    <div
      className={cx(className, presence.exiting ? exit.sink : late ? LATE_ENTRANCE : cascades && cx(enter.rise, STAGGER))}
      style={cascades ? stagger(cascadeIndex) : undefined}
      onAnimationEnd={presence.onAnimationEnd}
    >
      <EntranceScope>{children(() => setRemoving(true))}</EntranceScope>
    </div>
  );
}

/** True for a moment after `trigger()`, for confirmations like a copy checkmark. */
export function useFlag(durationMs: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const trigger = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), durationMs);
  };
  return [on, trigger];
}
