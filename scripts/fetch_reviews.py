import csv
import json
import os
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from pathlib import Path

APPIDS = [3513350, 4162040, 1671200, 2064650, 3092660, 2376580, 2484110, 3016760, 1436650, 2594920]

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ENV_PATH = SCRIPT_DIR.parent / ".env"

REVIEWS_URL = "https://store.steampowered.com/appreviews/{appid}?json=1"
DETAILS_URL = "https://store.steampowered.com/api/appdetails?appids={appid}"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SteamReviewFetcher/1.0"}

# Deliberately NOT browser-like: Supabase's secret API keys refuse to work on requests
# that look like they came from a browser (it checks the User-Agent), which the
# Steam-facing HEADERS above are designed to mimic.
SUPABASE_HEADERS = {"User-Agent": "gacha-pulse-fetch-script/1.0"}


def load_dotenv(path):
    """Minimal .env loader (no third-party deps) — mirrors the Node side's `dotenv/config`.
    Only fills in vars not already set, so real environment variables (e.g. GitHub Actions
    secrets in CI, where no .env file exists) always take precedence.
    """
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


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_game_name(appid):
    try:
        data = fetch_json(DETAILS_URL.format(appid=appid))
        entry = data.get(str(appid), {})
        if entry.get("success"):
            return entry["data"].get("name", str(appid))
    except Exception as e:
        print(f"  warn: could not fetch name for {appid}: {e}")
    return str(appid)


def supabase_config():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return url.rstrip("/"), key


def fetch_game_id_by_appid():
    """Maps Steam appid (str) -> Supabase games.id, so we can look up each game's
    latest stored review date. Returns {} (triggering a full fetch for every game)
    if Supabase isn't configured or unreachable — keeps a from-scratch run working
    with no Supabase project set up yet.
    """
    config = supabase_config()
    if not config:
        print("  Supabase not configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing) — doing a full fetch for every game.")
        return {}
    url, key = config
    headers = {**SUPABASE_HEADERS, "apikey": key, "Authorization": f"Bearer {key}"}
    try:
        rows = fetch_json(f"{url}/rest/v1/games?select=id,steam_appid", headers=headers)
        return {row["steam_appid"]: row["id"] for row in rows}
    except Exception as e:
        print(f"  warn: could not load games from Supabase, doing a full fetch for every game: {e}")
        return {}


def fetch_latest_created_at_unix(game_id):
    """Latest `reviews.created_at` already stored for this game, as unix seconds —
    or None if the game has no reviews yet (or Supabase is unreachable), meaning
    a full fetch should run for it.
    """
    config = supabase_config()
    if not config or not game_id:
        return None
    url, key = config
    headers = {**SUPABASE_HEADERS, "apikey": key, "Authorization": f"Bearer {key}"}
    query = urllib.parse.urlencode(
        {"game_id": f"eq.{game_id}", "select": "created_at", "order": "created_at.desc", "limit": "1"}
    )
    try:
        rows = fetch_json(f"{url}/rest/v1/reviews?{query}", headers=headers)
        if not rows:
            return None
        return int(datetime.fromisoformat(rows[0]["created_at"]).timestamp())
    except Exception as e:
        print(f"  warn: could not fetch latest review date for game {game_id}, doing a full fetch: {e}")
        return None


def fetch_reviews_for_app(appid, name, writer, cutoff_ts):
    cursor = "*"
    seen_cursors = set()
    total = 0
    page = 0
    while True:
        params = f"&filter=recent&language=all&num_per_page=100&purchase_type=all&cursor={urllib.parse.quote(cursor)}"
        url = REVIEWS_URL.format(appid=appid) + params
        try:
            data = fetch_json(url)
        except urllib.error.HTTPError as e:
            print(f"  HTTP error on {name} page {page}: {e}")
            break
        except Exception as e:
            print(f"  error on {name} page {page}: {e}")
            break

        reviews = data.get("reviews", [])
        page += 1
        if not reviews:
            print(f"  {name}: page {page} returned 0 reviews, stopping")
            break

        # filter=recent returns newest-first, so once we hit a review at or before the
        # cutoff, everything from here on (this page and every later page) is already
        # stored in Supabase — write what's new on this page, then stop paginating.
        reached_cutoff = False
        new_on_page = 0
        for r in reviews:
            ts = int(r.get("timestamp_created") or 0)
            if cutoff_ts is not None and ts <= cutoff_ts:
                reached_cutoff = True
                break
            writer.writerow({
                "game_name": name,
                "appid": appid,
                "recommendationid": r.get("recommendationid", ""),
                "review_text": r.get("review", ""),
                "voted_up": r.get("voted_up", ""),
                "timestamp_created": r.get("timestamp_created", ""),
                "playtime_forever": r.get("author", {}).get("playtime_forever", ""),
            })
            new_on_page += 1
        total += new_on_page

        new_cursor = data.get("cursor", "")
        print(f"  {name}: page {page}, {new_on_page} new of {len(reviews)} reviews (total new {total}), cursor={new_cursor!r}")

        if reached_cutoff:
            print(f"  {name}: reached already-stored reviews, stopping")
            break

        if not new_cursor or new_cursor == cursor or new_cursor in seen_cursors:
            break
        seen_cursors.add(new_cursor)
        cursor = new_cursor

        time.sleep(1.2)

    return total


def main():
    load_dotenv(ENV_PATH)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("Looking up already-stored review cutoffs in Supabase...")
    game_id_by_appid = fetch_game_id_by_appid()

    out_path = DATA_DIR / "steam_reviews.csv"
    summary = []
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "game_name",
            "appid",
            "recommendationid",
            "review_text",
            "voted_up",
            "timestamp_created",
            "playtime_forever",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for appid in APPIDS:
            print(f"Fetching name for appid {appid}...")
            name = get_game_name(appid)
            print(f"  -> {name}")
            time.sleep(1.0)

            game_id = game_id_by_appid.get(str(appid))
            cutoff_ts = fetch_latest_created_at_unix(game_id)
            if cutoff_ts is not None:
                print(f"  {name}: fetching reviews newer than {datetime.fromtimestamp(cutoff_ts)}")
            else:
                print(f"  {name}: no stored reviews found, doing a full fetch")

            print(f"Fetching reviews for {name} ({appid})...")
            total = fetch_reviews_for_app(appid, name, writer, cutoff_ts)
            print(f"  Done: {total} new reviews for {name}")
            summary.append({"game": name, "appid": appid, "new_reviews": total})
            time.sleep(1.0)

    print(f"\nSaved reviews to {out_path}")

    summary_path = DATA_DIR / "fetch_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Saved fetch summary to {summary_path}")

    print("\n--- New reviews found per game ---")
    for row in summary:
        print(f"  {row['game']}: {row['new_reviews']}")


if __name__ == "__main__":
    main()
