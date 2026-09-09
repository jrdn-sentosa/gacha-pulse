-- ============================================
-- Gacha Pulse — Supabase schema
-- ============================================

-- Games table: one row per game, includes EoS metadata
create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  steam_appid text not null,
  is_eos boolean default false,
  eos_announced_date date,
  eos_shutdown_date date,
  header_image text,
  hero_image text,
  created_at timestamptz default now()
);

-- Reviews table: one row per Steam review
create table reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  review_text text,
  voted_up boolean,
  created_at timestamptz,
  playtime_forever integer,
  steam_review_id text,
  dedup_hash text unique
);

-- Index to speed up the queries that the dashboard will run constantly:
create index idx_reviews_game_id_created_at on reviews (game_id, created_at);

-- Row Level Security: required so the public anon key can read data.
alter table games enable row level security;
alter table reviews enable row level security;

create policy "Allow public read access" on games
  for select using (true);

create policy "Allow public read access" on reviews
  for select using (true);

-- Seed all 10 games
insert into games (name, steam_appid, is_eos, eos_announced_date, eos_shutdown_date) values
('Wuthering Waves', '3513350', false, null, null),
('Zenless Zone Zero', '4162040', false, null, null),
('Honkai Impact 3rd', '1671200', false, null, null),
('Tower of Fantasy', '2064650', false, null, null),
('Reverse: 1999', '3092660', false, null, null),
('TRIBE NINE', '2376580', true, '2025-05-15', '2025-11-27'),
('FINAL FANTASY VII EVER CRISIS', '2484110', true, '2026-07-07', '2026-10-06'),
('Gran Saga', '3016760', true, '2025-03-05', '2025-04-30'),
('Battle Star', '1436650', true, '2024-05-08', '2024-06-28'),
('Atelier Resleriana: Forgotten Alchemy and the Polar Night Liberator', '2594920', true, '2025-01-27', '2025-03-28');
