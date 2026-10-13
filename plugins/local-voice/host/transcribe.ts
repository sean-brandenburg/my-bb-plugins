import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { run } from "./process.ts";

/** Whisper's own annotations for non-speech ("[BLANK_AUDIO]", "[Music]", "(silence)"), which are never dictation. */
const ANNOTATION = /\[[^\]]*\]|\((?:silence|music|blank[ _]audio|inaudible|no speech)[^)]*\)/gi;

export function cleanTranscript(text: string): string {
  return text.replace(ANNOTATION, " ").replace(/\s+/g, " ").trim();
}

/**
 * Re-encodes a recording (bb's are WebM, Ogg, or MP4) as the 16 kHz mono WAV whisper.cpp reads, which
 * every transcription server also accepts.
 */
export async function toWav(
  audio: Buffer,
  options: { ffmpeg: string; tempDir: string; timeoutMs: number; signal: AbortSignal },
): Promise<Buffer> {
  const base = nodePath.join(options.tempDir, randomUUID());
  const input = `${base}.in`;
  const output = `${base}.wav`;
  try {
    await writeFile(input, audio);
    await run(
      options.ffmpeg,
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", "-y", output],
      { timeoutMs: options.timeoutMs, signal: options.signal },
    );
    return await readFile(output);
  } finally {
    await Promise.all([rm(input, { force: true }), rm(output, { force: true })]);
  }
}

export interface TranscriptionRequest {
  url: string;
  wav: Buffer;
  fields: Record<string, string | null>;
  apiKey?: string;
  signal: AbortSignal;
}

/** Posts a WAV as multipart `file` to whisper-server's /inference or an OpenAI-style /v1/audio/transcriptions. */
export async function requestTranscript(request: TranscriptionRequest): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(request.wav)], { type: "audio/wav" }), "recording.wav");
  for (const [name, value] of Object.entries(request.fields)) {
    if (value !== null && value !== "") form.append(name, value);
  }
  const response = await fetch(request.url, {
    method: "POST",
    body: form,
    signal: request.signal,
    headers: request.apiKey ? { authorization: `Bearer ${request.apiKey}` } : {},
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${request.url} answered ${response.status}: ${body.trim().slice(0, 500) || response.statusText}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`${request.url} did not answer with JSON: ${body.trim().slice(0, 200)}`);
  }
  const text = (parsed as { text?: unknown } | null)?.text;
  if (typeof text !== "string") {
    const error = (parsed as { error?: unknown } | null)?.error;
    throw new Error(`${request.url} answered without a transcript${error ? `: ${JSON.stringify(error).slice(0, 300)}` : ""}`);
  }
  return cleanTranscript(text);
}
