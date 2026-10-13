import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { localVoiceCli } from "./server/cli.ts";
import { SERVICE_ID } from "./server/selection.ts";
import { SETTINGS } from "./server/settings.ts";
import { createVoice } from "./server/voice.ts";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define(SETTINGS);
  const voice = createVoice(bb, settings);

  bb.experimental_aiServices.register({
    id: SERVICE_ID,
    displayName: "Local voice",
    transcribe: voice.transcribe,
    status: voice.status,
  });
  bb.cli.register(localVoiceCli(voice, settings, bb.pluginId));
  bb.background.service("model", { start: voice.watch });
  settings.onChange(() => void voice.reconcile());
}
