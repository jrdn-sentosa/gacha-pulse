# Gacha Pulse

A dashboard tracking sentiment and review trends across gacha games over time, including comparisons against titles that have already reached end-of-service (EoS), to explore whether declining sentiment is a leading indicator of shutdown.

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
- **shadcn/ui** — component library
- **Supabase** (Postgres) — data storage
- **Python** (`uv`) — data collection scripts
- **Node.js** — Supabase loader script

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql) — this creates the `games` and `reviews` tables, sets up read-only RLS policies, and seeds the original 7 games.
3. Then run [`supabase/add_games.sql`](./supabase/add_games.sql) — adds 3 more EoS games (Gran Saga, Battle Star, Atelier Resleriana) found after the initial pass, bringing the set to 5 live / 5 EoS.
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
3. `load-reviews-to-supabase.js` reads `data/steam_reviews.csv` and loads it into the Supabase `reviews` table, matching each row to its `game_id` by name.

Run in order, from the repo root:

```sh
cd scripts
uv run fetch_reviews.py
uv run fetch_reviews_append.py
cd ..
npm run load
```

`data/steam_reviews.csv` and `logs/*.txt` are gitignored (the CSV is ~36MB and fully regeneratable from the commands above, so it isn't committed).

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

Visit `http://localhost:3000`.

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
├── app/                    # Next.js dashboard (pages, layout)
├── components/             # shadcn UI components + charts
├── lib/                    # Supabase client, data-fetching helpers
├── scripts/                # data collection & loading
│   ├── fetch_reviews.py
│   ├── fetch_reviews_append.py
│   └── load-reviews-to-supabase.js
├── supabase/
│   └── schema.sql
├── data/                   # gitignored CSV output
├── logs/                   # gitignored run logs
├── .env.example
└── README.md
```