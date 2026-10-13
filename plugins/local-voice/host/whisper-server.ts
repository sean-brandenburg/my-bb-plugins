import { execFile, spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { promisify } from "node:util";
import { errorMessage } from "./process.ts";

const LOAD_TIMEOUT_MS = 120_000;
const STOP_GRACE_MS = 3_000;
/** How long a failed start is reported instead of retried, so a bad model file doesn't respawn on every status poll. */
const FAILURE_BACKOFF_MS = 30_000;
const MAX_OUTPUT_CHARS = 2_000;

export interface Launch {
  /** Absolute path of the whisper-server executable. */
  binary: string;
  modelPath: string;
  threads: number;
  unloadAfterMinutes: number;
}

export interface Lease {
  dispose(): void;
}

interface Entry {
  key: string;
  unloadAfterMs: number;
  lease: Lease;
  child: ChildProcess | null;
  loaded: boolean;
  /** Stopped on purpose, which is not a failure. */
  stopped: boolean;
  exited: boolean;
  ready: Promise<number>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  output: string;
}

export interface WhisperServerDeps {
  pidFile: string;
  spawn?: typeof nodeSpawn;
  freePort?: () => Promise<number>;
  /** Resolves true once the server on `port` has its model loaded. */
  probe?: (port: number) => Promise<boolean>;
  now?: () => number;
  minuteMs?: number;
}

export function launchKey(launch: Launch): string {
  return JSON.stringify([launch.binary, launch.modelPath, launch.threads]);
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address !== null ? resolve(address.port) : reject(new Error("No free port"))));
    });
  });
}

/**
 * Builds that serve /health answer 503 while the model loads; older builds only listen once it has
 * loaded and have no /health, so a 404 also means ready.
 */
export async function probeHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) });
    await response.body?.cancel();
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

/** One whisper-server child kept warm between recordings, restarted when its launch settings change. */
export class WhisperServer {
  private current: Entry | null = null;
  private failure: { key: string; message: string; at: number } | null = null;
  /** Settings of a server unloaded for disuse; warming leaves it unloaded until the next recording. */
  private unloadedKey: string | null = null;
  private readonly spawn: typeof nodeSpawn;
  private readonly freePort: () => Promise<number>;
  private readonly probe: (port: number) => Promise<boolean>;
  private readonly now: () => number;
  private readonly minuteMs: number;
  private readonly pidFile: string;

  constructor(deps: WhisperServerDeps) {
    this.pidFile = deps.pidFile;
    this.spawn = deps.spawn ?? nodeSpawn;
    this.freePort = deps.freePort ?? freePort;
    this.probe = deps.probe ?? probeHealth;
    this.now = deps.now ?? Date.now;
    this.minuteMs = deps.minuteMs ?? 60_000;
  }

  isLoaded(launch: Launch): boolean {
    return this.current?.key === launchKey(launch) && this.current.loaded;
  }

  isRunning(): boolean {
    return this.current !== null;
  }

  /** Why the last start with these settings failed, while that failure is recent enough to hold off a retry. */
  recentFailure(launch: Launch): string | null {
    const failure = this.failure;
    if (failure === null || failure.key !== launchKey(launch) || this.now() - failure.at > FAILURE_BACKOFF_MS) return null;
    return failure.message;
  }

  /**
   * Starts loading the model ahead of a recording, unless it is already running, failed recently, or
   * was unloaded for disuse. Unlike `ensure`, it doesn't count as use, so it never delays the idle unload.
   * `retain` is called synchronously, so it may be a host handler's `experimental_retainWorker`.
   */
  warm(launch: Launch, retain: () => Lease): void {
    const key = launchKey(launch);
    if (this.current?.key === key) {
      this.current.unloadAfterMs = launch.unloadAfterMinutes * this.minuteMs;
      return;
    }
    if (this.unloadedKey === key || this.recentFailure(launch) !== null) return;
    this.stop();
    this.begin(launch, key, retain());
  }

  /** Starts (or reuses) the server for a recording and resolves its port once the model is loaded. */
  ensure(launch: Launch, retain: () => Lease): Promise<number> {
    const key = launchKey(launch);
    const failure = this.recentFailure(launch);
    if (failure !== null) return Promise.reject(new Error(failure));
    this.unloadedKey = null;
    let entry = this.current;
    if (entry === null || entry.key !== key) {
      this.stop();
      entry = this.begin(launch, key, retain());
    }
    entry.unloadAfterMs = launch.unloadAfterMinutes * this.minuteMs;
    this.touch(entry);
    return entry.ready;
  }

