"""Builds the deployable EoS-risk pipeline bundle, implementing the "v2" approach
selected in ml/eos_risk/results.md: EoSRiskTransformer (ml/eos_risk/pipeline_def.py)
wrapped in a single-step sklearn Pipeline.

Reuses the same Supabase fetch / weekly bucketing / EoS-relative alignment /
feature-engineering functions already validated in explore_approaches.py -- this script
doesn't re-derive that logic, it just fits and packages the chosen transformer on top of
it. The transformer's pooled sentiment/volume normalization stats are fit on every
weekly row across all 10 games (its genuine learned state); the survival-curve base-rate
prior needs no fitting, since it comes from the fixed external GachaGo checkpoints passed
into the constructor.

After saving, spawns a fresh Python subprocess that loads the bundle back from disk and
calls pipeline.transform(...) on an example row -- proving the dumped object carries
fitted state (pooled means/stds), not just architecture that would need refitting if
reconstructed from scratch at server boot.
"""
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.pipeline import Pipeline

import explore_approaches as base
from pipeline_def import EoSRiskTransformer, INPUT_COLUMNS, OUTPUT_COLUMNS

SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR / "models"
PIPELINE_PATH = MODELS_DIR / "pipeline.joblib"

# GachaGo! End of Service Tracker checkpoints, already cited in
# components/dashboard/why-eos-section.tsx -- fraction of tracked games still active
# beyond each milestone.
SURVIVAL_CHECKPOINTS = {1: 0.84, 3: 0.44, 5: 0.26}

ALIGNED_FEATURE_COLUMNS = ["sentiment_slope_4w", "sentiment_vol_4w", "volume_slope_4w", "game_age_weeks"]


def build_training_matrix(aligned):
    """Every weekly row, across all 10 games, in INPUT_COLUMNS order. This is the pooled
    historical data the transformer's sentiment/volume z-score stats are fit on -- NaNs
    (gap weeks, insufficient sample, pre-launch) are fine, fit() uses nanmean/nanstd.
    """
    return aligned[ALIGNED_FEATURE_COLUMNS].to_numpy(dtype=float)


def build_live_snapshot(aligned, games_df):
    """One current-week row per live game, in INPUT_COLUMNS order, for the build-time
    sanity check below.
    """
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    name = games_df.set_index("id")["name"]
    names, rows = [], []
    for gid in live_ids:
        row = base.latest_observed_row(aligned, gid)
        if row is None:
            continue
        names.append(name[gid])
        rows.append([row[col] for col in ALIGNED_FEATURE_COLUMNS])
    return names, np.array(rows, dtype=float)


def verify_fresh_process_load():
    """Loads ml/eos_risk/models/pipeline.joblib in a brand-new `python` subprocess and
    calls transform() on it, proving the saved bundle carries fitted state rather than
    needing to be refit at load time.
    """
    verification_code = f"""
import sys
sys.path.insert(0, {str(SCRIPT_DIR)!r})
import joblib
import numpy as np

bundle = joblib.load({str(PIPELINE_PATH)!r})
pipeline = bundle["pipeline"]
transformer = pipeline.named_steps["eos_risk"]

print("fitted sentiment_slope_mean_:", transformer.sentiment_slope_mean_)
print("fitted sentiment_vol_mean_:", transformer.sentiment_vol_mean_)
print("fitted volume_slope_mean_:", transformer.volume_slope_mean_)

# Example: a game with a declining sentiment slope, moderate volatility, declining
# volume, ~3 years old.
example = np.array([[-10.0, 15.0, -5.0, 156.0]])
result = pipeline.transform(example)
print("transform output {OUTPUT_COLUMNS}:", result.tolist())
print("metadata:", bundle["metadata"])
print("survival_checkpoints:", bundle["survival_checkpoints"])
"""
    result = subprocess.run(
        [sys.executable, "-c", verification_code],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        raise RuntimeError("Fresh-process load/transform check failed -- see stderr above.")
    return result.stdout


def main():
    now = pd.Timestamp.now().normalize()

    print("Fetching games + reviews from Supabase...")
    games_df, reviews_df = base.fetch_games_and_reviews()
    weekly = base.build_weekly(games_df, reviews_df)
    aligned = base.build_aligned_features(weekly, games_df, now)

    X_train = build_training_matrix(aligned)
    print(f"Pooled training matrix: {X_train.shape[0]} weekly rows across {games_df.shape[0]} games")

    pipeline = Pipeline([("eos_risk", EoSRiskTransformer(survival_checkpoints=SURVIVAL_CHECKPOINTS))])
    pipeline.fit(X_train)

    transformer = pipeline.named_steps["eos_risk"]
    print("\nFitted pooled statistics:")
    print(f"  sentiment_slope_4w: mean={transformer.sentiment_slope_mean_:.4f}, std={transformer.sentiment_slope_std_:.4f}")
    print(f"  sentiment_vol_4w:   mean={transformer.sentiment_vol_mean_:.4f}, std={transformer.sentiment_vol_std_:.4f}")
    print(f"  volume_slope_4w:    mean={transformer.volume_slope_mean_:.4f}, std={transformer.volume_slope_std_:.4f}")

    print("\n--- Build-time sanity check: score the 5 live games, compare against results.md's v2 table ---")
    names, X_live = build_live_snapshot(aligned, games_df)
    scores = pipeline.transform(X_live)
    ranked = sorted(zip(names, scores.tolist()), key=lambda t: t[1][0], reverse=True)
    print(f"  {'game':<20} {'risk_score':>10} {'base_rate_risk':>15} {'score_sv':>10}")
    for name, (risk_score, base_rate, score_sv) in ranked:
        print(f"  {name:<20} {risk_score:>10.3f} {base_rate:>15.3f} {score_sv:>10.3f}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": pipeline,
        "metadata": {
            "steps": [name for name, _ in pipeline.steps],
            "built_at": datetime.now(timezone.utc).isoformat(),
            "sklearn_version": sklearn.__version__,
        },
        "survival_checkpoints": SURVIVAL_CHECKPOINTS,
        "input_columns": list(INPUT_COLUMNS),
        "output_columns": list(OUTPUT_COLUMNS),
    }
    joblib.dump(bundle, PIPELINE_PATH)
    print(f"\nSaved pipeline bundle to {PIPELINE_PATH}")

    print("\n--- Verifying fresh-process load + transform (learned-state check) ---")
    verify_fresh_process_load()
    print("Fresh-process load and transform succeeded: bundle carries fitted state, not a fresh/unfit pipeline.")


if __name__ == "__main__":
    main()
