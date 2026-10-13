import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import nodePath from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { WhisperEngine, WhisperModel } from "../contract.ts";
import { expandHome } from "./process.ts";

export function modelUrl(model: WhisperModel): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`;
}

export function downloadedModelPath(dataDir: string, model: WhisperModel): string {
  return nodePath.join(dataDir, "models", `ggml-${model}.bin`);
}

/** The ggml file whisper-server should load: the configured file, else the downloaded model. */
export function modelPathFor(engine: WhisperEngine, dataDir: string): string {
  return engine.modelPath.trim() === "" ? downloadedModelPath(dataDir, engine.model) : nodePath.resolve(expandHome(engine.modelPath.trim()));
}

export async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

/** Downloads a model next to a `.part` file and renames it into place, so a cancelled download never looks complete. */
export async function downloadModel(
  dataDir: string,
  model: WhisperModel,
  signal: AbortSignal,
): Promise<{ path: string; bytes: number; alreadyPresent: boolean }> {
  const path = downloadedModelPath(dataDir, model);
  const existing = await fileSize(path);
  if (existing !== null) return { path, bytes: existing, alreadyPresent: true };
  await mkdir(nodePath.dirname(path), { recursive: true });
  const partial = `${path}.${randomUUID()}.part`;
  try {
    const response = await fetch(modelUrl(model), { signal, redirect: "follow" });
    if (!response.ok || response.body === null) throw new Error(`Downloading ${modelUrl(model)} failed: ${response.status} ${response.statusText}`);
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(partial), { signal });
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  return { path, bytes: (await fileSize(path)) ?? 0, alreadyPresent: false };
}
