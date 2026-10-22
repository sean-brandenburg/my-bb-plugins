import { afterEach, describe, expect, it, vi } from "vitest";
import type { SuggestionItem } from "bb-diff-view/types";
import type { Ticket } from "../shared/board";
import type { PrComment } from "../shared/comments";
import { commentsBody } from "./comments/pr-comments";
import type { KanbanContext } from "./context";
import { commitSuggestionsToPr, createSuggestions } from "./diff/suggestions";

/**
 * A pull request's head repository as GitHub's git data API serves it: a branch, commits, trees and blobs, with every
 * write recorded. The PR lives in `acme/widgets`; its head branch in a fork.
 */
function stubGitData(files: Record<string, string>) {
  let nextSha = 0;
  const sha = () => `sha${++nextSha}`;
  const blobs = new Map<string, string>();
  const trees = new Map<string, Array<{ path: string; mode: string; type: "blob" | "tree"; sha: string }>>();
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  const writeTree = (entries: Record<string, string>): string => {
    const byDir = new Map<string, Record<string, string>>();
    const tree: Array<{ path: string; mode: string; type: "blob" | "tree"; sha: string }> = [];
    for (const [path, text] of Object.entries(entries)) {
      const [head, ...rest] = path.split("/");
      if (rest.length > 0) byDir.set(head!, { ...(byDir.get(head!) ?? {}), [rest.join("/")]: text });
      else {
        const blob = sha();
        blobs.set(blob, text);
        tree.push({ path: head!, mode: head === "run.sh" ? "100755" : "100644", type: "blob", sha: blob });
      }
    }
    for (const [dir, inner] of byDir) tree.push({ path: dir, mode: "040000", type: "tree", sha: writeTree(inner) });
    const id = sha();
    trees.set(id, tree);
    return id;
  };
  const root = sha();
  commits.set(root, { tree: writeTree(files), parents: [], message: "initial" });
  const refs = new Map([["feature/x", root]]);
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname);
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    if (method !== "GET") writes.push({ method, path, body });
    if (path === "/repos/acme/widgets/pulls/7") return json({ head: { ref: "feature/x", sha: root, repo: { full_name: "fork/widgets" } } });
    const base = "/repos/fork/widgets/git";
    if (method === "GET" && path.startsWith(`${base}/ref/heads/`)) {
      const at = refs.get(path.slice(`${base}/ref/heads/`.length));
      return at === undefined ? json({ message: "Not Found" }, 404) : json({ object: { sha: at } });
    }
    if (method === "GET" && path.startsWith(`${base}/commits/`)) return json({ tree: { sha: commits.get(path.slice(`${base}/commits/`.length))!.tree } });
    if (method === "GET" && path.startsWith(`${base}/trees/`)) return json({ tree: trees.get(path.slice(`${base}/trees/`.length)) });
    if (method === "GET" && path.startsWith(`${base}/blobs/`)) return json({ content: Buffer.from(blobs.get(path.slice(`${base}/blobs/`.length))!).toString("base64"), encoding: "base64" });
    if (method === "POST" && path === `${base}/blobs`) {
      const id = sha();
      blobs.set(id, body.content);
      return json({ sha: id });
    }
    if (method === "POST" && path === `${base}/trees`) {
      const id = sha();
      const replaced = new Set(body.tree.map((entry: { path: string }) => entry.path));
      trees.set(id, [...trees.get(body.base_tree)!.filter((entry) => !replaced.has(entry.path)), ...body.tree]);
      return json({ sha: id });
    }
    if (method === "POST" && path === `${base}/commits`) {
      const id = sha();
      commits.set(id, { tree: body.tree, parents: body.parents, message: body.message });
      return json({ sha: id, html_url: `https://github.com/fork/widgets/commit/${id}` });
    }
    if (method === "PATCH" && path === `${base}/refs/heads/feature/x`) {
      refs.set("feature/x", body.sha);
      return json({ object: { sha: body.sha } });
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  });
  return { fetch, writes, refs, commits, blobs, trees };
}

