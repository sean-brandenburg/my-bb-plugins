import type { DiffFile } from "../types";

const GENERATED_PATH_PATTERNS: RegExp[] = [
  /(^|\/)(dist|build|__snapshots__)\//u,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|go\.sum|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|flake\.lock|bun\.lockb?)$/u,
  /\.(pb|pb\.gw|pb\.validate|sql|gen|generated|g|min|d|snap|map|swagger|openapi)\.(go|ts|js|py|dart|json|yaml|yml|css|rb|kt|swift)$/u,
  /(^|\/)(zz_generated|wire_gen)[^/]*\.go$/u,
  /(^|\/)(mock_[^/]+\.go|[^/]+_mock\.go|[^/]+\.mock\.ts|[^/]+_string\.go|[^/]+_pb2(_grpc)?\.py|[^/]+_generated\.[^/]+|[^/]+\.generated\.[^/]+)$/u,
];

/** Lockfiles, vendored trees, protobuf and other generated output: collapsed by default so hand-written changes stand out. */
export function isGeneratedFile(file: DiffFile): boolean {
  return file.vendored || GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(file.path));
}
