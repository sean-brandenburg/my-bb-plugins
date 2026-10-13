import type { PluginSettingDescriptors } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { DEFAULT_WHISPER_MODEL, ENGINES, WHISPER_MODEL_NAMES, languageSchema, type Setup, type WhisperModel } from "../contract.ts";

export const SETTINGS = {
  engine: {
    type: "select",
    label: "Engine",
    description:
      "whisper-server: the plugin runs whisper.cpp and keeps the model loaded. openai-compatible: recordings go to a transcription server you run yourself (Parakeet, faster-whisper, …).",
    options: [...ENGINES],
    default: "whisper-server",
  },
  language: {
    type: "string",
    label: "Language",
    description: 'Spoken language as a code such as "en", or "auto" to detect it. Naming it is faster and more accurate.',
    experimental_schema: languageSchema,
    default: "auto",
  },
  model: {
    type: "select",
    label: "Whisper model",
    description: "whisper.cpp model to load. Run `bb local-voice download` after changing it; `bb local-voice models` lists sizes.",
    options: [...WHISPER_MODEL_NAMES],
    default: DEFAULT_WHISPER_MODEL,
  },
  modelPath: {
    type: "string",
    label: "Whisper model file",
    description: "A ggml .bin file to load instead of the downloaded model above. Leave empty to use the model above.",
    default: "",
  },
  whisperServer: {
    type: "string",
    label: "whisper-server",
    description: "The whisper-server executable from `brew install whisper.cpp`. A bare name is looked up on PATH.",
    default: "whisper-server",
  },
  threads: {
    type: "number",
    label: "Threads",
    description: "CPU threads whisper-server uses.",
    experimental_schema: z.number().int().min(1).max(64),
    default: 4,
  },
  unloadAfterMinutes: {
    type: "number",
    label: "Unload after (minutes)",
    description: "Stop whisper-server and free its memory after this many minutes without voice input.",
    experimental_schema: z.number().int().min(1).max(24 * 60),
    default: 30,
  },
  ffmpeg: {
    type: "string",
    label: "ffmpeg",
    description: "Converts bb's recordings to 16 kHz WAV. A bare name is looked up on PATH.",
    default: "ffmpeg",
  },
  serverUrl: {
    type: "string",
    label: "Transcription server URL",
    description: "openai-compatible engine: the endpoint that takes a multipart `file` and answers `{ \"text\" }`.",
    experimental_schema: z.string().url(),
    default: "http://127.0.0.1:8000/v1/audio/transcriptions",
  },
  serverModel: {
    type: "string",
    label: "Transcription server model",
    description: "openai-compatible engine: sent as the `model` field. Leave empty if the server has one model.",
    default: "",
  },
  serverApiKey: {
    type: "string",
    label: "Transcription server API key",
    description: "openai-compatible engine: sent as a Bearer token, for servers that ask for one.",
    secret: true,
  },
} satisfies PluginSettingDescriptors;

export interface SettingValues {
  engine: string;
  language: string;
  model: string;
  modelPath: string;
  whisperServer: string;
  threads: number;
  unloadAfterMinutes: number;
  ffmpeg: string;
  serverUrl: string;
  serverModel: string;
  serverApiKey?: string | number | boolean;
}

export function isWhisperModel(value: string): value is WhisperModel {
  return (WHISPER_MODEL_NAMES as readonly string[]).includes(value);
}

/** The host call's view of the settings; stored values are revalidated since settings files can be hand-edited. */
export function setupFrom(values: SettingValues): Setup {
  if (values.engine === "openai-compatible") {
    return {
      engine: {
        kind: "openai-compatible",
        url: values.serverUrl,
        model: values.serverModel.trim(),
        apiKey: typeof values.serverApiKey === "string" ? values.serverApiKey : "",
      },
      ffmpeg: values.ffmpeg.trim() || "ffmpeg",
    };
  }
  return {
    engine: {
      kind: "whisper-server",
      binary: values.whisperServer.trim() || "whisper-server",
      model: isWhisperModel(values.model) ? values.model : DEFAULT_WHISPER_MODEL,
      modelPath: values.modelPath,
      threads: values.threads,
      unloadAfterMinutes: values.unloadAfterMinutes,
    },
    ffmpeg: values.ffmpeg.trim() || "ffmpeg",
  };
}

export function languageFrom(values: SettingValues): string {
  const language = values.language.trim().toLowerCase();
  return languageSchema.safeParse(language).success ? language : "auto";
}
