import type { WorktreeRow } from "./rpc-contract.js";

/** Only a clean worktree that no live thread uses can be removed; anything else could lose work. */
export function canCleanUp(row: Pick<WorktreeRow, "unused" | "tree">): boolean {
  return row.unused && row.tree === "clean";
}
