# Sentiment Classifier Results

## Dataset
- Total rows: 111097
- Train rows: 88877
- Test rows: 22220
- Class balance: 81.3% positive (90366), 18.7% negative (20731)

## Model
- TF-IDF vectorizer (max_features=20000, ngram_range=(1,2), min_df=2)
- Logistic Regression (class_weight="balanced", max_iter=1000)

## Test set metrics
| Metric | Value |
| --- | --- |
| Accuracy | 0.8381 |
| Precision | 0.9258 |
| Recall | 0.8708 |
| F1 | 0.8974 |

## Confusion matrix
Rows = actual, columns = predicted, order = [positive, negative]

```
[[15738  2336]
 [ 1261  2885]]
```

## Artifacts
- Vectorizer: `ml/models/vectorizer.joblib`
- Model: `ml/models/model.joblib`

## Negative-class recall improvement experiments

| Approach | Accuracy | Pos Precision | Pos Recall | Pos F1 | Neg Precision | Neg Recall | Neg F1 | Macro F1 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline (LR, threshold=0.5) | 0.8381 | 0.9258 | 0.8708 | 0.8974 | 0.5526 | 0.6959 | 0.6160 | 0.7567 | original model.joblib |
| Threshold-tuned LR (t=0.30) | 0.6526 | 0.9840 | 0.5824 | 0.7317 | 0.3450 | 0.9588 | 0.5074 | 0.6195 |  |
| Threshold-tuned LR (t=0.35) | 0.6841 | 0.9799 | 0.6244 | 0.7628 | 0.3657 | 0.9440 | 0.5272 | 0.6450 |  |
| Threshold-tuned LR (t=0.40) | 0.7109 | 0.9744 | 0.6621 | 0.7884 | 0.3855 | 0.9240 | 0.5440 | 0.6662 |  |
| Threshold-tuned LR (t=0.45) | 0.7322 | 0.9687 | 0.6932 | 0.8081 | 0.4029 | 0.9023 | 0.5570 | 0.6826 |  |
| Threshold-tuned LR (t=0.50) | 0.8381 | 0.9258 | 0.8708 | 0.8974 | 0.5526 | 0.6959 | 0.6160 | 0.7567 | chosen |
| ComplementNB | 0.7153 | 0.9526 | 0.6841 | 0.7963 | 0.3821 | 0.8517 | 0.5275 | 0.6619 | same TF-IDF features |

**Winner: Baseline (LR, threshold=0.5)** — saved as `ml/models/model.joblib`.

### Confusion matrices (rows=actual, cols=predicted, order=[positive, negative])

Baseline:
```
[[15738  2336]
 [ 1261  2885]]
```

Threshold-tuned (t=0.50):
```
[[15738  2336]
 [ 1261  2885]]
```

ComplementNB:
```
[[12364  5710]
 [  615  3531]]
```

## Bootstrap confidence intervals (95%)

| Approach | Macro F1 [95% CI] | Negative F1 [95% CI] |
| --- | --- | --- |
| Baseline (LR, threshold=0.5) | 0.757 [0.749, 0.764] | 0.616 [0.604, 0.627] |
| Threshold-tuned LR (t=0.45) | 0.683 [0.676, 0.689] | 0.557 [0.547, 0.567] |
| ComplementNB | 0.662 [0.655, 0.669] | 0.528 [0.518, 0.538] |

1000 bootstrap resamples of the held-out test set (with replacement, same size as the test set), reusing the already-trained model/vectorizer for each resample rather than retraining. 95% CI = [2.5th, 97.5th] percentile of the bootstrap distribution. Overlapping CIs indicate the difference between approaches may be within noise.

## Custom transformer evaluation

Evaluates whether `ml/pipeline_def.py`'s `ReviewStatsTransformer` (4 hand-crafted features: character length, `!` count, all-caps word ratio, negation word count) adds any signal beyond the TF-IDF baseline, before considering wiring it into the deployed pipeline. Same held-out test set as above (`common.load_split()`), same `LogisticRegression(class_weight="balanced", max_iter=1000)` for both sides; the stats features are combined with TF-IDF via `FeatureUnion` and `StandardScaler`-ed so their raw magnitude (e.g. length in the hundreds) doesn't overwhelm the [0,1]-scaled TF-IDF columns. Script: `ml/experiment_review_stats.py` (standalone — not run as part of the train/experiment pipeline, saves no model artifacts).

| Approach | Accuracy | Pos Precision | Pos Recall | Pos F1 | Neg Precision | Neg Recall | Neg F1 | Macro F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-IDF only (baseline) | 0.8381 | 0.9258 | 0.8708 | 0.8974 | 0.5526 | 0.6959 | 0.6160 | 0.7567 |
| TF-IDF + ReviewStatsTransformer | 0.8376 | 0.9255 | 0.8705 | 0.8971 | 0.5515 | 0.6944 | 0.6148 | 0.7560 |

### Confusion matrices (rows=actual, cols=predicted, order=[positive, negative])

TF-IDF only:
```
[[15738  2336]
 [ 1261  2885]]
```

TF-IDF + ReviewStatsTransformer:
```
[[15733  2341]
 [ 1267  2879]]
```

**Conclusion: the hand-crafted features add no discriminative signal beyond what TF-IDF unigrams/bigrams already capture.** Negative-class recall is essentially unchanged (0.6959 -> 0.6944, delta -0.0014), and every other metric shifts by a similarly tiny amount in the same direction (delta macro F1 = -0.0008, delta neg F1 = -0.0012). These deltas amount to a handful of examples out of 22,220 in the test set and are well within the bootstrap noise already measured above (the baseline's macro F1 95% CI alone spans [0.749, 0.764], a width of 0.015 -- larger than the entire observed delta). This makes sense: logistic regression over word/bigram features already implicitly encodes negation words, capitalization, and punctuation-heavy phrasing, so the explicit stats features are largely redundant.

**Not wired into the deployed pipeline** (`ml/models/model.joblib` / `vectorizer.joblib` are untouched) -- next step, if pursued, would be deciding whether to proceed given this negative result.
