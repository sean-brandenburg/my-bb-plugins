// Suggested changes: GitHub's ```suggestion blocks in comment bodies, the lines they replace, and applying them to a
// file's text. Pure, shared by the view and every host's server.
import type { LineRange, SuggestionItem } from "./types";

/** A comment body cut into Markdown and the suggestion blocks between it. */
export type CommentBodyPart = { kind: "markdown"; text: string } | { kind: "suggestion"; lines: string[] };

const OPENING = /^ {0,3}(`{3,}|~{3,})[ \t]*suggestion[ \t]*$/u;

/** The body's suggestion blocks in order, with the Markdown around them. A block left open runs to the end, as on GitHub. */
export function parseCommentBody(body: string): CommentBodyPart[] {
  const parts: CommentBodyPart[] = [];
  let markdown: string[] = [];
  let block: { fence: string; lines: string[] } | null = null;
  const flushMarkdown = () => {
    const text = markdown.join("\n");
    if (text.trim() !== "") parts.push({ kind: "markdown", text });
    markdown = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (block !== null) {
      const closing = line.trim();
      if (closing.length >= block.fence.length && closing === block.fence[0]!.repeat(closing.length)) {
        parts.push({ kind: "suggestion", lines: block.lines });
        block = null;
      } else block.lines.push(line);
      continue;
    }
    const opening = OPENING.exec(line);
    if (opening !== null) {
      flushMarkdown();
      block = { fence: opening[1]!, lines: [] };
    } else markdown.push(line);
  }
  if (block !== null) parts.push({ kind: "suggestion", lines: block.lines });
  else flushMarkdown();
  return parts;
}

/** Every suggestion block's lines; the first is the one that applies. */
export function suggestionBlocks(body: string): string[][] {
  return parseCommentBody(body).flatMap((part) => (part.kind === "suggestion" ? [part.lines] : []));
}

/** A suggestion block replacing the lines with `lines`; the fence outgrows any backtick run inside them. */
export function suggestionBlock(lines: readonly string[]): string {
  const longest = Math.max(2, ...lines.map((line) => Math.max(0, ...(line.match(/`+/gu) ?? []).map((run) => run.length))));
  const fence = "`".repeat(longest + 1);
  return [`${fence}suggestion`, ...lines, fence].join("\n");
}

/** Where the caret goes in a body that is just `suggestionBlock(lines)`: the end of its last line. */
export function suggestionCaret(block: string): number {
  return block.lastIndexOf("\n");
}

/** The new-side lines a comment range covers, when it sits on the new side only; null for the old side or a whole file. */
export function suggestionLines(range: LineRange): { startLine: number; endLine: number } | null {
  if (range.line === null || range.side !== "RIGHT") return null;
  if (range.startLine === null) return { startLine: range.line, endLine: range.line };
  if ((range.startSide ?? range.side) !== "RIGHT") return null;
  return { startLine: Math.min(range.startLine, range.line), endLine: Math.max(range.startLine, range.line) };
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;

/** Every new-side line a unified patch shows (added and context), by line number. */
export function newSideLineMap(patch: string): Map<number, string> {
  const found = new Map<number, string>();
  let next: number | null = null;
  for (const text of patch.split("\n")) {
    const header = HUNK_HEADER.exec(text);
    if (header !== null) {
      next = Number(header[1]);
      continue;
    }
    if (next === null || text.startsWith("\\") || text.startsWith("-")) continue;
    if (text.startsWith("+") || text.startsWith(" ") || text === "") {
      const line = text.slice(1);
      found.set(next, line.endsWith("\r") ? line.slice(0, -1) : line);
      next += 1;
    }
  }
  return found;
}

/** Lines `start`–`end` of a `newSideLineMap`; null when any is missing. */
export function linesFromMap(map: ReadonlyMap<number, string>, start: number, end: number): string[] | null {
  const lines: string[] = [];
  for (let line = start; line <= end; line++) {
    const text = map.get(line);
    if (text === undefined) return null;
    lines.push(text);
  }
  return lines;
}

/** New-side lines `start`–`end` as a unified patch shows them; null when the patch leaves any of them out. */
export function newSideLines(patch: string, start: number, end: number): string[] | null {
  return linesFromMap(newSideLineMap(patch), start, end);
}

/** Whether lines already read as the suggestion would leave them: the replacement, starting at the range's first line. */
export function alreadyApplied(current: readonly string[] | null, replacement: readonly string[]): boolean {
  return current !== null && current.length >= replacement.length && replacement.every((line, index) => current[index] === line);
}

/** Why the server refused a batch: the items whose lines moved or overlap, by path and lines. */
export class SuggestionConflictError extends Error {}

function label(item: Pick<SuggestionItem, "path" | "startLine" | "endLine">): string {
  return `${item.path}:${item.startLine === item.endLine ? `L${item.startLine}` : `L${item.startLine}-${item.endLine}`}`;
}

/**
 * The file's text with every item applied, checked first against the text as it is: an item whose `expected` lines no
 * longer match, that runs past the file's end or overlaps another throws, naming its path and lines, and nothing is
 * applied. Line endings are kept.
 */
export function applySuggestionsToText(text: string, items: readonly SuggestionItem[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/u);
  // A final newline leaves an empty last element, which is not a line of the file.
  const finalNewline = lines.length > 1 && lines.at(-1) === "";
  if (finalNewline) lines.pop();
  const sorted = [...items].sort((a, b) => a.startLine - b.startLine);
  const problems: string[] = [];
  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    if (!Number.isInteger(item.startLine) || !Number.isInteger(item.endLine) || item.startLine < 1 || item.endLine < item.startLine) problems.push(`${label(item)} is not a range of lines`);
    else if (item.endLine > lines.length) problems.push(`${label(item)} runs past the file's ${lines.length} lines`);
    else if (previous !== undefined && item.startLine <= previous.endLine) problems.push(`${label(item)} overlaps ${label(previous)}`);
    else if (item.expected.length !== item.endLine - item.startLine + 1 || item.expected.some((line, offset) => lines[item.startLine - 1 + offset] !== line)) problems.push(`${label(item)} changed since the suggestion was made`);
  });
  if (problems.length > 0) throw new SuggestionConflictError(`Not applied: ${problems.join("; ")}. Refresh and try again.`);
  // Bottom up, so each splice leaves the line numbers above it alone.
  for (const item of sorted.reverse()) lines.splice(item.startLine - 1, item.endLine - item.startLine + 1, ...item.replacement);
  return lines.join(eol) + (finalNewline ? eol : "");
}

/** Items grouped by file, in the order their files first appear. */
export function suggestionsByPath(items: readonly SuggestionItem[]): Map<string, SuggestionItem[]> {
  const byPath = new Map<string, SuggestionItem[]>();
  for (const item of items) byPath.set(item.path, [...(byPath.get(item.path) ?? []), item]);
  return byPath;
}

/** The commit message when the reviewer gives none, as GitHub words it. */
export function defaultSuggestionMessage(count: number): string {
  return count === 1 ? "Apply suggestion from code review" : "Apply suggestions from code review";
}

/** The line a message to an agent carries when a comment holds a suggestion block. */
export const SUGGESTION_NOTE = "A ```suggestion block in a comment is the exact replacement text for the lines that comment is on.";

export function mentionsSuggestion(bodies: Iterable<string>): boolean {
  for (const body of bodies) if (suggestionBlocks(body).length > 0) return true;
  return false;
}
