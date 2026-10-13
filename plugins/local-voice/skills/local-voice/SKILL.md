---
name: local-voice
description: Set up, check, or troubleshoot the Local voice plugin, which transcribes bb's voice input with a local speech model (whisper.cpp's whisper-server, or an OpenAI-compatible transcription server such as Parakeet or faster-whisper). Use when the user asks about local or offline voice input or dictation, the microphone not showing, choosing or downloading a whisper model, or `bb local-voice`.
---

# Local voice

The plugin registers the `local` AI service for bb's voice task. bb sends it
each recording, and it returns the transcript. Everything runs on the bb
server's machine.

## Commands

```sh
bb local-voice status            # engine, ready or what's missing, model file, loaded, voice selection
bb local-voice models            # whisper.cpp models with sizes; marks downloaded and selected
bb local-voice download [model]  # fetch a ggml model (default: the selected one) from huggingface.co/ggerganov/whisper.cpp
bb local-voice use               # set bb's voice input to this plugin
bb local-voice unload            # stop whisper-server and free its memory now
bb voice transcribe rec.wav      # transcribe a file with whichever voice service bb uses
```

All commands take `--json`. `download` can take minutes, and it fetches
hundreds of MB to a GB or more, so confirm with the user before you run it.

## Setup

1. `brew install whisper.cpp ffmpeg`. whisper.cpp provides `whisper-server`.
2. `bb local-voice download`.
3. `bb local-voice use`. Under Automatic, bb tries bb cloud first, so a
   signed-in bb account would otherwise keep using bb cloud.
4. `bb local-voice status` should say `Ready yes`.

## Settings

Set them with `bb plugin config local-voice set <key> <value>` or under
Settings → Installed plugins.

| Key | Default | Meaning |
| --- | --- | --- |
| `engine` | `whisper-server` | `whisper-server` (the plugin runs whisper.cpp) or `openai-compatible` (your own server) |
| `language` | `auto` | Spoken language code such as `en`; naming it beats auto-detection |
| `model` | `large-v3-turbo-q8_0` | whisper.cpp model; run `download` after changing it |
| `modelPath` | empty | A ggml `.bin` to load instead of `model` |
| `whisperServer` | `whisper-server` | Executable, a bare name on PATH or a path |
| `threads` | `4` | whisper-server CPU threads |
| `unloadAfterMinutes` | `30` | Idle time before whisper-server stops |
| `ffmpeg` | `ffmpeg` | Converts recordings to 16 kHz mono WAV |
| `serverUrl` | `http://127.0.0.1:8000/v1/audio/transcriptions` | openai-compatible endpoint (multipart `file`, answers `{"text"}`) |
| `serverModel` | empty | Sent as the `model` field |
| `serverApiKey` | unset (secret) | Sent as a Bearer token |

## Behavior and limits

- When bb's voice input uses this plugin, chosen outright or picked by
  Automatic, the plugin loads whisper-server ahead of the first recording.
  It checks every minute and after setting changes. It unloads the model
  after `unloadAfterMinutes` without a recording, and after `unload`. It
  doesn't preload again until the next recording, which starts the model
  cold. When bb stops using the plugin, the model is unloaded.
- bb gives a transcription 10 seconds. A recording made right after a cold
  start of a large model can time out once. Smaller models, or naming the
  `language`, load and run faster.
- bb's vocabulary hint goes in as whisper's `prompt`. Whisper's non-speech
  annotations (`[BLANK_AUDIO]`, `[Music]`) are stripped.
- When it isn't ready, the microphone hides. `status` prints the fix: a
  missing ffmpeg or whisper-server, a model that isn't downloaded, or a
  whisper-server that crashed on start. A crash is retried after 30 seconds.
- Models download to the plugin's host data directory. `models` prints the
  paths.
