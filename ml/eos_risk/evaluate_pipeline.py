"""Validates the deployed EoS-risk pipeline (ml/eos_risk/models/pipeline.joblib) against
its only available ground truth: the 5 known EoS games' actual outcomes. With n=5, this
is deliberately NOT a classification-metrics evaluation -- AUC/precision/recall at this
sample size would overstate statistical confidence. Instead this runs three
qualitative/illustrative checks and prints them for transcription into
ml/eos_risk/evaluation.md:

  1. Retrospective trajectory: does risk_score trend upward as each EoS game's real
     announcement approaches, using only data available at each earlier point in time?
  2. Leave-one-out refit: scored against pooled stats fit WITHOUT that game's own data,
     is each EoS game still flagged as elevated/high risk?
  3. Matched-age rank comparison: at comparable lifecycle ages, do EoS games' scores rank
     higher than live games' scores?

Read-only: loads the already-fitted deployed bundle for checks 1 and 3, and fits fresh
EoSRiskTransformer instances only for the leave-one-out check in check 2 (never touches
or overwrites ml/eos_risk/models/pipeline.joblib). This is a validation exercise, not a
re-tuning pass.

Run:  uv run evaluate_pipeline.py
"""
from pathlib import Path

import joblib
import pandas as pd

import explore_approaches as base
from build_pipeline import ALIGNED_FEATURE_COLUMNS, SURVIVAL_CHECKPOINTS
from pipeline_def import EoSRiskTransformer

SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_PATH = SCRIPT_DIR / "models" / "pipeline.joblib"

TRAJECTORY_OFFSETS = [-24, -12, -4]

# Same bands as ml/eos_risk/serve.py's _interpretation() -- duplicated here rather than
# imported, since importing serve.py would trigger its own module-level bundle load.
LOW_MAX = 0.15
MODERATE_MAX = 0.35
ELEVATED_MAX = 1.2


def interpretation(risk_score):
    if pd.isna(risk_score):
        return None
    if risk_score < LOW_MAX:
        return "low"
    if risk_score < MODERATE_MAX:
        return "moderate"
    if risk_score < ELEVATED_MAX:
        return "elevated"
    return "high"


def score_row(pipeline, feat):
    risk_score, base_rate_risk, score_sv = pipeline.transform([feat])[0]
    return float(risk_score), float(base_rate_risk), float(score_sv)


def has_age(row):
    """age_weeks is the one input that breaks the computation outright if missing (it
    feeds arithmetic in _survival_pct_at with no NaN handling). The other three
    (sentiment_slope_4w, sentiment_vol_4w, volume_slope_4w) are safe to leave NaN --
    EoSRiskTransformer._z() already treats a NaN value as "no evidence" (z=0), exactly
    matching how the deployed API behaves for such inputs, so gating on them too would
    hide real (if partially uninformed) deployed behavior rather than reflect it.
    """
    return pd.notna(row["game_age_weeks"])


def n_features_available(row):
    return sum(pd.notna(row[c]) for c in ["sentiment_slope_4w", "sentiment_vol_4w", "volume_slope_4w"])


# --------------------------------------------------------------------------------------
# Check 1: retrospective trajectory
# --------------------------------------------------------------------------------------

def retrospective_trajectory(aligned, games_df, pipeline):
    eos_ids = games_df.loc[games_df["is_eos"], "id"].tolist()
    name = games_df.set_index("id")["name"]
    rows = []
    for gid in eos_ids:
        g = aligned[aligned["game_id"] == gid].set_index("weeks_offset")
        for offset in TRAJECTORY_OFFSETS:
            weeks_before = -offset
            if offset not in g.index or not has_age(g.loc[offset]):
                rows.append(
                    {"game": name[gid], "weeks_before_announcement": weeks_before, "risk_score": None, "note": "no data at this offset"}
                )
                continue
            r = g.loc[offset]
            feat = [r[c] for c in ALIGNED_FEATURE_COLUMNS]
            risk_score, base_rate, score_sv = score_row(pipeline, feat)
            n_feat = n_features_available(r)
            rows.append(
                {
                    "game": name[gid],
                    "weeks_before_announcement": weeks_before,
                    "risk_score": round(risk_score, 3),
                    "base_rate_risk": round(base_rate, 3),
                    "score_sv": round(score_sv, 3),
                    "interpretation": interpretation(risk_score),
                    "note": None if n_feat == 3 else f"only {n_feat}/3 sentiment/volume features available",
                }
            )
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------------------
# Check 2: leave-one-out refit
# --------------------------------------------------------------------------------------

