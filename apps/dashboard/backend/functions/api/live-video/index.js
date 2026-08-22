const LIVEKIT_DISPATCH_PATH = "/twirp/livekit.AgentDispatchService/CreateDispatch";

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function liveKitAdminToken(apiKey, apiSecret) {
  const now = Math.floor(Date.now() / 1000);
  // Match LiveKit's official server SDK token shape exactly. Service tokens
  // have an issuer and grant, but no participant subject/identity.
  const header = base64Url(JSON.stringify({ alg:"HS256" }));
  const payload = base64Url(JSON.stringify({
    iss:String(apiKey),
    nbf:now,
    exp:now + 300,
    video:{ roomAdmin:true },
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(apiSecret)),
    { name:"HMAC", hash:"SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function liveKitHttpUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("LIVEKIT_URL must be ws(s) or http(s)");
  return url.origin;
}

function zoomMeetingUrl(value) {
  if (!value) return "";
  const url = new URL(String(value));
  const host = url.hostname.toLowerCase();
  if (!(host === "zoom.us" || host.endsWith(".zoom.us"))) throw new Error("Use a complete Zoom meeting link");
  if (!/^\/j\/\d+/.test(url.pathname)) throw new Error("Use a Zoom participant join link");
  return url.toString();
}

async function zoomAccessToken(env) {
  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    throw new Error("Zoom meeting creation is not configured; paste an existing Zoom link");
  }
  const credentials = btoa(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`);
  const body = new URLSearchParams({ grant_type:"account_credentials", account_id:env.ZOOM_ACCOUNT_ID });
  const response = await fetch("https://zoom.us/oauth/token", {
    method:"POST",
    headers:{ Authorization:`Basic ${credentials}`, "Content-Type":"application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Zoom rejected the server-to-server credentials");
  const result = await response.json();
  if (!result.access_token) throw new Error("Zoom did not return an access token");
  return result.access_token;
}

async function createZoomMeeting(env, topic) {
  const accessToken = await zoomAccessToken(env);
  const userId = encodeURIComponent(String(env.ZOOM_USER_ID || "me"));
  const response = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
    method:"POST",
    headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      topic:String(topic || "ACE Host live customer service").slice(0, 120),
      type:2,
      start_time:new Date(Date.now() + 60_000).toISOString(),
      duration:60,
      settings:{
        host_video:true,
        participant_video:true,
        join_before_host:true,
        waiting_room:false,
        mute_upon_entry:false,
      },
    }),
  });
  if (!response.ok) throw new Error("Zoom could not create the meeting");
  const meeting = await response.json();
  if (!meeting.join_url) throw new Error("Zoom did not return a join link");
  return zoomMeetingUrl(meeting.join_url);
}

async function dispatchEila(env, meetingUrl) {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error("LiveKit dispatch is not configured");
  }
  const room = `ace-video-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const token = await liveKitAdminToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const response = await fetch(`${liveKitHttpUrl(env.LIVEKIT_URL)}${LIVEKIT_DISPATCH_PATH}`, {
    method:"POST",
    headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      room,
      agent_name:String(env.LIVEKIT_MEETING_AGENT_NAME || "lemonslice"),
      metadata:JSON.stringify({
        meeting_url:meetingUrl,
        bot_name:String(env.LIVE_VIDEO_BOT_NAME || "EILA · ACE Host"),
        listen_to_meeting_chat:true,
      }),
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(`LiveKit dispatch failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const dispatch = await response.json();
  return { room, dispatchId:dispatch.id || dispatch.dispatch_id || null };
}

module.exports = async function handler({ method, body, env }) {
  if (method !== "POST") return { ok:false, error:"Method not allowed" };
  try {
    const suppliedUrl = zoomMeetingUrl(String(body?.meetingUrl || "").trim());
    const joinUrl = suppliedUrl || await createZoomMeeting(env, body?.topic);
    const dispatch = await dispatchEila(env, joinUrl);
    return { ok:true, data:{ joinUrl, ...dispatch } };
  } catch (error) {
    return { ok:false, error:error instanceof Error ? error.message : "Live video could not be started" };
  }
};

module.exports.liveKitAdminToken = liveKitAdminToken;
module.exports.liveKitHttpUrl = liveKitHttpUrl;
module.exports.zoomMeetingUrl = zoomMeetingUrl;
