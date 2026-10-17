import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./rpc-contract.js";
import { createWorktreeService } from "./server/worktrees.js";

export default async function plugin(bb: BbPluginApi) {
  const worktrees = createWorktreeService(bb);
  bb.rpc.register(rpcContract, {
    worktrees: ({ refresh }) => worktrees.list(refresh),
    async cleanup_worktree({ environmentId }) {
      await worktrees.cleanUp(environmentId);
      return { ok: true as const };
    },
  });
}