def leave_one_out(aligned, games_df, pipeline):
    eos_ids = games_df.loc[games_df["is_eos"], "id"].tolist()
    name = games_df.set_index("id")["name"]
    rows = []
    for held_out in eos_ids:
        score_row_data = aligned[(aligned["game_id"] == held_out) & (aligned["weeks_offset"] == 0)]
        if score_row_data.empty or not has_age(score_row_data.iloc[0]):
            rows.append({"game": name[held_out], "note": "no usable announcement-week data"})
            continue
        feat = [score_row_data.iloc[0][c] for c in ALIGNED_FEATURE_COLUMNS]

        # Original (deployed): pooled stats fit on ALL 10 games, including this one.
        full_risk, full_base, full_sv = score_row(pipeline, feat)

        # Leave-one-out: pooled stats refit excluding this game's rows entirely.
        train_mask = aligned["game_id"] != held_out
        X_loo = aligned.loc[train_mask, ALIGNED_FEATURE_COLUMNS].to_numpy(dtype=float)
        loo_transformer = EoSRiskTransformer(survival_checkpoints=SURVIVAL_CHECKPOINTS).fit(X_loo)
        loo_risk, loo_base, loo_sv = score_row(loo_transformer, feat)

        rows.append(
            {
                "game": name[held_out],
                "risk_score_deployed": round(full_risk, 3),
                "interpretation_deployed": interpretation(full_risk),
                "risk_score_loo": round(loo_risk, 3),
                "interpretation_loo": interpretation(loo_risk),
                "score_sv_loo": round(loo_sv, 3),
            }
        )
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------------------
# Check 3: matched-age rank comparison
# --------------------------------------------------------------------------------------

def matched_age_comparison(aligned, games_df, pipeline):
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    eos_ids = games_df.loc[games_df["is_eos"], "id"].tolist()
    name = games_df.set_index("id")["name"]

    eos_candidates = aligned[
        (aligned["game_id"].isin(eos_ids)) & (aligned["weeks_offset"] <= 0)
    ].dropna(subset=["game_age_weeks"])

    rows = []
    for gid in live_ids:
        live_row = base.latest_observed_row(aligned, gid)
        if live_row is None or not has_age(live_row):
            continue
        live_age = live_row["game_age_weeks"]
        live_feat = [live_row[c] for c in ALIGNED_FEATURE_COLUMNS]
        live_risk, _, _ = score_row(pipeline, live_feat)

        candidates = eos_candidates.copy()
        candidates["age_diff"] = (candidates["game_age_weeks"] - live_age).abs()
        best = candidates.loc[candidates["age_diff"].idxmin()]
        eos_feat = [best[c] for c in ALIGNED_FEATURE_COLUMNS]
        eos_risk, _, _ = score_row(pipeline, eos_feat)

        rows.append(
            {
                "live_game": name[gid],
                "live_age_weeks": round(float(live_age), 1),
                "live_risk_score": round(live_risk, 3),
                "closest_eos_match": name[best["game_id"]],
                "eos_age_weeks": round(float(best["game_age_weeks"]), 1),
                "eos_weeks_before_announcement": -int(best["weeks_offset"]),
                "eos_risk_score": round(eos_risk, 3),
                "eos_scored_higher": bool(eos_risk > live_risk),
            }
        )
    return pd.DataFrame(rows)


def main():
    now = pd.Timestamp.now().normalize()

    print("Fetching games + reviews from Supabase...")
    games_df, reviews_df = base.fetch_games_and_reviews()
    weekly = base.build_weekly(games_df, reviews_df)
    aligned = base.build_aligned_features(weekly, games_df, now)

    pipeline = joblib.load(PIPELINE_PATH)["pipeline"]

    base.print_section("Check 1: Retrospective trajectory (does risk_score rise as announcement approaches?)")
    traj = retrospective_trajectory(aligned, games_df, pipeline)
    print(traj.to_string(index=False))

    base.print_section("Check 2: Leave-one-out refit (still elevated/high without its own data in the pooled fit?)")
    loo = leave_one_out(aligned, games_df, pipeline)
    print(loo.to_string(index=False))

    base.print_section("Check 3: Matched-age rank comparison (EoS pre-announcement vs. live, at similar age)")
    matched = matched_age_comparison(aligned, games_df, pipeline)
    print(matched.to_string(index=False))
    print(f"\nEoS scored higher than its age-matched live game in {matched['eos_scored_higher'].sum()}/{len(matched)} pairs.")

    base.print_section("Done")
    print("Read-only checks -- ml/eos_risk/models/pipeline.joblib was not modified.")


if __name__ == "__main__":
    main()
