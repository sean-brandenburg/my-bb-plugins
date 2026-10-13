import { PluginCliError, cliCommand, defineCli, type PluginSettingsHandle } from "@get-bb/plugin-sdk";
import { WHISPER_MODEL_NAMES, WHISPER_MODELS } from "../contract.ts";
import { describeSelection } from "./selection.ts";
import { isWhisperModel, languageFrom, setupFrom, type SETTINGS } from "./settings.ts";
import type { Voice } from "./voice.ts";

const json = { type: "boolean", description: "Emit machine-readable JSON" } as const;

function output(value: unknown, asJson: boolean | undefined, text: () => string) {
  return { exitCode: 0, stdout: asJson ? `${JSON.stringify(value, null, 2)}\n` : `${text()}\n` };
}

function formatBytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function localVoiceCli(voice: Voice, settings: PluginSettingsHandle<typeof SETTINGS>, pluginId: string) {
  return defineCli({
    name: "local-voice",
    summary: "Local speech-to-text for bb's voice input (whisper.cpp or an OpenAI-compatible server)",
    commands: {
      status: cliCommand({
        summary: "Show the engine, whether it is ready, and whether bb's voice input uses it",
        options: { json },
        async run(input) {
          const values = await settings.get();
          const setup = setupFrom(values);
          const [status, voiceInput] = await Promise.all([voice.hostStatus(false), voice.voiceSelection()]);
          const result = {
            engine: setup.engine.kind,
            language: languageFrom(values),
            ...(setup.engine.kind === "whisper-server" ? { model: setup.engine.modelPath.trim() || setup.engine.model } : { url: setup.engine.url }),
            ...status,
            voiceInput: { selection: describeSelection(voiceInput.selection, pluginId), usesThisPlugin: voiceInput.usesUs },
          };
          return output(result, input.options.json, () =>
            [
              `Engine       ${result.engine}`,
              `Ready        ${status.ready ? "yes" : `no: ${status.message}`}`,
              ...(status.modelPath === null ? [] : [`Model file   ${status.modelPath}`, `Loaded       ${status.loaded ? "yes" : "no"}`]),
              ...("url" in result ? [`Server       ${result.url}`] : []),
              `Language     ${result.language}`,
              `Voice input  ${result.voiceInput.selection}${voiceInput.usesUs ? " (uses this plugin)" : " (does not use this plugin; run `bb local-voice use`)"}`,
            ].join("\n"),
          );
        },
      }),

      models: cliCommand({
        summary: "List the whisper.cpp models `download` can fetch",
        options: { json },
        async run(input) {
          const [models, values] = await Promise.all([voice.models(), settings.get()]);
          return output(models, input.options.json, () =>
            models
              .map((model) => {
                const marks = [model.downloaded ? "downloaded" : null, model.name === values.model ? "selected" : null].filter(Boolean);
                return `${model.name.padEnd(22)} ${model.size.padEnd(9)} ${marks.join(", ")}`.trimEnd();
              })
              .join("\n"),
          );
        },
      }),

      download: cliCommand({
        summary: "Download a whisper.cpp model from huggingface.co/ggerganov/whisper.cpp (defaults to the selected model)",
        positionals: [{ name: "model", description: "Model name from `bb local-voice models`", required: false }],
        options: { json },
        async run(input, ctx) {
          const model = input.positionals.model ?? (await settings.get()).model;
          if (!isWhisperModel(model)) {
            throw new PluginCliError(`Unknown model "${model}"`, { code: "invalid_value", hint: `Use one of: ${WHISPER_MODEL_NAMES.join(", ")}.` });
          }
          const result = await voice.download(model, ctx.signal);
          return output(result, input.options.json, () =>
            result.alreadyPresent
              ? `${model} is already downloaded: ${result.path}`
              : `Downloaded ${model} (${formatBytes(result.bytes)}, expected ${WHISPER_MODELS[model]}) to ${result.path}`,
          );
        },
      }),

      unload: cliCommand({
        summary: "Stop whisper-server and free the model's memory until the next recording",
        options: { json },
        async run(input) {
          const unloaded = await voice.unload(true);
          return output({ unloaded }, input.options.json, () => (unloaded ? "Unloaded the model." : "No model was loaded."));
        },
      }),

      use: cliCommand({
        summary: "Make this plugin bb's voice input service",
        options: { json },
        async run(input) {
          await voice.use();
          return output({ selection: "this plugin" }, input.options.json, () => "bb's voice input now uses Local voice.");
        },
      }),
    },
  });
}
