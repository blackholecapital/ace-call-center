# EILA Voice Runtime

Self-hosted realtime speech runtime shared by ACE Host, Blackhole, Buddy's, and the upcoming EILA video-call engine.

## Why it exists

The first ACE implementation waited for a complete RunPod response and then waited again for a complete OpenAI TTS file. Live measurements showed roughly 2.3–2.75 seconds for response generation plus 1.8–3.1 seconds for TTS. This runtime pipelines those stages:

1. stream local LLM tokens;
2. create short, natural phrase boundaries;
3. synthesize each phrase with self-hosted Chatterbox Turbo;
4. return 8 kHz G.711 mu-law chunks immediately;
5. let the channel adapter forward audio while the rest of the response is still generating.

The runtime does not contain ACE product logic, Twilio credentials, Cloudflare bindings, CRM writes, or estimate rules. Those remain channel/application concerns.

## API contract

All paid endpoints require `x-runtime-token`.

- `GET /health` — provider readiness and protocol metadata
- `POST /chat` — compatibility endpoint returning `{ "response": "..." }`
- `POST /v1/speech` — NDJSON stream for deterministic text-to-speech
- `POST /v1/turn` — NDJSON stream containing LLM deltas, phrases, mu-law audio chunks, and final timing

Important event types:

- `response.started`
- `text.delta`
- `text.phrase`
- `audio.chunk` with base64 `audio/x-mulaw` at 8 kHz
- `audio.completed`
- `response.completed` with `firstAudioMs` and `totalLatencyMs`
- `response.error`

The same text and audio events can feed a telephone channel today and an avatar/lip-sync adapter later.

## Quick boot

```bash
cd apps/eila-voice-runtime
cp .env.example .env
openssl rand -hex 32
# Put that value in EILA_RUNTIME_TOKEN, then configure the local LLM and voice reference.
./quick-boot.sh
```

The first boot creates `.venv`, installs pinned dependencies, loads Chatterbox, and starts port 8000. Later boots skip installation unless `requirements.txt` changed.

In another terminal:

```bash
cd apps/eila-voice-runtime
set -a
source .env
set +a
./scripts/smoke.sh
```

## Alley voice reference

Place a clean, licensed or explicitly consented British female reference at:

```text
assets/voices/alley/reference.wav
```

Use a dry recording with one speaker, no music, and roughly 5–15 seconds of natural speech. The file is intentionally ignored by Git so biometric voice material never enters the repository.

## LLM providers

`ollama` uses the local `/api/generate` streaming endpoint. `openai-compatible` uses a local `/v1/chat/completions` SSE server such as vLLM. The latter does not mean OpenAI is called; it describes the wire format.

## Production acceptance targets

- p50 first audio below 800 ms
- p95 first audio below 1.2 seconds
- interruption clears queued Twilio audio within 250 ms
- no provider API required for LLM or TTS
- runtime remains warm between calls
- voice reference and runtime token mounted as secrets, never committed

Do not enable the ACE streaming feature flag until `/health`, `/v1/speech`, and a complete test call pass. The Worker retains the previous path as an automatic rollback.
