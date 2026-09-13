import re

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

NEGATION_WORDS = ["not", "never", "no", "n't", "cannot", "nothing"]

_WORD_NEGATION_PATTERN = re.compile(
    r"\b(" + "|".join(w for w in NEGATION_WORDS if w != "n't") + r")\b",
    re.IGNORECASE,
)
_CONTRACTION_NEGATION_PATTERN = re.compile(r"n't", re.IGNORECASE)


class ReviewStatsTransformer(BaseEstimator, TransformerMixin):
    def __init__(self):
        pass

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        rows = []
        for text in X:
            if text is None:
                text = ""
            text = str(text)

            char_length = len(text)
            exclamation_count = text.count("!")

            words = text.split()
            if words:
                caps_words = sum(
                    1 for w in words if w.isupper() and any(c.isalpha() for c in w)
                )
                caps_ratio = caps_words / len(words)
            else:
                caps_ratio = 0.0

            negation_count = len(_WORD_NEGATION_PATTERN.findall(text)) + len(
                _CONTRACTION_NEGATION_PATTERN.findall(text)
            )

            rows.append([char_length, exclamation_count, caps_ratio, negation_count])

        return np.array(rows, dtype=float)
