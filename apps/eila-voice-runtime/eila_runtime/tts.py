from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .config import Settings


@dataclass(frozen=True)
class Speech:
    samples: np.ndarray
    sample_rate: int


class ChatterboxSpeech:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = None
        self._lock = asyncio.Lock()
        self._cache: dict[str, Speech] = {}

    @property
    def ready(self) -> bool:
        return self.model is not None

    async def load(self) -> None:
        if self.settings.tts_backend == "disabled" or self.model is not None:
            return
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        voice_reference = self.settings.voice_reference_path
        if not voice_reference.exists():
            raise RuntimeError(
                "Alley voice reference is missing. Set EILA_TTS_VOICE_REFERENCE to a "
                "licensed or consented WAV file."
            )
        self.model = await asyncio.to_thread(
            lambda: ChatterboxTurboTTS.from_pretrained(device=self.settings.tts_device)
        )
        await asyncio.to_thread(
            self.model.prepare_conditionals,
            str(voice_reference),
            exaggeration=self.settings.tts_exaggeration,
        )
        for text in (part.strip() for part in self.settings.tts_preface_texts.split("|")):
            if text:
                self._cache[text] = await asyncio.to_thread(self._generate, text)

    def _generate(self, text: str) -> Speech:
        kwargs = {
            "exaggeration": self.settings.tts_exaggeration,
            "cfg_weight": self.settings.tts_cfg_weight,
        }
        waveform = self.model.generate(text, **kwargs)
        if hasattr(waveform, "detach"):
            waveform = waveform.detach().cpu().numpy()
        sample_rate = int(getattr(self.model, "sr", self.settings.tts_sample_rate))
        return Speech(samples=np.asarray(waveform, dtype=np.float32).squeeze(), sample_rate=sample_rate)

    async def synthesize(self, text: str) -> Speech:
        if self.settings.tts_backend == "disabled":
            raise RuntimeError("TTS is disabled")
        await self.load()
        clean = str(text).strip()
        cached = self._cache.get(clean)
        if cached is not None:
            return cached

        async with self._lock:
            speech = await asyncio.to_thread(self._generate, clean)
        return speech

    def status(self) -> dict:
        reference = Path(self.settings.voice_reference_path)
        return {
            "backend": self.settings.tts_backend,
            "device": self.settings.tts_device,
            "loaded": self.ready,
            "voiceReferenceConfigured": reference.exists(),
            "voiceReference": str(reference),
        }
