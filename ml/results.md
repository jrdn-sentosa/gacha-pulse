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
