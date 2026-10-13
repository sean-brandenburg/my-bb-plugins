import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import nodePath from "node:path";
import { after, before, test } from "node:test";
import { downloadedModelPath, modelPathFor } from "./models.ts";
import { resolveExecutable } from "./process.ts";
import { cleanTranscript, requestTranscript, toWav } from "./transcribe.ts";
import { WhisperServer, type Launch } from "./whisper-server.ts";

let dir = "";
let fakeServer = "";

// Stands in for whisper-server: listens on --port once "loaded", answers /inference with the form it got.
const FAKE_WHISPER_SERVER = `#!${process.execPath}
const http = require("node:http");
const args = process.argv.slice(2);
const arg = (name) => args[args.indexOf(name) + 1];
if (arg("--model").includes("broken")) { console.error("error: failed to load model"); process.exit(3); }
const loadMs = arg("--model").includes("slow") ? 300 : 0;
let loaded = false;
const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.statusCode = loaded ? 200 : 503; res.end(); return; }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("latin1");
    const prompt = /name="prompt"\\r\\n\\r\\n([^\\r]*)/.exec(body)?.[1] ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ text: " [BLANK_AUDIO] heard " + prompt + " pid " + process.pid + " " }));
  });
});
server.listen(Number(arg("--port")), "127.0.0.1", () => setTimeout(() => (loaded = true), loadMs));
`;

