export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

/** The bucket that keeps the strip between about 24 and 30 columns for the range, or for all time by the span of the log. */
export function bucketWidth(rangeMs: number | null, firstAt: number | null, now: number): number {
  const span = rangeMs ?? (firstAt === null ? DAY : now - firstAt);
  if (span <= DAY) return HOUR;
  if (span <= 14 * DAY) return 6 * HOUR;
  if (span <= 120 * DAY) return DAY;
  return WEEK;
}

/**
 * Shifts bucket boundaries from UTC to the client's local midnight, and for week buckets to Monday (the epoch
 * fell on a Thursday).
 */
export function bucketOffset(bucketMs: number, now: number): number {
  return -new Date(now).getTimezoneOffset() * 60_000 + (bucketMs === WEEK ? 3 * DAY : 0);
}

export function bucketStart(at: number, bucketMs: number, offsetMs: number): number {
  return Math.floor((at + offsetMs) / bucketMs) * bucketMs - offsetMs;
}

/** Every bucket start from the one holding `sinceMs` to the one holding `now`, inclusive. */
export function bucketStarts(sinceMs: number, now: number, bucketMs: number, offsetMs: number): number[] {
  const starts: number[] = [];
  const last = bucketStart(now, bucketMs, offsetMs);
  for (let start = bucketStart(sinceMs, bucketMs, offsetMs); start <= last; start += bucketMs) starts.push(start);
  return starts;
}

const weekday = (at: number) => new Date(at).toLocaleDateString(undefined, { weekday: "short" });
const monthDay = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** What a bucket is called in a sentence: "Wed 11:00", "Oct 22", or the week of "Oct 20". */
export function bucketLabel(start: number, bucketMs: number): string {
  if (bucketMs < DAY) return `${weekday(start)} ${clock(start)}`;
  if (bucketMs === DAY) return monthDay(start);
  return `the week of ${monthDay(start)}`;
}

/** The bucket as a span, for a pin chip or a column's accessible name: "Wed, Oct 22, 11:00 to 12:00". */
export function bucketSpanLabel(start: number, bucketMs: number): string {
  const end = start + bucketMs;
  if (bucketMs < DAY) return `${weekday(start)}, ${monthDay(start)}, ${clock(start)} to ${clock(end)}`;
  if (bucketMs === DAY) return `${weekday(start)}, ${monthDay(start)}`;
  return `${monthDay(start)} to ${monthDay(end - DAY)}`;
}

/** The unit a bucket spans, for "the busiest hour". */
export function bucketUnit(bucketMs: number): string {
  if (bucketMs === HOUR) return "hour";
  if (bucketMs < DAY) return "six hours";
  if (bucketMs === DAY) return "day";
  return "week";
}

/**
 * An axis label for each column or null: the weekday at each local midnight under sub-day buckets, otherwise
 * every k-th date so at most eight labels show.
 */
export function axisLabels(starts: readonly number[], bucketMs: number, offsetMs: number): (string | null)[] {
  if (bucketMs < DAY) return starts.map((start) => ((start + offsetMs) % DAY === 0 ? weekday(start) : null));
  const step = Math.max(1, Math.ceil(starts.length / 8));
  return starts.map((start, index) => (index % step === 0 ? monthDay(start) : null));
}
