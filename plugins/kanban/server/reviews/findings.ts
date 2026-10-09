import { locationLabel } from "../../shared/finding-location";
import { findingEditsSchema, selectionSchema, type Finding, type FindingEdit, type FindingSeverity, type Review, type ReviewReport, type ReviewScores, type ReviewSummary, type SeverityCounts } from "../../shared/review";

/**
 * Pre-selection for the apply round. Critical always; otherwise both scores
 * must clear 3 so low-value or scope-expanding fixes stay unticked. Unscored
 * reports fall back to severity.
 */
export function defaultSelected(finding: Finding): boolean {
  if (finding.severity === "critical") return true;
  if (finding.importance !== null && finding.scopeFit !== null) {
    return finding.importance >= 3 && finding.scopeFit >= 3;
  }
  return finding.severity === "important";
}

export function rollupScores(report: ReviewReport | null): ReviewScores | null {
  if (report === null) return null;
  const scored = report.findings.filter(
    (finding): finding is Finding & { importance: number; scopeFit: number } =>
      finding.importance !== null && finding.scopeFit !== null,
  );
  if (scored.length === 0) return null;
  const mean = (values: number[]) => Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  return {
    maxImportance: Math.max(...scored.map((finding) => finding.importance)),
    meanScopeFit: mean(scored.map((finding) => finding.scopeFit)),
    meanImportance: mean(scored.map((finding) => finding.importance)),
    scored: scored.length,
  };
}

export function countSeverities(report: ReviewReport | null): SeverityCounts | null {
  if (report === null) return null;
  const counts: SeverityCounts = { critical: 0, important: 0, minor: 0 };
  for (const finding of report.findings) counts[finding.severity] += 1;
  return counts;
}

export function parseSelection(raw: string | null): Record<string, boolean> {
  try {
    const parsed = selectionSchema.safeParse(JSON.parse(raw ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function effectiveSelection(report: ReviewReport | null, overrides: Record<string, boolean>): Record<string, boolean> {
  if (report === null) return {};
  return Object.fromEntries(report.findings.map((finding) => [finding.id, overrides[finding.id] ?? defaultSelected(finding)]));
}

export function parseFindingEdits(raw: string | null): Record<string, FindingEdit> {
  try {
    const parsed = findingEditsSchema.safeParse(JSON.parse(raw ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function applyFindingEdits(report: ReviewReport | null, edits: Record<string, FindingEdit>): ReviewReport | null {
  if (report === null || Object.keys(edits).length === 0) return report;
  return {
    ...report,
    findings: report.findings.map((finding) => {
      const edit = edits[finding.id];
      if (edit === undefined) return finding;
      return {
        ...finding,
        title: edit.title ?? finding.title,
        description: edit.description ?? finding.description,
        fix: edit.fix === undefined ? finding.fix : edit.fix,
      };
    }),
  };
}

export function summarize(review: Review): ReviewSummary {
  const { body, report, selection, selectionOverrides, ...rest } = review;
  return {
    ...rest,
    hasBody: body !== null && body.trim() !== "",
    counts: countSeverities(report),
    selectedCount: report === null ? null : Object.values(selection).filter(Boolean).length,
    scores: rollupScores(report),
  };
}

/** The review body trimmed to the selected findings, so the apply round never sees deselected ones. */
export function selectedFindingsBody(review: Review): { body: string; findingIds: string[] | null } {
  const { report } = review;
  if (report === null) return { body: review.body ?? "(the review body is empty; open the review thread for details)", findingIds: null };
  const selected = report.findings.filter((finding) => review.selection[finding.id] === true);
  const bySeverity = (["critical", "important", "minor"] as const)
    .map((severity) => ({ severity, findings: selected.filter((finding) => finding.severity === severity) }))
    .filter((group) => group.findings.length > 0);
  const headings: Record<FindingSeverity, string> = {
    critical: "### Critical (Must Fix)",
    important: "### Important (Should Fix)",
    minor: "### Minor (Nice to Fix)",
  };
  const lines: string[] = ["## Change Summary", report.summary, "", "## Selected findings", ""];
  lines.push(
    `${selected.length} of ${report.findings.length} findings were selected on the Kanban board; the rest were deliberately left out. Apply only these.`,
    "",
  );
  for (const { severity, findings } of bySeverity) {
    lines.push(headings[severity]);
    for (const finding of findings) {
      const scores = finding.importance === null || finding.scopeFit === null ? "" : ` (importance ${finding.importance}, scope ${finding.scopeFit})`;
      const where = finding.locations.map((location) => `\`${locationLabel(location)}\``).join(", ");
      const fix = finding.fix === null || finding.fix === "" ? "" : ` — ${finding.fix}`;
      lines.push(`- **${finding.id}**${scores} ${where} — ${finding.title}. ${finding.description}${fix} (flagged by: ${finding.flaggedBy.join(", ")})`);
    }
    lines.push("");
  }
  lines.push("```json review-findings", JSON.stringify({ ...report, findings: selected }, null, 2), "```");
  return { body: lines.join("\n"), findingIds: selected.map((finding) => finding.id) };
}
