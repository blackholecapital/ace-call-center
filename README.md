# ACE Host AI Call Center

ACE Host's custom AI sales and operations dashboard for data-center services, infrastructure products, and AI Automations. Built on:

- Alley AI
- BlackHole Communications Platform
- MessageTrack Dashboard

The ACE dashboard is the frontend default and is also available at `/ace-dashboard/`. It preserves the proven call-center API contracts while deploying to an ACE-only Cloudflare stack.

Every top-level Wrangler target in this repository is ACE-only. A plain `wrangler deploy` cannot target a `blackhole-*` worker. See [ACE tenant deployment](docs/cloudflare/ACE-TENANT-DEPLOYMENT.md) for the resource map, provisioning commands, secret inventory, deploy order, and corporate/franchise scaling model.
