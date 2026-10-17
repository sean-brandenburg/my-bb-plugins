const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A span as its largest unit or two: `45s`, `12m`, `2h 10m`, `3d`. */
export function formatSpan(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MINUTE) return `${Math.floor(span / 1000)}s`;
  if (span < HOUR) return `${Math.floor(span / MINUTE)}m`;
  if (span < DAY) {
    const hours = Math.floor(span / HOUR);
    const minutes = Math.floor((span % HOUR) / MINUTE);
    return minutes === 0 || hours >= 10 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  return `${Math.floor(span / DAY)}d`;
}

export function formatAgo(at: number, now: number): string {
  return now - at < MINUTE ? "just now" : `${formatSpan(now - at)} ago`;
}

/** Strips bb's `bb/` prefix and the `-thr_…` suffix it appends to a worktree branch. */
export function shortBranch(branch: string): string {
  return branch.replace(/^bb\//, "").replace(/-thr_[a-z0-9]+$/, "");
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
