bb's voice input, transcribed by a speech model on your own machine instead of bb cloud.

## What you get

- A **Local voice** service under Settings → AI services that bb's microphone uses for voice input. Nothing leaves your machine.
- whisper.cpp out of the box: the plugin runs `whisper-server`, loads the model ahead of your first recording, and unloads it after 30 minutes without one.
- Any model you like: pick a whisper.cpp model (large-v3-turbo by default), point at your own ggml file, or send recordings to any OpenAI-compatible transcription server you run, such as Parakeet or faster-whisper.
- `bb local-voice` to check readiness, download models, and switch bb's voice input to this plugin.

## Setup

```sh
brew install whisper.cpp ffmpeg
bb local-voice download   # the selected model, ~875 MB by default
bb local-voice use        # route bb's voice input here
```

## How it works

bb hands each recording to the plugin. ffmpeg converts it to 16 kHz WAV, and the warm whisper-server transcribes it, using bb's vocabulary hint as whisper's prompt so project names and identifiers come out right. bb waits up to 10 seconds for each transcript.
