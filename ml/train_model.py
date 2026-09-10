"""Trains a TF-IDF + logistic regression sentiment classifier on the exported review
data, evaluates it on a held-out test set, and saves the fitted vectorizer/model plus
a metrics summary.
"""
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_PATH = SCRIPT_DIR / "data" / "training_data.csv"
MODELS_DIR = SCRIPT_DIR / "models"
RESULTS_PATH = SCRIPT_DIR / "results.md"

RANDOM_STATE = 42


def main():
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=["review_text", "voted_up"])
    df["voted_up"] = df["voted_up"].astype(bool)

    X_train, X_test, y_train, y_test = train_test_split(
        df["review_text"],
        df["voted_up"],
        test_size=0.2,
        stratify=df["voted_up"],
        random_state=RANDOM_STATE,
    )

    vectorizer = TfidfVectorizer(max_features=20000, ngram_range=(1, 2), min_df=2)
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    model.fit(X_train_vec, y_train)

    y_pred = model.predict(X_test_vec)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    cm = confusion_matrix(y_test, y_pred, labels=[True, False])

    print(f"Train rows: {len(X_train)}, Test rows: {len(X_test)}")
    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1:        {f1:.4f}")
    print("Confusion matrix (rows=actual, cols=predicted, order=[positive, negative]):")
    print(cm)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(vectorizer, MODELS_DIR / "vectorizer.joblib")
    joblib.dump(model, MODELS_DIR / "model.joblib")

    positive_count = int(df["voted_up"].sum())
    negative_count = len(df) - positive_count

    results_md = f"""# Sentiment Classifier Results

## Dataset
- Total rows: {len(df)}
- Train rows: {len(X_train)}
- Test rows: {len(X_test)}
- Class balance: {positive_count / len(df) * 100:.1f}% positive ({positive_count}), {negative_count / len(df) * 100:.1f}% negative ({negative_count})

## Model
- TF-IDF vectorizer (max_features=20000, ngram_range=(1,2), min_df=2)
- Logistic Regression (class_weight="balanced", max_iter=1000)

## Test set metrics
| Metric | Value |
| --- | --- |
| Accuracy | {accuracy:.4f} |
| Precision | {precision:.4f} |
| Recall | {recall:.4f} |
| F1 | {f1:.4f} |

## Confusion matrix
Rows = actual, columns = predicted, order = [positive, negative]

```
{cm}
```

## Artifacts
- Vectorizer: `ml/models/vectorizer.joblib`
- Model: `ml/models/model.joblib`
"""
    RESULTS_PATH.write_text(results_md, encoding="utf-8")
    print(f"\nSaved models to {MODELS_DIR}")
    print(f"Saved results summary to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
