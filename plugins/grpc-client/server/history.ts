import { PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { callResultSchema, type CallResult, type Launch, type MetadataEntry } from "../contract.ts";
import { MASKED_VALUE } from "../shared/common.ts";
import type { CallRequest, HistoryEntry } from "./rpc-contract.ts";

export type CallOrigin = "ui" | "cli";

const HISTORY_LIMIT = 500;
const HISTORY_RESULT_MAX_BYTES = 256 * 1024;
const HISTORY_MESSAGE_MAX_CHARS = 2000;
const SENSITIVE_HEADER = /authorization|cookie|token|secret|password|api-?key|session|auth|jwt|assertion/i;

const MIGRATIONS = [
  `CREATE TABLE calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      origin TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      source TEXT NOT NULL,
      method TEXT NOT NULL,
      request TEXT NOT NULL,
      metadata TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      duration_ms INTEGER NOT NULL
    )`,
  `ALTER TABLE calls ADD COLUMN result TEXT`,
];

interface CallRow {
  id: number;
  at: number;
  origin: string;
  endpoint: string;
  source: string;
  method: string;
  request: string;
  metadata: string;
  ok: number;
  status: string;
  message: string;
  duration_ms: number;
}

/** History never stores credentials: values of auth, endpoint and credential-looking headers are masked. */
export function maskMetadata(launch: Launch, metadata: MetadataEntry[]): MetadataEntry[] {
  const secret = new Set([...Object.values(launch.auth.profiles).map((profile) => profile.header), ...Object.keys(launch.endpoint.headers)]);
  return metadata.map(({ name, value }) => ({ name, value: secret.has(name) || SENSITIVE_HEADER.test(name) ? MASKED_VALUE : value }));
}

/** The result as kept in history: request metadata is already masked by the host; huge bodies are dropped. */
export function storedResult(result: CallResult): string {
  const json = JSON.stringify(result);
  if (Buffer.byteLength(json) <= HISTORY_RESULT_MAX_BYTES) return json;
  const note = `(${result.responses.length} response message(s), ${Buffer.byteLength(json)} bytes: too large to keep in history)`;
  return JSON.stringify({ ...result, responses: [note] });
}

function toEntry(row: CallRow): HistoryEntry {
  return {
    id: row.id,
    at: row.at,
    origin: row.origin,
    endpoint: row.endpoint,
    source: row.source,
    method: row.method,
    request: row.request,
    metadata: JSON.parse(row.metadata) as MetadataEntry[],
    ok: row.ok === 1,
    status: row.status,
    message: row.message,
    durationMs: row.duration_ms,
  };
}

/** Recent calls from the page and the CLI, newest first, capped at HISTORY_LIMIT rows. */
export function createHistory(storage: BbPluginApi["storage"], onChange: () => void) {
  const db = storage.database();
  storage.migrate(db, MIGRATIONS);

  function select(limit: number, id?: number): HistoryEntry[] {
    const rows = db
      .prepare(
        `SELECT id, at, origin, endpoint, source, method, request, metadata, ok, status, message, duration_ms
         FROM calls ${id === undefined ? "" : "WHERE id = ?"} ORDER BY id DESC LIMIT ?`,
      )
      .all(...(id === undefined ? [limit] : [id, limit])) as CallRow[];
    return rows.map(toEntry);
  }

  return {
    record(origin: CallOrigin, launch: Launch, request: CallRequest, result: CallResult): void {
      db.prepare(
        `INSERT INTO calls (at, origin, endpoint, source, method, request, metadata, ok, status, message, duration_ms, result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        Date.now(),
        origin,
        launch.endpoint.name,
        launch.source.name,
        request.method,
        request.request,
        JSON.stringify(maskMetadata(launch, request.metadata)),
        result.ok ? 1 : 0,
        result.status.name,
        (result.error ?? result.status.message).slice(0, HISTORY_MESSAGE_MAX_CHARS),
        result.durationMs,
        storedResult(result),
      );
      db.prepare(`DELETE FROM calls WHERE id <= (SELECT id FROM calls ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(HISTORY_LIMIT);
      onChange();
    },

    list(limit: number): HistoryEntry[] {
      return select(limit);
    },

    entry(id: number): HistoryEntry | undefined {
      return select(1, id)[0];
    },

    /** The recorded response, or null for calls recorded before responses were kept. */
    result(id: number): CallResult | null {
      const row = db.prepare(`SELECT result FROM calls WHERE id = ?`).get(id) as { result: string | null } | undefined;
      if (row === undefined) throw new PluginCliError(`No history entry ${id}`, { code: "not_found", hint: "Run `bb grpc history` to see ids." });
      if (row.result === null) return null;
      const parsed = callResultSchema.safeParse(JSON.parse(row.result));
      return parsed.success ? parsed.data : null;
    },

    delete(ids: number[]): number {
      const remove = db.prepare(`DELETE FROM calls WHERE id = ?`);
      let deleted = 0;
      db.transaction(() => {
        for (const id of ids) deleted += remove.run(id).changes;
      })();
      if (deleted > 0) onChange();
      return deleted;
    },

    clear(): number {
      const cleared = db.prepare(`DELETE FROM calls`).run().changes;
      onChange();
      return cleared;
    },
  };
}
export type History = ReturnType<typeof createHistory>;
