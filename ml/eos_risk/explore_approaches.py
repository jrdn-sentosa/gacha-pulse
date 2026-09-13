"""Exploratory comparison of three EoS-risk modeling approaches -- DTW curve matching,
a transparent rule-based score, and changepoint detection -- against the same aligned
Week -52..+4 sentiment/volume trend data already computed for the dashboard's
"Healthy vs. EoS" tab (lib/aggregate.ts: buildGameSeries + mergeAlignedSeries).

This is NOT the final pipeline. It fetches games/reviews from Supabase, rebuilds the same
weekly buckets and EoS-relative alignment the dashboard computes client-side in
TypeScript, engineers a handful of extra features (rolling slope/volatility, game age),
then runs and reports on each candidate approach. Nothing here is persisted as a model
artifact or wired into the deployed sentiment API -- read the printed report to decide
which approach(es) are worth building into a real ml/eos_risk pipeline.

Run:  uv run explore_approaches.py
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import ruptures as rpt
from dtaidistance import dtw

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_PATH = SCRIPT_DIR.parent.parent / ".env"
OUTPUT_DIR = SCRIPT_DIR / "exploration_output"

PAGE_SIZE = 1000
SUPABASE_HEADERS = {"User-Agent": "gacha-pulse-ml/1.0"}

MIN_WEEKLY_SAMPLE = 5   # lib/aggregate.ts MIN_WEEKLY_SAMPLE -- weeks below this show as a gap
MIN_OFFSET, MAX_OFFSET = -52, 4   # dashboard's Healthy-vs-EoS chart window (weeks relative to announcement/"now")
TRAILING_WINDOW = 4     # "trailing 4-week" slope/volatility window requested in the brief
RECENT_CHANGEPOINT_WEEKS = 12    # a changepoint within this many weeks of "now" counts as "recent"


# --------------------------------------------------------------------------------------
# Supabase fetch (same minimal urllib approach as ml/sentiment/export_training_data.py)
# --------------------------------------------------------------------------------------

def load_dotenv(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def supabase_config():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in the repo's .env "
            "or the environment) to fetch games/reviews."
        )
    return url.rstrip("/"), key


def fetch_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all(url, key, table, select, order):
    headers = {**SUPABASE_HEADERS, "apikey": key, "Authorization": f"Bearer {key}"}
    rows, offset = [], 0
    while True:
        query = urllib.parse.urlencode(
            {"select": select, "order": order, "offset": str(offset), "limit": str(PAGE_SIZE)}
        )
        try:
            page = fetch_json(f"{url}/rest/v1/{table}?{query}", headers)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase request failed: {e}") from e
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def fetch_games_and_reviews():
    load_dotenv(ENV_PATH)
    url, key = supabase_config()
    games = fetch_all(url, key, "games", "id,name,is_eos,eos_announced_date,eos_shutdown_date", "name.asc")
    reviews = fetch_all(url, key, "reviews", "game_id,voted_up,created_at,playtime_forever", "id.asc")

    games_df = pd.DataFrame(games)
    games_df["eos_announced_date"] = pd.to_datetime(games_df["eos_announced_date"], utc=True).dt.tz_localize(None)
    games_df["eos_shutdown_date"] = pd.to_datetime(games_df["eos_shutdown_date"], utc=True).dt.tz_localize(None)

    reviews_df = pd.DataFrame(reviews)
    reviews_df["created_at"] = pd.to_datetime(reviews_df["created_at"], utc=True).dt.tz_localize(None)
    return games_df, reviews_df


# --------------------------------------------------------------------------------------
# Weekly bucketing -- mirrors lib/aggregate.ts buildGameSeries()
# --------------------------------------------------------------------------------------

def week_start(ts):
    """Monday-aligned week bucket, matching date-fns startOfWeek({weekStartsOn: 1})."""
    d = pd.Timestamp(ts).normalize()
    return d - pd.Timedelta(days=d.weekday())


def review_phase(ws, announced, shutdown):
    """Mirrors lib/aggregate.ts reviewPhaseFor()."""
    if pd.isna(announced):
        return "live"
    if ws < announced:
        return "pre_announcement"
    if pd.notna(shutdown) and ws > shutdown:
        return "post_shutdown"
    return "announced"


def build_weekly(games_df, reviews_df):
    reviews_df = reviews_df.copy()
    reviews_df["week_start"] = reviews_df["created_at"].map(week_start)

    frames = []
    for _, game in games_df.iterrows():
        g_reviews = reviews_df[reviews_df["game_id"] == game["id"]]
        if g_reviews.empty:
            continue
        grouped = (
            g_reviews.groupby("week_start")
            .agg(
                total=("voted_up", "size"),
                positive=("voted_up", "sum"),
                playtime_sum=("playtime_forever", "sum"),
                playtime_count=("playtime_forever", "count"),
            )
            .reset_index()
            .sort_values("week_start")
        )
        grouped["pct_positive"] = np.where(
            grouped["total"] >= MIN_WEEKLY_SAMPLE, grouped["positive"] / grouped["total"] * 100, np.nan
        )
        grouped["avg_playtime"] = np.where(
            grouped["playtime_count"] > 0, grouped["playtime_sum"] / grouped["playtime_count"], np.nan
        )
        grouped["review_phase"] = grouped["week_start"].map(
            lambda ws: review_phase(ws, game["eos_announced_date"], game["eos_shutdown_date"])
        )
        first_week = grouped["week_start"].min()
        grouped["game_age_weeks"] = ((grouped["week_start"] - first_week).dt.days / 7).round().astype(int)
        grouped["game_id"] = game["id"]
        grouped["game_name"] = game["name"]
        grouped["is_eos"] = game["is_eos"]
        frames.append(grouped)
    return pd.concat(frames, ignore_index=True)


# --------------------------------------------------------------------------------------
# EoS-relative alignment -- mirrors lib/aggregate.ts referenceDateForGame + mergeAlignedSeries
# --------------------------------------------------------------------------------------

def reference_date(game_row, now):
    if game_row["is_eos"] and pd.notna(game_row["eos_announced_date"]):
        return game_row["eos_announced_date"]
    return now


def _ols_slope(y):
    mask = ~np.isnan(y)
    if mask.sum() < 2:
        return np.nan
    x = np.arange(len(y))[mask]
    yv = y[mask]
    x_mean, y_mean = x.mean(), yv.mean()
    denom = ((x - x_mean) ** 2).sum()
    return np.nan if denom == 0 else float(((x - x_mean) * (yv - y_mean)).sum() / denom)


def rolling_slope(series, window):
    return series.rolling(window, min_periods=2).apply(_ols_slope, raw=True)


def rolling_vol(series, window):
    return series.rolling(window, min_periods=2).std()


def build_aligned_features(weekly, games_df, now):
    """One row per (game, weeks_offset) in [MIN_OFFSET, MAX_OFFSET], reindexed onto a
    dense integer weekly grid (so 'trailing 4-week' rolling windows are literal calendar
    weeks, not just 4 data points with gaps skipped) with all engineered features.

    Rounding "now" to the nearest weekly bucket (matching the dashboard's own
    alignByReferenceDate) can put weeks_offset=0 on a week that hasn't happened yet,
    depending which day of the week the script runs on. Zero-filling volume there would
    fabricate a "review volume collapsed to 0" data point that never happened, so gap
    weeks are only zero-filled *inside* the game's real observed range
    [min_real_offset, max_real_offset]; anything past max_real_offset (the future, for a
    live game) is left NaN and excluded from rolling stats and "current" snapshots.
    """
    full_index = pd.RangeIndex(MIN_OFFSET, MAX_OFFSET + 1)
    first_real_week = weekly.groupby("game_id")["week_start"].min()
    frames = []
    for _, game in games_df.iterrows():
        g = weekly[(weekly["game_id"] == game["id"]) & (weekly["review_phase"] != "post_shutdown")]
        if g.empty:
            continue
        ref = reference_date(game, now)
        base_age_weeks = round((ref - first_real_week[game["id"]]).days / 7)

        g = g.copy()
        g["weeks_offset"] = ((g["week_start"] - ref).dt.days / 7).round().astype(int)
        g = g[(g["weeks_offset"] >= MIN_OFFSET) & (g["weeks_offset"] <= MAX_OFFSET)]
        min_real_offset, max_real_offset = g["weeks_offset"].min(), g["weeks_offset"].max()

        g = g.drop_duplicates(subset="weeks_offset").set_index("weeks_offset").reindex(full_index)
        g.index.name = "weeks_offset"
        in_real_range = (g.index >= min_real_offset) & (g.index <= max_real_offset)
        g.loc[in_real_range, "total"] = g.loc[in_real_range, "total"].fillna(0)
        age = base_age_weeks + pd.Series(g.index, index=g.index)
        g["game_age_weeks"] = age.where(age >= 0)
        g["game_id"] = game["id"]
        g["game_name"] = game["name"]
        g["is_eos"] = bool(game["is_eos"])
        frames.append(g.reset_index())

    aligned = pd.concat(frames, ignore_index=True).sort_values(["game_id", "weeks_offset"]).reset_index(drop=True)

    aligned["sentiment_pct"] = aligned["pct_positive"]
    aligned["volume"] = aligned["total"]
    for col, feature in [("sentiment_pct", "sentiment"), ("volume", "volume")]:
        aligned[f"{feature}_slope_4w"] = aligned.groupby("game_id")[col].transform(
            lambda s: rolling_slope(s, TRAILING_WINDOW)
        )
        aligned[f"{feature}_vol_4w"] = aligned.groupby("game_id")[col].transform(
            lambda s: rolling_vol(s, TRAILING_WINDOW)
        )

    return aligned[
        [
            "game_id", "game_name", "is_eos", "weeks_offset",
            "sentiment_pct", "sentiment_slope_4w", "sentiment_vol_4w",
            "volume", "volume_slope_4w", "volume_vol_4w",
            "avg_playtime", "game_age_weeks",
        ]
    ]


# --------------------------------------------------------------------------------------
# Approach 1: DTW distance to each of the 5 EoS reference curves
# --------------------------------------------------------------------------------------

def _curve(aligned, game_id, feature, offset_range, smooth):
    g = aligned[(aligned["game_id"] == game_id) & aligned["weeks_offset"].between(*offset_range)]
    g = g.sort_values("weeks_offset")
    s = g[feature].astype(float).interpolate(limit_direction="both")
    if s.isna().all():
        return None
    if smooth:
        s = s.rolling(smooth, min_periods=1).mean()
    return s.to_numpy()


def _znorm(x):
    x = np.asarray(x, dtype=float)
    std = x.std()
    return (x - x.mean()) / std if std > 0 else x - x.mean()


def run_dtw_comparison(aligned, games_df, feature="sentiment_pct"):
    name = games_df.set_index("id")["name"]
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    eos_ids = games_df.loc[games_df["is_eos"], "id"].tolist()

    eos_curves = {}
    for eid in eos_ids:
        c = _curve(aligned, eid, feature, (MIN_OFFSET, 0), TRAILING_WINDOW)
        if c is not None:
            eos_curves[eid] = _znorm(c)

    results = []
    for lid in live_ids:
        live_curve = _curve(aligned, lid, feature, (MIN_OFFSET, 0), TRAILING_WINDOW)
        if live_curve is None:
            results.append({"live_game": name[lid], "error": "insufficient data"})
            continue
        live_z = _znorm(live_curve)
        dists = {name[eid]: round(float(dtw.distance(live_z, curve)), 3) for eid, curve in eos_curves.items()}
        ranked = sorted(dists.items(), key=lambda kv: kv[1])
        results.append(
            {
                "live_game": name[lid],
                "closest_eos_match": ranked[0][0],
                "distance": ranked[0][1],
                "all_distances_ranked": ranked,
            }
        )
    return results


# --------------------------------------------------------------------------------------
# Approach 2: transparent weighted rule-based score, no training
# --------------------------------------------------------------------------------------

WEIGHTS = {"sentiment_slope": 0.5, "sentiment_vol": 0.2, "volume_slope": 0.3}


def _pooled_zscore(aligned, col):
    vals = aligned[col].dropna()
    return vals.mean(), vals.std()


def latest_observed_row(aligned, game_id):
    """The most recent weeks_offset with real (non-reindex-filled) data for this game --
    see build_aligned_features's docstring for why this isn't just weeks_offset==0.
    """
    g = aligned[(aligned["game_id"] == game_id) & aligned["volume"].notna()]
    return None if g.empty else g.loc[g["weeks_offset"].idxmax()]


def run_rule_based_score(aligned, games_df):
    name = games_df.set_index("id")["name"]
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    current = pd.DataFrame(
        [row for gid in live_ids if (row := latest_observed_row(aligned, gid)) is not None]
    ).set_index("game_id")

    sent_slope_mean, sent_slope_std = _pooled_zscore(aligned, "sentiment_slope_4w")
    sent_vol_mean, sent_vol_std = _pooled_zscore(aligned, "sentiment_vol_4w")
    vol_slope_mean, vol_slope_std = _pooled_zscore(aligned, "volume_slope_4w")

    rows = []
    for gid in live_ids:
        if gid not in current.index:
            continue
        r = current.loc[gid]

        def z(value, mean, std):
            if pd.isna(value) or std == 0 or pd.isna(std):
                return 0.0
            return float((value - mean) / std)

        z_sent_slope = z(r["sentiment_slope_4w"], sent_slope_mean, sent_slope_std)
        z_sent_vol = z(r["sentiment_vol_4w"], sent_vol_mean, sent_vol_std)
        z_vol_slope = z(r["volume_slope_4w"], vol_slope_mean, vol_slope_std)

        # Risk rises when sentiment is trending down, sentiment is volatile, and volume
        # is trending down -- hence the sign flips on the two "falling = worse" terms.
        score = (
            WEIGHTS["sentiment_slope"] * -z_sent_slope
            + WEIGHTS["sentiment_vol"] * z_sent_vol
            + WEIGHTS["volume_slope"] * -z_vol_slope
        )
        rows.append(
            {
                "game": name[gid],
                "risk_score": round(score, 3),
                "sentiment_pct": round(r["sentiment_pct"], 1) if pd.notna(r["sentiment_pct"]) else None,
                "sentiment_slope_4w": round(r["sentiment_slope_4w"], 3) if pd.notna(r["sentiment_slope_4w"]) else None,
                "sentiment_vol_4w": round(r["sentiment_vol_4w"], 3) if pd.notna(r["sentiment_vol_4w"]) else None,
                "volume_slope_4w": round(r["volume_slope_4w"], 2) if pd.notna(r["volume_slope_4w"]) else None,
            }
        )
    return sorted(rows, key=lambda r: r["risk_score"], reverse=True)


# --------------------------------------------------------------------------------------
# Approach 3: changepoint detection on each game's own full history
# --------------------------------------------------------------------------------------

def full_weekly_series(weekly, game_id, feature="pct_positive"):
    # Exclude post_shutdown weeks (nostalgia/frustration reviews about the closure itself,
    # not the pre-EoS decline this is meant to detect) -- same filter used everywhere else.
    g = weekly[(weekly["game_id"] == game_id) & (weekly["review_phase"] != "post_shutdown")]
    g = g.sort_values("week_start")
    if len(g) < 12:
        return None
    idx = pd.date_range(g["week_start"].min(), g["week_start"].max(), freq="W-MON")
    s = g.set_index("week_start")[feature].reindex(idx).interpolate(limit_direction="both")
    return s


def detect_changepoints(series, pen=6.0):
    signal = series.to_numpy().reshape(-1, 1)
    algo = rpt.Pelt(model="rbf", min_size=TRAILING_WINDOW).fit(signal)
    bkps = algo.predict(pen=pen)
    return [b for b in bkps if b < len(series)]  # drop the trailing len(signal) sentinel


def changepoint_penalty_sensitivity(weekly, games_df, pens=(3.0, 6.0, 10.0)):
    """How much does the chosen penalty change the number of detected breakpoints? With
    only 5 EoS examples there's no held-out way to tune this, so instability here is a
    real limitation, not just a footnote.
    """
    rows = []
    for _, game in games_df.iterrows():
        s = full_weekly_series(weekly, game["id"])
        if s is None:
            continue
        rows.append({"game": game["name"], **{f"n_bkps_pen={p}": len(detect_changepoints(s, pen=p)) for p in pens}})
    return rows


def run_changepoint_detection(weekly, games_df, now):
    rows = []
    for _, game in games_df.iterrows():
        s = full_weekly_series(weekly, game["id"])
        if s is None:
            rows.append({"game": game["name"], "is_eos": bool(game["is_eos"]), "error": "insufficient history"})
            continue
        bkps = detect_changepoints(s)
        ref = game["eos_announced_date"] if game["is_eos"] else now

        if bkps:
            last_idx = bkps[-1]
            last_date = s.index[last_idx]
            weeks_since = round((ref - last_date).days / 7)
            before = s.iloc[max(0, last_idx - TRAILING_WINDOW): last_idx].mean()
            after = s.iloc[last_idx: last_idx + TRAILING_WINDOW].mean()
            shift = round(float(after - before), 1)
        else:
            weeks_since, shift = None, None

        rows.append(
            {
                "game": game["name"],
                "is_eos": bool(game["is_eos"]),
                "n_weeks_of_history": len(s),
                "n_changepoints": len(bkps),
                "weeks_between_last_changepoint_and_reference": weeks_since,
                "sentiment_level_shift_at_last_changepoint": shift,
                "recent_break": weeks_since is not None and abs(weeks_since) <= RECENT_CHANGEPOINT_WEEKS,
            }
        )
    return rows


# --------------------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------------------

def print_section(title):
    print("\n" + "=" * 88)
    print(title)
    print("=" * 88)


def main():
    now = pd.Timestamp.now().normalize()

    print("Fetching games + reviews from Supabase...")
    games_df, reviews_df = fetch_games_and_reviews()
    print(f"  {len(games_df)} games ({games_df['is_eos'].sum()} EoS, {(~games_df['is_eos']).sum()} live), "
          f"{len(reviews_df)} reviews")

    weekly = build_weekly(games_df, reviews_df)
    aligned = build_aligned_features(weekly, games_df, now)

    OUTPUT_DIR.mkdir(exist_ok=True)
    aligned.to_csv(OUTPUT_DIR / "aligned_features.csv", index=False)
    print(f"  Wrote per-game per-week feature table to {OUTPUT_DIR / 'aligned_features.csv'}")

    print_section("Live game snapshot (each game's own most recently observed week)")
    snapshot_cols = [
        "game_name", "weeks_offset", "sentiment_pct", "sentiment_slope_4w", "sentiment_vol_4w",
        "volume", "volume_slope_4w", "game_age_weeks",
    ]
    live_ids = games_df.loc[~games_df["is_eos"], "id"].tolist()
    snapshot = pd.DataFrame(
        [row for gid in live_ids if (row := latest_observed_row(aligned, gid)) is not None]
    )[snapshot_cols]
    print(snapshot.to_string(index=False))

    print_section("Approach 1: DTW distance to each EoS reference curve (sentiment_pct, z-normalized, weeks -52..0)")
    dtw_results = run_dtw_comparison(aligned, games_df)
    for r in dtw_results:
        if "error" in r:
            print(f"  {r['live_game']}: {r['error']}")
            continue
        print(f"  {r['live_game']}: closest match = {r['closest_eos_match']} (distance {r['distance']})")
        print(f"    full ranking: {r['all_distances_ranked']}")

    print_section("Approach 2: weighted rule-based risk score (no training)")
    print(f"  score = {WEIGHTS['sentiment_slope']}*(-z(sentiment_slope_4w)) "
          f"+ {WEIGHTS['sentiment_vol']}*z(sentiment_vol_4w) "
          f"+ {WEIGHTS['volume_slope']}*(-z(volume_slope_4w))")
    print("  (z-scores computed against the pooled distribution of that feature across all 10 games' full history)")
    rule_results = run_rule_based_score(aligned, games_df)
    for i, r in enumerate(rule_results, 1):
        print(f"  {i}. {r['game']}: risk_score={r['risk_score']}  "
              f"(sentiment={r['sentiment_pct']}%, sent_slope={r['sentiment_slope_4w']}, "
              f"sent_vol={r['sentiment_vol_4w']}, vol_slope={r['volume_slope_4w']})")

    print_section("Approach 3: changepoint detection (ruptures Pelt/rbf) on each game's own full sentiment history")
    cp_results = run_changepoint_detection(weekly, games_df, now)
    print("  -- EoS games (validation: does the last changepoint land near their real announcement week?) --")
    for r in cp_results:
        if r["is_eos"]:
            print(f"  {r['game']}: {r}")
    print("  -- Live games --")
    for r in cp_results:
        if not r["is_eos"]:
            print(f"  {r['game']}: {r}")

    print_section("Approach 3 sensitivity check: how much does the penalty hyperparameter change results?")
    for r in changepoint_penalty_sensitivity(weekly, games_df):
        print(f"  {r}")

    print_section("Done")
    print("This script only explores/reports -- no model artifacts were saved, nothing was deployed.")


if __name__ == "__main__":
    main()
