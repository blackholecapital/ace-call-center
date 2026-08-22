# EILA live video on Zoom

The dashboard's **Live Video Chat** tab can accept an existing Zoom participant
link or create a Zoom meeting through a Server-to-Server OAuth app. It then
creates an explicit LiveKit dispatch for the `lemonslice` agent with the Zoom
link in job metadata.

## Required Worker secrets

Set these from `apps/dashboard` without placing them in Git:

```bash
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET
npx wrangler secret put ZOOM_ACCOUNT_ID
npx wrangler secret put ZOOM_CLIENT_ID
npx wrangler secret put ZOOM_CLIENT_SECRET
```

The three Zoom secrets are only required when ACE Host creates a new meeting.
Dispatching EILA into an existing Zoom link only requires the two LiveKit
secrets.

The Zoom Server-to-Server OAuth app needs permission to create meetings for the
configured `ZOOM_USER_ID` (`me` by default).

## Agent contract

ACE Host dispatches JSON metadata shaped like:

```json
{
  "meeting_url": "https://us05web.zoom.us/j/12345678901?pwd=...",
  "bot_name": "EILA · ACE Host",
  "listen_to_meeting_chat": true
}
```

The matching Alley-AI LiveKit worker must call LemonSlice
`AvatarSession.join_meeting()` before starting the agent session. Regular web
avatar jobs without `meeting_url` continue using the browser LiveKit flow.
