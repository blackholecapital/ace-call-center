from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _integer(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _floating(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _boolean(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _duration(name: str, default: int | str) -> int | str:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return value


@dataclass(frozen=True)
class Settings:
    runtime_token: str = os.getenv("EILA_RUNTIME_TOKEN", "")
    host: str = os.getenv("EILA_HOST", "0.0.0.0")
    port: int = _integer("EILA_PORT", 8000)
    log_level: str = os.getenv("EILA_LOG_LEVEL", "info")

    llm_provider: str = os.getenv("EILA_LLM_PROVIDER", "ollama")
    llm_base_url: str = os.getenv("EILA_LLM_BASE_URL", "http://127.0.0.1:11434")
    llm_model: str = os.getenv("EILA_LLM_MODEL", "qwen2.5:14b")
    llm_api_key: str = os.getenv("EILA_LLM_API_KEY", "")
    llm_timeout_seconds: float = _floating("EILA_LLM_TIMEOUT_SECONDS", 90.0)
    llm_think: bool = _boolean("EILA_LLM_THINK", False)
    llm_keep_alive: int | str = _duration("EILA_LLM_KEEP_ALIVE", -1)
    llm_temperature: float = _floating("EILA_LLM_TEMPERATURE", 0.4)
    llm_num_predict: int = _integer("EILA_LLM_NUM_PREDICT", 96)
    llm_num_ctx: int = _integer("EILA_LLM_NUM_CTX", 4096)

    tts_backend: str = os.getenv("EILA_TTS_BACKEND", "chatterbox")
    tts_device: str = os.getenv("EILA_TTS_DEVICE", "cuda")
    tts_voice_reference: str = os.getenv(
        "EILA_TTS_VOICE_REFERENCE", "assets/voices/alley/reference.wav"
    )
    tts_sample_rate: int = _integer("EILA_TTS_SAMPLE_RATE", 24000)
    tts_exaggeration: float = _floating("EILA_TTS_EXAGGERATION", 0.0)
    tts_cfg_weight: float = _floating("EILA_TTS_CFG_WEIGHT", 0.0)

    telephony_sample_rate: int = _integer("EILA_TELEPHONY_SAMPLE_RATE", 8000)
    audio_chunk_ms: int = _integer("EILA_AUDIO_CHUNK_MS", 100)
    phrase_min_words: int = _integer("EILA_PHRASE_MIN_WORDS", 2)
    phrase_target_words: int = _integer("EILA_PHRASE_TARGET_WORDS", 6)
    phrase_max_words: int = _integer("EILA_PHRASE_MAX_WORDS", 18)
    phrase_first_max_words: int = _integer("EILA_PHRASE_FIRST_MAX_WORDS", 6)

    @property
    def voice_reference_path(self) -> Path:
        path = Path(self.tts_voice_reference)
        return path if path.is_absolute() else Path.cwd() / path

    def validate(self) -> None:
        if not self.runtime_token:
            raise RuntimeError("EILA_RUNTIME_TOKEN is required")
        if self.llm_provider not in {"ollama", "openai-compatible"}:
            raise RuntimeError("EILA_LLM_PROVIDER must be ollama or openai-compatible")
        if self.tts_backend not in {"chatterbox", "disabled"}:
            raise RuntimeError("EILA_TTS_BACKEND must be chatterbox or disabled")
        if self.telephony_sample_rate != 8000:
            raise RuntimeError("Twilio output currently requires EILA_TELEPHONY_SAMPLE_RATE=8000")
