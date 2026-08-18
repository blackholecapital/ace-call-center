from __future__ import annotations

import asyncio
import base64
import time
from collections.abc import AsyncIterator

from .audio import chunks, twilio_mulaw
from .config import Settings
from .llm import StreamingLlm
from .protocol import event
from .text import PhraseChunker
from .tts import ChatterboxSpeech


class VoiceEngine:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.llm = StreamingLlm(settings)
        self.tts = ChatterboxSpeech(settings)

    async def stream_speech(
        self, text: str, request_id: str, voice_id: str | None = None
    ) -> AsyncIterator[dict]:
        started = time.perf_counter()
        resolved_voice = self.settings.resolve_voice_id(voice_id)
        yield event("audio.started", request_id, text=text, voiceId=resolved_voice)
        speech = await self.tts.synthesize(text, resolved_voice)
        payload = twilio_mulaw(speech.samples, speech.sample_rate)
        for sequence, audio_chunk in enumerate(
            chunks(payload, self.settings.audio_chunk_ms, self.settings.telephony_sample_rate)
        ):
            yield event(
                "audio.chunk",
                request_id,
                sequence=sequence,
                encoding="audio/x-mulaw",
                sampleRate=8000,
                voiceId=resolved_voice,
                audio=base64.b64encode(audio_chunk).decode("ascii"),
            )
        yield event(
            "audio.completed",
            request_id,
            voiceId=resolved_voice,
            audioBytes=len(payload),
            latencyMs=round((time.perf_counter() - started) * 1000),
        )

    async def stream_turn(
        self,
        prompt: str,
        request_id: str,
        preface: str = "",
        voice_id: str | None = None,
    ) -> AsyncIterator[dict]:
        started = time.perf_counter()
        resolved_voice = self.settings.resolve_voice_id(voice_id)
        output: asyncio.Queue = asyncio.Queue()
        phrases: asyncio.Queue = asyncio.Queue()
        full_text: list[str] = []
        phrase_count = 0
        audio_bytes = 0
        first_audio_ms = None
        starting_sequence = 0

        clean_preface = preface.strip()
        if clean_preface:
            yield event("response.started", request_id, voiceId=resolved_voice)
            yield event("text.preface", request_id, text=clean_preface, voiceId=resolved_voice)
            speech = await self.tts.synthesize(clean_preface, resolved_voice)
            payload = twilio_mulaw(speech.samples, speech.sample_rate)
            audio_bytes += len(payload)
            for audio_chunk in chunks(
                payload, self.settings.audio_chunk_ms, self.settings.telephony_sample_rate
            ):
                if first_audio_ms is None:
                    first_audio_ms = round((time.perf_counter() - started) * 1000)
                yield event(
                    "audio.chunk",
                    request_id,
                    sequence=starting_sequence,
                    encoding="audio/x-mulaw",
                    sampleRate=8000,
                    voiceId=resolved_voice,
                    audio=base64.b64encode(audio_chunk).decode("ascii"),
                )
                starting_sequence += 1

        async def produce_text() -> None:
            chunker = PhraseChunker(
                self.settings.phrase_min_words,
                self.settings.phrase_target_words,
                self.settings.phrase_max_words,
                self.settings.phrase_first_max_words,
            )
            try:
                if not clean_preface:
                    await output.put(event("response.started", request_id, voiceId=resolved_voice))
                async for token in self.llm.stream(prompt):
                    full_text.append(token)
                    await output.put(event("text.delta", request_id, delta=token))
                    for phrase in chunker.push(token):
                        await phrases.put(phrase)
                for phrase in chunker.flush():
                    await phrases.put(phrase)
            except Exception as exc:
                await output.put(event("response.error", request_id, error=str(exc), stage="llm"))
            finally:
                await phrases.put(None)
                await output.put(None)

        async def produce_audio() -> None:
            nonlocal phrase_count, audio_bytes, first_audio_ms
            sequence = starting_sequence
            try:
                while True:
                    phrase = await phrases.get()
                    if phrase is None:
                        break
                    phrase_count += 1
                    await output.put(
                        event(
                            "text.phrase",
                            request_id,
                            phrase=phrase,
                            phraseIndex=phrase_count - 1,
                        )
                    )
                    speech = await self.tts.synthesize(phrase, resolved_voice)
                    payload = twilio_mulaw(speech.samples, speech.sample_rate)
                    audio_bytes += len(payload)
                    for audio_chunk in chunks(
                        payload, self.settings.audio_chunk_ms, self.settings.telephony_sample_rate
                    ):
                        if first_audio_ms is None:
                            first_audio_ms = round((time.perf_counter() - started) * 1000)
                        await output.put(
                            event(
                                "audio.chunk",
                                request_id,
                                sequence=sequence,
                                encoding="audio/x-mulaw",
                                sampleRate=8000,
                                voiceId=resolved_voice,
                                audio=base64.b64encode(audio_chunk).decode("ascii"),
                            )
                        )
                        sequence += 1
            except Exception as exc:
                await output.put(event("response.error", request_id, error=str(exc), stage="tts"))
            finally:
                await output.put(None)

        tasks = [asyncio.create_task(produce_text()), asyncio.create_task(produce_audio())]
        completed_producers = 0
        try:
            while completed_producers < 2:
                item = await output.get()
                if item is None:
                    completed_producers += 1
                    continue
                yield item
        finally:
            await asyncio.gather(*tasks, return_exceptions=True)

        response_text = "".join(full_text).strip()
        yield event(
            "response.completed",
            request_id,
            text=response_text,
            voiceId=resolved_voice,
            phraseCount=phrase_count,
            audioBytes=audio_bytes,
            firstAudioMs=first_audio_ms,
            totalLatencyMs=round((time.perf_counter() - started) * 1000),
        )
