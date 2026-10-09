import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { callResultSchema, metadataEntrySchema } from "../contract.ts";
import { transportSchema } from "../shared/config.ts";
import { descriptorStateSchema, serviceInfoSchema, typeClosureSchema } from "../shared/schema.ts";

const endpointSummarySchema = z.object({
  name: z.string(),
  target: z.string(),
  transport: transportSchema,
  description: z.string().nullable(),
  source: z.string(),
  protected: z.boolean(),
});
export type EndpointSummary = z.infer<typeof endpointSummarySchema>;

const overviewSchema = z.object({
  endpoints: z.array(endpointSummarySchema),
  sources: z.array(z.object({ name: z.string(), kind: z.string() })),
  profiles: z.array(z.string()),
  timeoutSeconds: z.number(),
  errors: z.array(z.string()),
});
export type Overview = z.infer<typeof overviewSchema>;

export const historyEntrySchema = z.object({
  id: z.number(),
  at: z.number(),
  origin: z.string(),
  endpoint: z.string(),
  source: z.string(),
  method: z.string(),
  request: z.string(),
  metadata: z.array(metadataEntrySchema),
  ok: z.boolean(),
  status: z.string(),
  message: z.string(),
  durationMs: z.number(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

const target = { endpoint: z.string(), source: z.string().optional() };

/** A call as the page and CLI make it: endpoint and source by name, resolved against the settings on the server. */
export const callRequestSchema = z.object({
  ...target,
  method: z.string().min(1),
  request: z.string(),
  metadata: z.array(metadataEntrySchema).default([]),
  timeoutSeconds: z.number().min(0.1).max(3600).optional(),
});
export type CallRequest = z.infer<typeof callRequestSchema>;

export const rpcContract = defineRpcContract({
  overview: { input: z.null(), output: overviewSchema },
  services: {
    input: z.object({ ...target, reload: z.boolean().default(false) }),
    output: z.object({ source: z.string(), state: descriptorStateSchema, services: z.array(serviceInfoSchema) }),
  },
  types: { input: z.object({ ...target, typeName: z.string().min(1) }), output: typeClosureSchema },
  invoke: { input: callRequestSchema, output: callResultSchema },
  command: { input: callRequestSchema, output: z.object({ command: z.string() }) },
  history: {
    input: z.object({ limit: z.number().int().min(1).max(500).default(100) }),
    output: z.object({ entries: z.array(historyEntrySchema) }),
  },
  historyResult: { input: z.object({ id: z.number().int() }), output: z.object({ result: callResultSchema.nullable() }) },
  deleteHistory: { input: z.object({ ids: z.array(z.number().int()).min(1).max(500) }), output: z.object({ deleted: z.number() }) },
  clearHistory: { input: z.null(), output: z.object({ cleared: z.number() }) },
  resetAuth: { input: z.null(), output: z.object({ cleared: z.number() }) },
});
