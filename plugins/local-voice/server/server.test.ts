import assert from "node:assert/strict";
import { test } from "node:test";
import { SERVICE_ID, describeSelection, voiceUsesUs, type ServiceSummary } from "./selection.ts";
import { languageFrom, setupFrom, type SettingValues } from "./settings.ts";

const ME = "local-voice";

const service = (pluginId: string, automaticRank: number | null, ready: boolean, id = pluginId === ME ? SERVICE_ID : "bb"): ServiceSummary => ({
  pluginId,
  id,
  automaticRank,
  status: { ready },
  tasks: ["voice"],
});

test("voiceUsesUs follows an explicit choice", () => {
  assert.ok(voiceUsesUs({ mode: "service", pluginId: ME, serviceId: SERVICE_ID }, [], ME));
  assert.ok(!voiceUsesUs({ mode: "service", pluginId: "bb-ai", serviceId: "bb" }, [service(ME, 2, true)], ME));
  assert.ok(!voiceUsesUs({ mode: "off" }, [service(ME, 1, true)], ME));
});

test("voiceUsesUs under Automatic: the first ready service by rank", () => {
  const automatic = { mode: "automatic" } as const;
  assert.ok(voiceUsesUs(automatic, [service("bb-ai", 1, false), service(ME, 2, true)], ME));
  assert.ok(!voiceUsesUs(automatic, [service(ME, 2, true), service("bb-ai", 1, true)], ME));
  assert.ok(!voiceUsesUs(automatic, [service(ME, 2, false)], ME));
  assert.ok(!voiceUsesUs(automatic, [{ ...service(ME, 1, true), tasks: ["thread-title"] }], ME));
  assert.ok(!voiceUsesUs(automatic, [service(ME, null, true)], ME));
});

test("describeSelection names this plugin", () => {
  assert.equal(describeSelection({ mode: "service", pluginId: ME, serviceId: SERVICE_ID }, ME), "this plugin");
  assert.equal(describeSelection({ mode: "service", pluginId: "bb-ai", serviceId: "bb" }, ME), "bb-ai/bb");
  assert.equal(describeSelection({ mode: "automatic" }, ME), "automatic");
});

const values: SettingValues = {
  engine: "whisper-server",
  language: "auto",
  model: "large-v3-turbo-q8_0",
  modelPath: "",
  whisperServer: "whisper-server",
  threads: 4,
  unloadAfterMinutes: 30,
  ffmpeg: "ffmpeg",
  serverUrl: "http://127.0.0.1:8000/v1/audio/transcriptions",
  serverModel: "",
};

test("setupFrom builds the whisper-server engine, falling back on hand-edited junk", () => {
  assert.deepEqual(setupFrom(values), {
    engine: { kind: "whisper-server", binary: "whisper-server", model: "large-v3-turbo-q8_0", modelPath: "", threads: 4, unloadAfterMinutes: 30 },
    ffmpeg: "ffmpeg",
  });
  const junk = setupFrom({ ...values, model: "nope", whisperServer: "  ", ffmpeg: "" });
  assert.equal(junk.engine.kind === "whisper-server" && junk.engine.model, "large-v3-turbo-q8_0");
  assert.equal(junk.engine.kind === "whisper-server" && junk.engine.binary, "whisper-server");
  assert.equal(junk.ffmpeg, "ffmpeg");
});

test("setupFrom builds the openai-compatible engine and only passes a string API key", () => {
  const withKey = setupFrom({ ...values, engine: "openai-compatible", serverModel: " parakeet ", serverApiKey: "k" });
  assert.deepEqual(withKey.engine, { kind: "openai-compatible", url: values.serverUrl, model: "parakeet", apiKey: "k" });
  const noKey = setupFrom({ ...values, engine: "openai-compatible" });
  assert.equal(noKey.engine.kind === "openai-compatible" && noKey.engine.apiKey, "");
});

test("languageFrom normalizes and rejects anything but auto or a code", () => {
  assert.equal(languageFrom({ ...values, language: " EN " }), "en");
  assert.equal(languageFrom({ ...values, language: "english" }), "auto");
});
