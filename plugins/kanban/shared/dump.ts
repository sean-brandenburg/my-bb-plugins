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
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Dump = z.infer<typeof dumpSchema>;
