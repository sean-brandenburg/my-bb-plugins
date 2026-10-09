// Server-side diff pieces shared by every plugin that shows the diff view: parsing unified diffs, reading an
// environment's changes, running difftastic, and searching a checkout for symbols.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { DiffFile, DiffResult, FileSlice, StructuralDiff, SymbolDefinition, SymbolUsages } from "./types";

const execFileAsync = promisify(execFile);

type Sdk = BbPluginApi["sdk"];

const VENDORED_PATH = /(^|\/)(vendor|node_modules|third_party|third-party|bower_components|\.yarn|Pods|Carthage\/Checkouts)\//u;

export function isVendoredPath(path: string): boolean {
  return VENDORED_PATH.test(path);
}

export function splitUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const chunks = diff.split(/^(?=diff --git )/mu).filter((chunk) => chunk.trim() !== "");
  for (const chunk of chunks) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/mu.exec(chunk);
    const plus = /^\+\+\+ (?:b\/)?(.+)$/mu.exec(chunk)?.[1] ?? null;
    const minus = /^--- (?:a\/)?(.+)$/mu.exec(chunk)?.[1] ?? null;
    const path = plus !== null && plus !== "/dev/null" ? plus : (header?.[2] ?? minus ?? "unknown");
    const previousPath = header !== null && header[1] !== header[2] ? header[1] : null;
    const status =
      minus === "/dev/null" || /^new file mode/mu.test(chunk)
        ? "added"
        : plus === "/dev/null" || /^deleted file mode/mu.test(chunk)
          ? "removed"
          : previousPath !== null
            ? "renamed"
            : "modified";
    let additions = 0;
    let deletions = 0;
    for (const line of chunk.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }
    const binary = /^Binary files /mu.test(chunk) || !/^@@/mu.test(chunk);
    files.push({ path, previousPath, status, additions, deletions, patch: binary ? null : chunk, vendored: isVendoredPath(path) });
  }
  return files;
}

/** Drops vendored files from a diff, counting what was left out. */
export function hideVendoredFiles(diff: DiffResult): DiffResult {
  const vendored = diff.files.filter((file) => file.vendored);
  if (vendored.length === 0) return diff;
  return {
    ...diff,
    files: diff.files.filter((file) => !file.vendored),
    hiddenVendored: {
      files: vendored.length,
      additions: vendored.reduce((sum, file) => sum + file.additions, 0),
      deletions: vendored.reduce((sum, file) => sum + file.deletions, 0),
    },
  };
}

export function emptyDiff(source: DiffResult["source"], message: string): DiffResult {
  return { source, files: [], baseRef: null, baseSha: null, headSha: null, truncated: false, message, fetchedAt: Date.now(), hiddenVendored: null };
}

/** Everything on the environment's branch since it diverged when the merge base is known, else just the working tree. */
export async function environmentDiff(sdk: Sdk, environmentId: string): Promise<DiffResult> {
  const environment = await sdk.environments.get({ environmentId });
  const result = await sdk.environments.diff(
    environment.mergeBaseBranch !== null
      ? { environmentId, target: "all", mergeBaseBranch: environment.mergeBaseBranch }
      : { environmentId, target: "uncommitted" },
  );
  if (result.outcome !== "available") {
    return emptyDiff("environment", result.outcome === "not_applicable" ? result.message : result.failure.message);
  }
  return {
    source: "environment",
    files: splitUnifiedDiff(result.diff.diff),
    baseRef: result.diff.mergeBaseRef,
    baseSha: null,
    headSha: null,
    truncated: result.diff.truncated,
    message: null,
    fetchedAt: Date.now(),
    hiddenVendored: null,
  };
}

/**
 * Both sides of one file of an environment diff, as text; null for a side that does not exist or is binary.
 * `mergeBaseRef` is the diff's resolved merge-base sha (`DiffResult.baseRef`), not a branch name.
 */
export async function environmentFileSides(sdk: Sdk, environmentId: string, file: DiffFile, mergeBaseRef: string | null): Promise<{ old: string | null; new: string | null }> {
  const read = async (side: "old" | "new"): Promise<string | null> => {
    if (side === "old" && file.status === "added") return null;
    if (side === "new" && file.status === "removed") return null;
    const path = side === "old" ? (file.previousPath ?? file.path) : file.path;
    try {
      const result = await sdk.environments.diffFile(
        mergeBaseRef !== null ? { environmentId, path, side, target: "all", mergeBaseRef } : { environmentId, path, side, target: "uncommitted" },
      );
      return result.contentEncoding === "base64" ? Buffer.from(result.content, "base64").toString("utf8") : result.content;
    } catch {
      return null;
    }
  };
  return { old: await read("old"), new: await read("new") };
}

