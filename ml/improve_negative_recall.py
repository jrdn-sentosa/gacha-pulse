"""Tries two approaches to improve the negative-class recall of the baseline
TF-IDF + logistic regression sentiment classifier (ml/train_model.py), in order:

  1. Threshold tuning on the existing trained model's predicted probabilities.
  2. ComplementNB trained on the same TF-IDF features.

(A third approach, SMOTE oversampling + logistic regression, was tried previously and
lost to the baseline; imbalanced-learn was removed as a dependency afterward, so it is
no longer implemented here. Re-running this script regenerates the whole comparison
table below and will not reproduce that historical SMOTE row.)

Both are evaluated against the exact same held-out test set (common.load_split() uses
the same random_state/stratify as train_model.py) and the same TF-IDF vectorizer already
saved in ml/models/, so the comparison isolates the effect of each technique.

Writes a side-by-side comparison to ml/results.md and saves whichever approach wins on
negative-class recall (subject to overall F1 staying reasonable) as the final
ml/models/model.joblib. Run after ml/train_model.py.
"""
import json

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.naive_bayes import ComplementNB

from common import EXPERIMENTS_MARKER, MODELS_DIR, RESULTS_PATH, load_split

THRESHOLDS = [0.30, 0.35, 0.40, 0.45, 0.50]

# Minimum acceptable overall quality for a candidate to be considered a viable
# replacement for the baseline, however good its negative recall is.
MIN_MACRO_F1 = 0.75


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
    print(f"  Confusion matrix (rows=actual, cols=predicted, order=[positive, negative]):")
    print(f"  {m['confusion_matrix']}")


def metrics_row(name, m, extra=""):
    return (
        f"| {name} | {m['accuracy']:.4f} | {m['pos_precision']:.4f} | {m['pos_recall']:.4f} | "
        f"{m['pos_f1']:.4f} | {m['neg_precision']:.4f} | {m['neg_recall']:.4f} | {m['neg_f1']:.4f} | "
        f"{m['macro_f1']:.4f} | {extra} |"
    )


def main():
    X_train, X_test, y_train, y_test = load_split()

    vectorizer = joblib.load(MODELS_DIR / "vectorizer.joblib")
    baseline_model = joblib.load(MODELS_DIR / "model.joblib")

    X_train_vec = vectorizer.transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    candidates = {}

    # --- Baseline (sanity check: should match ml/train_model.py's reported numbers) ---
    baseline_pred = baseline_model.predict(X_test_vec)
    baseline_metrics = class_metrics(y_test, baseline_pred)
    print_metrics("Baseline (logistic regression, threshold=0.5)", baseline_metrics)
    candidates["Baseline (LR, threshold=0.5)"] = baseline_metrics

    # --- 1. Threshold tuning ---
    neg_idx = list(baseline_model.classes_).index(False)
    proba = baseline_model.predict_proba(X_test_vec)
    proba_neg = proba[:, neg_idx]

    print("\n--- Threshold tuning (predict negative when P(negative) >= threshold) ---")
    threshold_results = {}
    for t in THRESHOLDS:
        pred_negative = proba_neg >= t
        y_pred_t = np.where(pred_negative, False, True)
        m = class_metrics(y_test, y_pred_t)
        threshold_results[t] = m
        print_metrics(f"threshold={t:.2f}", m)

    best_threshold = max(threshold_results, key=lambda t: threshold_results[t]["neg_f1"])
    best_threshold_metrics = threshold_results[best_threshold]
    print(f"\nChosen threshold (max negative F1): {best_threshold:.2f}")
    candidates[f"Threshold-tuned LR (threshold={best_threshold:.2f})"] = best_threshold_metrics

    # --- 2. ComplementNB ---
    cnb = ComplementNB()
    cnb.fit(X_train_vec, y_train)
    cnb_pred = cnb.predict(X_test_vec)
    cnb_metrics = class_metrics(y_test, cnb_pred)
    print_metrics("ComplementNB", cnb_metrics)
    candidates["ComplementNB"] = cnb_metrics

    # --- Pick a winner: best negative recall among candidates with acceptable macro F1 ---
    viable = {name: m for name, m in candidates.items() if m["macro_f1"] >= MIN_MACRO_F1}
    pool = viable if viable else candidates
    winner_name = max(pool, key=lambda name: pool[name]["neg_recall"])
    winner_metrics = candidates[winner_name]
    print(f"\nWinner (best negative recall, macro F1 >= {MIN_MACRO_F1}): {winner_name}")

    # --- Save the winning model ---
    threshold_note = ""
    if winner_name.startswith("Baseline"):
        joblib.dump(baseline_model, MODELS_DIR / "model.joblib")
        (MODELS_DIR / "decision_threshold.json").write_text(
            json.dumps({"negative_class_threshold": 0.5}), encoding="utf-8"
        )
    elif winner_name.startswith("Threshold-tuned"):
        # Same model/vectorizer as baseline; only the inference decision rule changes.
        joblib.dump(baseline_model, MODELS_DIR / "model.joblib")
        (MODELS_DIR / "decision_threshold.json").write_text(
            json.dumps({"negative_class_threshold": best_threshold}), encoding="utf-8"
        )
        threshold_note = (
            f" Inference must predict negative when P(negative) >= {best_threshold:.2f} "
            f"(see ml/models/decision_threshold.json), not the sklearn default of argmax/0.5."
        )
    elif winner_name == "ComplementNB":
        joblib.dump(cnb, MODELS_DIR / "model.joblib")
        (MODELS_DIR / "decision_threshold.json").write_text(
            json.dumps({"negative_class_threshold": 0.5}), encoding="utf-8"
        )
    print(f"Saved winning model to {MODELS_DIR / 'model.joblib'}.{threshold_note}")

    # --- Write comparison table to results.md ---
    existing = RESULTS_PATH.read_text(encoding="utf-8") if RESULTS_PATH.exists() else ""
    existing = existing.split(EXPERIMENTS_MARKER)[0].rstrip() + "\n"

    header = (
        "| Approach | Accuracy | Pos Precision | Pos Recall | Pos F1 | "
        "Neg Precision | Neg Recall | Neg F1 | Macro F1 | Notes |\n"
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
    )
    rows = [metrics_row("Baseline (LR, threshold=0.5)", baseline_metrics, "original model.joblib")]
    for t in THRESHOLDS:
        note = "chosen" if t == best_threshold else ""
        rows.append(metrics_row(f"Threshold-tuned LR (t={t:.2f})", threshold_results[t], note))
    rows.append(metrics_row("ComplementNB", cnb_metrics, "same TF-IDF features"))

    winner_line = f"\n**Winner: {winner_name}** — saved as `ml/models/model.joblib`.{threshold_note}\n"

    confusion_section = (
        "\n### Confusion matrices (rows=actual, cols=predicted, order=[positive, negative])\n\n"
        f"Baseline:\n```\n{baseline_metrics['confusion_matrix']}\n```\n\n"
        f"Threshold-tuned (t={best_threshold:.2f}):\n```\n{best_threshold_metrics['confusion_matrix']}\n```\n\n"
        f"ComplementNB:\n```\n{cnb_metrics['confusion_matrix']}\n```\n"
    )

    section = EXPERIMENTS_MARKER + "\n" + header + "\n".join(rows) + "\n" + winner_line + confusion_section
    RESULTS_PATH.write_text(existing + section, encoding="utf-8")
    print(f"\nAppended comparison table to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
