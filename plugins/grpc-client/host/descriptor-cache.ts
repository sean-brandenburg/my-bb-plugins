// Descriptor sets per source (per endpoint for reflection), kept in memory and
// under the host data dir, rebuilt when the source config or its files change.
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import type { FileRegistry } from "@bufbuild/protobuf";
import type { Launch } from "../contract.ts";
import { descriptorCacheKey, type Source } from "../shared/config.ts";
import { createRegistry, parseDescriptorSets } from "../shared/descriptors.ts";
import { buildDescriptorSet, expandSource, sha256, sourceFingerprint } from "./sources.ts";

export interface Loaded {
  key: string;
  configHash: string;
  fingerprint: string;
  protosetPath: string;
  registry: FileRegistry;
  loadedAt: number;
  fileCount: number;
}

interface CacheMeta {
  configHash: string;
  fingerprint: string;
  loadedAt: number;
  bin: string;
}

const descriptors = new Map<string, Loaded>();
const descriptorBuilds = new Map<string, Promise<Loaded>>();

let dataDir: string | null = null;

/** Every host handler passes its context's data dir before loading descriptors. */
export function setDataDir(dir: string): void {
  dataDir = dir;
}

async function cacheDir(): Promise<string> {
  if (dataDir === null) throw new Error("Host data directory is not known yet");
  const dir = nodePath.join(dataDir, "descriptors");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function safeName(key: string): string {
  return key.replace(/[^A-Za-z0-9._@-]/g, "_");
}

/** Reflection results also depend on how the server is reached, so those settings are part of the hash. */
function configHash(launch: Launch, source: Source): string {
  const endpoint = launch.endpoint;
  const reflection =
    source.kind === "reflection"
      ? { target: endpoint.target, transport: endpoint.transport, args: endpoint.args, headers: endpoint.headers, auth: endpoint.auth ?? null }
      : null;
  return sha256(JSON.stringify({ source, reflection }));
}

async function readCached(dir: string, key: string, hash: string, fingerprint: string): Promise<Loaded | null> {
  try {
    const meta = JSON.parse(await fs.readFile(nodePath.join(dir, `${safeName(key)}.json`), "utf8")) as CacheMeta;
    if (meta.configHash !== hash || meta.fingerprint !== fingerprint || typeof meta.bin !== "string") return null;
    const protosetPath = nodePath.join(dir, nodePath.basename(meta.bin));
    const set = parseDescriptorSets([await fs.readFile(protosetPath)]);
    return { key, configHash: hash, fingerprint, protosetPath, registry: createRegistry(set), loadedAt: meta.loadedAt, fileCount: set.file.length };
  } catch {
    // Missing, stale or corrupt cache entries are rebuilt.
    return null;
  }
}

async function build(launch: Launch, source: Source, key: string, hash: string, fingerprint: string, reload: boolean): Promise<Loaded> {
  const dir = await cacheDir();
  if (!reload) {
    const cached = await readCached(dir, key, hash, fingerprint);
    if (cached !== null) return cached;
  }
  const loadedAt = Date.now();
  // A fresh file per build: a reader of the previous meta never sees a half-written or mismatched set.
  const bin = `${safeName(key)}.${hash.slice(0, 12)}.${loadedAt}.binpb`;
  const protosetPath = nodePath.join(dir, bin);
  const temp = `${protosetPath}.tmp`;
  try {
    await buildDescriptorSet(launch, source, temp);
    const set = parseDescriptorSets([await fs.readFile(temp)]);
    const registry = createRegistry(set);
    await fs.rename(temp, protosetPath);
    const metaPath = nodePath.join(dir, `${safeName(key)}.json`);
    const previous = await fs
      .readFile(metaPath, "utf8")
      .then((text) => (JSON.parse(text) as Partial<CacheMeta>).bin ?? null)
      .catch(() => null);
    const meta: CacheMeta = { configHash: hash, fingerprint, loadedAt, bin };
    await fs.writeFile(`${metaPath}.tmp`, JSON.stringify(meta));
    await fs.rename(`${metaPath}.tmp`, metaPath);
    if (typeof previous === "string" && previous !== bin) {
      // grpcurl calls already running against the old file keep their open handle.
      await fs.rm(nodePath.join(dir, nodePath.basename(previous)), { force: true });
    }
    return { key, configHash: hash, fingerprint, protosetPath, registry, loadedAt, fileCount: set.file.length };
  } finally {
    await fs.rm(temp, { force: true });
  }
}

/** The launch's descriptors from memory, disk, or a fresh build; concurrent identical builds are shared. */
export async function loadDescriptors(launch: Launch, reload: boolean): Promise<Loaded & { fromCache: boolean }> {
  const source = expandSource(launch.source);
  const key = descriptorCacheKey(launch.endpoint, source);
  const hash = configHash(launch, source);
  const fingerprint = await sourceFingerprint(source);
  const current = descriptors.get(key);
  if (!reload && current !== undefined && current.configHash === hash && current.fingerprint === fingerprint) {
    return { ...current, fromCache: true };
  }
  const buildKey = JSON.stringify([key, hash, fingerprint, reload]);
  let pending = descriptorBuilds.get(buildKey);
  if (pending === undefined) {
    pending = build(launch, source, key, hash, fingerprint, reload).then((loaded) => {
      descriptors.set(key, loaded);
      return loaded;
    });
    descriptorBuilds.set(buildKey, pending);
    const settled = pending;
    void settled.finally(() => descriptorBuilds.delete(buildKey)).catch(() => {});
  }
  return { ...(await pending), fromCache: false };
}
