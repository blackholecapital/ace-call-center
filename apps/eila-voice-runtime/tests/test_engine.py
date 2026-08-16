import unittest

import numpy as np

from eila_runtime.config import Settings
from eila_runtime.engine import VoiceEngine
from eila_runtime.tts import Speech


class FakeLlm:
    async def stream(self, _prompt):
        for token in ["I can help ", "with that today. ", "What capacity do you need?"]:
            yield token


class FakeTts:
    async def synthesize(self, text):
        duration = max(0.1, len(text) / 100)
        return Speech(np.zeros(int(24000 * duration), dtype=np.float32), 24000)


class EngineTests(unittest.IsolatedAsyncioTestCase):
    async def test_turn_stream_contains_text_audio_and_metrics(self):
        settings = Settings(
            runtime_token="test",
            phrase_min_words=3,
            phrase_target_words=6,
            phrase_max_words=10,
        )
        engine = VoiceEngine(settings)
        engine.llm = FakeLlm()
        engine.tts = FakeTts()

        events = [item async for item in engine.stream_turn("prompt", "turn_test")]
        event_types = [item["type"] for item in events]
        self.assertIn("text.delta", event_types)
        self.assertIn("text.phrase", event_types)
        self.assertIn("audio.chunk", event_types)
        self.assertEqual(event_types[-1], "response.completed")
        self.assertEqual(events[-1]["text"], "I can help with that today. What capacity do you need?")
        self.assertGreater(events[-1]["audioBytes"], 0)
        self.assertIsNotNone(events[-1]["firstAudioMs"])

    async def test_cached_preface_audio_precedes_generated_reply(self):
        settings = Settings(
            runtime_token="test",
            phrase_min_words=3,
            phrase_target_words=6,
            phrase_max_words=10,
        )
        engine = VoiceEngine(settings)
        engine.llm = FakeLlm()
        engine.tts = FakeTts()

        events = [
            item
            async for item in engine.stream_turn(
                "prompt", "turn_preface", preface="Got it."
            )
        ]
        event_types = [item["type"] for item in events]
        self.assertEqual(event_types[0:2], ["response.started", "text.preface"])
        self.assertLess(event_types.index("audio.chunk"), event_types.index("text.delta"))
        self.assertEqual(events[-1]["text"], "I can help with that today. What capacity do you need?")


if __name__ == "__main__":
    unittest.main()
