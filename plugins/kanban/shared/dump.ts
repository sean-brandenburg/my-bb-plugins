import { z } from "zod";

/** What the planning agent proposes from a brain dump: tickets plus the questions it could not resolve. */
export const proposedTicketSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  subtasks: z.array(z.object({ title: z.string().min(1), description: z.string().default("") })).default([]),
  dependsOn: z.array(z.string()).default([]),
  estimate: z.enum(["S", "M", "L"]).nullable().default(null),
});
export type ProposedTicket = z.infer<typeof proposedTicketSchema>;
export const proposalQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  why: z.string().default(""),
  affects: z.array(z.string()).default([]),
  options: z.array(z.string()).default([]),
});
export const proposalSchema = z.object({
  version: z.number().int(),
  summary: z.string().default(""),
  tickets: z.array(proposedTicketSchema),
  questions: z.array(proposalQuestionSchema).default([]),
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Where one ticket's work stands in the dump's integration: settled and resolved to a head, or not yet. */
export const integrationMemberOutcomeSchema = z.enum([
  /** The card is still being worked on. */
  "pending",
  /** Settled, with commits beyond the base branch at `headSha`. */
  "ready",
  /** Settled, but its branch has no commits beyond the base branch. */
  "nothing",
  /** Settled, but its head can't be read (no thread, another machine, the environment is gone); `note` says why. */
  "unavailable",
  /** The integration thread merged it. */
  "merged",
  /** The integration thread could not merge it cleanly. */
  "conflict",
  /** The integration thread left it out. */
  "skipped",
]);
export type IntegrationMemberOutcome = z.infer<typeof integrationMemberOutcomeSchema>;
export const integrationMemberSchema = z.object({
  ticketId: z.string(),
  /** The ticket's id in the proposal (T1, T2…), which the integration thread reports with. */
  proposalId: z.string(),
  /** Merge order: a ticket comes after the ones it depends on. */
  position: z.number().int(),
  headSha: z.string().nullable(),
  branch: z.string().nullable(),
  outcome: integrationMemberOutcomeSchema,
  note: z.string(),
});
export type IntegrationMember = z.infer<typeof integrationMemberSchema>;

export const integrationStatusSchema = z.enum([
  /** Waiting for every member card to settle. */
  "waiting",
  /** The integration thread is merging and checking. */
  "integrating",
  /** The thread recorded its merge with `bb kanban integrated`. */
  "integrated",
  /** The thread could not be started, or ended without recording a result. */
  "failed",
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

/**
 * The merge of a dump's tickets into one worktree once they are all done, so the feature they make up can be tested
 * end to end before anything lands. `ticketId` is the integration card, whose thread owns that worktree.
 */
export const integrationSchema = z.object({
  id: z.string(),
  dumpId: z.string(),
  ticketId: z.string(),
  projectId: z.string(),
  threadId: z.string().nullable(),
  status: integrationStatusSchema,
  /** The merge commit the thread recorded. */
  commitSha: z.string().nullable(),
  /** The check command's exit code after the merge, when the thread reported one. */
  checkExitCode: z.number().int().nullable(),
  error: z.string().nullable(),
  members: z.array(integrationMemberSchema),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Integration = z.infer<typeof integrationSchema>;

export const dumpStatusSchema = z.enum(["planning", "ready", "failed", "done", "discarded"]);
export const dumpSchema = z.object({
  id: z.string(),
  text: z.string(),
  projectId: z.string(),
  threadId: z.string().nullable(),
  status: dumpStatusSchema,
  proposal: proposalSchema.nullable(),
  /** The user's answers keyed by question id, from the last refine round. */
  answers: z.record(z.string(), z.string()),
  /** Ids of tickets created when the dump was finalized. */
  createdTicketIds: z.array(z.string()),
  /** The merge of those tickets into one worktree, when the dump was finalized with it. */
  integration: integrationSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Dump = z.infer<typeof dumpSchema>;
