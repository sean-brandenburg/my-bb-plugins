import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cx, EntranceScope, enter, exit, speed, stagger, STAGGER, useLateMount, usePresence } from "bb-motion";

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
