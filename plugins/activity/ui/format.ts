const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "4d ago", else the date. */
export function formatAgo(at: number, now: number): string {
  const gap = Math.max(0, now - at);
  if (gap < MINUTE) return "just now";
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)}m ago`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)}h ago`;
  if (gap < 14 * DAY) return `${Math.floor(gap / DAY)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

export function pluginName(plugin: string | null): string {
  return plugin ?? "bb";
}
