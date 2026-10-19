import { z } from "zod";
import { DEFAULT_REVIEW_DEPTH, findingSeveritySchema, reviewDepthSchema } from "./review";

/** Where a monitored card is in the review loop. */
export const loopPhaseSchema = z.enum(["idle", "planning", "building", "checking", "classifying", "reviewing", "fixing", "paused", "needs-you", "accepted", "landed"]);
export type LoopPhase = z.infer<typeof loopPhaseSchema>;

/** Why the loop stopped at Needs you: `clean` is the happy ending, every other reason an escalation. */
export const needsYouReasonSchema = z.enum(["clean", "cap", "not-converging", "checks", "dispute", "question", "loop-error"]);
export type NeedsYouReason = z.infer<typeof needsYouReasonSchema>;

export const NEEDS_YOU_REASON_LABEL: Record<NeedsYouReason, string> = {
  clean: "clean",
  cap: "cap reached",
  "not-converging": "not converging",
  checks: "checks failing",
  dispute: "dispute",
  question: "question",
  "loop-error": "loop error",
};

/** Kept short so a card's loop state stays small; the checks table keeps the full tail of a re-run. */
const OUTPUT_TAIL_MAX = 4000;
const outputTailSchema = z.string().transform((tail) => tail.slice(-OUTPUT_TAIL_MAX));

