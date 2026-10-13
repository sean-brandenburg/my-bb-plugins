import type { BbPluginApi, PluginAiServiceStatus, PluginAiTranscribeOptions, PluginSettingsHandle } from "@get-bb/plugin-sdk";
import { setTimeout as sleep } from "node:timers/promises";
import { DOWNLOAD_TIMEOUT_MS, TRANSCRIBE_TIMEOUT_MS, hostContract, type Status, type WhisperModel } from "../contract.ts";
import { SERVICE_ID, voiceUsesUs, type Selection } from "./selection.ts";
import { languageFrom, setupFrom, type SETTINGS } from "./settings.ts";

const STATUS_TIMEOUT_MS = 5_000;
const SELECTION_POLL_MS = 60_000;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type Voice = ReturnType<typeof createVoice>;

/** The AI service bb calls, plus the operations `bb local-voice` exposes; each reads the settings afresh. */
export function createVoice(bb: BbPluginApi, settings: PluginSettingsHandle<typeof SETTINGS>) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  // Whether bb sends recordings here, as of the last check; only then is the model kept loaded.
  let inUse = false;
  // Whether whisper-server may be running, so a deselected service frees its memory once.
  let mayBeLoaded = false;

  async function hostId(): Promise<string> {
    const { primaryHostId } = await bb.sdk.system.config();
    if (primaryHostId === null) throw new Error("The bb server machine is not connected yet.");
    return primaryHostId;
  }

  async function hostStatus(warm: boolean): Promise<Status> {
    const setup = setupFrom(await settings.get());
    if (warm && setup.engine.kind === "whisper-server") mayBeLoaded = true;
    return host.call("status", { ...setup, warm }, { hostId: await hostId(), timeoutMs: STATUS_TIMEOUT_MS });
  }

  async function voiceSelection(): Promise<{ selection: Selection; usesUs: boolean }> {
    const { selections, services } = await bb.sdk.system.aiServices();
    return { selection: selections.voice, usesUs: voiceUsesUs(selections.voice, services, bb.pluginId) };
  }

  async function unload(untilNextRecording: boolean): Promise<boolean> {
    mayBeLoaded = false;
    return (await host.call("unload", { untilNextRecording }, { hostId: await hostId(), timeoutMs: STATUS_TIMEOUT_MS })).unloaded;
  }

  /** Loads the model while bb would send recordings here and frees it once bb wouldn't. */
  async function reconcile(): Promise<void> {
    try {
      inUse = (await voiceSelection()).usesUs;
      const { engine } = setupFrom(await settings.get());
      if (inUse && engine.kind === "whisper-server") await hostStatus(true);
      else if (mayBeLoaded) await unload(false);
    } catch (error) {
      bb.log.warn(`Could not reconcile the voice model: ${errorMessage(error)}`);
    }
  }

  return {
    // bb.sdk.system.aiServices() calls this, so it must not call aiServices() itself.
    async status(): Promise<PluginAiServiceStatus> {
      try {
        const result = await hostStatus(inUse);
        return result.ready ? { ready: true } : { ready: false, message: result.message ?? "Not ready" };
      } catch (error) {
        return { ready: false, message: errorMessage(error) };
      }
    },

    async transcribe(audio: File, { signal, hint }: PluginAiTranscribeOptions): Promise<string> {
      const values = await settings.get();
      const setup = setupFrom(values);
      inUse = true;
      if (setup.engine.kind === "whisper-server") mayBeLoaded = true;
      const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
      const { text } = await host.call(
        "transcribe",
        { ...setup, audioBase64, language: languageFrom(values), hint },
        { hostId: await hostId(), signal, timeoutMs: TRANSCRIBE_TIMEOUT_MS },
      );
      return text;
    },

    hostStatus,
    voiceSelection,
    unload,
    reconcile,

    async models() {
      return host.call("models", null, { hostId: await hostId() });
    },

    async download(model: WhisperModel, signal?: AbortSignal) {
      const result = await host.call("download", { model }, { hostId: await hostId(), signal, timeoutMs: DOWNLOAD_TIMEOUT_MS });
      void reconcile();
      return result;
    },

    async use(): Promise<void> {
      await bb.sdk.system.setAiServiceSelection({ task: "voice", selection: { mode: "service", pluginId: bb.pluginId, serviceId: SERVICE_ID } });
      void reconcile();
    },

    async watch(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        await reconcile();
        await sleep(SELECTION_POLL_MS, undefined, { signal }).catch(() => {});
      }
    },
  };
}