  /** Pushes back the idle unload after a recording. */
  touchIfRunning(): void {
    if (this.current !== null) this.touch(this.current);
  }

  /** Stops the server and keeps `warm` from reloading it until the next recording. */
  unload(): boolean {
    if (this.current !== null) this.unloadedKey = this.current.key;
    return this.stop();
  }

  stop(): boolean {
    const entry = this.current;
    if (entry === null) return false;
    this.current = null;
    entry.stopped = true;
    if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
    const child = entry.child;
    if (child === null || child.exitCode !== null || child.signalCode !== null) {
      entry.lease.dispose();
      return true;
    }
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, STOP_GRACE_MS).unref();
    return true;
  }

  private touch(entry: Entry): void {
    if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      if (this.current === entry) this.unload();
    }, entry.unloadAfterMs);
  }

  private begin(launch: Launch, key: string, lease: Lease): Entry {
    const entry: Entry = {
      key,
      unloadAfterMs: launch.unloadAfterMinutes * this.minuteMs,
      lease,
      child: null,
      loaded: false,
      stopped: false,
      exited: false,
      ready: Promise.resolve(0),
      idleTimer: null,
      output: "",
    };
    entry.ready = this.start(launch, entry);
    // The idle countdown starts again once loaded, so a slow load doesn't eat into it.
    entry.ready.then(() => {
      if (this.current === entry) this.touch(entry);
    }, () => {});
    entry.ready.catch((error: unknown) => {
      if (entry.stopped) return;
      this.failure = { key, message: errorMessage(error), at: this.now() };
      if (this.current === entry) this.stop();
    });
    this.current = entry;
    return entry;
  }

  private async start(launch: Launch, entry: Entry): Promise<number> {
    await this.killStale();
    const port = await this.freePort();
    if (entry.stopped) throw new Error("whisper-server was stopped before it started");
    const child = this.spawn(
      launch.binary,
      ["--model", launch.modelPath, "--host", "127.0.0.1", "--port", String(port), "--threads", String(launch.threads)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    entry.child = child;
    const record = (chunk: Buffer) => {
      entry.output = (entry.output + chunk.toString("utf8")).slice(-MAX_OUTPUT_CHARS);
    };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);
    const exited = new Promise<never>((_, reject) => {
      child.once("error", (error) => reject(new Error(`Could not start ${launch.binary}: ${error.message}`)));
      child.once("exit", (code, signal) => {
        entry.exited = true;
        entry.loaded = false;
        if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
        entry.lease.dispose();
        if (this.current === entry) {
          this.current = null;
          this.failure = { key: entry.key, message: `whisper-server exited (${code ?? signal}): ${lastLines(entry.output)}`, at: this.now() };
        }
        void this.forgetPid(child.pid);
        reject(new Error(`whisper-server exited (${code ?? signal}) before it loaded the model: ${lastLines(entry.output)}`));
      });
    });
    exited.catch(() => {});
    if (child.pid !== undefined) await writeFile(this.pidFile, String(child.pid)).catch(() => {});
    await Promise.race([this.waitUntilLoaded(port, entry), exited]);
    entry.loaded = true;
    return port;
  }

  private async waitUntilLoaded(port: number, entry: Entry): Promise<void> {
    const deadline = this.now() + LOAD_TIMEOUT_MS;
    while (!entry.stopped && !entry.exited) {
      if (await this.probe(port)) return;
      if (this.now() > deadline) throw new Error(`whisper-server did not load the model within ${LOAD_TIMEOUT_MS / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("whisper-server stopped while it loaded the model");
  }

  /** A crashed worker can't kill its child, so the next worker clears one a predecessor left running. */
  private async killStale(): Promise<void> {
    const pid = Number.parseInt(await readFile(this.pidFile, "utf8").catch(() => ""), 10);
    if (!Number.isInteger(pid) || pid <= 0) return;
    try {
      const { stdout } = await promisify(execFile)("ps", ["-p", String(pid), "-o", "comm="]);
      if (stdout.trim().endsWith("whisper-server")) process.kill(pid, "SIGTERM");
    } catch {}
    await rm(this.pidFile, { force: true });
  }

  /** A replacement server may already have written its own pid. */
  private async forgetPid(pid: number | undefined): Promise<void> {
    const recorded = await readFile(this.pidFile, "utf8").catch(() => null);
    if (recorded !== null && recorded.trim() === String(pid)) await rm(this.pidFile, { force: true });
  }
}

function lastLines(output: string): string {
  const lines = output.trim().split("\n").filter(Boolean);
  return lines.slice(-3).join(" | ") || "no output";
}
