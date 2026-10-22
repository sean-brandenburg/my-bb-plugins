const UNITS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 };

/** `--since 7d`, `30d`, `12h`, `90m`, `2w`, or `all`; null means all time. */
export function parseSince(text: string | undefined, now: number): number | null | undefined {
  if (text === undefined || text === "all") return null;
  const match = /^(\d+)([mhdw])$/u.exec(text.trim());
  if (match === null) return undefined;
  return now - Number(match[1]) * UNITS[match[2]!]!;
}
