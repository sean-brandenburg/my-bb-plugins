// Line bookkeeping for narrative reviews, shared by the server (checking an agent's coverage) and the view (cutting
// each step's excerpts out of the file patches). Pure functions over unified patches; no React, no node.

/** Lines of one file a narrative step points at. A null `startLine` is the whole file. */
export interface NarrativeRef {
  path: string;
  side: "old" | "new";
  startLine: number | null;
  endLine: number | null;
}

/** The patch a narrative covers for one file; null for a binary or oversized file. */
export interface NarrativePatchFile {
  path: string;
  previousPath: string | null;
  patch: string | null;
}

/** Changed lines no step covers: whole-file when the file has no patch, else the line ranges per side. */
export interface UncoveredFile {
  path: string;
  wholeFile: boolean;
  old: Array<[number, number]>;
  new: Array<[number, number]>;
}

export interface NarrativeCoverage {
  uncovered: UncoveredFile[];
  /** Refs naming a path that is not in the diff. */
  unknownPaths: string[];
  changedLines: number;
  coveredLines: number;
}

interface Row {
  kind: "context" | "add" | "del";
  old: number | null;
  new: number | null;
  text: string;
}

interface Hunk {
  rows: Row[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/u;

function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const text of patch.split("\n")) {
    const header = HUNK_HEADER.exec(text);
    if (header !== null) {
      current = { rows: [] };
      hunks.push(current);
      oldLine = Number(header[1]);
      oldLeft = header[2] === undefined ? 1 : Number(header[2]);
      newLine = Number(header[3]);
      newLeft = header[4] === undefined ? 1 : Number(header[4]);
      continue;
    }
    if (current === null || (oldLeft <= 0 && newLeft <= 0)) continue;
    const mark = text[0];
    if (mark === "-") {
      current.rows.push({ kind: "del", old: oldLine++, new: null, text });
      oldLeft -= 1;
    } else if (mark === "+") {
      current.rows.push({ kind: "add", old: null, new: newLine++, text });
      newLeft -= 1;
    } else if (mark === " " || text === "") {
      current.rows.push({ kind: "context", old: oldLine++, new: newLine++, text: text === "" ? " " : text });
      oldLeft -= 1;
      newLeft -= 1;
    }
  }
  return hunks;
}

/** Runs of consecutive numbers as `[start, end]` pairs. */
export function compressLines(lines: Iterable<number>): Array<[number, number]> {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const line of sorted) {
    const last = ranges.at(-1);
    if (last !== undefined && line === last[1] + 1) last[1] = line;
    else ranges.push([line, line]);
  }
  return ranges;
}

/** Deleted lines by old-side number and added lines by new-side number. */
export function changedLines(patch: string): { old: number[]; new: number[] } {
  const old: number[] = [];
  const added: number[] = [];
  for (const hunk of parseHunks(patch)) {
    for (const row of hunk.rows) {
      if (row.kind === "del") old.push(row.old!);
      else if (row.kind === "add") added.push(row.new!);
    }
  }
  return { old, new: added };
}

function refMatchesPath(ref: NarrativeRef, file: NarrativePatchFile): boolean {
  return ref.path === file.path || (file.previousPath !== null && ref.path === file.previousPath);
}

function inRef(ref: NarrativeRef, line: number): boolean {
  if (ref.startLine === null) return true;
  const end = ref.endLine ?? ref.startLine;
  return line >= Math.min(ref.startLine, end) && line <= Math.max(ref.startLine, end);
}

/** Which changed lines of `files` no ref covers. A whole-file ref covers both sides of its file. */
export function narrativeCoverage(files: readonly NarrativePatchFile[], refs: readonly NarrativeRef[]): NarrativeCoverage {
  const uncovered: UncoveredFile[] = [];
  let changed = 0;
  let covered = 0;
  for (const file of files) {
    const mine = refs.filter((ref) => refMatchesPath(ref, file));
    if (file.patch === null) {
      changed += 1;
      if (mine.length > 0) covered += 1;
      else uncovered.push({ path: file.path, wholeFile: true, old: [], new: [] });
      continue;
    }
    const lines = changedLines(file.patch);
    const missOld = lines.old.filter((line) => !mine.some((ref) => (ref.startLine === null || ref.side === "old") && inRef(ref, line)));
    const missNew = lines.new.filter((line) => !mine.some((ref) => (ref.startLine === null || ref.side === "new") && inRef(ref, line)));
    changed += lines.old.length + lines.new.length;
    covered += lines.old.length + lines.new.length - missOld.length - missNew.length;
    if (missOld.length > 0 || missNew.length > 0) uncovered.push({ path: file.path, wholeFile: false, old: compressLines(missOld), new: compressLines(missNew) });
  }
  const known = new Set(files.flatMap((file) => (file.previousPath === null ? [file.path] : [file.path, file.previousPath])));
  const unknownPaths = [...new Set(refs.map((ref) => ref.path).filter((path) => !known.has(path)))];
  return { uncovered, unknownPaths, changedLines: changed, coveredLines: covered };
}

