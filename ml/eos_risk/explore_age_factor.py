"""Exploratory follow-up to explore_approaches.py: does adding "game age" (weeks since
first review) to the rule-based EoS-risk score change the ranking of the 5 live games?

Tries two treatments, per the brief:
  1. Age as a fourth additive, z-scored term in the same weighted formula.
  2. Age as a base-rate prior -- the GachaGo survival-curve checkpoints already cited in
     the dashboard (why-eos-section.tsx: 84% past year 1, 44% past year 3, 26% past year
     5) interpolated into a per-game "expected risk given age alone", then combined
     multiplicatively with the existing (age-free) sentiment/volume score rather than
     folded into the same z-scored sum.

Reuses the data fetch / weekly bucketing / alignment / feature engineering from
explore_approaches.py unchanged -- this script only adds the age-comparison logic. Not
the final pipeline; still just a report.

Run:  uv run explore_age_factor.py
"""
import numpy as np
import pandas as pd

import explore_approaches as base

# GachaGo! End of Service Tracker checkpoints already cited in
# components/dashboard/why-eos-section.tsx -- % of tracked games still active beyond
# each milestone. (0, 100%) is the implicit launch-day anchor, not itself cited.
SURVIVAL_CHECKPOINTS_YEARS = [0, 1, 3, 5]
SURVIVAL_PCT = [100, 84, 44, 26]


def survival_pct_at(age_years):
    """Piecewise-linear interpolation between the cited checkpoints; beyond year 5,
    linearly extrapolates the year-3-to-5 slope (clipped at 0) since the source only
    tracks out to year 5 -- flagged as a real limitation in the report, though none of
    the 5 live games are old enough to hit it.
    """
    if age_years <= SURVIVAL_CHECKPOINTS_YEARS[-1]:
        return float(np.interp(age_years, SURVIVAL_CHECKPOINTS_YEARS, SURVIVAL_PCT))
    slope = (SURVIVAL_PCT[-1] - SURVIVAL_PCT[-2]) / (SURVIVAL_CHECKPOINTS_YEARS[-1] - SURVIVAL_CHECKPOINTS_YEARS[-2])
    extrapolated = SURVIVAL_PCT[-1] + slope * (age_years - SURVIVAL_CHECKPOINTS_YEARS[-1])
    return max(0.0, extrapolated)


def base_rate_risk(age_years):
    """1 - survival fraction: naive-Bayes-style base rate of "already past EoS" given
    only the game's age, ignoring sentiment/volume evidence entirely.
    """
    return 1 - survival_pct_at(age_years) / 100


def age_at_reference(aligned, games_df):
    """One age-in-weeks observation per game, at its own reference point (announcement
    week for EoS games, most-recently-observed week for live games) -- NOT pooled across
    every weekly row, unlike the slope/volatility features. Age is monotonically
    increasing within a game, so pooling every week of a game's history as if it were an
    independent sample would be pseudoreplication; the only defensible population here is
    one cross-sectional point per game (n=10).
    """
    ages = {}
    for _, game in games_df.iterrows():
        gid = game["id"]
        if game["is_eos"]:
            row = aligned[(aligned["game_id"] == gid) & (aligned["weeks_offset"] == 0)]
            age = row["game_age_weeks"].iloc[0] if not row.empty else np.nan
        else:
            row = base.latest_observed_row(aligned, gid)
            age = row["game_age_weeks"] if row is not None else np.nan
        ages[gid] = age
    return pd.Series(ages, name="game_age_weeks")


def version1_additive_age(aligned, games_df):
    """Version 1: age folded into the same weighted z-scored formula as a 4th term."""
    name = games_df.set_index("id")["name"]
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    current = pd.DataFrame(
        [row for gid in live_ids if (row := base.latest_observed_row(aligned, gid)) is not None]
    ).set_index("game_id")

    ages = age_at_reference(aligned, games_df).dropna()
    age_mean, age_std = ages.mean(), ages.std()

    sent_slope_mean, sent_slope_std = base._pooled_zscore(aligned, "sentiment_slope_4w")
    sent_vol_mean, sent_vol_std = base._pooled_zscore(aligned, "sentiment_vol_4w")
    vol_slope_mean, vol_slope_std = base._pooled_zscore(aligned, "volume_slope_4w")

    weights = {"sentiment_slope": 0.4, "sentiment_vol": 0.15, "volume_slope": 0.25, "age": 0.2}

    def z(value, mean, std):
        if pd.isna(value) or std == 0 or pd.isna(std):
            return 0.0
        return float((value - mean) / std)

    rows = []
    for gid in live_ids:
        if gid not in current.index:
            continue
        r = current.loc[gid]
        z_sent_slope = z(r["sentiment_slope_4w"], sent_slope_mean, sent_slope_std)
        z_sent_vol = z(r["sentiment_vol_4w"], sent_vol_mean, sent_vol_std)
        z_vol_slope = z(r["volume_slope_4w"], vol_slope_mean, vol_slope_std)
        z_age = z(ages.get(gid, np.nan), age_mean, age_std)

        score = (
            weights["sentiment_slope"] * -z_sent_slope
            + weights["sentiment_vol"] * z_sent_vol
            + weights["volume_slope"] * -z_vol_slope
            + weights["age"] * z_age
        )
        rows.append(
            {
                "game": name[gid],
                "risk_score_v1_additive_age": round(score, 3),
                "age_weeks": round(ages.get(gid, np.nan), 1),
                "z_age": round(z_age, 3),
            }
        )
    return sorted(rows, key=lambda r: r["risk_score_v1_additive_age"], reverse=True), weights, (age_mean, age_std)


