// Pure text operations on one note that the editor and reader share:
// locating link targets, extracting embedded sections, and toggling tasks.
import { parseHeadings, slugifyHeading } from "./obsidian.ts";

export interface NavigationTarget {
  line?: number;
  heading?: string;
  /** Block id without the leading "^". */
  block?: string;
}

/** The target named by a link's "#…" part: a heading, or a block when it starts with "^". */
export function targetFromSubpath(subpath: string | null): NavigationTarget | undefined {
  if (subpath === null || subpath === "") return undefined;
  return subpath.startsWith("^") ? { block: subpath.slice(1) } : { heading: subpath };
}

/** Zero-based line a navigation target points at in `content`, or null. */
export function resolveTargetLine(content: string, target: NavigationTarget): number | null {
  if (target.line !== undefined) return target.line;
  const lines = content.split("\n");
  if (target.block !== undefined) {
    const marker = ` ^${target.block.toLowerCase()}`;
    const index = lines.findIndex((line) => line.trimEnd().toLowerCase().endsWith(marker));
    return index === -1 ? null : index;
  }
  if (target.heading !== undefined) {
    const wanted = slugifyHeading(target.heading);
    return parseHeadings(content).find((heading) => slugifyHeading(heading.text) === wanted)?.line ?? null;
  }
  return null;
}

/**
 * The heading section (or block) of a note an embed subpath points at, or the
 * whole note when the subpath matches nothing.
 */
export function embedSection(content: string, subpath: string): string {
  const lines = content.split("\n");
  if (subpath.startsWith("^")) {
    const marker = subpath.toLowerCase();
    const line = lines.find((candidate) => candidate.trimEnd().toLowerCase().endsWith(` ${marker}`));
    return line === undefined ? content : line.replace(/\s+\^[\w-]+\s*$/, "");
  }
  const wanted = slugifyHeading(subpath);
  const start = lines.findIndex((line) => {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    return match !== null && slugifyHeading(match[2]!.replace(/\s+#+\s*$/, "")) === wanted;
  });
  if (start === -1) return content;
  const level = /^(#{1,6})/.exec(lines[start]!)![1]!.length;
  let end = start + 1;
  while (end < lines.length) {
    const match = /^(#{1,6})\s/.exec(lines[end]!);
    if (match !== null && match[1]!.length <= level) break;
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}

const TASK_MARKER = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

/**
 * Flips the task checkbox on a one-based source line (as markdown positions
 * count). Returns null when that line isn't a task.
 */
export function toggleTaskAt(content: string, line: number): string | null {
  const lines = content.split("\n");
  const source = lines[line - 1];
  if (source === undefined) return null;
  const toggled = source.replace(TASK_MARKER, (_, open: string, mark: string, close: string) => `${open}${mark === " " ? "x" : " "}${close}`);
  if (toggled === source) return null;
  lines[line - 1] = toggled;
  return lines.join("\n");
}
