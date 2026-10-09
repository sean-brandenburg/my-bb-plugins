import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, resolve } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { defaultHostId } from "./shared/hosts.js";

type FolderSdk = Pick<BbPluginApi["sdk"], "hosts" | "projects">;

export interface FolderInspection {
  path: string | null;
  isDirectory: boolean;
  projectId: string | null;
}

export function expandFolderPath(raw: string, home = homedir()): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const expanded =
    trimmed === "~"
      ? home
      : trimmed.startsWith("~/")
        ? `${home}${trimmed.slice(1)}`
        : trimmed;
  if (!isAbsolute(expanded)) return null;
  const resolved = resolve(expanded);
  return resolved.length > 1 ? resolved.replace(/\/+$/, "") : resolved;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function findProjectAtPath(
  sdk: FolderSdk,
  path: string,
): Promise<string | null> {
  const projects = await sdk.projects.list();
  for (const project of projects) {
    if (project.kind === "personal") continue;
    if (project.sources.some((source) => resolve(source.path) === path)) {
      return project.id;
    }
  }
  return null;
}

export async function inspectFolder(
  sdk: FolderSdk,
  raw: string,
): Promise<FolderInspection> {
  const path = expandFolderPath(raw);
  if (path === null) return { path: null, isDirectory: false, projectId: null };
  if (!(await isDirectory(path))) {
    return { path, isDirectory: false, projectId: null };
  }
  return {
    path,
    isDirectory: true,
    projectId: await findProjectAtPath(sdk, path),
  };
}

export async function openProjectFolder(
  sdk: FolderSdk,
  raw: string,
  hostId?: string,
): Promise<{ projectId: string; created: boolean }> {
  const path = expandFolderPath(raw);
  if (path === null) throw new Error(`Not an absolute path: ${raw}`);
  if (!(await isDirectory(path))) throw new Error(`Not a folder: ${path}`);
  const existing = await findProjectAtPath(sdk, path);
  if (existing !== null) return { projectId: existing, created: false };
  const project = await sdk.projects.create({
    name: basename(path) || path,
    source: {
      type: "local_path",
      path,
      hostId: hostId ?? defaultHostId(await sdk.hosts.list()),
    },
  });
  return { projectId: project.id, created: true };
}
