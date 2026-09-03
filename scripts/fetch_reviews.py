import csv
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

APPIDS = [3513350, 4162040, 1671200, 2064650, 3092660, 2376580, 2484110, 3016760, 1436650, 2594920]

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"

REVIEWS_URL = "https://store.steampowered.com/appreviews/{appid}?json=1"
DETAILS_URL = "https://store.steampowered.com/api/appdetails?appids={appid}"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SteamReviewFetcher/1.0"}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
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


def fetch_reviews_for_app(appid, name, writer):
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

        for r in reviews:
            writer.writerow({
                "game_name": name,
                "appid": appid,
                "review_text": r.get("review", ""),
                "voted_up": r.get("voted_up", ""),
                "timestamp_created": r.get("timestamp_created", ""),
                "playtime_forever": r.get("author", {}).get("playtime_forever", ""),
            })
        total += len(reviews)

        new_cursor = data.get("cursor", "")
        print(f"  {name}: page {page}, {len(reviews)} reviews (total {total}), cursor={new_cursor!r}")

        if not new_cursor or new_cursor == cursor or new_cursor in seen_cursors:
            break
        seen_cursors.add(new_cursor)
        cursor = new_cursor

        time.sleep(1.2)

    return total


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "steam_reviews.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = ["game_name", "appid", "review_text", "voted_up", "timestamp_created", "playtime_forever"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for appid in APPIDS:
            print(f"Fetching name for appid {appid}...")
            name = get_game_name(appid)
            print(f"  -> {name}")
            time.sleep(1.0)
            print(f"Fetching reviews for {name} ({appid})...")
            total = fetch_reviews_for_app(appid, name, writer)
            print(f"  Done: {total} reviews for {name}")
            time.sleep(1.0)

    print(f"\nSaved reviews to {out_path}")


if __name__ == "__main__":
    main()
