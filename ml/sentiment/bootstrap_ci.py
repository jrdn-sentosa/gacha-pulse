"""Computes bootstrap 95% confidence intervals for macro F1 and negative-class F1, to
show whether the differences between approaches in the "Negative-class recall
improvement experiments" comparison (ml/improve_negative_recall.py) are statistically
meaningful or within noise.

Covers three approaches, all evaluated on the exact same held-out test set as
train_model.py (common.load_split()):

  1. Baseline: the current final ml/models/model.joblib (logistic regression, threshold=0.5).
  2. Threshold-tuned: the same baseline model/vectorizer, predicting negative when
     P(negative) >= 0.45.
  3. ComplementNB: has no saved artifact (it lost the earlier comparison and was never
     persisted to ml/models/), so it's fit once here on the training split, exactly as
     in improve_negative_recall.py, and that single fitted model is reused for every
     bootstrap resample below.

No retraining happens inside the bootstrap loop. Predictions for each approach are
computed once on the full test set; each of the 1,000 iterations then draws a
with-replacement resample of row indices (same size as the test set) and recomputes
macro F1 / negative F1 from the already-computed (y_true, y_pred) pairs at those
indices -- equivalent to resampling the raw test set and rerunning inference, since
predictions are a deterministic function of the (already-trained) model and a given
row. All three approaches share the same sequence of resampled indices (paired
bootstrap), which is standard practice for comparing models on the same test set.

The 95% CI is the [2.5th, 97.5th] percentile of each metric's bootstrap distribution.

Appends a confidence-interval section to ml/results.md, after the experiments section.
Run after ml/train_model.py and ml/improve_negative_recall.py.
"""
import joblib
import numpy as np
from sklearn.metrics import f1_score
from sklearn.naive_bayes import ComplementNB

from common import BOOTSTRAP_CI_MARKER, MODELS_DIR, RANDOM_STATE, RESULTS_PATH, load_split

N_BOOTSTRAP = 1000
THRESHOLD_TUNED_T = 0.45


def predict_at_threshold(model, X_vec, threshold):
    neg_idx = list(model.classes_).index(False)
    proba_neg = model.predict_proba(X_vec)[:, neg_idx]
    return np.where(proba_neg >= threshold, False, True)


def format_metric(point, ci):
    return f"{point:.3f} [{ci[0]:.3f}, {ci[1]:.3f}]"


def main():
    X_train, X_test, y_train, y_test = load_split()
    y_test = np.asarray(y_test)

    vectorizer = joblib.load(MODELS_DIR / "vectorizer.joblib")
    baseline_model = joblib.load(MODELS_DIR / "model.joblib")

    X_train_vec = vectorizer.transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    cnb = ComplementNB()
    cnb.fit(X_train_vec, y_train)

    approaches = {
        "Baseline (LR, threshold=0.5)": baseline_model.predict(X_test_vec),
        f"Threshold-tuned LR (t={THRESHOLD_TUNED_T:.2f})": predict_at_threshold(
            baseline_model, X_test_vec, THRESHOLD_TUNED_T
        ),
        "ComplementNB": cnb.predict(X_test_vec),
    }

    n = len(y_test)

    # Draw the shared bootstrap resample indices once, then evaluate every approach on them.
    rng = np.random.default_rng(RANDOM_STATE)
    resample_indices = [rng.integers(0, n, size=n) for _ in range(N_BOOTSTRAP)]

    summaries = {}
    for name, y_pred in approaches.items():
        y_pred = np.asarray(y_pred)
        macro_f1s = np.empty(N_BOOTSTRAP)
        neg_f1s = np.empty(N_BOOTSTRAP)
        for i, idx in enumerate(resample_indices):
            yt, yp = y_test[idx], y_pred[idx]
            macro_f1s[i] = f1_score(yt, yp, average="macro")
            neg_f1s[i] = f1_score(yt, yp, pos_label=False)

        macro_point = f1_score(y_test, y_pred, average="macro")
        neg_point = f1_score(y_test, y_pred, pos_label=False)
        summaries[name] = {
            "macro_f1": macro_point,
            "macro_f1_ci": tuple(np.percentile(macro_f1s, [2.5, 97.5])),
            "neg_f1": neg_point,
            "neg_f1_ci": tuple(np.percentile(neg_f1s, [2.5, 97.5])),
        }

    print(f"Bootstrap 95% CIs ({N_BOOTSTRAP} resamples, test set size {n}):")
    for name, m in summaries.items():
        print(f"\n{name}")
        print(f"  Macro F1:    {format_metric(m['macro_f1'], m['macro_f1_ci'])}")
        print(f"  Negative F1: {format_metric(m['neg_f1'], m['neg_f1_ci'])}")

    # --- Append confidence-interval section to results.md ---
    existing = RESULTS_PATH.read_text(encoding="utf-8") if RESULTS_PATH.exists() else ""
    existing = existing.split(BOOTSTRAP_CI_MARKER)[0].rstrip() + "\n"

    header = (
        "| Approach | Macro F1 [95% CI] | Negative F1 [95% CI] |\n"
        "| --- | --- | --- |\n"
    )
    rows = [
        f"| {name} | {format_metric(m['macro_f1'], m['macro_f1_ci'])} | {format_metric(m['neg_f1'], m['neg_f1_ci'])} |"
        for name, m in summaries.items()
    ]
    note = (
        f"\n{N_BOOTSTRAP} bootstrap resamples of the held-out test set (with replacement, "
        "same size as the test set), reusing the already-trained model/vectorizer for each "
        "resample rather than retraining. 95% CI = [2.5th, 97.5th] percentile of the "
        "bootstrap distribution. Overlapping CIs indicate the difference between approaches "
        "may be within noise.\n"
    )
    section = BOOTSTRAP_CI_MARKER + "\n" + header + "\n".join(rows) + "\n" + note
    RESULTS_PATH.write_text(existing + section, encoding="utf-8")
    print(f"\nAppended confidence intervals to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
