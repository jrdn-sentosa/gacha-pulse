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

Reviews are collected in two steps, then loaded into Supabase:

1. `fetch_reviews.py` pulls Steam reviews for the 5 healthy (still-live) games and writes `data/steam_reviews.csv`.
2. `fetch_reviews_append.py` appends Steam reviews for the 2 EoS (end-of-service) games to the same CSV.
3. `load-reviews-to-supabase.mjs` reads `data/steam_reviews.csv` and loads it into the Supabase `reviews` table, matching each row to its `game_id` by name.

Run in order, from the repo root:

```sh
cd scripts
uv run fetch_reviews.py
uv run fetch_reviews_append.py
cd ..
npm run load
```

`data/steam_reviews.csv` and `logs/*.txt` are gitignored (the CSV is ~36MB and fully regeneratable from the commands above, so it isn't committed).

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
│   ├── fetch_reviews.py
│   ├── fetch_reviews_append.py
│   ├── load-reviews-to-supabase.mjs
│   ├── fetch-header-images.mjs
│   └── fetch-hero-images.mjs
├── supabase/
│   └── schema.sql
├── data/                   # gitignored CSV output
├── logs/                   # gitignored run logs
├── .env.example
└── README.md
```