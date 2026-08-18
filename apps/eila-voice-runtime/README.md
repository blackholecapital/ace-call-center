# EILA Voice Runtime

Self-hosted realtime speech runtime shared by ACE Host, Blackhole/Buddy's, EILA Overwatch, and the upcoming EILA video-call engine.

## Why it exists

The runtime keeps one local LLM and one Chatterbox Turbo model warm on the GPU, while Cloudflare Workers continue to own tenant-specific prompts, CRM writes, tools and call flows.

It pipelines:

1. local LLM tokens;
2. short natural phrase boundaries;
3. Chatterbox Turbo synthesis;
4. immediate 8 kHz G.711 mu-law audio;
5. channel forwarding while the remainder of the response is still generating.

That separation allows one GPU process to serve multiple products without cloning a full inference stack for every tenant.

## API contract

All protected endpoints require `x-runtime-token`.

- `GET /health` - provider readiness, loaded voices and protocol metadata
- `POST /chat` - compatibility endpoint returning `{ "response": "..." }`
- `POST /tts/twilio` - complete 8 kHz mu-law payload; accepts optional `voiceId`
- `POST /v1/speech` - NDJSON TTS stream; accepts optional `voiceId`
- `POST /v1/turn` - NDJSON LLM + TTS stream; accepts optional `voiceId`

The same text/audio events can feed telephone channels today and MuseTalk/avatar adapters later.

## Shared deployment model

```text
                       ┌─ ACE voice worker       voiceId=ace
                       ├─ Buddy/Blackhole worker current ChatGPT voice for now
Cloudflare channels ───┼─ EILA Overwatch         voiceId=eila
                       └─ future ASOS/tenants     voiceId=<profile>
                               │
                               ▼
                    one EILA Voice Runtime
                    Ollama + Qwen 3.5 9B
                    one Chatterbox Turbo model
                               │
                               ├─ eila conditionals
                               ├─ ace conditionals
                               └─ future profiles
```

## Voice profiles

Each selectable profile is a directory containing a clean reference WAV:

```text
assets/voices/
├── eila/
│   └── reference.wav
├── ace/
│   └── reference.wav
└── another-profile/
    └── reference.wav
```

Chatterbox model weights are loaded once. Speaker conditionals are prepared per profile, cached and swapped under a synthesis lock so simultaneous tenant requests cannot cross voices.

Current recovery configuration:

```text
EILA_TTS_DEFAULT_VOICE=eila
EILA_TTS_VOICE_ALIASES=ace:eila
```

That means EILA and ACE can temporarily share the EILA WAV. When a dedicated ACE recording is ready, place it at:

```text
assets/voices/ace/reference.wav
```

and remove the `ace:eila` alias. No second Chatterbox model or second GPU runtime is required.

Buddy's remains on its existing ChatGPT/OpenAI TTS voice until intentionally migrated.

### Request examples

```json
{"text":"Hello from EILA.","voiceId":"eila"}
```

```json
{"text":"Hello from ACE.","voiceId":"ace"}
```

For `/v1/turn`, add the same `voiceId` field beside `prompt`, `tenantId`, and `assistantName`.

## Quick boot

```bash
cd apps/eila-voice-runtime
cp .env.example .env
openssl rand -hex 32
# Put that value in EILA_RUNTIME_TOKEN.
./quick-boot.sh
```

The first boot creates a virtual environment, installs pinned dependencies, loads Chatterbox and starts port 8000. Later boots skip dependency installation unless `requirements.txt` changes.

## Vast RTX 5090 bootstrap

The canonical Blackhole recovery archive is:

```text
/mnt/eila-hot-sidecar/backups/runtime/runpod-voice-2026-08-17/eila-voice-portable-2026-08-17.tar
```

Verified SHA256:

```text
3c4f8c983ebaae9b12efd2c4eb1f64cdb1448b3891be132d12028fef87358d9c
```

Optional current voice profiles should be copied separately to the GPU as:

```text
/workspace/voice-profiles/eila/reference.wav
/workspace/voice-profiles/ace/reference.wav
```

Then run:

```bash
bash apps/eila-voice-runtime/scripts/vast-5090-bootstrap.sh \
  /workspace/eila-voice-portable-2026-08-17.tar
```

The bootstrap verifies the archive, restores Qwen and Hugging Face model state, overlays `/workspace/voice-profiles`, boots Ollama and the EILA runtime, then tests EILA plus the ACE alias.

## LLM provider

The canonical recovered local model is:

```text
qwen3.5:9b
```

`ollama` uses the local `/api/generate` endpoint. `openai-compatible` can target an SSE-compatible local server such as vLLM.

## Security

Reference WAVs and runtime tokens are private runtime material. They must not be committed to Git. Canonical voice profiles live on Blackhole under:

```text
/mnt/eila-hot-sidecar/backups/runtime/voice-profiles/
```

## Production acceptance targets

- p50 first audio below 800 ms
- p95 first audio below 1.2 seconds
- interruption clears queued Twilio audio within 250 ms
- no external provider required for LLM or Chatterbox TTS
- runtime remains warm between calls
- voice references and runtime token remain outside source control

Do not repoint production channels until `/health`, `/chat`, `/tts/twilio`, `/v1/speech`, voice routing and a complete test call pass.
