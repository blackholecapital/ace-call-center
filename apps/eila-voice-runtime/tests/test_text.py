import unittest

from eila_runtime.text import PhraseChunker


class PhraseChunkerTests(unittest.TestCase):
    def test_emits_complete_sentence(self):
        chunker = PhraseChunker(3, 6, 10)
        self.assertEqual(chunker.push("I can help "), [])
        self.assertEqual(chunker.push("with that today."), ["I can help with that today."])

    def test_emits_long_phrase_without_punctuation(self):
        chunker = PhraseChunker(3, 4, 5)
        self.assertEqual(chunker.push("one two three four five"), [])
        self.assertEqual(
            chunker.push(" six"),
            ["one two three four five"],
        )
        self.assertEqual(chunker.flush(), ["six"])

    def test_flushes_short_tail(self):
        chunker = PhraseChunker()
        chunker.push("Absolutely.")
        self.assertEqual(chunker.flush(), ["Absolutely."])

    def test_retains_early_soft_boundary_until_target_is_reached(self):
        chunker = PhraseChunker(2, 6, 14)
        self.assertEqual(chunker.push("Got it, "), [])
        self.assertEqual(
            chunker.push("I can definitely help you"),
            ["Got it,"],
        )
        self.assertEqual(chunker.flush(), ["I can definitely help you"])

    def test_caps_only_first_phrase_without_punctuation(self):
        chunker = PhraseChunker(2, 6, 18, first_maximum_words=6)
        self.assertEqual(chunker.push("I'd be happy to help you"), [])
        self.assertEqual(
            chunker.push(" find"),
            ["I'd be happy to help you"],
        )
        self.assertEqual(
            chunker.push(" the perfect rack space for your Tampa data center needs!"),
            ["find the perfect rack space for your Tampa data center needs!"],
        )

    def test_terminal_punctuation_at_exact_limit_stays_with_phrase(self):
        chunker = PhraseChunker(2, 6, 18)
        phrase = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen"
        self.assertEqual(chunker.push(phrase), [])
        self.assertEqual(chunker.push("?"), [f"{phrase}?"])

    def test_discards_punctuation_only_tail(self):
        chunker = PhraseChunker(2, 6, 18)
        chunker._buffer = "?"
        self.assertEqual(chunker.flush(), [])


if __name__ == "__main__":
    unittest.main()
