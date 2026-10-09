/** Trimmed text, with runs of blank lines collapsed, cut to `limit` characters. */
export function excerpt(text: string, limit: number): string {
  const trimmed = text.trim().replace(/\n{3,}/g, "\n\n");
  return trimmed.length > limit ? `${trimmed.slice(0, limit).trimEnd()}…` : trimmed;
}
