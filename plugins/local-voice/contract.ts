import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** ggml models published at huggingface.co/ggerganov/whisper.cpp, with their approximate download size. */
export const WHISPER_MODELS = {
  "large-v3-turbo-q8_0": "~875 MB",
  "large-v3-turbo-q5_0": "~575 MB",
  "large-v3-turbo": "~1.6 GB",
  "large-v3-q5_0": "~1.1 GB",
  "large-v3": "~3.1 GB",
  "medium.en": "~1.5 GB",
  medium: "~1.5 GB",
  "small.en": "~490 MB",
  small: "~490 MB",
  "base.en": "~150 MB",
  base: "~150 MB",
  "tiny.en": "~78 MB",
  tiny: "~78 MB",
} as const;
export type WhisperModel = keyof typeof WHISPER_MODELS;
export const WHISPER_MODEL_NAMES = Object.keys(WHISPER_MODELS) as [WhisperModel, ...WhisperModel[]];
export const DEFAULT_WHISPER_MODEL: WhisperModel = "large-v3-turbo-q8_0";

export const ENGINES = ["whisper-server", "openai-compatible"] as const;

/** bb stops waiting for a transcript after 10 seconds. */
export const TRANSCRIBE_TIMEOUT_MS = 10_000;
/** A model download can take a while on a slow connection; the host caps a call at 30 minutes. */
export const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

export const languageSchema = z
  .string()
  .regex(/^(auto|[a-z]{2,3})$/, 'Use "auto" or a language code such as "en"');

export const whisperEngineSchema = z.object({
  kind: z.literal("whisper-server"),
  binary: z.string().min(1),
  model: z.enum(WHISPER_MODEL_NAMES),
  /** A ggml file to use instead of the downloaded `model`; empty to use `model`. */
  modelPath: z.string(),
  threads: z.number().int().min(1).max(64),
  unloadAfterMinutes: z.number().int().min(1).max(24 * 60),
});
export type WhisperEngine = z.infer<typeof whisperEngineSchema>;

export const openAiEngineSchema = z.object({
  kind: z.literal("openai-compatible"),
  url: z.string().url(),
  /** Sent as the `model` form field; empty to omit it. */
  model: z.string(),
  apiKey: z.string(),
});
export type OpenAiEngine = z.infer<typeof openAiEngineSchema>;

export const engineSchema = z.discriminatedUnion("kind", [whisperEngineSchema, openAiEngineSchema]);
export type Engine = z.infer<typeof engineSchema>;

export const setupSchema = z.object({
  engine: engineSchema,
  ffmpeg: z.string().min(1),
});
export type Setup = z.infer<typeof setupSchema>;

export const statusSchema = z.object({
  ready: z.boolean(),
  /** How to become ready, when not ready. */
  message: z.string().nullable(),
  /** The ggml file whisper-server loads; null for the openai-compatible engine. */
  modelPath: z.string().nullable(),
  /** Whether whisper-server is running with the model loaded. */
  loaded: z.boolean(),
});
export type Status = z.infer<typeof statusSchema>;

export const hostContract = defineRpcContract({
  status: {
    input: setupSchema.extend({
      /** Start loading the model when everything it needs is in place. */
      warm: z.boolean(),
    }),
    output: statusSchema,
  },
  transcribe: {
    input: setupSchema.extend({
      audioBase64: z.string().min(1),
      language: languageSchema,
      hint: z.string().nullable(),
    }),
    output: z.object({ text: z.string() }),
  },
  models: {
    input: z.null(),
    output: z.array(z.object({ name: z.enum(WHISPER_MODEL_NAMES), size: z.string(), path: z.string(), downloaded: z.boolean() })),
  },
  download: {
    input: z.object({ model: z.enum(WHISPER_MODEL_NAMES) }),
    output: z.object({ path: z.string(), bytes: z.number(), alreadyPresent: z.boolean() }),
  },
  unload: {
    /** `untilNextRecording` also keeps warming from reloading it; otherwise the next warm reloads it. */
    input: z.object({ untilNextRecording: z.boolean() }),
    output: z.object({ unloaded: z.boolean() }),
  },
});
