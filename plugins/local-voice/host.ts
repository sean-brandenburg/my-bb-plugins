// Runs on the bb server's machine: converts recordings with ffmpeg, keeps whisper-server warm, and
// downloads whisper.cpp models.
import { experimental_defineHostEntry, type ExperimentalHostRpcContext } from "@get-bb/plugin-sdk";
import nodePath from "node:path";
import { WHISPER_MODEL_NAMES, WHISPER_MODELS, hostContract, type Setup, type Status, type WhisperEngine } from "./contract.ts";
import { downloadModel, downloadedModelPath, fileSize, modelPathFor } from "./host/models.ts";
import { fileExists, resolveExecutable } from "./host/process.ts";
import { requestTranscript, toWav } from "./host/transcribe.ts";
import { WhisperServer, type Launch } from "./host/whisper-server.ts";

/** Leaves room inside bb's 10-second budget for the transcription itself. */
const CONVERT_TIMEOUT_MS = 5_000;

let server: WhisperServer | null = null;

function whisperServer(context: ExperimentalHostRpcContext): WhisperServer {
  if (server === null) {
    const created = new WhisperServer({ pidFile: nodePath.join(context.experimental_paths.dataDir, "whisper-server.pid") });
    context.lifecycle.signal.addEventListener("abort", () => created.stop(), { once: true });
    server = created;
  }
  return server;
}

/** Something the user has to install or configure; status reports it instead of failing. */
class NotReady extends Error {}

async function requireFfmpeg(command: string): Promise<string> {
  const ffmpeg = await resolveExecutable(command);
  if (ffmpeg === null) throw new NotReady(`ffmpeg not found ("${command}"). Install it with \`brew install ffmpeg\` or set the ffmpeg path.`);
  return ffmpeg;
}

async function requireWhisper(engine: WhisperEngine, dataDir: string): Promise<Launch> {
  const binary = await resolveExecutable(engine.binary);
  if (binary === null) {
    throw new NotReady(`whisper-server not found ("${engine.binary}"). Install whisper.cpp with \`brew install whisper.cpp\` or set its path.`);
  }
  const modelPath = modelPathFor(engine, dataDir);
  if (!(await fileExists(modelPath))) {
    throw new NotReady(
      engine.modelPath.trim() === "" ? `The ${engine.model} model isn't downloaded. Run \`bb local-voice download\`.` : `No model file at ${modelPath}.`,
    );
  }
  return { binary, modelPath, threads: engine.threads, unloadAfterMinutes: engine.unloadAfterMinutes };
}

async function status(input: Setup & { warm: boolean }, context: ExperimentalHostRpcContext): Promise<Status> {
  await requireFfmpeg(input.ffmpeg);
  if (input.engine.kind === "openai-compatible") return { ready: true, message: null, modelPath: null, loaded: false };
  const launch = await requireWhisper(input.engine, context.experimental_paths.dataDir);
  const whisper = whisperServer(context);
  const failure = whisper.recentFailure(launch);
  if (failure !== null) return { ready: false, message: failure, modelPath: launch.modelPath, loaded: false };
  // Loading takes a few seconds, so start it before the first recording rather than inside bb's 10-second wait.
  if (input.warm) whisper.warm(launch, () => context.experimental_retainWorker());
  return { ready: true, message: null, modelPath: launch.modelPath, loaded: whisper.isLoaded(launch) };
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async status(input, context) {
      try {
        return await status(input, context);
      } catch (error) {
        if (error instanceof NotReady) return { ready: false, message: error.message, modelPath: null, loaded: false };
        throw error;
      }
    },

    async transcribe(input, context) {
      const ffmpeg = await requireFfmpeg(input.ffmpeg);
      const { engine } = input;
      const convert = () =>
        toWav(Buffer.from(input.audioBase64, "base64"), {
          ffmpeg,
          tempDir: context.experimental_paths.tempDir,
          timeoutMs: CONVERT_TIMEOUT_MS,
          signal: context.signal,
        });
      if (engine.kind === "openai-compatible") {
        const text = await requestTranscript({
          url: engine.url,
          wav: await convert(),
          fields: {
            model: engine.model,
            prompt: input.hint,
            language: input.language === "auto" ? null : input.language,
            response_format: "json",
            temperature: "0",
          },
          apiKey: engine.apiKey,
          signal: context.signal,
        });
        return { text };
      }
      const whisper = whisperServer(context);
      const port = whisper.ensure(await requireWhisper(engine, context.experimental_paths.dataDir), () => context.experimental_retainWorker());
      port.catch(() => {});
      const wav = await convert();
      const text = await requestTranscript({
        url: `http://127.0.0.1:${await port}/inference`,
        wav,
        fields: { prompt: input.hint, language: input.language, response_format: "json", temperature: "0.0" },
        signal: context.signal,
      });
      whisper.touchIfRunning();
      return { text };
    },

    async models(_input, context) {
      const dataDir = context.experimental_paths.dataDir;
      return Promise.all(
        WHISPER_MODEL_NAMES.map(async (name) => {
          const path = downloadedModelPath(dataDir, name);
          return { name, size: WHISPER_MODELS[name], path, downloaded: (await fileSize(path)) !== null };
        }),
      );
    },

    download(input, context) {
      return downloadModel(context.experimental_paths.dataDir, input.model, context.signal);
    },

    unload(input) {
      return { unloaded: (input.untilNextRecording ? server?.unload() : server?.stop()) ?? false };
    },
  },
  dispose: () => {
    server?.stop();
  },
});
