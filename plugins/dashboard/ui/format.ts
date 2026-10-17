import { type Tokens, totalTokens } from "../usage-model.js";

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

/** `950`, `12k`, `4.2M`, `1.1B`: two significant digits below ten of a unit, whole units above. */
export function formatTokens(tokens: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [size, suffix] of units) {
    if (tokens >= size) {
      const value = tokens / size;
      return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}${suffix}`;
    }
  }
  return String(Math.round(tokens));
}

/** A token total and what it is made of. */
export function describeTokens(tokens: Tokens): string {
  const parts: [number, string][] = [
    [tokens.output, "output"],
    [tokens.cacheWrite, "cache write"],
    [tokens.cacheRead, "cache read"],
    [tokens.input, "input"],
  ];
  return [`${formatTokens(totalTokens(tokens))} tokens`, ...parts.filter(([value]) => value > 0).map(([value, label]) => `${formatTokens(value)} ${label}`)].join(" · ");
}

export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** `YYYY-MM-DD` as a short local date: `Thu, Oct 15`. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
