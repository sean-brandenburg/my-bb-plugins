import { localEnvironmentPath, splitUnifiedDiff } from "bb-diff-view/server";
import type { Ticket } from "../../shared/board";
import type { TicketDiff } from "../../shared/diff";
import { narrativeDeltaSchema, narrativePatchFileSchema, type Narrative, type NarrativeDelta, type NarrativeRevision } from "../../shared/tour";
import type { KanbanContext } from "../context";
import { rowToNarrative, type NarrativeRow } from "../db/rows";
import { github, resolveToken } from "../github";
import { execFileAsync } from "../util";
import { z } from "zod";

type PatchFile = z.infer<typeof narrativePatchFileSchema>;

interface SnapshotRow {
  narrative_id: string;
  previous_id: string | null;
  head: string | null;
  dirty: number;
  files: string;
  delta: string | null;
}

/** Where the subject's code was when a narrative was asked for. */
export interface NarrativeHead {
  head: string | null;
  dirty: boolean;
}

/** A newer narrative keeps this many earlier ones readable; older ones drop out of the story. */
const STORY_REVISIONS = 8;

export function snapshotFiles(diff: TicketDiff): PatchFile[] {
  return diff.files.map((file) => ({ path: file.path, previousPath: file.previousPath, status: file.status, patch: file.patch }));
}

/** Same files with the same patches: nothing a narrative would say differently. */
export function samePatches(a: readonly PatchFile[], b: readonly PatchFile[]): boolean {
  if (a.length !== b.length) return false;
  const byPath = new Map(a.map((file) => [file.path, file.patch] as const));
  return b.every((file) => byPath.has(file.path) && byPath.get(file.path) === file.patch);
}