/** What the card's thread says it ran to verify its work. */
export const evidenceSchema = z.object({
  commands: z
    .array(z.object({ command: z.string().trim().min(1).max(2000), exitCode: z.number().int(), outputTail: outputTailSchema.default("") }).strict())
    .max(20)
    .default([]),
  screenshots: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** What the board knows about one project, set from the card panel. */
export const projectSettingsSchema = z.object({
  /** Re-run by the board at every ready commit; null leaves the choice to the card's agent. */
  checkCommand: z.string().trim().min(1).max(2000).nullable().default(null),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

/** The command the board re-runs, and whether the project set it or the agent chose it. */
export const checkCommandSchema = z.object({ command: z.string().min(1), source: z.enum(["project", "agent"]) });
export type CheckCommand = z.infer<typeof checkCommandSchema>;

/** One re-run of the checks, as the loop remembers it. */
export const checksOutcomeSchema = z.object({ commit: z.string(), exitCode: z.number().int(), passed: z.boolean() });
export type ChecksOutcome = z.infer<typeof checksOutcomeSchema>;

/** Automatic fix rounds before the loop stops for the user. */
export const LOOP_ROUND_CAP = 3;

/** A finding the loop handed to the card's thread, or left open when it stopped. */
export const loopFindingSchema = z.object({ id: z.string(), severity: findingSeveritySchema, title: z.string() });
export type LoopFinding = z.infer<typeof loopFindingSchema>;

/** The card thread's answer to one finding of a fix round. */
export const findingAnswerSchema = z.discriminatedUnion("answer", [
  z.object({ answer: z.literal("fixed") }),
  z.object({ answer: z.literal("disputed"), reason: z.string().trim().min(1).max(4000) }),
]);
export type FindingAnswer = z.infer<typeof findingAnswerSchema>;

/** One automatic fix round: the review it answers, the findings it handed over, and the thread's answer to each, by finding id. */
export const loopRoundSchema = z.object({ reviewId: z.string(), handed: z.array(z.string()), answers: z.record(z.string(), findingAnswerSchema).default({}) });
export type LoopRound = z.infer<typeof loopRoundSchema>;

/** The handed findings of the round being fixed that the card's thread hasn't answered yet. */
export function unansweredFindings(state: LoopState): string[] {
  const round = state.phase === "fixing" ? state.rounds.find((entry) => entry.reviewId === state.reviewId) : undefined;
  return round === undefined ? [] : round.handed.filter((id) => round.answers[id] === undefined);
}

export const loopGatesSchema = z.object({
  /** Stop after the card's thread proposes a plan, until it's approved. */
  plan: z.boolean().default(false),
  /** Each round's findings wait for approval before the fix prompt goes out. */
  findings: z.boolean().default(false),
  /** A change that ends at Glance level with nothing serious open is accepted without stopping at Needs you. */
  autoAccept: z.boolean().default(false),
});
export type LoopGates = z.infer<typeof loopGatesSchema>;

/** Every field has a default, so state stored by an older version of the loop still parses. */
export const loopStateSchema = z.object({
  monitored: z.boolean().default(false),
  gates: loopGatesSchema.default({ plan: false, findings: false, autoAccept: false }),
  phase: loopPhaseSchema.default("idle"),
  /** Set while the phase is needs-you. */
  reason: needsYouReasonSchema.nullable().default(null),
  /** Automatic fix rounds started; the cap counts these. */
  round: z.number().int().default(0),
  /** The depth the loop's reviews run at. */
  depth: reviewDepthSchema.default(DEFAULT_REVIEW_DEPTH),
  /** The review running, or the one the current fix round answers. */
  reviewId: z.string().nullable().default(null),
  rounds: z.array(loopRoundSchema).default([]),
  /** The minor findings left open when the loop ended clean: at the cap, or disputed and the dispute rejected. */
  openFindings: z.array(loopFindingSchema).default([]),
  /** Rounds the user started, which never count toward the cap. */
  humanRounds: z.number().int().default(0),
  /** The commit being checked or reviewed. */
  commit: z.string().nullable().default(null),
  checkCommand: checkCommandSchema.nullable().default(null),
  /** The evidence of the latest ready report. */
  evidence: evidenceSchema.nullable().default(null),
  checks: z.array(checksOutcomeSchema).default([]),
});
export type LoopState = z.infer<typeof loopStateSchema>;

export const INITIAL_LOOP_STATE: LoopState = loopStateSchema.parse({});

/** Stored state, or the initial one when there is none or it doesn't parse. */
export function parseLoopState(raw: string | null): LoopState {
  if (raw === null) return INITIAL_LOOP_STATE;
  try {
    const parsed = loopStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : INITIAL_LOOP_STATE;
  } catch {
    return INITIAL_LOOP_STATE;
  }
}

/** The chip a monitored card shows on the board: the loop's phase, or why it needs you. */
export function phaseChip(loop: LoopState): { label: string; tone: "neutral" | "accent" | "warning" | "danger" | "success"; title: string } | null {
  if (!loop.monitored) return null;
  const commit = loop.commit === null ? "" : ` ${loop.commit.slice(0, 7)}`;
  switch (loop.phase) {
    case "checking":
      return { label: "checks", tone: "accent", title: `Re-running \`${loop.checkCommand?.command ?? "the checks"}\` at${commit}` };
    case "reviewing": {
      const recheck = loop.round >= LOOP_ROUND_CAP;
      return {
        label: `review r${recheck ? loop.round : loop.round + 1}`,
        tone: "accent",
        title: recheck ? `Re-reviewing the last round's fixes at${commit}` : `Reviewing${commit} at ${loop.depth} depth`,
      };
    }
    case "fixing":
      return { label: `fixing r${loop.round}`, tone: "accent", title: `The card's thread is fixing round ${loop.round}'s findings` };
    case "needs-you":
      if (loop.reason === "clean" || loop.reason === null) {
        const minors = loop.openFindings.length === 0 ? "" : `; ${loop.openFindings.length} minor finding${loop.openFindings.length === 1 ? "" : "s"} left open: ${loop.openFindings.map((finding) => `${finding.id} ${finding.title}`).join(", ")}`;
        return { label: "ready", tone: "success", title: `Checked and reviewed clean at${commit}${minors}; needs you` };
      }
      return { label: `stuck · ${NEEDS_YOU_REASON_LABEL[loop.reason]}`, tone: "danger", title: `Needs you: ${NEEDS_YOU_REASON_LABEL[loop.reason]}` };
    case "paused":
      return { label: "stuck · question", tone: "warning", title: "The card's thread is waiting on you" };
    case "accepted":
    case "landed":
      return { label: loop.phase, tone: "success", title: `Monitored; ${loop.phase}` };
    case "idle":
    case "building":
      return { label: "building", tone: "neutral", title: "Monitored: the board checks the work when the card's thread reports it ready" };
    default:
      return { label: loop.phase, tone: "accent", title: `Monitored: ${loop.phase}` };
  }
}
