import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { SyncStatus } from "../shared/board";
import type { KanbanDatabase, Statements } from "./db/statements";
import type { KanbanSettings } from "./settings";

/** What every server module shares: the host API, settings, storage, and the live sync status. */
export interface KanbanContext {
  bb: BbPluginApi;
  settings: KanbanSettings;
  db: KanbanDatabase;
  stmts: Statements;
  /** Mutated in place: RPC and CLI hand this object out as the current status. */
  sync: SyncStatus;
  /** Tell open boards to refetch. */
  publish(): void;
}
