import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/**
 * What gets recorded: a `click` on a control, a vim key `command` a plugin ran, a raw `key` nothing
 * bound (or that bb itself took), and a `route` opened.
 */
export const KINDS = ["click", "command", "key", "route"] as const;
export type Kind = (typeof KINDS)[number];

export const VIAS = ["pointer", "keyboard"] as const;
export type Via = (typeof VIAS)[number];

export const MAX_TEXT = 120;
export const MAX_BATCH = 500;

export const eventSchema = z.object({
  at: z.number().int(),
  kind: z.enum(KINDS),
  /** The plugin whose surface it happened in; null for bb's own UI. */
  plugin: z.string().max(MAX_TEXT).nullable(),
  /** The page, with ids collapsed: `/threads/*`, `/plugins/kanban/board`. */
  route: z.string().max(MAX_TEXT),
  /** What counts as the same control or key across occurrences. */
  key: z.string().max(MAX_TEXT),
  /** One reading of it, for display: a button's text, a key sequence, a route. */
  label: z.string().max(MAX_TEXT),
  /** How a click was made; null for keys and routes. */
  via: z.enum(VIAS).nullable(),
  /** A vim count typed before a command (`5j`); null otherwise. */
  count: z.number().int().nullable(),
});
export type ActivityEvent = z.infer<typeof eventSchema>;

export const summaryQuerySchema = z
  .object({
    /** Only events at or after this time; null for all time. */
    sinceMs: z.number().int().nullable(),
    /** Only events before this time; null or absent for up to now. */
    untilMs: z.number().int().nullable().optional(),
    kind: z.enum(KINDS).nullable(),
    /** A plugin id, "bb" for bb's own UI, or null for every plugin. */
    plugin: z.string().nullable(),
    limit: z.number().int().min(1).max(5000),
  })
  .strict();
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const summaryItemSchema = z.object({
  plugin: z.string().nullable(),
  kind: z.enum(KINDS),
  key: z.string(),
  label: z.string(),
  count: z.number().int(),
  pointer: z.number().int(),
  keyboard: z.number().int(),
  lastAt: z.number().int(),
});
export type SummaryItem = z.infer<typeof summaryItemSchema>;

export const summarySchema = z.object({
  total: z.number().int(),
  /** Every plugin seen in the range, busiest first; null is bb itself. */
  plugins: z.array(z.object({ plugin: z.string().nullable(), count: z.number().int() })),
  items: z.array(summaryItemSchema),
  /** When the first event in the database happened; null when it is empty. */
  firstAt: z.number().int().nullable(),
});
export type Summary = z.infer<typeof summarySchema>;

export const timelineQuerySchema = z
  .object({
    sinceMs: z.number().int().nullable(),
    untilMs: z.number().int().nullable(),
    kind: z.enum(KINDS).nullable(),
    plugin: z.string().nullable(),
    /** Bucket width; an hour, six hours, a day, or a week. */
    bucketMs: z.number().int().min(60_000),
    /** The client's UTC offset, so day buckets start at its midnight rather than UTC's. */
    offsetMs: z.number().int(),
  })
  .strict();
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const timelineBucketSchema = z.object({ start: z.number().int(), count: z.number().int() });
export type TimelineBucket = z.infer<typeof timelineBucketSchema>;

export const storedEventSchema = eventSchema.extend({ id: z.number().int() });
export type StoredEvent = z.infer<typeof storedEventSchema>;

export const rpcContract = defineRpcContract({
  record: {
    input: z.object({ events: z.array(eventSchema).max(MAX_BATCH) }).strict(),
    output: z.null(),
  },
  summary: {
    input: summaryQuerySchema,
    output: summarySchema,
  },
  timeline: {
    input: timelineQuerySchema,
    /** Only buckets with events, oldest first; the client fills the gaps. */
    output: z.array(timelineBucketSchema),
  },
  recent: {
    input: z.object({ limit: z.number().int().min(1).max(1000) }).strict(),
    output: z.array(storedEventSchema),
  },
});
