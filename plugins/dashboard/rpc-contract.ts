import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const worktreeRowSchema = z.object({
  environmentId: z.string(),
  projectId: z.string(),
  branchName: z.string().nullable(),
  path: z.string(),
  /** "unknown" when git status couldn't be read; the row then offers no cleanup. */
  tree: z.enum(["clean", "dirty", "unknown"]),
  changedFiles: z.number(),
  insertions: z.number(),
  deletions: z.number(),
  /** No thread outside the archive uses the worktree. */
  unused: z.boolean(),
  /** A live thread on the worktree, else the most recently archived one. */
  thread: z.object({ id: z.string(), title: z.string(), archived: z.boolean() }).nullable(),
  lastActiveAt: z.number(),
});

export type WorktreeRow = z.infer<typeof worktreeRowSchema>;

export const rpcContract = defineRpcContract({
  worktrees: {
    input: z.object({ refresh: z.boolean() }).strict(),
    output: z.object({
      rows: z.array(worktreeRowSchema),
      total: z.number(),
      /** Worktrees only hidden plugin threads use (kanban's review threads), by plugin and project. */
      held: z.array(z.object({ pluginId: z.string().nullable(), projectId: z.string(), count: z.number() })),
      checkedAt: z.number(),
    }),
  },
  cleanup_worktree: {
    input: z.object({ environmentId: z.string().min(1).max(128) }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
});