before(async () => {
  dir = await mkdtemp(nodePath.join(os.tmpdir(), "local-voice-test-"));
  fakeServer = nodePath.join(dir, "whisper-server");
  await writeFile(fakeServer, FAKE_WHISPER_SERVER);
  await chmod(fakeServer, 0o755);
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const lease = () => {
  const counts = { acquired: 0, disposed: 0 };
  return {
    counts,
    retain: () => {
      counts.acquired += 1;
      let disposed = false;
      return {
        dispose() {
          if (!disposed) counts.disposed += 1;
          disposed = true;
        },
      };
    },
  };
};

function launch(model: string, overrides: Partial<Launch> = {}): Launch {
  return { binary: fakeServer, modelPath: nodePath.join(dir, model), threads: 4, unloadAfterMinutes: 1, ...overrides };
}

async function inference(port: number, prompt: string): Promise<string> {
  return requestTranscript({
    url: `http://127.0.0.1:${port}/inference`,
    wav: Buffer.from("RIFF"),
    fields: { prompt, response_format: "json" },
    signal: AbortSignal.timeout(5_000),
  });
}

const until = async (condition: () => boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test("cleanTranscript drops whisper's non-speech annotations and squeezes whitespace", () => {
  assert.equal(cleanTranscript(" [BLANK_AUDIO] "), "");
  assert.equal(cleanTranscript(" Hello  [Music] there (silence)\n"), "Hello there");
  assert.equal(cleanTranscript("call foo(bar) twice"), "call foo(bar) twice");
});

test("resolveExecutable finds bare names on PATH and checks explicit paths", async () => {
  assert.equal(await resolveExecutable("whisper-server", dir), fakeServer);
  assert.equal(await resolveExecutable(fakeServer, ""), fakeServer);
  assert.equal(await resolveExecutable("whisper-server", "/nonexistent"), null);
  assert.equal(await resolveExecutable(nodePath.join(dir, "missing"), ""), null);
});

test("modelPathFor uses a configured file, else the downloaded model", () => {
  const engine = { kind: "whisper-server", binary: "x", model: "base.en", modelPath: "", threads: 4, unloadAfterMinutes: 30 } as const;
  assert.equal(modelPathFor(engine, "/data"), downloadedModelPath("/data", "base.en"));
  assert.equal(downloadedModelPath("/data", "base.en"), "/data/models/ggml-base.en.bin");
  assert.equal(modelPathFor({ ...engine, modelPath: " ~/m/ggml.bin " }, "/data"), nodePath.join(os.homedir(), "m/ggml.bin"));
});

test("requestTranscript posts the WAV and fields, sends the API key, and reports server errors", async () => {
  const seen: { auth?: string; body: string }[] = [];
  let fail = false;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({ auth: req.headers.authorization, body: Buffer.concat(chunks).toString("latin1") });
      if (fail) {
        res.statusCode = 500;
        res.end("model exploded");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ text: " Hello world. " }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/audio/transcriptions`;
  try {
    const text = await requestTranscript({
      url,
      wav: Buffer.from("RIFFdata"),
      fields: { model: "parakeet", prompt: "kubectl, bb", language: null, empty: "" },
      apiKey: "k-123",
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(text, "Hello world.");
    assert.equal(seen[0]!.auth, "Bearer k-123");
    assert.match(seen[0]!.body, /name="file"; filename="recording.wav"\r\nContent-Type: audio\/wav\r\n\r\nRIFFdata/);
    assert.match(seen[0]!.body, /name="model"\r\n\r\nparakeet/);
    assert.match(seen[0]!.body, /name="prompt"\r\n\r\nkubectl, bb/);
    assert.doesNotMatch(seen[0]!.body, /name="language"|name="empty"/);

    await requestTranscript({ url, wav: Buffer.from("x"), fields: {}, signal: AbortSignal.timeout(5_000) });
    assert.equal(seen[1]!.auth, undefined);

    fail = true;
    await assert.rejects(requestTranscript({ url, wav: Buffer.from("x"), fields: {}, signal: AbortSignal.timeout(5_000) }), /answered 500: model exploded/);
  } finally {
    server.close();
  }
});

test("toWav re-encodes a recording as 16 kHz mono PCM", async (t) => {
  const ffmpeg = await resolveExecutable("ffmpeg");
  if (ffmpeg === null) return t.skip("ffmpeg is not installed");
  const ogg = nodePath.join(dir, "tone.ogg");
  execFileSync(ffmpeg, ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5:sample_rate=48000", "-ac", "2", "-c:a", "libopus", "-y", ogg]);
  const wav = await toWav(await readFile(ogg), { ffmpeg, tempDir: dir, timeoutMs: 10_000, signal: AbortSignal.timeout(10_000) });
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 1, "mono");
  assert.equal(wav.readUInt32LE(24), 16_000, "16 kHz");
  assert.equal(wav.readUInt16LE(34), 16, "16-bit");
  await assert.rejects(
    toWav(Buffer.from("not audio"), { ffmpeg, tempDir: dir, timeoutMs: 10_000, signal: AbortSignal.timeout(10_000) }),
    /ffmpeg exited with/,
  );
});

test("WhisperServer starts once, reuses the warm server, and restarts when the launch changes", async () => {
  const whisper = new WhisperServer({ pidFile: nodePath.join(dir, "reuse.pid") });
  const { counts, retain } = lease();
  try {
    const first = launch("slow-a.bin");
    const [port, samePort] = await Promise.all([whisper.ensure(first, retain), whisper.ensure(first, retain)]);
    assert.equal(port, samePort);
    assert.equal(counts.acquired, 1);
    assert.ok(whisper.isLoaded(first));
    const pid = (await inference(port, "x")).split(" pid ")[1];
    assert.equal(await readFile(nodePath.join(dir, "reuse.pid"), "utf8"), pid);
    assert.equal(await inference(await whisper.ensure(first, retain), "again"), `heard again pid ${pid}`);

    const second = launch("b.bin");
    const nextPort = await whisper.ensure(second, retain);
    assert.notEqual((await inference(nextPort, "x")).split(" pid ")[1], pid);
    assert.ok(!whisper.isLoaded(first));
    await until(() => counts.disposed === 1);
    assert.equal(counts.acquired, 2);
  } finally {
    whisper.stop();
  }
  await until(() => counts.disposed === 2);
});

test("WhisperServer reports a server that dies while loading and holds off retrying", async () => {
  let now = 1_000_000;
  const whisper = new WhisperServer({ pidFile: nodePath.join(dir, "broken.pid"), now: () => now });
  const { counts, retain } = lease();
  const broken = launch("broken.bin");
  await assert.rejects(whisper.ensure(broken, retain), /exited \(3\).*failed to load model/);
  assert.match(whisper.recentFailure(broken) ?? "", /failed to load model/);
  assert.ok(!whisper.isRunning());
  await assert.rejects(whisper.ensure(broken, retain), /failed to load model/);
  assert.equal(counts.acquired, 1, "no respawn during the backoff");
  assert.equal(whisper.recentFailure(launch("other.bin")), null);
  now += 31_000;
  assert.equal(whisper.recentFailure(broken), null);
  await until(() => counts.disposed === 1);
});

test("WhisperServer unloads after the idle time, and recordings push it back", async () => {
  const whisper = new WhisperServer({ pidFile: nodePath.join(dir, "idle.pid"), minuteMs: 600 });
  const { counts, retain } = lease();
  const idle = launch("idle.bin");
  try {
    await whisper.ensure(idle, retain);
    await new Promise((resolve) => setTimeout(resolve, 400));
    whisper.touchIfRunning();
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.ok(whisper.isLoaded(idle), "touched 400ms ago, so still loaded");
    await until(() => !whisper.isRunning(), 2_000);
    await until(() => counts.disposed === 1);
  } finally {
    whisper.stop();
  }
});

test("WhisperServer stop during startup kills the child and frees the lease", async () => {
  const whisper = new WhisperServer({ pidFile: nodePath.join(dir, "early.pid") });
  const { counts, retain } = lease();
  const starting = whisper.ensure(launch("slow-early.bin"), retain);
  starting.catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(whisper.stop());
  await assert.rejects(starting, /stopped|exited/);
  await until(() => counts.disposed === 1);
  assert.equal(whisper.recentFailure(launch("slow-early.bin")), null, "a deliberate stop is not a failure");
});

test("WhisperServer warming never delays the idle unload or reloads an idle-unloaded model, but a recording does", async () => {
  const whisper = new WhisperServer({ pidFile: nodePath.join(dir, "warm.pid"), minuteMs: 400 });
  const { counts, retain } = lease();
  const model = launch("warm.bin");
  try {
    whisper.warm(model, retain);
    whisper.warm(model, retain);
    assert.equal(counts.acquired, 1);
    await until(() => whisper.isLoaded(model));
    const polls = setInterval(() => whisper.warm(model, retain), 50);
    try {
      await until(() => !whisper.isRunning(), 2_000);
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      clearInterval(polls);
    }
    assert.ok(!whisper.isRunning(), "warm polls after the idle unload don't reload it");
    assert.equal(counts.acquired, 1);

    await inference(await whisper.ensure(model, retain), "x");
    assert.equal(counts.acquired, 2, "a recording reloads it");

    assert.ok(whisper.unload());
    whisper.warm(model, retain);
    assert.ok(!whisper.isRunning(), "an explicit unload also holds until the next recording");
    whisper.warm(launch("other-warm.bin"), retain);
    assert.ok(whisper.isRunning(), "changed settings warm normally");
  } finally {
    whisper.stop();
  }
  await until(() => counts.disposed === counts.acquired);
});
