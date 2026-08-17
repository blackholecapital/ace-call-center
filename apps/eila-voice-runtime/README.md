# EILA Voice Runtime

Self-hosted realtime speech runtime shared by ACE Host, Blackhole/Buddy's, EILA Overwatch, and the upcoming EILA video-call engine.

## Why it exists

The first ACE implementation waited for a complete remote response and then waited again for a complete TTS file. This runtime pipelines those stages:

1. stream local LLM tokens;
2. create short, natural phrase boundaries;
3. synthesize each phrase with self-hosted Chatterbox Turbo;
4. return 8 kHz G.711 mu-law chunks immediately;
5. let the channel adapter forward audio while the rest of the response is still generating.

The runtime does not contain ACE product logic, Buddy product logic, Twilio credentials, Cloudflare bindings, CRM writes, estimate rules, or EILA People/Calendar policy. Those remain channel/application concerns.

That separation is intentional: **one warm GPU runtime can serve multiple tenants and products while each Worker owns its own prompt, tools, CRM and call flow.**

## API contract

All protected endpoints require `x-runtime-token`.

- `GET /health` - provider readiness and protocol metadata
- `POST /chat` - compatibility endpoint returning `{ "response": "..." }`
- `POST /tts/twilio` - compatibility endpoint returning a complete 8 kHz mu-law payload for older Buddy/Blackhole channel adapters
- `POST /v1/speech` - NDJSON stream for deterministic text-to-speech
- `POST /v1/turn` - NDJSON stream containing LLM deltas, phrases, mu-law audio chunks, and final timing

Important streaming event types:

- `response.started`
- `text.delta`
- `text.phrase`
- `audio.chunk` with base64 `audio/x-mulaw` at 8 kHz
- `audio.completed`
- `response.completed` with `firstAudioMs` and `totalLatencyMs`
- `response.error`

The same text and audio events can feed a telephone channel today and an avatar/lip-sync adapter later.

## Shared deployment model

The intended production shape is:

```text
                       ┌─ ACE voice worker
                       ├─ Buddy/Blackhole voice worker
Cloudflare channels ───┼─ EILA Overwatch / EILA voice worker
                       └─ future ASOS/other tenant adapters
                               │
                               ▼
                    one EILA Voice Runtime
                    Ollama + Qwen 3.5 9B
                    Chatterbox Turbo
                               │
                               └─ future MuseTalk/video adapter
```

Older Buddy/Blackhole Workers can use `/chat` + `/tts/twilio`. ACE already supports `/v1/turn`. Overwatch can use `/chat`. This lets the channels come online against one GPU process without running a separate legacy Buddy inference server.

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

## Alley/EILA voice reference

Place the licensed/consented British female reference at:

```text
assets/voices/alley/reference.wav
```

The canonical Blackhole voice backup dated 2026-08-17 preserves the working reference plus the Hugging Face model cache and Ollama `qwen3.5:9b` model store. Voice biometric material remains out of Git.

## LLM providers

`ollama` uses the local `/api/generate` streaming endpoint. `openai-compatible` uses a local `/v1/chat/completions` SSE server such as vLLM. The latter describes the wire format and does not require OpenAI.

The default recovery model is now:

```text
qwen3.5:9b
```

## Production acceptance targets

- p50 first audio below 800 ms
- p95 first audio below 1.2 seconds
- interruption clears queued Twilio audio within 250 ms
- no provider API required for LLM or TTS
- runtime remains warm between calls
- voice reference and runtime token mounted as secrets, never committed

Do not enable or repoint production channel adapters until `/health`, `/chat`, `/tts/twilio`, `/v1/speech`, and a complete test call pass.

## Canonical recovery source

Large artifacts are not stored in GitHub. The canonical 2026-08-17 voice recovery archive lives on the Blackhole hot sidecar at:

```text
/mnt/eila-hot-sidecar/backups/runtime/runpod-voice-2026-08-17/eila-voice-portable-2026-08-17.tar
```

Verified SHA256:

```text
3c4f8c983ebaae9b12efd2c4eb1f64cdb1448b3891be132d12028fef87358d9c
```

The archive contains the preserved model stores, reference voice and historical runtime state. GitHub supplies current application code. GPU hosts such as Vast are disposable compute targets.
