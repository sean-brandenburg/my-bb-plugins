import { useCallback, useState, type AnimationEvent } from "react";

/**
 * Replays a one-shot animation class (such as bb-motion's NUDGE) on an element
 * without remounting it, so it keeps focus and its value.
 */
export function useReplayAnimation(animationClass: string) {
  const [playing, setPlaying] = useState(false);
  const play = useCallback(() => setPlaying(true), []);
  const onAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.target === event.currentTarget) setPlaying(false);
  }, []);
  return { className: playing ? animationClass : undefined, play, onAnimationEnd };
}
