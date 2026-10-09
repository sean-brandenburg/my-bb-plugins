import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyDiff,
  environmentDiff,
  environmentFileSides,
  grepDefinitions,
  grepUsages,
  hideVendoredFiles,
  isVendoredPath,
  localEnvironmentPath,
  runDifftastic,
  structuralUnavailable,
} from "bb-diff-view/server";
import type { Ticket } from "../../shared/board";
import type { StructuralDiff, SymbolLookup, SymbolUsages, TicketDiff } from "../../shared/diff";
import type { KanbanContext } from "../context";
import { GITHUB_API, github, githubHeaders, githubPages, resolveToken, type GithubPull, type GithubPullFile } from "../github";
import { execFileAsync } from "../util";

export async function containsCommit(dir: string, sha: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: dir, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** A card's changes, file sides, structural diffs and symbol lookups. */
export function createChanges(ctx: KanbanContext) {
  const { bb, settings } = ctx;

  const diffCache = new Map<string, { key: string; diff: TicketDiff }>();

  /** The card's changes, minus vendored files when the setting hides them. */
  async function ticketDiff(ticket: Ticket, refresh: boolean): Promise<TicketDiff> {
    const diff = await fullTicketDiff(ticket, refresh);
    return (await settings.get()).hideVendored ? hideVendoredFiles(diff) : diff;
  }

  /** The card's changes: the PR's files from GitHub, else the thread environment's working diff. */
  async function fullTicketDiff(ticket: Ticket, refresh: boolean): Promise<TicketDiff> {
    const now = Date.now();
    if (ticket.pr !== null) {
      const key = `pr:${ticket.pr.updatedAt}`;
      const cached = diffCache.get(ticket.id);
      if (!refresh && cached !== undefined && cached.key === key && now - cached.diff.fetchedAt < 10 * 60_000) return cached.diff;
      const auth = await resolveToken(settings);
      if (auth === null) {
        return emptyDiff("pr", "No GitHub token configured.");
      }
      const [pull, files] = await Promise.all([
        github<GithubPull & { base?: { ref?: string; sha?: string }; head?: { sha?: string } }>(`/repos/${ticket.pr.repo}/pulls/${ticket.pr.number}`, auth.token),
        // GitHub lists at most 300 files for a PR.
        githubPages<GithubPullFile>(`/repos/${ticket.pr.repo}/pulls/${ticket.pr.number}/files`, auth.token, undefined, 3),
      ]);
      const diff: TicketDiff = {
        source: "pr",
        files: files.map((file) => ({
          path: file.filename,
          previousPath: file.previous_filename ?? null,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch ?? null,
          vendored: isVendoredPath(file.filename),
        })),
        baseRef: pull.base?.ref ?? null,
        baseSha: pull.base?.sha ?? null,
        headSha: pull.head?.sha ?? null,
        truncated: files.length >= 300,
        message: null,
        fetchedAt: now,
        hiddenVendored: null,
      };
      diffCache.set(ticket.id, { key, diff });
      return diff;
    }
    if (ticket.threadId !== null) {
      const thread = await bb.sdk.threads.get({ threadId: ticket.threadId });
      if (thread.environmentId === null) return emptyDiff("none", "The card's thread has no environment yet.");
      return environmentDiff(bb.sdk, thread.environmentId);
    }
    return emptyDiff("none", "No pull request or thread to diff.");
  }

  /** Both sides of one file in the card's diff, as text; null for a side that does not exist or is binary. */
  async function fileSides(ticket: Ticket, path: string): Promise<{ old: string | null; new: string | null; headSha: string | null }> {
    const diff = await ticketDiff(ticket, false);
    const file = diff.files.find((entry) => entry.path === path || entry.previousPath === path);
    if (file === undefined) throw new Error(`${path} is not in this card's diff`);
    if (ticket.pr !== null) {
      const auth = await resolveToken(settings);
      if (auth === null) throw new Error("No GitHub token configured.");
      const fetchSide = async (ref: string | null, filePath: string): Promise<string | null> => {
        if (ref === null) return null;
        const response = await fetch(`${GITHUB_API}/repos/${ticket.pr!.repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`, {
          headers: githubHeaders(auth.token, "application/vnd.github.raw+json"),
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`GitHub ${response.status} fetching ${filePath}@${ref.slice(0, 7)}`);
        return response.text();
      };
      return {
        old: file.status === "added" ? null : await fetchSide(diff.baseSha, file.previousPath ?? file.path),
        new: file.status === "removed" ? null : await fetchSide(diff.headSha, file.path),
        headSha: diff.headSha,
      };
    }
    if (ticket.threadId !== null) {
      const thread = await bb.sdk.threads.get({ threadId: ticket.threadId });
      if (thread.environmentId === null) throw new Error("The card's thread has no environment yet.");
      return { ...(await environmentFileSides(bb.sdk, thread.environmentId, file, diff.baseRef)), headSha: null };
    }
    throw new Error("No pull request or thread to diff.");
  }

  const structuralCache = new Map<string, StructuralDiff>();

  async function structuralDiff(ticket: Ticket, path: string): Promise<StructuralDiff> {
    if (isVendoredPath(path)) return structuralUnavailable("Vendored file; the structural diff skips these.");
    const sides = await fileSides(ticket, path);
    const cacheKey = `${ticket.id}:${path}:${sides.headSha ?? "env"}:${(sides.old ?? "").length}:${(sides.new ?? "").length}`;
    const cached = structuralCache.get(cacheKey);
    if (cached !== undefined && sides.headSha !== null) return cached;
    const result = await runDifftastic((await settings.get()).difftPath, path, sides);
    if (result.available) structuralCache.set(cacheKey, result);
    return result;
  }

  /** Where a symbol is defined: `git grep` in a local workspace of the card, else GitHub code search for PR cards. */
  async function symbolDefinitions(ticket: Ticket, symbol: string): Promise<SymbolLookup> {
    const localDir = await localWorkspaceDir(ticket);
    if (localDir !== null) {
      const definitions = await grepDefinitions(localDir.path, symbol);
      // A failed git grep falls through to GitHub.
      if (definitions !== null) return { symbol, definitions, open: { kind: "environment", environmentId: localDir.environmentId }, searched: "workspace" };
    }
    if (ticket.pr !== null) {
      const auth = await resolveToken(settings);
      const diff = await ticketDiff(ticket, false);
      if (auth !== null) {
        const response = await fetch(`${GITHUB_API}/search/code?q=${encodeURIComponent(`${symbol} repo:${ticket.pr.repo}`)}&per_page=20`, {
          headers: githubHeaders(auth.token, "application/vnd.github.text-match+json"),
        });
        if (response.ok) {
          const body = (await response.json()) as { items?: Array<{ path: string; text_matches?: Array<{ fragment: string }> }> };
          const definitions = (body.items ?? []).map((item) => ({
            path: item.path,
            line: null,
            snippet: (item.text_matches?.[0]?.fragment ?? "").split("\n").find((line) => line.includes(symbol))?.trim().slice(0, 200) ?? "",
            context: null,
          }));
          return { symbol, definitions, open: { kind: "github", repo: ticket.pr.repo, sha: diff.headSha ?? "HEAD" }, searched: "github" };
        }
      }
      return { symbol, definitions: [], open: { kind: "github", repo: ticket.pr.repo, sha: diff.headSha ?? "HEAD" }, searched: "none" };
    }
    return { symbol, definitions: [], open: { kind: "none" }, searched: "none" };
  }

  async function symbolUsages(ticket: Ticket, symbol: string): Promise<SymbolUsages> {
    const localDir = await localWorkspaceDir(ticket);
    if (localDir === null) return { symbol, usages: [], open: { kind: "none" }, searched: "none", truncated: false };
    return { symbol, ...(await grepUsages(localDir.path, symbol)), open: { kind: "environment", environmentId: localDir.environmentId }, searched: "workspace" };
  }

  /**
   * A checkout of the card's code on this server machine: the card thread's environment, else its latest review's.
   * For PR cards, a checkout that does not contain the PR head is only used when no candidate does, since the
   * card thread's worktree often lags the PR branch and would miss symbols the PR introduces.
   */
  async function localWorkspaceDir(ticket: Ticket): Promise<{ path: string; environmentId: string } | null> {
    const candidates = [ticket.threadId, ticket.latestReview?.threadId ?? null].filter((id): id is string => id !== null);
    const headSha = ticket.pr === null ? null : (await ticketDiff(ticket, false)).headSha;
    let stale: { path: string; environmentId: string } | null = null;
    for (const threadId of candidates) {
      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (thread.environmentId === null) continue;
        const path = await localEnvironmentPath(bb.sdk, thread.environmentId);
        if (path === null) continue;
        const found = { path, environmentId: thread.environmentId };
        if (headSha === null || (await containsCommit(path, headSha))) return found;
        stale ??= found;
      } catch {
        continue;
      }
    }
    return stale;
  }

  async function peekFile(ticket: Ticket, path: string, startLine: number, endLine: number): Promise<{ startLine: number; lines: string[]; totalLines: number }> {
    const localDir = await localWorkspaceDir(ticket);
    if (localDir === null) throw new Error("No local checkout to read from.");
    if (path.includes("..") || path.startsWith("/")) throw new Error("Invalid path");
    const text = await readFile(join(localDir.path, path), "utf8");
    const all = text.split("\n");
    const start = Math.max(1, Math.min(startLine, endLine));
    const end = Math.min(all.length, Math.max(startLine, endLine));
    return { startLine: start, lines: all.slice(start - 1, end), totalLines: all.length };
  }

  return { ticketDiff, structuralDiff, symbolDefinitions, symbolUsages, peekFile };
}

export type Changes = ReturnType<typeof createChanges>;
