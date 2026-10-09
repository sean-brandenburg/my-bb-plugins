import { useState } from "react";

/**
 * True once `value` has differed from what it was on the first render. Lets
 * an indicator animate when it changes in view without every instance
 * animating as its list mounts.
 */
export function useChangedSinceMount<T>(value: T): boolean {
  const [initial] = useState(value);
  const [changed, setChanged] = useState(false);
  const differs = !Object.is(value, initial);
  if (differs && !changed) setChanged(true);
  return changed || differs;
}
