import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { addTokens, NO_TOKENS, type Tokens } from "../../shared/spend";

interface FileState {
  /** Bytes read so far, always at a line boundary. */
  offset: number;
  size: number;
  tokens: Tokens;
  /** Message ids already counted. */
  seen: Set<string>;
}

/**
 * Token usage of given Claude Code sessions, read from their transcripts (`<root>/<dir>/<session>.jsonl`, and
 * `<session>/subagents/*.jsonl` for the subagents a session ran). The parsing follows the dashboard plugin's
 * TranscriptIndex, narrowed to the sessions asked for: transcripts only grow, so each refresh reads just the bytes
 * added since the last one, and Claude Code writes one line per content block of a response, each with the
 * response's full usage, so responses are counted once by message id.
 */
export class SessionTranscripts {
  private readonly files = new Map<string, FileState>();
  private readonly sessionFiles = new Map<string, Set<string>>();
  /** Every session file seen, by session id; a project folder is listed again only when its mtime moves. */
  private readonly sessionDirs = new Map<string, string>();
  private readonly dirMtimes = new Map<string, number>();

  constructor(private readonly root: string) {}

  async refresh(sessionIds: Iterable<string>): Promise<void> {
    const ids = [...new Set(sessionIds)];
    if (ids.some((id) => !this.sessionDirs.has(id))) await this.indexSessions();
    for (const id of ids) {
      const dir = this.sessionDirs.get(id);
      if (dir === undefined) continue;
      const paths = this.sessionFiles.get(id) ?? new Set<string>();
      this.sessionFiles.set(id, paths);
      paths.add(join(dir, `${id}.jsonl`));
      const subagents = join(dir, id, "subagents");
      for (const name of await readdir(subagents).catch(() => [] as string[])) if (name.endsWith(".jsonl")) paths.add(join(subagents, name));
      for (const path of paths) await this.readFile(path);
    }
  }

  tokens(sessionId: string): Tokens {
    let sum = NO_TOKENS;
    for (const path of this.sessionFiles.get(sessionId) ?? []) sum = addTokens(sum, this.files.get(path)?.tokens ?? NO_TOKENS);
    return sum;
  }

  private async indexSessions(): Promise<void> {
    const projects = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const dir = join(this.root, project.name);
      const mtime = await stat(dir).then((info) => info.mtimeMs, () => null);
      if (mtime === null || this.dirMtimes.get(dir) === mtime) continue;
      this.dirMtimes.set(dir, mtime);
      for (const name of await readdir(dir).catch(() => [] as string[])) {
        if (name.endsWith(".jsonl")) this.sessionDirs.set(name.slice(0, -".jsonl".length), dir);
      }
    }
  }

  private async readFile(path: string): Promise<void> {
    let size;
    try {
      size = (await stat(path)).size;
    } catch {
      return;
    }
    const known = this.files.get(path);
    if (known !== undefined && known.size === size) return;
    // A file that shrank was rewritten, so it's read again from the start.
    const state = known !== undefined && known.size <= size ? known : { offset: 0, size: 0, tokens: NO_TOKENS, seen: new Set<string>() };
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(size - state.offset);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, state.offset);
      const end = buffer.lastIndexOf(0x0a, bytesRead - 1);
      let tokens = state.tokens;
      if (end !== -1) {
        for (const line of buffer.toString("utf8", 0, end).split("\n")) tokens = addTokens(tokens, readLine(line, state.seen));
      }
      this.files.set(path, { offset: end === -1 ? state.offset : state.offset + end + 1, size, tokens, seen: state.seen });
    } finally {
      await handle.close();
    }
  }
}

function readLine(line: string, seen: Set<string>): Tokens {
  if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) return NO_TOKENS;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return NO_TOKENS;
  }
  const message = entry?.message;
  const usage = message?.usage;
  if (entry.type !== "assistant" || typeof message?.id !== "string" || usage === undefined || seen.has(message.id)) return NO_TOKENS;
  seen.add(message.id);
  return {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
  };
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
