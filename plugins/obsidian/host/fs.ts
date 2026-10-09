import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

export async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await fs.lstat(path)).isSymbolicLink();
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

/** Writes without following a symlink at the final path component. */
export async function writeNoFollow(absolute: string, content: string): Promise<void> {
  const { O_WRONLY, O_CREAT, O_TRUNC, O_NOFOLLOW } = fsConstants;
  const handle = await fs.open(absolute, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0o644);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

/** Reads without following a symlink at the final path component. */
export async function readNoFollow(absolute: string): Promise<{ bytes: Buffer; mtimeMs: number }> {
  const handle = await fs.open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const [bytes, stat] = await Promise.all([handle.readFile(), handle.stat()]).finally(() => handle.close());
  return { bytes, mtimeMs: stat.mtimeMs };
}
