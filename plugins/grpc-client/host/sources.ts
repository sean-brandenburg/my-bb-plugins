// Per-kind proto source handling: where a source's files live, what changes
// when they change, and how its descriptor set is built. A new source kind
// adds a case to each switch here (and to sourceSchema).
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import { DESCRIPTOR_BUILD_TIMEOUT_MS, type Launch } from "../contract.ts";
import type { Source } from "../shared/config.ts";
import { parseDescriptorSets, serializeDescriptorSet } from "../shared/descriptors.ts";
import { connectionArgs, headerEnv, headerFlags, sourceArgs } from "../shared/grpcurl.ts";
import { requestHeaders } from "./auth.ts";
import { expandHome, run, type RunResult } from "./process.ts";

const MAX_PROTO_FILES = 20_000;
// Well under macOS ARG_MAX (1 MiB including the environment).
const MAX_ARG_BYTES = 256 * 1024;
/** Per-file argv overhead on top of the path: "-proto", separators and the terminator. */
const PROTO_ARG_OVERHEAD_BYTES = 8;

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function expandSource(source: Source): Source {
  switch (source.kind) {
    case "reflection":
      return source;
    case "buf":
      return { ...source, path: expandHome(source.path) };
    case "protoset":
      return { ...source, files: source.files.map(expandHome) };
    case "protoDir":
      return { ...source, path: expandHome(source.path), importPaths: source.importPaths.map(expandHome) };
    case "protoFiles":
      return { ...source, importPaths: source.importPaths.map(expandHome) };
  }
}

/** Recursive listing that follows symlinks (Bazel-style trees) without looping. */
async function walk(
  root: string,
  relative: string,
  accept: (name: string) => boolean,
  out: string[],
  limit: number,
  visited = new Set<string>(),
): Promise<void> {
  const dir = nodePath.join(root, relative);
  const real = await fs.realpath(dir);
  if (visited.has(real)) return;
  visited.add(real);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      const target = await fs.stat(nodePath.join(root, child)).catch(() => null);
      isDirectory = target?.isDirectory() ?? false;
      isFile = target?.isFile() ?? false;
    }
    if (isDirectory) {
      await walk(root, child, accept, out, limit, visited);
    } else if (isFile && accept(entry.name)) {
      out.push(child);
      if (out.length > limit) throw new Error(`More than ${limit} files under ${root}`);
    }
    if (out.length > limit) return;
  }
}

const isProto = (name: string) => name.endsWith(".proto");

async function findProtoFiles(root: string, scan: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const dir of scan.length === 0 ? [""] : scan) {
    const relative = dir.replace(/^\.?\/+|\/+$/g, "");
    if (relative.split("/").includes("..")) throw new Error(`scan entry "${dir}" must stay inside ${root}`);
    await walk(root, relative, isProto, files, MAX_PROTO_FILES);
  }
  return [...new Set(files)].sort();
}

/** Absolute paths of every .proto under some directories; a stand-in for "anything importable changed". */
async function protosUnder(dirs: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const dir of dirs) {
    const files: string[] = [];
    try {
      await walk(dir, "", isProto, files, MAX_PROTO_FILES);
    } catch {
      // Unreadable or huge import paths only weaken invalidation; the build reports real problems.
    }
    paths.push(...files.map((file) => nodePath.join(dir, file)));
  }
  return paths;
}

async function statFingerprint(paths: string[]): Promise<string> {
  const parts = await Promise.all(
    [...new Set(paths)].sort().map(async (path) => {
      try {
        const stat = await fs.stat(path);
        return `${path}:${stat.mtimeMs}:${stat.size}`;
      } catch {
        return `${path}:missing`;
      }
    }),
  );
  return sha256(parts.join("\n"));
}

