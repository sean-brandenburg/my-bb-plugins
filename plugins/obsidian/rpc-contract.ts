// RPC contract between the app and the plugin server. The vault methods proxy
// to the host worker (contract.ts); the daily methods are served by server/daily.ts.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { backlinksSchema, moveResultSchema, noteSchema, searchSchema, treeSchema, writeResultSchema } from "./contract.ts";

const relativePath = z.string().min(1).max(1024);

export const vaultRpcContract = defineRpcContract({
  status: {
    input: z.null(),
    output: z.object({
      vaultPath: z.string().nullable(),
      vaultName: z.string().nullable(),
      dailyFolder: z.string(),
      todayKey: z.string(),
    }),
  },
  configure: {
    input: z.object({ vaultPath: z.string().trim().min(1).max(1024) }).strict(),
    output: z.object({ ok: z.boolean(), message: z.string().nullable() }),
  },
  tree: { input: z.null(), output: treeSchema },
  read: { input: z.object({ path: relativePath }).strict(), output: noteSchema },
  write: {
    input: z
      .object({
        path: relativePath,
        content: z.string(),
        expectedSha256: z.string().nullable().optional(),
      })
      .strict(),
    output: writeResultSchema,
  },
  mkdir: {
    input: z.object({ path: relativePath }).strict(),
    output: z.object({ path: z.string() }),
  },
  move: {
    input: z.object({ from: relativePath, to: relativePath, updateLinks: z.boolean() }).strict(),
    output: moveResultSchema,
  },
  trash: {
    input: z.object({ path: relativePath }).strict(),
    output: z.object({ trashedTo: z.string() }),
  },
  backlinks: { input: z.object({ path: relativePath }).strict(), output: backlinksSchema },
  search: {
    input: z.object({ query: z.string().trim().min(1).max(500) }).strict(),
    output: searchSchema,
  },
  previewBase: {
    input: z.null(),
    output: z.object({ baseUrl: z.string(), expiresAtMs: z.number() }),
  },
});

export const activityItemSchema = z.object({
  threadId: z.string(),
  title: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  firstAt: z.number(),
  lastAt: z.number(),
  turns: z.number(),
  lastText: z.string(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const ticketSchema = z.object({
  path: z.string(),
  key: z.string(),
  summary: z.string(),
  status: z.string(),
  url: z.string().nullable(),
  done: z.boolean(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const routineModeSchema = z.enum(["start", "log", "wrap"]);
export type RoutineMode = z.infer<typeof routineModeSchema>;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A calendar event as `shared/calendar.ts` shapes it. */
export const meetingSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string(),
  calendar: z.string(),
  attendees: z.number(),
  myStatus: z.string().nullable(),
  organizer: z.string().nullable(),
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  notes: z.string().nullable(),
  allDay: z.boolean(),
  declined: z.boolean(),
  canceled: z.boolean(),
});

/** A meeting with the note the rules would give it. */
export const plannedMeetingSchema = meetingSchema.extend({
  /** The local date it starts on. */
  date: dateKey,
  note: z.object({ path: z.string(), rule: z.string(), template: z.string().nullable() }),
});
export type PlannedMeeting = z.infer<typeof plannedMeetingSchema>;

export const dailyRpcContract = defineRpcContract({
  /** Meetings between two local dates, `to` exclusive, every calendar entry included. */
  meetings: {
    input: z.object({ from: dateKey, to: dateKey }).strict(),
    output: z.object({
      meetings: z.array(plannedMeetingSchema),
      rules: z.object({ path: z.string(), exists: z.boolean(), errors: z.array(z.string()) }),
    }),
  },
  /** Creates the meeting's note from its rule (or finds the existing one) and links it from the day's daily note. */
  startMeetingNote: {
    input: z.object({ meeting: meetingSchema }).strict(),
    output: z.object({ path: z.string(), created: z.boolean() }),
  },
  /** The rules note's path, writing the starter when there is none yet. */
  ensureMeetingRules: {
    input: z.null(),
    output: z.object({ path: z.string(), created: z.boolean() }),
  },
  capture: {
    input: z.object({ text: z.string().min(1).max(50_000), threadId: z.string().optional() }).strict(),
    output: z.object({ path: z.string() }),
  },
  openToday: {
    input: z.null(),
    output: z.object({ path: z.string() }),
  },
  startRoutine: {
    input: z.object({ mode: routineModeSchema }).strict(),
    output: z.object({ threadId: z.string() }),
  },
  dashboard: {
    input: z.null(),
    output: z.object({
      dateKey: z.string(),
      today: z.object({ path: z.string(), exists: z.boolean(), inbox: z.array(z.string()) }),
      carryForward: z.object({ path: z.string().nullable(), items: z.array(z.string()) }),
      tickets: z.array(ticketSchema),
      activity: z.array(activityItemSchema),
    }),
  },
});

export const rpcContract = defineRpcContract({ ...vaultRpcContract, ...dailyRpcContract });
