# ACE Host Voice Worker

Cloudflare Worker for ACE Host AI voice calls.

## Realtime path

The worker originates Twilio calls, receives a bidirectional Media Stream, sends caller audio to Deepgram for transcription, and returns synthesized speech. Conversation logic uses the shared RunPod runtime; when `OPENAI_API_KEY` is configured, speech output uses OpenAI `gpt-4o-mini-tts` with the `marin` voice and the ACE Host delivery instructions in `wrangler.toml`. If OpenAI TTS fails, the worker falls back to the shared RunPod TTS endpoint.

## Required secrets

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` — use an ACE-only number
- `INTERNAL_CALL_SECRET` — identical on dashboard, concierge, and voice
- `DEEPGRAM_API_KEY`
- `BUDDY_RUNTIME_TOKEN`
- `OPENAI_API_KEY` — required for the configured Marin voice

Set each secret against the default ACE target:

```bash
npx wrangler secret put OPENAI_API_KEY --config apps/voice-worker/wrangler.toml
```

## Deploy and verify

```bash
npx wrangler deploy --config apps/voice-worker/wrangler.toml
npx wrangler tail ace-voice-worker
```

Expected progression:

1. Twilio call status reaches in-progress.
2. `Twilio media stream started` appears.
3. Deepgram connects and emits final transcript events.
4. The log reports `provider: openai`, `model: gpt-4o-mini-tts`, and `voice: marin` for ACE speech.
5. The stream close log reports audio and transcript counts.

The RunPod URL may remain shared for controlled demos. Move ACE to a dedicated runtime only when independent capacity, releases, or data-processing isolation are required.