/** Changes whenever a file the source reads changes, so edited protos reload on the next request. */
export async function sourceFingerprint(source: Source): Promise<string> {
  switch (source.kind) {
    case "reflection":
      return "";
    case "protoset":
      return statFingerprint(source.files);
    case "protoDir": {
      const files = await findProtoFiles(source.path, source.scan);
      return statFingerprint([...files.map((file) => nodePath.join(source.path, file)), ...(await protosUnder(source.importPaths))]);
    }
    case "protoFiles":
      return statFingerprint(await protosUnder(source.importPaths));
    case "buf": {
      const stat = await fs.stat(source.path).catch(() => null);
      if (stat === null || !stat.isDirectory()) return statFingerprint([source.path]);
      const files: string[] = [];
      await walk(source.path, "", (name) => isProto(name) || /^buf(\.work)?\.(yaml|lock)$/.test(name), files, MAX_PROTO_FILES).catch(() => {});
      return statFingerprint(files.map((file) => nodePath.join(source.path, file)));
    }
  }
}

/** Splits -proto arguments into batches whose argv stays under MAX_ARG_BYTES. */
export function protoBatches(files: string[], maxBytes = MAX_ARG_BYTES): string[][] {
  const batches: string[][] = [[]];
  let bytes = 0;
  for (const file of files) {
    const size = Buffer.byteLength(file) + PROTO_ARG_OVERHEAD_BYTES;
    if (bytes + size > maxBytes && batches[batches.length - 1]!.length > 0) {
      batches.push([]);
      bytes = 0;
    }
    batches[batches.length - 1]!.push(file);
    bytes += size;
  }
  return batches;
}

/** Writes the source's FileDescriptorSet to `output`. `source` has its paths expanded already. */
export async function buildDescriptorSet(launch: Launch, source: Source, output: string): Promise<void> {
  const grpcurl = launch.tools.grpcurl;
  const fail = (label: string, result: RunResult): never => {
    throw new Error(`${label} failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim().slice(0, 2000)}`);
  };
  switch (source.kind) {
    case "protoset": {
      const buffers = await Promise.all(source.files.map((file) => fs.readFile(file)));
      await fs.writeFile(output, serializeDescriptorSet(parseDescriptorSets(buffers)));
      return;
    }
    case "buf": {
      const result = await run(launch.tools.buf, ["build", source.path, "-o", output, ...source.args], {
        timeoutMs: DESCRIPTOR_BUILD_TIMEOUT_MS,
      });
      if (result.code !== 0) fail("buf build", result);
      return;
    }
    case "protoDir":
    case "protoFiles": {
      const files = source.kind === "protoDir" ? await findProtoFiles(source.path, source.scan) : source.files;
      if (files.length === 0) throw new Error(`No .proto files found under ${source.kind === "protoDir" ? source.path : "the import paths"}`);
      const batches = protoBatches(files);
      const parts: Buffer[] = [];
      for (const [index, batch] of batches.entries()) {
        const part = batches.length === 1 ? output : `${output}.${index}`;
        const batchSource = source.kind === "protoDir" ? source : { ...source, files: batch };
        try {
          const result = await run(grpcurl, [...sourceArgs(batchSource, batch), "-protoset-out", part, "describe"], {
            timeoutMs: DESCRIPTOR_BUILD_TIMEOUT_MS,
          });
          if (result.code !== 0) fail("grpcurl describe", result);
          if (batches.length > 1) parts.push(await fs.readFile(part));
        } finally {
          if (batches.length > 1) await fs.rm(part, { force: true });
        }
      }
      if (batches.length > 1) await fs.writeFile(output, serializeDescriptorSet(parseDescriptorSets(parts)));
      return;
    }
    case "reflection": {
      const headers = await requestHeaders(launch, null, []);
      const { names, env } = headerEnv(headers.entries, process.env);
      const args = [...connectionArgs(launch.endpoint), "-expand-headers", ...headerFlags(names), "-protoset-out", output, "describe", launch.endpoint.target];
      const result = await run(grpcurl, args, { env, timeoutMs: DESCRIPTOR_BUILD_TIMEOUT_MS });
      if (result.code !== 0) fail("grpcurl reflection", result);
      return;
    }
  }
}
