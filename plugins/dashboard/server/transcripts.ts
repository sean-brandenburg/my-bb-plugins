import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { UsageRecord } from "../usage-model.js";

interface FileState {
  /** Bytes read so far, always at a line boundary. */
  offset: number;
  size: number;
}

export interface SessionInfo {
  title: string | null;
  cwd: string | null;
}

/**
 * Token usage from Claude Code's session transcripts (`~/.claude/projects/<dir>/<session>.jsonl`,
 * and `<session>/subagents/*.jsonl` for subagents, which carry their parent's session id).
 * Transcripts only grow, so each refresh reads just the bytes added since the last one. Claude
 * Code writes one line per content block of a response, each with the response's full usage, so
 * records are keyed by message id.
 */
export class TranscriptIndex {
  private readonly files = new Map<string, FileState>();
  private readonly records = new Map<string, UsageRecord>();
  private readonly sessions = new Map<string, SessionInfo>();

  constructor(private readonly root: string) {}

  async refresh(sinceMs: number): Promise<void> {
    for (const path of await this.transcriptPaths()) {
      let info;
      try {
        info = await stat(path);
      } catch {
        continue;
      }
      if (info.mtimeMs < sinceMs) continue;
      const known = this.files.get(path);
      // A file that shrank was rewritten, so it's read again from the start.
      const offset = known !== undefined && known.size <= info.size ? known.offset : 0;
      if (known !== undefined && known.size === info.size && offset === known.offset) continue;
      const read = await this.readFrom(path, offset, info.size);
      this.files.set(path, { offset: read, size: info.size });
    }
    for (const [id, record] of this.records) if (record.at < sinceMs) this.records.delete(id);
  }

  usage(): UsageRecord[] {
    return [...this.records.values()];
  }

  session(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  private async transcriptPaths(): Promise<string[]> {
    const paths: string[] = [];
    let projects;
    try {
      projects = await readdir(this.root, { withFileTypes: true });
    } catch {
      return paths;
    }
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const dir = join(this.root, project.name);
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) paths.push(join(dir, entry.name));
        else if (entry.isDirectory()) {
          const subagents = join(dir, entry.name, "subagents");
          const agents = await readdir(subagents).catch(() => [] as string[]);
          for (const agent of agents) if (agent.endsWith(".jsonl")) paths.push(join(subagents, agent));
        }
      }
    }
    return paths;
  }

  /** Reads whole lines from `offset` up to `size`; returns the offset after the last complete one. */
  private async readFrom(path: string, offset: number, size: number): Promise<number> {
    if (size <= offset) return offset;
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(size - offset);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      const end = buffer.lastIndexOf(0x0a, bytesRead - 1);
      if (end === -1) return offset;
      for (const line of buffer.toString("utf8", 0, end).split("\n")) this.readLine(line);
      return offset + end + 1;
    } finally {
      await handle.close();
    }
  }

  private readLine(line: string): void {
    const assistant = line.includes('"type":"assistant"') && line.includes('"usage"');
    const title = line.includes('"type":"ai-title"');
    if (!assistant && !title) return;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : null;
    if (sessionId === null) return;
    const session = this.sessions.get(sessionId) ?? { title: null, cwd: null };
    if (entry.type === "ai-title" && typeof entry.aiTitle === "string") {
      this.sessions.set(sessionId, { ...session, title: entry.aiTitle });
      return;
    }
    if (entry.type !== "assistant") return;
    if (session.cwd === null && typeof entry.cwd === "string") this.sessions.set(sessionId, { ...session, cwd: entry.cwd });
    const message = entry.message;
    const usage = message?.usage;
    const at = Date.parse(entry.timestamp);
    if (typeof message?.id !== "string" || usage === undefined || Number.isNaN(at) || this.records.has(message.id)) return;
    this.records.set(message.id, {
      at,
      sessionId,
      input: count(usage.input_tokens),
      output: count(usage.output_tokens),
      cacheRead: count(usage.cache_read_input_tokens),
      cacheWrite: count(usage.cache_creation_input_tokens),
    });
  }
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