const item = (path: string, startLine: number, endLine: number, expected: string[], replacement: string[], id = `review-comment:${startLine}`): SuggestionItem => ({ id, path, startLine, endLine, expected, replacement });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commitSuggestionsToPr", () => {
  it("makes one commit on the head branch with every file's suggestions, keeping each file's mode", async () => {
    const git = stubGitData({ "src/a.ts": "one\ntwo\nthree\n", "run.sh": "echo hi\n" });
    vi.stubGlobal("fetch", git.fetch);
    const result = await commitSuggestionsToPr("acme/widgets", 7, [item("src/a.ts", 3, 3, ["three"], ["THREE"]), item("src/a.ts", 1, 1, ["one"], []), item("run.sh", 1, 1, ["echo hi"], ["echo hello"])], null, "token");
    const head = git.refs.get("feature/x")!;
    expect(result).toEqual({ applied: 3, commitUrl: `https://github.com/fork/widgets/commit/${head}` });
    const commit = git.commits.get(head)!;
    expect(commit.message).toBe("Apply suggestions from code review");
    expect(commit.parents).toHaveLength(1);
    const tree = git.trees.get(commit.tree)!;
    expect(tree.find((entry) => entry.path === "run.sh")).toMatchObject({ mode: "100755" });
    expect(git.blobs.get(tree.find((entry) => entry.path === "run.sh")!.sha)).toBe("echo hello\n");
    expect(git.blobs.get(tree.find((entry) => entry.path === "src/a.ts")!.sha)).toBe("two\nTHREE\n");
    expect(git.writes.map((write) => `${write.method} ${write.path}`)).toEqual([
      "POST /repos/fork/widgets/git/blobs",
      "POST /repos/fork/widgets/git/blobs",
      "POST /repos/fork/widgets/git/trees",
      "POST /repos/fork/widgets/git/commits",
      "PATCH /repos/fork/widgets/git/refs/heads/feature/x",
    ]);
    expect(git.writes.at(-1)!.body).toEqual({ sha: head, force: false });
  });

  it("writes nothing when any item's lines moved on the branch, naming them", async () => {
    const git = stubGitData({ "src/a.ts": "one\ntwo\n" });
    vi.stubGlobal("fetch", git.fetch);
    await expect(commitSuggestionsToPr("acme/widgets", 7, [item("src/a.ts", 1, 1, ["one"], ["ONE"]), item("src/a.ts", 2, 2, ["2"], ["TWO"])], "Tidy", "token")).rejects.toThrow(/src\/a\.ts:L2 changed since the suggestion was made/u);
    await expect(commitSuggestionsToPr("acme/widgets", 7, [item("src/gone.ts", 1, 1, ["x"], ["y"])], null, "token")).rejects.toThrow(/src\/gone\.ts is not on the pull request's branch/u);
    expect(git.writes).toEqual([]);
  });
});

describe("createSuggestions", () => {
  const prTicket = { id: "t1", pr: { repo: "acme/widgets", number: 7 }, threadId: null } as unknown as Ticket;
  const ctx = (warn: (message: string) => void) =>
    ({
      bb: { log: { warn } },
      settings: { get: async () => ({ githubToken: "token", ghPath: "" }) },
      stmts: { byId: { get: () => undefined } },
    }) as unknown as KanbanContext;

  it("resolves each applied GitHub thread after the commit, and a failed resolve doesn't fail the apply", async () => {
    const git = stubGitData({ "a.ts": "one\ntwo\n" });
    vi.stubGlobal("fetch", git.fetch);
    const resolved: string[] = [];
    const warnings: string[] = [];
    const prComments = {
      setResolved: async (id: string) => {
        if (id === "review-comment:2") throw new Error("GitHub said no");
        resolved.push(id);
        return {} as PrComment;
      },
      syncPrComments: async () => {},
    };
    const suggestions = createSuggestions(ctx((message) => warnings.push(message)), { prComments: prComments as never });
    const result = await suggestions.applySuggestions(prTicket, [item("a.ts", 1, 1, ["one"], ["ONE"]), item("a.ts", 2, 2, ["two"], ["TWO"])], null);
    expect(result.applied).toBe(2);
    expect(resolved).toEqual(["review-comment:1"]);
    expect(warnings).toEqual([expect.stringContaining("review-comment:2")]);
  });
});

describe("commentsBody", () => {
  const comment = (body: string) => ({ id: "local:1", kind: "review-comment", author: "you", path: "a.ts", line: 2, side: "RIGHT", startLine: null, startSide: null, inReplyTo: null, url: "", body }) as unknown as PrComment;
  const ticket = { id: "t1", pr: null } as unknown as Ticket;

  it("tells the agent a suggestion block is the exact replacement, only when one is there", () => {
    expect(commentsBody(ticket, [comment("```suggestion\nconst a = 1;\n```")])).toContain("exact replacement text");
    expect(commentsBody(ticket, [comment("rename this")])).not.toContain("exact replacement");
  });
});
