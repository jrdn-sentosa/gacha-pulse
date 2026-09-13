"""Quick comparison: does adding ReviewStatsTransformer's hand-crafted features to the
TF-IDF baseline change negative-class recall for the sentiment classifier?

Trains two identical LogisticRegression(class_weight="balanced") models on the exact
same train/test split as train_model.py (common.load_split()):

  (a) TF-IDF alone (mirrors the existing baseline vectorizer config).
  (b) TF-IDF + ReviewStatsTransformer, combined via FeatureUnion. The stats branch is
      StandardScaler'd so its raw-magnitude features (e.g. character length in the
      hundreds) don't get swamped/dominate relative to the [0,1]-scaled TF-IDF columns.

This is a one-off comparison script, not wired into the train/experiment pipeline --
it does not save any model or touch results.md.
"""
import numpy as np
from scipy.sparse import issparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import StandardScaler

from common import load_split
from pipeline_def import ReviewStatsTransformer


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


def metrics_row(name, m):
    return (
        f"| {name} | {m['accuracy']:.4f} | {m['pos_precision']:.4f} | {m['pos_recall']:.4f} | "
        f"{m['pos_f1']:.4f} | {m['neg_precision']:.4f} | {m['neg_recall']:.4f} | {m['neg_f1']:.4f} | "
        f"{m['macro_f1']:.4f} |"
    )


def main():
    X_train, X_test, y_train, y_test = load_split()

    # --- (a) TF-IDF alone (same config as train_model.py) ---
    tfidf_only = TfidfVectorizer(max_features=20000, ngram_range=(1, 2), min_df=2)
    X_train_tfidf = tfidf_only.fit_transform(X_train)
    X_test_tfidf = tfidf_only.transform(X_test)

    model_tfidf = LogisticRegression(max_iter=1000, class_weight="balanced")
    model_tfidf.fit(X_train_tfidf, y_train)
    pred_tfidf = model_tfidf.predict(X_test_tfidf)
    metrics_tfidf = class_metrics(y_test, pred_tfidf)
    print_metrics("TF-IDF only (baseline)", metrics_tfidf)

    # --- (b) TF-IDF + ReviewStatsTransformer via FeatureUnion ---
    combined = FeatureUnion([
        ("tfidf", TfidfVectorizer(max_features=20000, ngram_range=(1, 2), min_df=2)),
        ("stats", Pipeline([
            ("extract", ReviewStatsTransformer()),
            ("scale", StandardScaler()),
        ])),
    ])
    X_train_combined = combined.fit_transform(X_train, y_train)
    X_test_combined = combined.transform(X_test)

    model_combined = LogisticRegression(max_iter=1000, class_weight="balanced")
    model_combined.fit(X_train_combined, y_train)
    pred_combined = model_combined.predict(X_test_combined)
    metrics_combined = class_metrics(y_test, pred_combined)
    print_metrics("TF-IDF + ReviewStatsTransformer (FeatureUnion)", metrics_combined)

    # --- Side-by-side summary ---
    n_tfidf_features = X_train_tfidf.shape[1] if issparse(X_train_tfidf) else X_train_tfidf.shape[1]
    print(f"\nFeature counts: TF-IDF only = {n_tfidf_features}, combined = {X_train_combined.shape[1]}")

    print("\n| Approach | Accuracy | Pos Precision | Pos Recall | Pos F1 | Neg Precision | Neg Recall | Neg F1 | Macro F1 |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    print(metrics_row("TF-IDF only", metrics_tfidf))
    print(metrics_row("TF-IDF + ReviewStatsTransformer", metrics_combined))

    delta_neg_recall = metrics_combined["neg_recall"] - metrics_tfidf["neg_recall"]
    delta_neg_f1 = metrics_combined["neg_f1"] - metrics_tfidf["neg_f1"]
    delta_macro_f1 = metrics_combined["macro_f1"] - metrics_tfidf["macro_f1"]
    print(f"\nDelta (combined - baseline): neg_recall={delta_neg_recall:+.4f}, "
          f"neg_f1={delta_neg_f1:+.4f}, macro_f1={delta_macro_f1:+.4f}")


if __name__ == "__main__":
    main()