def version2_base_rate_prior(aligned, games_df, baseline_scores):
    """Version 2: age -> interpolated survival-curve base rate, combined multiplicatively
    with the existing age-free sentiment/volume score (baseline_scores: game -> score).
    combined = base_rate_risk(age) * (1 + score_sv), clipped at 0 so a very healthy trend
    (score_sv << -1) can't flip the combined risk negative.
    """
    name = games_df.set_index("id")["name"]
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    ages = age_at_reference(aligned, games_df)

    rows = []
    for gid in live_ids:
        game_name = name[gid]
        age_weeks = ages.get(gid, np.nan)
        if pd.isna(age_weeks) or game_name not in baseline_scores:
            continue
        age_years = age_weeks / 52
        rate = base_rate_risk(age_years)
        score_sv = baseline_scores[game_name]
        multiplier = max(0.0, 1 + score_sv)
        combined = rate * multiplier
        rows.append(
            {
                "game": game_name,
                "age_years": round(age_years, 2),
                "base_rate_risk": round(rate, 3),
                "score_sv_age_free": round(score_sv, 3),
                "multiplier_(1+score_sv)": round(multiplier, 3),
                "risk_score_v2_base_rate_prior": round(combined, 3),
            }
        )
    return sorted(rows, key=lambda r: r["risk_score_v2_base_rate_prior"], reverse=True)


def main():
    now = pd.Timestamp.now().normalize()
    print("Fetching games + reviews from Supabase...")
    games_df, reviews_df = base.fetch_games_and_reviews()
    weekly = base.build_weekly(games_df, reviews_df)
    aligned = base.build_aligned_features(weekly, games_df, now)

    base.print_section("Baseline (age-free) rule-based score, for reference")
    v0 = base.run_rule_based_score(aligned, games_df)
    for i, r in enumerate(v0, 1):
        print(f"  {i}. {r['game']}: risk_score={r['risk_score']}")
    v0_by_name = {r["game"]: r["risk_score"] for r in v0}

    base.print_section("Version 1: age as a 4th additive z-scored term")
    v1, weights, (age_mean, age_std) = version1_additive_age(aligned, games_df)
    print("  score = 0.4*(-z_sent_slope) + 0.15*z_sent_vol + 0.25*(-z_vol_slope) + 0.2*z_age")
    print(f"  age z-scored cross-sectionally across all 10 games' age-at-reference (n=10), "
          f"mean={age_mean:.1f}wk, std={age_std:.1f}wk")
    for i, r in enumerate(v1, 1):
        print(f"  {i}. {r['game']}: risk_score={r['risk_score_v1_additive_age']}  "
              f"(age={r['age_weeks']}wk, z_age={r['z_age']})")

    base.print_section("Version 2: age as a base-rate prior (GachaGo survival curve), combined multiplicatively")
    print("  combined = base_rate_risk(age) * (1 + age-free sentiment/volume score), clipped >= 0")
    v2 = version2_base_rate_prior(aligned, games_df, v0_by_name)
    for i, r in enumerate(v2, 1):
        print(f"  {i}. {r['game']}: risk_score={r['risk_score_v2_base_rate_prior']}  "
              f"(age={r['age_years']}y, base_rate_risk={r['base_rate_risk']}, "
              f"score_sv={r['score_sv_age_free']}, multiplier={r['multiplier_(1+score_sv)']})")

    base.print_section("Side-by-side ranking comparison")
    v0_rank = {r["game"]: i + 1 for i, r in enumerate(v0)}
    v1_rank = {r["game"]: i + 1 for i, r in enumerate(v1)}
    v2_rank = {r["game"]: i + 1 for i, r in enumerate(v2)}
    games = sorted(v0_rank, key=lambda g: v0_rank[g])
    print(f"  {'game':<20} {'v0 (age-free)':>15} {'v1 (additive)':>15} {'v2 (base-rate)':>15}")
    for g in games:
        print(f"  {g:<20} {v0_rank[g]:>15} {v1_rank.get(g, '-'):>15} {v2_rank.get(g, '-'):>15}")

    base.print_section("Done")


if __name__ == "__main__":
    main()
