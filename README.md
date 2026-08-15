# ACE Host AI Call Center

ACE Host's custom AI sales and operations dashboard for data-center services, infrastructure products, and AI Automations. Built on:

- Alley AI
- BlackHole Communications Platform
- MessageTrack Dashboard

The ACE dashboard is the frontend default and is also available at `/ace-dashboard/`. It preserves the proven call-center API contracts while deploying to an ACE-only Cloudflare stack.

Every top-level Wrangler target in this repository is ACE-only. A plain `wrangler deploy` cannot target a `blackhole-*` worker. See [ACE tenant deployment](docs/cloudflare/ACE-TENANT-DEPLOYMENT.md) for the resource map, provisioning commands, secret inventory, deploy order, and corporate/franchise scaling model.

## Reusable voice engine

[`apps/eila-voice-runtime`](apps/eila-voice-runtime/README.md) is the provider-neutral, self-hosted realtime speech engine. It streams local model output into self-hosted Chatterbox speech and emits telephone-ready audio without waiting for a complete response. ACE consumes it behind a disabled-by-default feature flag; the same protocol is intended for the EILA video-call engine.
