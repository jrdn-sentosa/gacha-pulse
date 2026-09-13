import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.utils.validation import check_is_fitted

# Column order expected in both fit(X) and transform(X).
INPUT_COLUMNS = ("sentiment_slope", "sentiment_volatility", "volume_slope", "age_weeks")
# Column order of transform(X)'s output.
OUTPUT_COLUMNS = ("risk_score", "base_rate_risk", "score_sv")


class EoSRiskTransformer(BaseEstimator, TransformerMixin):
    """Implements the "v2" EoS-risk approach chosen in ml/eos_risk/results.md: a
    transparent sentiment/volume-derived score, z-scored against fitted pooled
    statistics, combined multiplicatively with a base-rate risk prior interpolated from
    external survival-curve checkpoints.

    fit(X) learns the pooled mean/std of the three z-scored features (sentiment_slope,
    sentiment_volatility, volume_slope) from historical weekly rows across all games --
    this is the transformer's genuine learned state. Age is deliberately NOT part of that
    pooled fit: it's monotonically increasing within a game, so treating every weekly row
    as an independent sample of "age" would be pseudoreplication (see results.md). Age
    instead flows through the fixed, externally-sourced survival_checkpoints at
    transform time, needing no fitting.

    transform(X) expects rows of [sentiment_slope, sentiment_volatility, volume_slope,
    age_weeks] (see INPUT_COLUMNS) and returns [risk_score, base_rate_risk, score_sv]
    (see OUTPUT_COLUMNS) so callers get the final score plus both intermediate
    components for a transparent API response.
    """

    def __init__(
        self,
        survival_checkpoints={1: 0.84, 3: 0.44, 5: 0.26},
        weights={"sentiment_slope": 0.5, "sentiment_vol": 0.2, "volume_slope": 0.3},
    ):
        self.survival_checkpoints = survival_checkpoints
        self.weights = weights

    def fit(self, X, y=None):
        X = np.asarray(X, dtype=float)
        self.sentiment_slope_mean_ = float(np.nanmean(X[:, 0]))
        self.sentiment_slope_std_ = float(np.nanstd(X[:, 0]))
        self.sentiment_vol_mean_ = float(np.nanmean(X[:, 1]))
        self.sentiment_vol_std_ = float(np.nanstd(X[:, 1]))
        self.volume_slope_mean_ = float(np.nanmean(X[:, 2]))
        self.volume_slope_std_ = float(np.nanstd(X[:, 2]))
        return self

    @staticmethod
    def _z(value, mean, std):
        if std == 0 or np.isnan(std) or np.isnan(value):
            return 0.0
        return (value - mean) / std

    def _survival_pct_at(self, age_years):
        """Piecewise-linear interpolation between (0, 100%) -- the implicit launch-day
        anchor, not itself a cited checkpoint -- and the fitted survival_checkpoints.
        Beyond the last checkpoint, linearly extrapolates the final segment's slope
        (clipped at 0%), since the source data doesn't track past it.
        """
        checkpoints = sorted(self.survival_checkpoints.items())
        years = [0.0] + [year for year, _ in checkpoints]
        pcts = [100.0] + [pct * 100 for _, pct in checkpoints]

        if age_years <= years[-1]:
            return float(np.interp(age_years, years, pcts))
        slope = (pcts[-1] - pcts[-2]) / (years[-1] - years[-2])
        extrapolated = pcts[-1] + slope * (age_years - years[-1])
        return max(0.0, extrapolated)

    def _base_rate_risk(self, age_weeks):
        """1 - cumulative survival fraction at this age: the fraction of tracked games
        this age that have already shut down. This is a cumulative-survival proxy, NOT a
        true conditional hazard rate (the probability of shutting down soon, given
        having already survived to this age) -- see results.md's caveat.
        """
        age_years = age_weeks / 52
        return 1 - self._survival_pct_at(age_years) / 100

    def transform(self, X):
        check_is_fitted(self, ["sentiment_slope_mean_", "sentiment_vol_mean_", "volume_slope_mean_"])
        X = np.asarray(X, dtype=float)

        rows = []
        for sentiment_slope, sentiment_vol, volume_slope, age_weeks in X:
            z_sent_slope = self._z(sentiment_slope, self.sentiment_slope_mean_, self.sentiment_slope_std_)
            z_sent_vol = self._z(sentiment_vol, self.sentiment_vol_mean_, self.sentiment_vol_std_)
            z_vol_slope = self._z(volume_slope, self.volume_slope_mean_, self.volume_slope_std_)

            # Risk rises when sentiment is trending down, sentiment is volatile, and
            # volume is trending down -- hence the sign flips on the two "falling =
            # worse" terms. Same formula validated in exploration.
            score_sv = (
                self.weights["sentiment_slope"] * -z_sent_slope
                + self.weights["sentiment_vol"] * z_sent_vol
                + self.weights["volume_slope"] * -z_vol_slope
            )
            base_rate = self._base_rate_risk(age_weeks)
            # Evidence multiplier centered at 1.0 (no adjustment); clipped at 0 so a very
            # healthy trend (score_sv << -1) can't flip the combined risk negative.
            multiplier = max(0.0, 1 + score_sv)
            risk_score = base_rate * multiplier

            rows.append([risk_score, base_rate, score_sv])

        return np.array(rows, dtype=float)
