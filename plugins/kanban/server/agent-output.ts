// Agents hand structured results back as a fenced ```json <tag> block at the end of their final message.
import type { z } from "zod";
import { proposalSchema, type Proposal } from "../shared/dump";
import { classificationSchema, type Classification } from "../shared/loop";
import { reviewReportSchema, type ReviewReport } from "../shared/review";
import { narrativeReportSchema, type NarrativeReport } from "../shared/tour";

/** The agent ends its final message with this so the reviewed commit survives even if it skipped `review-record`. */
export const REVIEWED_COMMIT_LINE = /Reviewed commit:\s*([0-9a-f]{7,40})/iu;

function fencedBlock(tag: string): RegExp {
  return new RegExp(`\`\`\`json\\s+${tag}\\s*\\n([\\s\\S]*?)\\n\`\`\``, "u");
}

const REPORT_BLOCK = fencedBlock("review-findings");
const NARRATIVE_BLOCK = fencedBlock("kanban-narrative");
const PROPOSAL_BLOCK = fencedBlock("kanban-proposal");
const CLASSIFY_BLOCK = fencedBlock("kanban-classify");

/** The first block matching `pattern`, validated by `schema`; null when absent, not JSON, or the wrong shape. */
function parseFencedJson<T>(body: string | null, pattern: RegExp, schema: z.ZodType<T>): T | null {
  if (body === null) return null;
  const match = pattern.exec(body);
  if (match === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseNarrative(body: string | null): NarrativeReport | null {
  return parseFencedJson(body, NARRATIVE_BLOCK, narrativeReportSchema);
}

/** Pulls the structured report out of a review body; null when absent or malformed. */
export function parseReviewReport(body: string | null): ReviewReport | null {
  return parseFencedJson(body, REPORT_BLOCK, reviewReportSchema);
}

export function parseProposal(body: string | null): Proposal | null {
  return parseFencedJson(body, PROPOSAL_BLOCK, proposalSchema);
}

export function parseClassification(body: string | null): Classification | null {
  return parseFencedJson(body, CLASSIFY_BLOCK, classificationSchema);
}
