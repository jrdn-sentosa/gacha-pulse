# Gacha Pulse

A dashboard tracking sentiment and review trends across gacha games over time, including comparisons against titles that have already reached end-of-service (EoS), to explore whether declining sentiment is a leading indicator of shutdown. First-time visitors get a gacha-style "pull" reveal of the 10 tracked games before landing on the dashboard.

## Games tracked

| Game | Steam appid | Status |
|---|---|---|
| Wuthering Waves | 3513350 | Live |
| Zenless Zone Zero | 4162040 | Live |
| Honkai Impact 3rd | 1671200 | Live |
| Tower of Fantasy | 2064650 | Live |
| Reverse: 1999 | 3092660 | Live |
| Tribe Nine | 2376580 | EoS'd 2025-11-27 (announced 2025-05-15) |
| Final Fantasy VII: Ever Crisis | 2484110 | Shutting down 2026-10-06 (announced 2026-07-07) |
| Gran Saga | 3016760 | EoS'd 2025-04-30 (announced 2025-03-05) |
| Battle Star | 1436650 | EoS'd 2024-06-28 (announced 2024-05-08) |
| Atelier Resleriana: Forgotten Alchemy and the Polar Night Liberator | 2594920 | EoS'd 2025-03-28 (announced 2025-01-27) |

5 live, 5 EoS — kept intentionally balanced to avoid survivorship bias in future modeling.

## Tech stack

- **Next.js** — dashboard app, deployed on Vercel
- **shadcn/ui** + **Tailwind CSS** — component library
- **Recharts** — sentiment/volume charts
- **Framer Motion** — gacha pull reveal animations
- **Supabase** (Postgres) — data storage
- **Python** (`uv`) — data collection scripts
- **Node.js** — Supabase loader / enrichment scripts

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql) — this creates the `games` and `reviews` tables, sets up read-only RLS policies, and seeds all 10 games (5 live / 5 EoS).
3. If you're updating an existing database created before `header_image` or `hero_image` were added to the schema, add the missing column(s) with `alter table games add column header_image text;` / `alter table games add column hero_image text;`.
4. From **Project Settings → API**, grab:
   - `Project URL`
   - `anon` / `public` key (safe for client-side use)
   - `service_role` key (secret — server-side/local scripts only, never commit or deploy this one)

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your Supabase values:

```sh
cp .env.example .env
```

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`.env` is gitignored and should never be committed.

### 3. Install dependencies

```sh
npm install
```

## Data pipeline

