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
