import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const tokensSchema = z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number() });

const limitSchema = z.object({
  key: z.string(),
  providerId: z.string(),
  providerKey: z.string().nullable(),
  label: z.string(),
  status: z.enum(["allowed", "warning", "blocked", "unknown"]),
  resetsAtMs: z.number().nullable(),
  reportedAt: z.number(),
});

const sessionSchema = z.object({
  /** The bb thread id, or the Claude Code session id for a session outside bb. */
  key: z.string(),
  /** The bb thread that ran the session; null for Claude Code used outside bb. */
  threadId: z.string().nullable(),
  title: z.string(),
  project: z.string().nullable(),
  tokens: tokensSchema,
});

export const usageSchema = z.object({
  limits: z.array(limitSchema),
  /** The current five-hour window; `estimated` when no provider has reported its reset. Null when none is open. */
  window: z
    .object({
      startMs: z.number(),
      endMs: z.number(),
      estimated: z.boolean(),
      tokens: tokensSchema,
      sessions: z.array(sessionSchema),
      others: z.object({ count: z.number(), tokens: tokensSchema }),
    })
    .nullable(),
  days: z.array(z.object({ day: z.string(), tokens: tokensSchema })),
  scannedAt: z.number(),
});

export type Usage = z.infer<typeof usageSchema>;
export type UsageSession = z.infer<typeof sessionSchema>;

export const rpcContract = defineRpcContract({
  usage: {
    input: z.object({ refresh: z.boolean() }).strict(),
    output: usageSchema,
  },
});
