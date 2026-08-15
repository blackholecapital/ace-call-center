import unittest

from eila_runtime.text import PhraseChunker


class PhraseChunkerTests(unittest.TestCase):
    def test_emits_complete_sentence(self):
        chunker = PhraseChunker(3, 6, 10)
        self.assertEqual(chunker.push("I can help "), [])
        self.assertEqual(chunker.push("with that today."), ["I can help with that today."])

    def test_emits_long_phrase_without_punctuation(self):
        chunker = PhraseChunker(3, 4, 5)
        self.assertEqual(chunker.push("one two three four five"), ["one two three four five"])

    def test_flushes_short_tail(self):
        chunker = PhraseChunker()
        chunker.push("Absolutely.")
        self.assertEqual(chunker.flush(), ["Absolutely."])


if __name__ == "__main__":
    unittest.main()