/** A checkout's directory on this server machine, or null when the environment lives on another host. */
export async function localEnvironmentPath(sdk: Sdk, environmentId: string): Promise<string | null> {
  const [config, environment] = await Promise.all([sdk.system.config(), sdk.environments.get({ environmentId })]);
  // Loose on purpose: `workspacePath` is not in the SDK's types but is read first, and test fakes omit `path` and `hostId`.
  const loose = environment as { workspacePath?: string | null; path?: string | null; hostId?: string | null };
  const path = loose.workspacePath ?? loose.path ?? null;
  const hostId = loose.hostId ?? null;
  return path === null || (hostId !== null && hostId !== config.primaryHostId) ? null : path;
}

interface DifftLine {
  line_number: number;
  changes: Array<{ start: number; end: number; content: string; highlight: string }>;
}
interface DifftOutput {
  language?: string;
  status?: string;
  chunks?: Array<Array<{ lhs?: DifftLine | null; rhs?: DifftLine | null }>>;
  aligned_lines?: Array<[number | null, number | null]>;
}

export function structuralUnavailable(reason: string): StructuralDiff {
  return { available: false, reason, language: null, status: null, oldText: "", newText: "", aligned: [], oldChanges: [], newChanges: [] };
}

/** difftastic's syntax-aware diff of two versions of `path`; a null side is a file that does not exist there. */
export async function runDifftastic(difftPath: string, path: string, sides: { old: string | null; new: string | null }): Promise<StructuralDiff> {
  if (isVendoredPath(path)) return structuralUnavailable("Vendored file; the structural diff skips these.");
  const base: StructuralDiff = { ...structuralUnavailable(""), reason: null, oldText: sides.old ?? "", newText: sides.new ?? "" };
  if (sides.old === null && sides.new === null) return { ...base, reason: "This file has no text content on either side (binary or oversized)." };
  const dir = await mkdtemp(join(tmpdir(), "diff-view-difft-"));
  try {
    const name = basename(path) || "file";
    const oldFile = join(dir, `old-${name}`);
    const newFile = join(dir, `new-${name}`);
    await writeFile(oldFile, sides.old ?? "");
    await writeFile(newFile, sides.new ?? "");
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(difftPath, ["--display", "json", "--context", "3", "--color", "never", oldFile, newFile], {
        // The default parse-error limit of 0 drops to a text diff whenever the grammar lags the language
        // (e.g. Go 1.26 `new(expr)`); tree-sitter recovers from errors well enough to keep the structural view.
        env: { ...process.env, DFT_UNSTABLE: "yes", DFT_PARSE_ERROR_LIMIT: "10000" },
        timeout: 30_000,
        maxBuffer: 64 * 1024 * 1024,
      }));
    } catch (error) {
      const code = (error as { code?: string }).code;
      const reason =
        code === "ENOENT"
          ? `difftastic was not found at \`${difftPath}\`. Install it with \`brew install difftastic\` (or set the difftastic binary setting).`
          : `difftastic failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
      return { ...base, reason };
    }
    let parsed: DifftOutput;
    try {
      parsed = JSON.parse(stdout) as DifftOutput;
    } catch {
      return { ...base, reason: "difftastic returned output that was not JSON; is it an older version without `--display json`?" };
    }
    const oldLines = (sides.old ?? "").split("\n").length;
    const newLines = (sides.new ?? "").split("\n").length;
    const pairs = (parsed.chunks ?? []).flat();
    // difftastic's JSON uses 0-based line numbers; guard against a build that already emits 1-based ones.
    const numbers = [...pairs.flatMap((pair) => [pair.lhs?.line_number, pair.rhs?.line_number]), ...(parsed.aligned_lines ?? []).flat()].filter((n): n is number => typeof n === "number");
    const zeroBased = numbers.length === 0 || numbers.some((n) => n === 0) || Math.max(...numbers) < Math.max(oldLines, newLines);
    const shift = (n: number | null | undefined): number | null => (typeof n === "number" ? n + (zeroBased ? 1 : 0) : null);
    const collect = (side: "lhs" | "rhs"): StructuralDiff["oldChanges"] => {
      const byLine = new Map<number, StructuralDiff["oldChanges"][number]>();
      for (const pair of pairs) {
        const line = pair[side];
        if (line === null || line === undefined) continue;
        const number = shift(line.line_number)!;
        const entry = byLine.get(number) ?? { line: number, changes: [] };
        entry.changes.push(...line.changes.map((change) => ({ start: change.start, end: change.end, highlight: change.highlight })));
        byLine.set(number, entry);
      }
      return [...byLine.values()].sort((a, b) => a.line - b.line);
    };
    // difftastic emits no alignment and no chunks for a created or deleted file: every line is the change.
    const wholeFile: StructuralDiff["aligned"] | null =
      sides.old === null || sides.old === "" ? Array.from({ length: newLines }, (_, i) => [null, i + 1] as [number | null, number | null])
      : sides.new === null || sides.new === "" ? Array.from({ length: oldLines }, (_, i) => [i + 1, null] as [number | null, number | null])
      : null;
    // Older difftastic builds lack aligned_lines; fall back to the changed pairs alone, which loses context but still renders.
    const aligned: StructuralDiff["aligned"] =
      wholeFile ??
      (parsed.aligned_lines ?? pairs.map((pair) => [pair.lhs?.line_number ?? null, pair.rhs?.line_number ?? null] as [number | null, number | null]))
        .map(([lhs, rhs]) => [shift(lhs), shift(rhs)] as [number | null, number | null])
        .filter(([lhs, rhs]) => (lhs === null || lhs <= oldLines) && (rhs === null || rhs <= newLines) && !(lhs === null && rhs === null));
    const status = parsed.status === "unchanged" || parsed.status === "changed" || parsed.status === "created" || parsed.status === "deleted" ? parsed.status : "changed";
    return { ...base, available: true, language: parsed.language ?? null, status, aligned, oldChanges: collect("lhs"), newChanges: collect("rhs") };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Lines of context returned around each definition, for the inline peek. */
const PEEK_BEFORE = 2;
const PEEK_AFTER = 18;
const DEFINITION_LIMIT = 40;
const USAGE_LIMIT = 300;
const GIT_GREP_TIMEOUT_MS = 15_000;

interface GrepHit {
  path: string;
  line: number;
  snippet: string;
}

/** Lines `[from, to]` (1-based, clamped) of a file in a checkout, or null when unreadable. */
export async function fileSlice(dir: string, path: string, from: number, to: number): Promise<FileSlice | null> {
  try {
    const text = await readFile(join(dir, path), "utf8");
    const all = text.split("\n");
    const start = Math.max(1, from);
    const end = Math.min(all.length, Math.max(start, to));
    return { startLine: start, lines: all.slice(start - 1, end), totalLines: all.length };
  } catch {
    return null;
  }
}

/** Where a symbol is defined in a checkout, by `git grep` for common definition shapes; null when git grep failed. */
export async function grepDefinitions(dir: string, symbol: string): Promise<SymbolDefinition[] | null> {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  // POSIX ERE only: macOS git grep uses the BSD regex engine, where `\s` and `\b` silently never match.
  const ws = "[[:space:]]";
  const end = `([^[:alnum:]_]|$)`;
  // Definition shapes across common languages; intentionally generous, ranked by the UI.
  const pattern = [
    `^${ws}*(export${ws}+)?(default${ws}+)?(async${ws}+)?(function|class|interface|type|enum|const|let|var)${ws}+${escaped}${end}`,
    `^${ws}*func${ws}+(\\([^)]*\\)${ws}*)?${escaped}${ws}*[(\\[]`,
    `^${ws}*(type|var|const)${ws}+${escaped}${end}`,
    `^${ws}*${escaped}${ws}+(struct|interface)${end}`,
    `^${ws}*(def|class)${ws}+${escaped}${end}`,
    `^${ws}*(pub${ws}+)?(fn|struct|enum|trait|type|const|static)${ws}+${escaped}${end}`,
    `^${ws}*((public|private|protected|static|final|abstract)${ws}+)*(class|interface|enum|record)${ws}+${escaped}${end}`,
  ].join("|");
  try {
    const { stdout } = await execFileAsync("git", ["grep", "-n", "-I", "-E", "--", pattern], { cwd: dir, timeout: GIT_GREP_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
    const found = stdout
      .split("\n")
      .filter((line) => line !== "")
      .slice(0, DEFINITION_LIMIT)
      .map(parseGrepLine)
      .filter((entry): entry is GrepHit => entry !== null);
    return Promise.all(found.map(async (entry) => ({ ...entry, context: await fileSlice(dir, entry.path, entry.line - PEEK_BEFORE, entry.line + PEEK_AFTER) })));
  } catch (error) {
    // git grep exits 1 when nothing matched.
    if ((error as { code?: number }).code === 1) return [];
    return null;
  }
}

/** Every whole-word occurrence of a symbol in a checkout. */
export async function grepUsages(dir: string, symbol: string): Promise<Pick<SymbolUsages, "usages" | "truncated">> {
  try {
    const { stdout } = await execFileAsync("git", ["grep", "-n", "-w", "-I", "-F", "--", symbol], { cwd: dir, timeout: GIT_GREP_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
    const lines = stdout.split("\n").filter((line) => line !== "");
    const usages = lines
      .slice(0, USAGE_LIMIT)
      .map(parseGrepLine)
      .filter((entry): entry is GrepHit => entry !== null);
    return { usages, truncated: lines.length > USAGE_LIMIT };
  } catch (error) {
    if ((error as { code?: number }).code === 1) return { usages: [], truncated: false };
    throw error;
  }
}

/** One `path:line:text` line of `git grep -n` output. */
function parseGrepLine(line: string): GrepHit | null {
  const match = /^(.+?):(\d+):(.*)$/u.exec(line);
  return match === null ? null : { path: match[1]!, line: Number.parseInt(match[2]!, 10), snippet: match[3]!.trim().slice(0, 200) };
}
