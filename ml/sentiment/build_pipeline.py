"""Builds the final deployable sentiment-classifier pipeline bundle.

Combines TF-IDF and the hand-crafted ReviewStatsTransformer features (ml/pipeline_def.py)
via FeatureUnion, feeding a single LogisticRegression(class_weight="balanced") -- the same
combination evaluated in ml/experiment_review_stats.py, now fit as one sklearn Pipeline and
packaged for deployment.

Does NOT modify ml/train_model.py or its artifacts (ml/models/model.joblib,
ml/models/vectorizer.joblib) -- that stays the baseline record. This script's own output,
ml/models/pipeline.joblib, is a separate bundle: {"pipeline", "metadata", "decision_threshold",
"label_names"}, not a bare pipeline, so a loader gets threshold/versioning context alongside
the fitted model.

After saving, spawns a fresh Python subprocess that loads the bundle back from disk and calls
pipeline.predict(...) on an example string -- proving the dumped object carries learned state
(fitted vectorizer vocabulary, fitted classifier coefficients), not just architecture that
would need retraining if reconstructed from scratch at server boot.
"""
import subprocess
import sys
from datetime import datetime, timezone

import joblib
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import StandardScaler

from common import MODELS_DIR, SCRIPT_DIR, load_split
from pipeline_def import ReviewStatsTransformer

PIPELINE_PATH = MODELS_DIR / "pipeline.joblib"
DECISION_THRESHOLD = 0.5
LABEL_NAMES = ["negative", "positive"]  # index order matches sorted bool classes_: [False, True]


def class_metrics(y_true, y_pred):
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "pos_precision": precision_score(y_true, y_pred, pos_label=True),
        "pos_recall": recall_score(y_true, y_pred, pos_label=True),
        "pos_f1": f1_score(y_true, y_pred, pos_label=True),
        "neg_precision": precision_score(y_true, y_pred, pos_label=False),
        "neg_recall": recall_score(y_true, y_pred, pos_label=False),
        "neg_f1": f1_score(y_true, y_pred, pos_label=False),
        "macro_f1": f1_score(y_true, y_pred, average="macro"),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=[True, False]),
    }


def print_metrics(label, m):
    print(f"\n{label}")
    print(f"  Accuracy:        {m['accuracy']:.4f}")
    print(f"  Positive P/R/F1: {m['pos_precision']:.4f} / {m['pos_recall']:.4f} / {m['pos_f1']:.4f}")
    print(f"  Negative P/R/F1: {m['neg_precision']:.4f} / {m['neg_recall']:.4f} / {m['neg_f1']:.4f}")
    print(f"  Macro F1:        {m['macro_f1']:.4f}")
    print("  Confusion matrix (rows=actual, cols=predicted, order=[positive, negative]):")
    print(f"  {m['confusion_matrix']}")


def verify_fresh_process_load():
    """Loads ml/models/pipeline.joblib in a brand-new `python` subprocess and calls
    predict() on it, proving the saved bundle carries fitted state rather than needing
    the model architecture to be rebuilt/retrained at load time.
    """
    verification_code = f"""
import sys
sys.path.insert(0, {str(SCRIPT_DIR)!r})
import joblib

bundle = joblib.load({str(PIPELINE_PATH)!r})
pipeline = bundle["pipeline"]

example = ["This game is absolutely amazing, I love every second of it!"]
pred = pipeline.predict(example)
proba = pipeline.predict_proba(example)

print("classes_:", list(pipeline.classes_))
print("prediction:", list(pred))
print("predict_proba:", proba.tolist())
print("metadata:", bundle["metadata"])
print("decision_threshold:", bundle["decision_threshold"])
print("label_names:", bundle["label_names"])
"""
    result = subprocess.run(
        [sys.executable, "-c", verification_code],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        raise RuntimeError("Fresh-process load/predict check failed -- see stderr above.")
    return result.stdout


def main():
    X_train, X_test, y_train, y_test = load_split()

    pipeline = Pipeline([
        ("features", FeatureUnion([
            ("tfidf", TfidfVectorizer(max_features=20000, ngram_range=(1, 2), min_df=2)),
            ("stats", Pipeline([
                ("extract", ReviewStatsTransformer()),
                ("scale", StandardScaler()),
            ])),
        ])),
        ("classifier", LogisticRegression(max_iter=1000, class_weight="balanced")),
    ])

    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    metrics = class_metrics(y_test, y_pred)
    print_metrics("Final pipeline (TF-IDF + ReviewStatsTransformer -> LogisticRegression)", metrics)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": pipeline,
        "metadata": {
            "steps": [name for name, _ in pipeline.steps],
            "built_at": datetime.now(timezone.utc).isoformat(),
            "sklearn_version": sklearn.__version__,
        },
        "decision_threshold": DECISION_THRESHOLD,
        "label_names": LABEL_NAMES,
    }
    joblib.dump(bundle, PIPELINE_PATH)
    print(f"\nSaved pipeline bundle to {PIPELINE_PATH}")

    print("\n--- Verifying fresh-process load + predict (learned-state check) ---")
    verify_fresh_process_load()
    print("Fresh-process load and predict succeeded: bundle carries fitted state, not a fresh/unfit pipeline.")


if __name__ == "__main__":
    main()
