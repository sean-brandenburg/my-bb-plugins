import type { PullRequest, SyncStatus } from "../shared/board";
import type { KanbanSettings } from "./settings";
import { USER_AGENT, execFileAsync } from "./util";

export const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** A non-2xx GitHub response; `status` tells a rejected payload (422) apart from an outage. */
export class GithubHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function githubHeaders(token: string, accept = "application/vnd.github+json"): Record<string, string> {
  return { authorization: `Bearer ${token}`, accept, "user-agent": USER_AGENT };
}

// GitHub API shapes (only the fields read)

export interface GithubSearchItem {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft?: boolean;
  user: { login: string } | null;
  updated_at: string;
  repository_url: string;
  pull_request?: { merged_at: string | null };
}

export interface GithubUser {
  login: string;
}
export interface GithubIssueComment {
  id: number;
  user: GithubUser | null;
  body: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}
export interface GithubReviewComment extends GithubIssueComment {
  path: string;
  line: number | null;
  original_line: number | null;
  side?: "LEFT" | "RIGHT";
  in_reply_to_id?: number;
}
export interface GithubReview {
  id: number;
  user: GithubUser | null;
  body: string | null;
  state: string;
  html_url: string;
  submitted_at?: string;
}

export interface GithubPullFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GithubPull {
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  html_url: string;
  updated_at: string;
  user: { login: string } | null;
}

export function repoFromRepositoryUrl(url: string): string {
  // https://api.github.com/repos/owner/repo
  return url.replace(/^https:\/\/api\.github\.com\/repos\//u, "").toLowerCase();
}

/** `git@github.com:owner/repo.git` and friends → `owner/repo`, or null. */
export function githubRepoFromRemote(remote: string | null): string | null {
  if (remote === null) return null;
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu.exec(
    remote.trim(),
  );
  if (match === null) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

/** `repo#number`, how thread titles name a PR. */
export function prShortName(pr: { repo: string; number: number }): string {
  return `${pr.repo.split("/")[1]}#${pr.number}`;
}

export function prStateOf(item: {
  state: "open" | "closed";
  draft?: boolean;
  merged: boolean;
}): PullRequest["state"] {
  if (item.merged) return "merged";
  if (item.state === "closed") return "closed";
  return item.draft === true ? "draft" : "open";
}

export async function resolveToken(settings: KanbanSettings): Promise<{ token: string; source: SyncStatus["tokenSource"] } | null> {
  const { githubToken } = await settings.get();
  if (typeof githubToken === "string" && githubToken.trim() !== "") {
    return { token: githubToken.trim(), source: "setting" };
  }
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { timeout: 10_000 });
    const token = stdout.trim();
    return token === "" ? null : { token, source: "gh-cli" };
  } catch {
    return null;
  }
}

export async function github<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: { ...githubHeaders(token), "x-github-api-version": API_VERSION },
    signal: signal ?? null,
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new GithubHttpError(response.status, `GitHub ${response.status} for ${path}: ${body}`);
  }
  return (await response.json()) as T;
}

export async function githubPost<T>(path: string, token: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method: "POST",
    signal: signal ?? null,
    headers: { ...githubHeaders(token), "content-type": "application/json", "x-github-api-version": API_VERSION },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    throw new GithubHttpError(response.status, `GitHub ${response.status} for ${path}: ${text}`);
  }
  return (await response.json()) as T;
}

/** Every page of a GitHub list endpoint, capped so a runaway PR cannot stall the sync. */
export async function githubPages<T>(path: string, token: string, signal?: AbortSignal, maxPages = 10): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await github<T[]>(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, token, signal);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

/** Resolved state per review thread, keyed by the thread's first comment id; REST does not expose it. */
export async function reviewThreadResolution(repo: string, number: number, token: string, signal?: AbortSignal): Promise<Map<number, boolean>> {
  const [owner, name] = repo.split("/");
  const map = new Map<number, boolean>();
  let after: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const result: {
      data?: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: Array<{ isResolved: boolean; comments: { nodes: Array<{ databaseId: number | null }> } }>;
              pageInfo?: { hasNextPage: boolean; endCursor: string | null };
            };
          } | null;
        } | null;
      };
      errors?: Array<{ message: string }>;
    } = await githubPost(
      "/graphql",
      token,
      {
        query: `query($owner: String!, $name: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $after) {
                nodes { isResolved comments(first: 1) { nodes { databaseId } } }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }`,
        variables: { owner, name, number, after },
      },
      signal,
    );
    if (result.errors !== undefined && result.errors.length > 0) throw new Error(result.errors.map((error) => error.message).join("; "));
    const threads = result.data?.repository?.pullRequest?.reviewThreads;
    for (const thread of threads?.nodes ?? []) {
      const rootId = thread.comments.nodes[0]?.databaseId;
      if (rootId !== null && rootId !== undefined) map.set(rootId, thread.isResolved);
    }
    if (threads?.pageInfo?.hasNextPage !== true || threads.pageInfo.endCursor === null) break;
    after = threads.pageInfo.endCursor;
  }
  return map;
}

export async function searchPulls(query: string, token: string, signal?: AbortSignal): Promise<GithubSearchItem[]> {
  const items: GithubSearchItem[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const result = await github<{ items: GithubSearchItem[]; total_count: number }>(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`,
      token,
      signal,
    );
    items.push(...result.items);
    if (result.items.length < 100 || items.length >= result.total_count) break;
  }
  return items;
}
