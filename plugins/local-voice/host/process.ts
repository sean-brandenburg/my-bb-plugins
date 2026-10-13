import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";

const MAX_STDERR_CHARS = 4 * 1024;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? nodePath.join(os.homedir(), path.slice(1)) : path;
}

/** The absolute path `command` runs as, searching PATH for a bare name; null when it isn't an executable. */
export async function resolveExecutable(command: string, path = process.env.PATH ?? ""): Promise<string | null> {
  const expanded = expandHome(command);
  const candidates = expanded.includes("/")
    ? [nodePath.resolve(expanded)]
    : path.split(nodePath.delimiter).filter(Boolean).map((dir) => nodePath.join(dir, expanded));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Runs a command to completion, rejecting on a non-zero exit with the tail of its stderr. */
export function run(command: string, args: string[], options: { timeoutMs: number; signal?: AbortSignal }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: os.homedir(), stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      outcome();
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`${nodePath.basename(command)} was cancelled`)));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`${nodePath.basename(command)} timed out after ${options.timeoutMs / 1000}s`)));
    }, options.timeoutMs);
    if (options.signal?.aborted) onAbort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_CHARS);
    });
    child.on("error", (error) => finish(() => reject(new Error(`Could not run ${command}: ${error.message}`))));
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve();
        else reject(new Error(`${nodePath.basename(command)} exited with ${code}: ${stderr.trim() || "no output"}`));
      });
    });
  });
}
