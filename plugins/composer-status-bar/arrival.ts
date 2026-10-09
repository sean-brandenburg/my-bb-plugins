/**
 * How a segment's current value got there: with the segment itself, or as a
 * change that went up (more tokens, an escalated limit, any unranked swap) or
 * down.
 */
export type Arrival = "enter" | "up" | "down";

export interface Shown {
  key: string;
  rank: number;
  arrival: Arrival;
}

/**
 * The next value's arrival. Only a new key counts as a change, so re-renders
 * with the same value keep their arrival and don't restart its animation.
 */
export function arrive(previous: Shown | null, key: string, rank: number): Shown {
  if (previous === null) return { key, rank, arrival: "enter" };
  if (previous.key === key) return previous;
  return { key, rank, arrival: rank < previous.rank ? "down" : "up" };
}
