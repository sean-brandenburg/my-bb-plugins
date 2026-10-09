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

export const dailyRpcContract = defineRpcContract({
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
