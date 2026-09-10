"""Shared data loading/splitting so every experiment script evaluates against the exact
same held-out test set as train_model.py (same random_state, same preprocessing).
"""
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_PATH = SCRIPT_DIR / "data" / "training_data.csv"
MODELS_DIR = SCRIPT_DIR / "models"
RESULTS_PATH = SCRIPT_DIR / "results.md"

RANDOM_STATE = 42

# Heading that starts the section improve_negative_recall.py appends to results.md.
# train_model.py must preserve anything from this marker onward when it rewrites the file.
EXPERIMENTS_MARKER = "\n## Negative-class recall improvement experiments\n"


def load_split():
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=["review_text", "voted_up"])
    df["voted_up"] = df["voted_up"].astype(bool)

    return train_test_split(
        df["review_text"],
        df["voted_up"],
        test_size=0.2,
        stratify=df["voted_up"],
        random_state=RANDOM_STATE,
    )
