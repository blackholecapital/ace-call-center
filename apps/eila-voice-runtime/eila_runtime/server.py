from __future__ import annotations

import hmac
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import __version__
from .audio import twilio_mulaw
from .config import Settings
from .engine import VoiceEngine
from .protocol import ndjson, request_id


settings = Settings()
settings.validate()
engine = VoiceEngine(settings)


class ChatRequest(BaseModel):
    text: str = Field(min_length=1, max_length=24000)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    sessionId: str | None = None


class TurnRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=30000)
    sessionId: str | None = None
    tenantId: str | None = None
    assistantName: str | None = None
    metadata: dict = Field(default_factory=dict)
    preface: str | None = Field(default=None, max_length=80)


def authorize(token: str | None) -> None:
    supplied = token or ""
    if not hmac.compare_digest(supplied, settings.runtime_token):
        raise HTTPException(status_code=401, detail="Invalid runtime token")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await engine.tts.load()
    yield


app = FastAPI(title="EILA Voice Runtime", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "eila-voice-runtime",
        "version": __version__,
        "protocol": "ndjson-v1",
        "compatibility": {"chat": True, "legacyTwilioTts": True},
        "llm": {
            "provider": settings.llm_provider,
            "model": settings.llm_model,
            "baseUrlConfigured": bool(settings.llm_base_url),
        },
        "tts": engine.tts.status(),
        "audio": {"encoding": "audio/x-mulaw", "sampleRate": 8000},
    }


@app.post("/chat")
async def compatible_chat(req: ChatRequest, x_runtime_token: str | None = Header(default=None)):
    authorize(x_runtime_token)
    return {"response": await engine.llm.complete(req.text)}


@app.post("/tts/twilio")
async def compatible_twilio_tts(
    req: SpeechRequest,
    x_runtime_token: str | None = Header(default=None),
):
    """Compatibility endpoint for the existing Buddy/Blackhole voice worker.

    The shared runtime remains the single LLM/TTS process. Older channel adapters can
    keep requesting a complete 8 kHz mu-law payload while newer adapters use the
    streaming NDJSON endpoints below.
    """
    authorize(x_runtime_token)
    speech = await engine.tts.synthesize(req.text)
    payload = twilio_mulaw(speech.samples, speech.sample_rate)
    return Response(
        content=payload,
        media_type="audio/x-mulaw",
        headers={
            "x-eila-audio-encoding": "mulaw",
            "x-eila-sample-rate": "8000",
        },
    )


@app.post("/v1/speech")
async def speech(req: SpeechRequest, x_runtime_token: str | None = Header(default=None)):
    authorize(x_runtime_token)
    rid = request_id("speech")

    async def body():
        async for item in engine.stream_speech(req.text, rid):
            yield ndjson(item)

    return StreamingResponse(body(), media_type="application/x-ndjson")


@app.post("/v1/turn")
async def turn(req: TurnRequest, x_runtime_token: str | None = Header(default=None)):
    authorize(x_runtime_token)
    rid = request_id("turn")

    async def body():
        async for item in engine.stream_turn(req.prompt, rid, preface=req.preface or ""):
            yield ndjson(item)

    return StreamingResponse(body(), media_type="application/x-ndjson")
