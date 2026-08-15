from __future__ import annotations

import re


class PhraseChunker:
    """Turns streaming LLM tokens into short, speakable phrases."""

    _strong_boundary = re.compile(r"[.!?](?:[\"')\]]+)?\s*$")
    _soft_boundary = re.compile(r"[,;:—-]\s*$")

    def __init__(self, minimum_words: int = 5, target_words: int = 12, maximum_words: int = 22):
        if not 1 <= minimum_words <= target_words <= maximum_words:
            raise ValueError("phrase word limits must satisfy 1 <= minimum <= target <= maximum")
        self.minimum_words = minimum_words
        self.target_words = target_words
        self.maximum_words = maximum_words
        self._buffer = ""

    def push(self, token: str) -> list[str]:
        self._buffer += token
        clean = self._buffer.strip()
        words = clean.split()
        if not clean or len(words) < self.minimum_words:
            return []

        should_emit = (
            bool(self._strong_boundary.search(clean))
            or (len(words) >= self.target_words and bool(self._soft_boundary.search(clean)))
            or len(words) >= self.maximum_words
        )
        if not should_emit:
            return []

        self._buffer = ""
        return [clean]

    def flush(self) -> list[str]:
        clean = self._buffer.strip()
        self._buffer = ""
        return [clean] if clean else []
