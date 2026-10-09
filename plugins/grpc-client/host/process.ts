import { spawn } from "node:child_process";
import os from "node:os";
import nodePath from "node:path";
import { AUTH_COMMAND_TIMEOUT_MS } from "../contract.ts";
import { errorMessage } from "../shared/common.ts";

const MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_CHARS = 8 * 1024;

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? nodePath.join(os.homedir(), path.slice(1)) : path;
}

export function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; stdin?: string; timeoutMs: number; signal?: AbortSignal },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // Its own process group, so a timeout also kills grandchildren that hold the pipes open.
    const child = spawn(expandHome(command), args, {
      cwd: os.homedir(),
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      outcome();
    };
    const killGroup = () => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const onAbort = () => {
      killGroup();
      finish(() => reject(new Error(`${command} was cancelled`)));
    };
    const timer = setTimeout(() => {
      killGroup();
      finish(() => reject(new Error(`${command} timed out after ${Math.round(options.timeoutMs / 1000)}s`)));
    }, options.timeoutMs);
    if (options.signal?.aborted) onAbort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_STDOUT_BYTES) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_CHARS);
    });
    child.on("error", (error) => {
      const hint = (error as NodeJS.ErrnoException).code === "ENOENT" ? ` (is "${command}" installed and on PATH?)` : "";
      finish(() => reject(new Error(`Could not run ${command}: ${error.message}${hint}`)));
    });
    child.on("close", (code) => {
      finish(() => {
        if (stdoutBytes > MAX_STDOUT_BYTES) reject(new Error(`${command} printed more than ${MAX_STDOUT_BYTES / 1024 / 1024} MiB`));
        else resolve({ code: code ?? 1, stdout: Buffer.concat(stdout).toString("utf8"), stderr });
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.stdin ?? "");
  });
}

export type ShellResult = { ok: true; value: string } | { ok: false; error: string };

/** Runs a user-configured shell command (an auth command); its trimmed stdout is the value. */
export async function runShell(command: string): Promise<ShellResult> {
  try {
    const result = await run("/bin/sh", ["-c", command], { timeoutMs: AUTH_COMMAND_TIMEOUT_MS });
    const value = result.stdout.trim();
    if (result.code !== 0) return { ok: false, error: `\`${command}\` exited with ${result.code}: ${result.stderr.trim().slice(-500)}` };
    if (value === "") return { ok: false, error: `\`${command}\` printed nothing` };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
