// Read-only queries over the index: backlinks and full-text search.
import type { Backlinks, FileEntry, SearchResults } from "../contract.ts";
import type { LinkResolver, ParsedLink } from "../shared/obsidian.ts";

const MAX_MATCHES_PER_FILE = 5;
const MAX_LINE_LENGTH = 300;
/** Ranks every file-name match above any number of content hits. */
const NAME_MATCH_SCORE = 1000;

type LineMatch = { line: number; text: string };

interface IndexedNote {
  content: string;
  links: readonly ParsedLink[];
}

function lineExcerpt(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MAX_LINE_LENGTH ? `${trimmed.slice(0, MAX_LINE_LENGTH)}…` : trimmed;
}

/** Notes linking to `path`, with up to five of the linking lines each, sorted by path. */
export function findBacklinks(notes: ReadonlyMap<string, IndexedNote>, resolver: LinkResolver, path: string): Backlinks {
  const backlinks: Backlinks["backlinks"] = [];
  for (const [notePath, note] of notes) {
    if (notePath === path) continue;
    const lines = new Set<number>();
    for (const link of note.links) {
      if (link.target !== "" && resolver.resolve(link.target, notePath, link.kind) === path) {
        lines.add(link.line);
      }
    }
    if (lines.size === 0) continue;
    const text = note.content.split("\n");
    backlinks.push({
      path: notePath,
      matches: [...lines].slice(0, MAX_MATCHES_PER_FILE).map((line) => ({ line, text: lineExcerpt(text[line] ?? "") })),
    });
  }
  backlinks.sort((a, b) => a.path.localeCompare(b.path));
  return { backlinks };
}

/**
 * Case-insensitive search where every whitespace-separated term must appear in
 * the path or the note. Path matches rank first, then notes with more matching lines.
 */
export function searchVault(
  files: Iterable<FileEntry>,
  notes: ReadonlyMap<string, IndexedNote>,
  query: string,
  limit: number,
): SearchResults {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: { path: string; nameMatch: boolean; matches: LineMatch[]; score: number }[] = [];
  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const nameMatch = terms.every((term) => lowerPath.includes(term));
    const note = notes.get(file.path);
    const lowerContent = note?.content.toLowerCase() ?? "";
    const contentMatch = note !== undefined && terms.every((term) => lowerContent.includes(term) || lowerPath.includes(term));
    if (!nameMatch && !contentMatch) continue;
    const matches: LineMatch[] = [];
    let hits = 0;
    if (note !== undefined) {
      note.content.split("\n").forEach((line, lineNumber) => {
        const lower = line.toLowerCase();
        if (!terms.some((term) => lower.includes(term))) return;
        hits += 1;
        if (matches.length < MAX_MATCHES_PER_FILE) matches.push({ line: lineNumber, text: lineExcerpt(line) });
      });
    }
    results.push({ path: file.path, nameMatch, matches, score: (nameMatch ? NAME_MATCH_SCORE : 0) + hits });
  }
  results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return {
    results: results.slice(0, limit).map(({ score: _score, ...result }) => result),
    truncated: results.length > limit,
  };
}