Reviews are collected and loaded into Supabase automatically every day via
[`.github/workflows/daily-review-sync.yml`](./.github/workflows/daily-review-sync.yml) — no manual
run required. The workflow needs two **repository secrets** (Settings → Secrets and variables →
Actions): `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It can also be triggered on demand from
the Actions tab (`Run workflow`).

1. `fetch_reviews.py` pulls Steam reviews for all 10 tracked games. It's **incremental**: it first
   asks Supabase for the most recent `created_at` already stored per game, then stops paginating
   Steam's (newest-first) review feed as soon as it reaches reviews at or before that cutoff —
   so a daily run only fetches what's new, not the full history every time. If Supabase isn't
   configured (e.g. a fresh checkout with no `.env` yet) it falls back to a full fetch for every
   game. Output goes to `data/steam_reviews.csv` and a per-game count of new reviews found to
   `data/fetch_summary.json`.
2. `fetch_reviews_append.py` is a manual, one-off helper for onboarding a **brand-new** game not
   yet in `APPIDS` — set its appid(s) in the script and run it once; it's not part of the daily
   automation.
3. `load-reviews-to-supabase.mjs` reads `data/steam_reviews.csv`, matches each row to its `game_id`
   by name, and **upserts** into the Supabase `reviews` table on a `dedup_hash` column
   (`md5(game_id + created_at + review_text)`, `on conflict (dedup_hash) do nothing`) — so
   re-running the pipeline (or the incremental fetch overlapping slightly with what's already
   stored) never creates duplicate rows. Steam's own review id is captured into
   `steam_review_id`. Writes per-game insert/duplicate counts to `data/load_summary.json`.

To run it manually, from the repo root:

```sh
cd scripts
uv run fetch_reviews.py
cd ..
npm run load
```

`data/*.csv`, `data/*.json`, and `logs/*.txt` are gitignored — all regeneratable from the commands
above, so nothing in `data/` is committed.

### Header images

Game card images (dashboard + pull reveal) use each game's real Steam header image, resolved once via Steam's public `appdetails` API and cached in the `games.header_image` column — not fetched live on every page load. Run this once (and again any time a game is added):

```sh
npm run fetch-header-images
```

`scripts/fetch-header-images.mjs` looks up `header_image` for each game and writes it to Supabase, rate-limited to avoid hitting Steam's API too fast. If a game's lookup fails or returns no image, `header_image` stays `null` and the UI falls back to a solid-color card — no broken-image icon.

### Hero images

`header_image` is a small 460x215 asset — stretched into the pull-reveal and banner cards, it looks blurry. Steam's CDN also serves a much larger `library_hero.jpg` banner (~3840x1240) for most (not all) apps, which is both higher resolution and, cropped with `object-fit: cover`, a better source for those cards. Run this once (and again any time a game is added):

```sh
npm run fetch-hero-images
```

`scripts/fetch-hero-images.mjs` probes `https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_hero.jpg` directly for each game (this asset isn't exposed by the `appdetails` API) and writes it to `games.hero_image` on a 200. If a game has no hero asset (a 404 — true for one of the tracked games), `hero_image` stays `null` and the UI falls back to `header_image` for that card. Because `library_hero.jpg` is landscape, cards render it with a center crop by default; a per-game `object-position` override list in `lib/pull.ts` (`HERO_CROP_OVERRIDES`) handles the rare game whose character sits off-center and gets awkwardly cropped.

### Verifying the load

In the Supabase SQL Editor:

```sql
select g.name, count(*) as review_count
from reviews r
join games g on g.id = r.game_id
group by g.name;
```

## Sentiment classifier (`ml/`)

`ml/` trains a standalone sentiment classifier (TF-IDF + logistic regression) on the reviews
already collected in Supabase. It has its own `pyproject.toml`/`uv.lock`, independent from
`scripts/` — the scraping scripts are intentionally dependency-free (stdlib-only, keeps the
daily GitHub Actions workflow fast with zero installs), so `ml/`'s dependencies (scikit-learn,
pandas, joblib) don't leak into them.

Run both from within `ml/`, using its own lockfile:

```sh
cd ml
uv run export_training_data.py
uv run train_model.py
cd ..
```

- `export_training_data.py` — paginates through Supabase's `reviews` table (ordered by `id`,
  same pagination fix as the dashboard) and writes `review_text`/`voted_up` to
  `ml/data/training_data.csv`, skipping rows with null/empty review text.
- `train_model.py` — trains an 80/20 stratified train/test split, reports accuracy, precision,
  recall, F1, and a confusion matrix on the held-out test set, saves the fitted vectorizer and
  model to `ml/models/*.joblib`, and writes a metrics summary to `ml/results.md`.

`ml/data/*.csv` and `ml/models/*.joblib` are gitignored — regeneratable from the commands above.

## Running the dashboard locally

```sh
npm run dev
```

Visit `http://localhost:3000` — first-time visitors see the gacha pull reveal, then land on `/dashboard`. Visit `/dashboard` directly to skip the reveal.

## Deployment (Vercel)

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), sign in with GitHub and import the repo — it auto-detects Next.js.
3. In the Vercel project's **Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   (Only the public/anon key — the `service_role` key is never used by the deployed app, only by local data-pipeline scripts.)
4. Deploy. Vercel auto-deploys on every push to `main` from then on.

## Project structure

```
gacha/
├── .github/
│   └── workflows/
│       └── daily-review-sync.yml  # scheduled Steam fetch + Supabase load
├── app/
│   ├── page.tsx             # "/" — gacha pull reveal, then redirects to /dashboard
│   ├── pull/page.tsx        # "/pull" — replay the pull reveal
│   └── dashboard/page.tsx   # "/dashboard" — sentiment/volume charts, healthy vs EoS
├── components/
│   ├── dashboard/           # charts, game cards, sentiment/volume views
│   ├── pull/                # gacha pull reveal UI
│   └── ui/                  # shadcn primitives
├── hooks/
│   └── use-dashboard-data.ts  # fetches games + reviews from Supabase
├── lib/                     # Supabase client, aggregation, types, theme
├── scripts/                 # data collection & loading
│   ├── fetch_reviews.py            # incremental daily Steam fetch
│   ├── fetch_reviews_append.py     # manual one-off: onboard a new game
│   ├── load-reviews-to-supabase.mjs
│   ├── print-sync-summary.mjs      # formats the daily workflow's step summary
│   ├── fetch-header-images.mjs
│   └── fetch-hero-images.mjs
├── ml/                     # sentiment classifier training pipeline (own pyproject.toml/uv.lock)
│   ├── export_training_data.py
│   ├── train_model.py
│   ├── data/               # gitignored CSV output
│   ├── models/             # gitignored trained vectorizer/model
│   └── results.md          # latest training run's metrics
├── supabase/
│   └── schema.sql
├── data/                   # gitignored CSV output
├── logs/                   # gitignored run logs
├── .env.example
└── README.md
```