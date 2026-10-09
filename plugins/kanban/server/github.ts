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
  start_line?: number | null;
  original_start_line?: number | null;
  start_side?: "LEFT" | "RIGHT" | null;
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

/** GitHub's StatusState for a commit's check rollup; EXPECTED is a required status nothing has reported yet. */
export function checksFromRollup(state: string | null | undefined): PullRequest["checks"] {
  switch (state) {
    case "SUCCESS":
      return "passing";
    case "FAILURE":
    case "ERROR":
      return "failing";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return null;
  }
}

export interface PrHead {
  headRef: string;
  checks: PullRequest["checks"];
}

interface PrHeadNode {
  pullRequest: {
    headRefName: string;
    commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } } | null> | null };
  } | null;
}

/** Aliases a batched query answers, keyed `pr0`, `pr1`, … in the order of `prs`. */
export type PrHeadsData = Record<string, PrHeadNode | null | undefined> | null | undefined;

const PR_HEADS_CHUNK = 40;

function prHeadsQuery(prs: ReadonlyArray<{ repo: string; number: number }>): { query: string; variables: Record<string, string | number> } {
  const variables: Record<string, string | number> = {};
  const params: string[] = [];
  const fields: string[] = [];
  prs.forEach((pr, index) => {
    const [owner = "", name = ""] = pr.repo.split("/");
    variables[`owner${index}`] = owner;
    variables[`name${index}`] = name;
    variables[`number${index}`] = pr.number;
    params.push(`$owner${index}: String!, $name${index}: String!, $number${index}: Int!`);
    fields.push(
      `pr${index}: repository(owner: $owner${index}, name: $name${index}) {
        pullRequest(number: $number${index}) {
          headRefName
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        }
      }`,
    );
  });
  return { query: `query(${params.join(", ")}) {\n${fields.join("\n")}\n}`, variables };
}

/**
 * Head branch and CI status per `repo#number`. A PR whose repository or pull request did not come back (deleted, no
 * access) is left out, so the caller keeps what it had.
 */
export function parsePrHeads(prs: ReadonlyArray<{ repo: string; number: number }>, data: PrHeadsData): Map<string, PrHead> {
  const heads = new Map<string, PrHead>();
  prs.forEach((pr, index) => {
    const pull = data?.[`pr${index}`]?.pullRequest;
    if (pull === null || pull === undefined) return;
    const rollup = pull.commits.nodes?.[0]?.commit.statusCheckRollup ?? null;
    heads.set(`${pr.repo}#${pr.number}`, { headRef: pull.headRefName, checks: checksFromRollup(rollup?.state) });
  });
  return heads;
}

/**
 * Head branch and CI status for many PRs, one GraphQL request per chunk since the search API returns neither. A failed
 * chunk, or errors that came back alongside data (one repo gone), go to `warn`; the other chunks still count.
 */
export async function fetchPrHeads(
  prs: ReadonlyArray<{ repo: string; number: number }>,
  token: string,
  signal: AbortSignal | undefined,
  warn: (message: string) => void,
): Promise<Map<string, PrHead>> {
  const heads = new Map<string, PrHead>();
  for (let start = 0; start < prs.length && signal?.aborted !== true; start += PR_HEADS_CHUNK) {
    const chunk = prs.slice(start, start + PR_HEADS_CHUNK);
    let result: { data?: PrHeadsData; errors?: Array<{ message: string }> };
    try {
      result = await githubPost("/graphql", token, prHeadsQuery(chunk), signal);
    } catch (error) {
      warn(String(error));
      continue;
    }
    const errors = (result.errors ?? []).map((error) => error.message).join("; ");
    if (errors !== "") warn(errors);
    for (const [key, head] of parsePrHeads(chunk, result.data)) heads.set(key, head);
  }
  return heads;
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