/** The patch rows on the given old-side and new-side ranges, as `-12 text` / `+40 text`, for telling an agent what it missed. */
export function uncoveredText(patch: string, old: ReadonlyArray<[number, number]>, added: ReadonlyArray<[number, number]>, limit = 40): string[] {
  const within = (ranges: ReadonlyArray<[number, number]>, line: number | null) => line !== null && ranges.some(([start, end]) => line >= start && line <= end);
  const out: string[] = [];
  for (const hunk of parseHunks(patch)) {
    for (const row of hunk.rows) {
      if (row.kind === "del" && within(old, row.old)) out.push(`-${row.old} ${row.text.slice(1)}`);
      else if (row.kind === "add" && within(added, row.new)) out.push(`+${row.new} ${row.text.slice(1)}`);
    }
  }
  return out.length > limit ? [...out.slice(0, limit), `… ${out.length - limit} more`] : out;
}

/** Refs that would show every line `uncovered` lists, for the view's catch-all step. */
export function refsForUncovered(uncovered: readonly UncoveredFile[]): NarrativeRef[] {
  return uncovered.flatMap((file): NarrativeRef[] =>
    file.wholeFile
      ? [{ path: file.path, side: "new", startLine: null, endLine: null }]
      : [
          ...file.old.map(([start, end]): NarrativeRef => ({ path: file.path, side: "old", startLine: start, endLine: end })),
          ...file.new.map(([start, end]): NarrativeRef => ({ path: file.path, side: "new", startLine: start, endLine: end })),
        ],
  );
}

/** `old L4–6`, `L12`, or `whole file`. */
export function refLabel(ref: NarrativeRef): string {
  if (ref.startLine === null) return "whole file";
  const end = ref.endLine ?? ref.startLine;
  const prefix = ref.side === "old" ? "old " : "";
  return end === ref.startLine ? `${prefix}L${ref.startLine}` : `${prefix}L${Math.min(ref.startLine, end)}–${Math.max(ref.startLine, end)}`;
}

/**
 * The part of a file's patch that `refs` point at, as a patch of its own: every row on a referenced line, plus up to
 * `context` unchanged rows around each run, with hunk headers recounted. Null when no ref touches the patch.
 * A whole-file ref returns the patch itself. A ref to an unchanged line inside a hunk keeps that line, so a step
 * can point at context it talks about.
 */
export function excerptPatch(patch: string, refs: readonly NarrativeRef[], context = 3): string | null {
  if (refs.length === 0) return null;
  if (refs.some((ref) => ref.startLine === null)) return patch;
  const hunks = parseHunks(patch);
  const out: string[] = [];
  for (const hunk of hunks) {
    const hit = hunk.rows.map((row) =>
      refs.some((ref) => {
        const line = ref.side === "old" ? row.old : row.new;
        return line !== null && inRef(ref, line);
      }),
    );
    // Unreferenced changes nearby are left out, splitting the excerpt, so a step never shows a line it does not cover.
    const keep = hit.map((value, index) => {
      if (value) return true;
      if (context === 0) return false;
      for (let distance = 1; distance <= context; distance++) {
        if (hit[index - distance] === true || hit[index + distance] === true) return hunk.rows[index]!.kind === "context";
      }
      return false;
    });
    let index = 0;
    while (index < hunk.rows.length) {
      if (!keep[index]) {
        index += 1;
        continue;
      }
      const start = index;
      while (index < hunk.rows.length && keep[index]) index += 1;
      const rows = hunk.rows.slice(start, index);
      const firstOld = rows.find((row) => row.old !== null)?.old ?? oldBefore(hunk.rows, start) + 1;
      const firstNew = rows.find((row) => row.new !== null)?.new ?? newBefore(hunk.rows, start) + 1;
      const oldCount = rows.filter((row) => row.kind !== "add").length;
      const newCount = rows.filter((row) => row.kind !== "del").length;
      out.push(`@@ -${oldCount === 0 ? firstOld - 1 : firstOld},${oldCount} +${newCount === 0 ? firstNew - 1 : firstNew},${newCount} @@`);
      for (const row of rows) out.push(row.text);
    }
  }
  return out.length === 0 ? null : out.join("\n");
}

function oldBefore(rows: readonly Row[], index: number): number {
  for (let at = index - 1; at >= 0; at--) if (rows[at]!.old !== null) return rows[at]!.old!;
  const next = rows.slice(index).find((row) => row.old !== null)?.old ?? null;
  return next === null ? 0 : next - 1;
}

function newBefore(rows: readonly Row[], index: number): number {
  for (let at = index - 1; at >= 0; at--) if (rows[at]!.new !== null) return rows[at]!.new!;
  const next = rows.slice(index).find((row) => row.new !== null)?.new ?? null;
  return next === null ? 0 : next - 1;
}