/** The diff each narrative was written against, kept so an old narrative still renders and a new one can explain the delta. */
export function createNarrativeSnapshots(ctx: KanbanContext) {
  const { bb, db, settings } = ctx;
  const insert = db.prepare(
    `INSERT OR REPLACE INTO narrative_snapshots (narrative_id, previous_id, head, dirty, files, delta) VALUES (@narrative_id, @previous_id, @head, @dirty, @files, @delta)`,
  );
  const byId = db.prepare<[string], SnapshotRow>(`SELECT * FROM narrative_snapshots WHERE narrative_id = ?`);
  const narrativeById = db.prepare<[string], NarrativeRow>(`SELECT * FROM narratives WHERE id = ?`);
  const withSnapshots = db.prepare<[string, number], NarrativeRow & SnapshotRow>(
    `SELECT n.*, s.previous_id, s.head, s.dirty, s.files, s.delta FROM narratives n JOIN narrative_snapshots s ON s.narrative_id = n.id
     WHERE n.ticket_id = ? AND n.status = 'completed' ORDER BY n.created_at DESC LIMIT ?`,
  );
  const latestCompletedWithSnapshot = db.prepare<[string], NarrativeRow>(
    `SELECT n.* FROM narratives n JOIN narrative_snapshots s ON s.narrative_id = n.id WHERE n.ticket_id = ? AND n.status = 'completed' ORDER BY n.created_at DESC LIMIT 1`,
  );
  // Narratives go when their card is deleted; their snapshots follow here rather than in every delete path.
  db.prepare(`DELETE FROM narrative_snapshots WHERE narrative_id NOT IN (SELECT id FROM narratives)`).run();

  async function git(dir: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd: dir, timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  }

  /** `git diff --no-index` exits 1 when the files differ, which is the only case asked for here. */
  async function gitDiffNoIndex(dir: string, path: string): Promise<string> {
    try {
      return await git(dir, ["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", path]);
    } catch (error) {
      const stdout = (error as { stdout?: unknown }).stdout;
      if (typeof stdout === "string" && stdout !== "") return stdout;
      throw error;
    }
  }

  /** The card thread's checkout on this machine, for local cards. */
  async function localDir(subject: Ticket): Promise<string | null> {
    if (subject.threadId === null) return null;
    try {
      const thread = await bb.sdk.threads.get({ threadId: subject.threadId });
      return thread.environmentId === null ? null : await localEnvironmentPath(bb.sdk, thread.environmentId);
    } catch {
      return null;
    }
  }

  async function headOf(subject: Ticket, diff: TicketDiff): Promise<NarrativeHead> {
    if (subject.pr !== null) return { head: diff.headSha, dirty: false };
    const dir = await localDir(subject);
    if (dir === null) return { head: null, dirty: true };
    try {
      const [head, status] = await Promise.all([git(dir, ["rev-parse", "HEAD"]), git(dir, ["status", "--porcelain"])]);
      return { head: head.trim(), dirty: status.trim() !== "" };
    } catch {
      return { head: null, dirty: true };
    }
  }

  /** Paths either diff touches, under both names of a rename, so the delta leaves out what only the base branch changed. */
  function touchedPaths(a: readonly PatchFile[], b: readonly PatchFile[]): Set<string> {
    return new Set([...a, ...b].flatMap((file) => (file.previousPath === null ? [file.path] : [file.path, file.previousPath])));
  }

  async function computeDelta(subject: Ticket, previous: { head: string | null; dirty: boolean; files: PatchFile[] }, current: NarrativeHead & { files: PatchFile[] }): Promise<NarrativeDelta | null> {
    if (previous.head === null) return null;
    const paths = touchedPaths(previous.files, current.files);
    const keep = (file: PatchFile) => paths.has(file.path) || (file.previousPath !== null && paths.has(file.previousPath));
    if (subject.pr !== null) {
      if (current.head === null || current.head === previous.head) return null;
      const auth = await resolveToken(settings);
      if (auth === null) return null;
      try {
        const compare = await github<{ files?: Array<{ filename: string; previous_filename?: string; status: string; patch?: string }> }>(
          `/repos/${subject.pr.repo}/compare/${previous.head}...${current.head}`,
          auth.token,
        );
        const files = (compare.files ?? []).map((file) => ({ path: file.filename, previousPath: file.previous_filename ?? null, status: file.status, patch: file.patch ?? null })).filter(keep);
        // A three-dot compare runs from the merge base, so after a rebase it also carries the base branch's edits to these files.
        return { fromHead: previous.head, toHead: current.head, files, note: null };
      } catch (error) {
        bb.log.warn(`narrative delta ${previous.head}...${current.head}: ${String(error)}`);
        return null;
      }
    }
    const dir = await localDir(subject);
    if (dir === null) return null;
    try {
      // Against the working tree, so uncommitted edits since the earlier narrative count; untracked files need --no-index.
      const tracked = await git(dir, ["diff", "--no-color", "--no-ext-diff", "-M", previous.head, "--", ...paths]);
      const untracked = (await git(dir, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...paths])).split("\0").filter((path) => path !== "");
      const added = await Promise.all(untracked.map((path) => gitDiffNoIndex(dir, path)));
      const files = splitUnifiedDiff([tracked, ...added].join("\n")).map((file) => ({ path: file.path, previousPath: file.previousPath, status: file.status, patch: file.patch })).filter(keep);
      const note = previous.dirty ? "The earlier narrative was written over uncommitted changes, so this delta runs from its last commit and can include lines it already covered." : null;
      return { fromHead: previous.head, toHead: current.head, files, note };
    } catch (error) {
      bb.log.warn(`narrative delta from ${previous.head}: ${String(error)}`);
      return null;
    }
  }

  function parseFiles(json: string): PatchFile[] {
    const parsed = z.array(narrativePatchFileSchema).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  }

  function parseDelta(json: string | null): NarrativeDelta | null {
    if (json === null) return null;
    const parsed = narrativeDeltaSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  }

  function record(narrativeId: string, previousId: string | null, head: NarrativeHead, files: PatchFile[], delta: NarrativeDelta | null): void {
    insert.run({ narrative_id: narrativeId, previous_id: previousId, head: head.head, dirty: head.dirty ? 1 : 0, files: JSON.stringify(files), delta: delta === null ? null : JSON.stringify(delta) });
  }

  function get(narrativeId: string): { previousId: string | null; head: string | null; dirty: boolean; files: PatchFile[]; delta: NarrativeDelta | null } | null {
    const row = byId.get(narrativeId);
    if (row === undefined) return null;
    return { previousId: row.previous_id, head: row.head, dirty: row.dirty === 1, files: parseFiles(row.files), delta: parseDelta(row.delta) };
  }

  function latestCompleted(ticketId: string): Narrative | null {
    const row = latestCompletedWithSnapshot.get(ticketId);
    return row === undefined ? null : rowToNarrative(row);
  }

  /** Completed narratives that carry steps, oldest first. */
  function revisions(ticketId: string): NarrativeRevision[] {
    return withSnapshots
      .all(ticketId, STORY_REVISIONS)
      .reverse()
      .map((row) => ({ narrative: rowToNarrative(row), head: row.head, dirty: row.dirty === 1, previousId: row.previous_id, files: parseFiles(row.files), delta: parseDelta(row.delta) }))
      .filter((revision) => (revision.narrative.report?.steps.length ?? 0) > 0);
  }

  return { headOf, computeDelta, record, get, latestCompleted, revisions, narrativeRow: (id: string) => narrativeById.get(id) };
}

export type NarrativeSnapshots = ReturnType<typeof createNarrativeSnapshots>;
