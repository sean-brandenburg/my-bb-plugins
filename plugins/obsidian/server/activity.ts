// Per-day log of the bb threads the user worked on, kept in the plugin's
// SQLite database for the dashboard and the wrap-up routine.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ActivityItem } from "../rpc-contract.ts";
import { daysBefore, localDateKey } from "../shared/daily.ts";
import { excerpt } from "./text.ts";

const ACTIVITY_TEXT_LIMIT = 600;
const ACTIVITY_RETENTION_DAYS = 90;

export function createActivityLog(
  bb: BbPluginApi,
  options: {
    /** Whether to record a thread that just went idle. */
    shouldRecord: (thread: { originPluginId?: string | null; projectId: string }) => Promise<boolean>;
    projectName: (projectId: string) => Promise<string>;
  },
) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS activity (
      day TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      title TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      first_at INTEGER NOT NULL,
      last_at INTEGER NOT NULL,
      turns INTEGER NOT NULL,
      last_text TEXT NOT NULL,
      PRIMARY KEY (day, thread_id)
    )`,
  ]);
  const upsertActivity = db.prepare(`
    INSERT INTO activity (day, thread_id, title, project_id, project_name, first_at, last_at, turns, last_text)
    VALUES (@day, @threadId, @title, @projectId, @projectName, @at, @at, 1, @lastText)
    ON CONFLICT (day, thread_id) DO UPDATE SET
      title = excluded.title,
      project_name = excluded.project_name,
      last_at = excluded.last_at,
      turns = activity.turns + 1,
      last_text = CASE WHEN excluded.last_text = '' THEN activity.last_text ELSE excluded.last_text END
  `);
  const selectActivity = db.prepare(`
    SELECT thread_id AS threadId, title, project_id AS projectId, project_name AS projectName,
      first_at AS firstAt, last_at AS lastAt, turns, last_text AS lastText
    FROM activity WHERE day = ? ORDER BY first_at
  `);
  const pruneActivity = db.prepare(`DELETE FROM activity WHERE day < ?`);
  const forgetThreadActivity = db.prepare(`DELETE FROM activity WHERE thread_id = ?`);

  bb.events.on("thread.idle", async ({ thread, lastAssistantText }) => {
    if (!(await options.shouldRecord(thread))) return;
    const now = Date.now();
    upsertActivity.run({
      day: localDateKey(new Date(now)),
      threadId: thread.id,
      title: thread.title ?? thread.titleFallback ?? thread.id,
      projectId: thread.projectId,
      projectName: await options.projectName(thread.projectId),
      at: now,
      lastText: excerpt(lastAssistantText ?? "", ACTIVITY_TEXT_LIMIT),
    });
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    forgetThreadActivity.run(thread.id);
  });

  bb.background.schedule("prune-activity", "17 3 * * *", () => {
    pruneActivity.run(localDateKey(daysBefore(new Date(), ACTIVITY_RETENTION_DAYS)));
  });

  return {
    forDay: (dateKey: string): ActivityItem[] => selectActivity.all(dateKey) as ActivityItem[],
  };
}
