import type { DiffLineAnnotation } from "@pierre/diffs/react";
import type { DiffSide } from "../../types";
import type { DiffThread } from "../comments/threads";
import type { InlineFinding, PlacedFinding } from "../findings/findings";
import type { ComposerAnchor } from "../patch-annotations";

export type AnnotationMeta = { key: string } & ({ kind: "thread"; thread: DiffThread } | { kind: "composer" } | { kind: "finding"; finding: InlineFinding });
export type PierreSide = "deletions" | "additions";

export function toPierreSide(side: DiffSide): PierreSide {
  return side === "LEFT" ? "deletions" : "additions";
}

export function fromPierreSide(side: PierreSide | undefined): DiffSide {
  return side === "deletions" ? "LEFT" : "RIGHT";
}

/**
 * Pierre keys annotation slots by array index, so an insertion or removal hands every later slot to the next
 * annotation. `key` is the identity the renderer puts on each slot's element so a shifted slot remounts rather than
 * passing its state (a reply draft, a finding edit) to another annotation, and the order keeps the stateful ones from
 * shifting: findings come last so toggling or receiving them moves nothing, and the composer sits after the threads so
 * submitting it (composer out, its thread appended) leaves every index in place. Opening the composer does shift the
 * findings; the renderer suppresses their re-entrance.
 *
 * The composer's key ignores its line, so a draft follows the composer to another line.
 */
export function buildLineAnnotations(threads: DiffThread[], composer: ComposerAnchor | null, findings: PlacedFinding[]): DiffLineAnnotation<AnnotationMeta>[] {
  const list: DiffLineAnnotation<AnnotationMeta>[] = [];
  for (const thread of threads) {
    if (thread.line !== null) list.push({ side: toPierreSide(thread.side), lineNumber: thread.line, metadata: { key: `thread:${thread.id}`, kind: "thread", thread } });
  }
  if (composer !== null && composer.line !== null) {
    list.push({ side: toPierreSide(composer.side), lineNumber: composer.line, metadata: { key: "composer", kind: "composer" } });
  }
  for (const entry of findings) {
    if (entry.line === null) continue;
    // One finding is placed once per location, so the line is part of its identity.
    const key = `finding:${entry.item.reviewId}:${entry.item.finding.id}:${entry.line}`;
    list.push({ side: "additions", lineNumber: entry.line, metadata: { key, kind: "finding", finding: entry.item } });
  }
  return list;
}
