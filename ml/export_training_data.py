"""Exports (review_text, voted_up) pairs from Supabase's reviews table to a local CSV
for training the sentiment classifier. Uses the raw REST API (no supabase client
dependency) since this repo's Python scripts talk to Supabase over HTTP directly.
"""
import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"
ENV_PATH = SCRIPT_DIR.parent / ".env"
OUT_PATH = DATA_DIR / "training_data.csv"

PAGE_SIZE = 1000

# Deliberately NOT browser-like: Supabase's secret API keys refuse to work on requests
# that look like they came from a browser (it checks the User-Agent).
SUPABASE_HEADERS = {"User-Agent": "gacha-pulse-ml/1.0"}


def load_dotenv(path):
    """Minimal .env loader (no third-party deps). Only fills in vars not already set,
    so real environment variables (e.g. CI secrets) always take precedence.
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


def supabase_config():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in the repo's .env "
            "or the environment) to export training data."
        )
    return url.rstrip("/"), key


def fetch_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all_reviews(url, key):
    """Paginated fetch of review_text/voted_up, ordered by id so that pagination is
    stable and gap-free — same fix as hooks/use-dashboard-data.ts: without an explicit
    .order(), Postgres/PostgREST don't guarantee row order across separate .range()
    queries, which can silently duplicate or drop rows.
    """
    headers = {**SUPABASE_HEADERS, "apikey": key, "Authorization": f"Bearer {key}"}
    rows = []
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "select": "review_text,voted_up",
                "order": "id.asc",
                "offset": str(offset),
                "limit": str(PAGE_SIZE),
            }
        )
        try:
            page = fetch_json(f"{url}/rest/v1/reviews?{query}", headers)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase request failed: {e}") from e
        if not page:
            break
        rows.extend(page)
        print(f"  fetched {len(rows)} rows so far...")
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def main():
    load_dotenv(ENV_PATH)
    url, key = supabase_config()

    print("Fetching reviews from Supabase...")
    rows = fetch_all_reviews(url, key)
    print(f"Fetched {len(rows)} total rows.")

    filtered = [
        row for row in rows
        if row.get("review_text") and row["review_text"].strip() and row.get("voted_up") is not None
    ]
    excluded = len(rows) - len(filtered)
    print(f"Excluded {excluded} rows with null/empty review_text.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["review_text", "voted_up"])
        writer.writeheader()
        for row in filtered:
            writer.writerow({"review_text": row["review_text"], "voted_up": row["voted_up"]})

    positive = sum(1 for row in filtered if row["voted_up"])
    negative = len(filtered) - positive
    pct_positive = (positive / len(filtered) * 100) if filtered else 0.0
    pct_negative = 100 - pct_positive if filtered else 0.0

    print(f"\nSaved {len(filtered)} rows to {OUT_PATH}")
    print(f"Class balance: {pct_positive:.1f}% positive ({positive}), {pct_negative:.1f}% negative ({negative})")


if __name__ == "__main__":
    main()
