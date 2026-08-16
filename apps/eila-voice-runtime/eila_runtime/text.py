from __future__ import annotations

import re


class PhraseChunker:
    """Turns streaming LLM tokens into short, speakable phrases."""

    _strong_boundary = re.compile(r"[.!?](?:[\"')\]]+)?\s*$")
    _soft_boundary = re.compile(r"[,;:—-]\s*$")
    _embedded_soft_boundary = re.compile(r"[,;:—-](?:[\"')\]]+)?\s+")

    def __init__(
        self,
        minimum_words: int = 5,
        target_words: int = 12,
        maximum_words: int = 22,
        first_maximum_words: int | None = None,
    ):
        if not 1 <= minimum_words <= target_words <= maximum_words:
            raise ValueError("phrase word limits must satisfy 1 <= minimum <= target <= maximum")
        self.minimum_words = minimum_words
        self.target_words = target_words
        self.maximum_words = maximum_words
        self.first_maximum_words = first_maximum_words or maximum_words
        if not minimum_words <= self.first_maximum_words <= maximum_words:
            raise ValueError("first phrase maximum must be between minimum and maximum")
        self._buffer = ""
        self._phrase_count = 0

    def _emit(self, phrase: str, remainder: str = "") -> list[str]:
        self._buffer = remainder
        self._phrase_count += 1
        return [phrase]

    def push(self, token: str) -> list[str]:
        self._buffer += token
        clean = self._buffer.strip()
        words = clean.split()
        if not clean or len(words) < self.minimum_words:
            return []

        if len(words) >= self.target_words:
            for match in reversed(list(self._embedded_soft_boundary.finditer(self._buffer))):
                phrase = self._buffer[: match.end()].strip()
                if len(phrase.split()) < self.minimum_words:
                    continue
                return self._emit(phrase, self._buffer[match.end() :])

        maximum_words = (
            self.first_maximum_words if self._phrase_count == 0 else self.maximum_words
        )

        should_emit = (
            bool(self._strong_boundary.search(clean))
            or (len(words) >= self.target_words and bool(self._soft_boundary.search(clean)))
            or len(words) >= maximum_words
        )
        if not should_emit:
            return []

        return self._emit(clean)

    def flush(self) -> list[str]:
        clean = self._buffer.strip()
        self._buffer = ""
        if clean:
            self._phrase_count += 1
        return [clean] if clean else []
