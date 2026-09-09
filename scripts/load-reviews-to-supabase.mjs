import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', 'data', 'steam_reviews.csv');
const SUMMARY_PATH = path.join(__dirname, '..', 'data', 'load_summary.json');
const BATCH_SIZE = 500;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const gameNameFilter = process.argv.slice(2).length
  ? new Set(process.argv.slice(2))
  : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

function parseVotedUp(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function toIsoTimestamp(unixSeconds) {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

/** Stable per-row fingerprint — lets `on conflict (dedup_hash) do nothing` skip rows
 * already loaded on a previous run, so re-running the pipeline is always safe. */
function computeDedupHash(gameId, createdAtIso, reviewText) {
  return crypto
    .createHash('md5')
    .update(`${gameId}${createdAtIso}${reviewText ?? ''}`)
    .digest('hex');
}

function perGameStats(stats, gameName) {
  let entry = stats.perGame.get(gameName);
  if (!entry) {
    entry = { read: 0, inserted: 0, duplicate: 0, failed: 0 };
    stats.perGame.set(gameName, entry);
  }
  return entry;
}

async function upsertBatch(batch, stats, gameNamesByRow) {
  const { data, error } = await supabase
    .from('reviews')
    .upsert(batch, { onConflict: 'dedup_hash', ignoreDuplicates: true })
    .select('dedup_hash');

  if (error) {
    console.error(`  Batch upsert failed (${batch.length} rows): ${error.message}`);
    stats.failed += batch.length;
    for (const row of batch) {
      perGameStats(stats, gameNamesByRow.get(row.dedup_hash)).failed += 1;
    }
    return;
  }

  const insertedHashes = new Set((data ?? []).map((r) => r.dedup_hash));
  stats.inserted += insertedHashes.size;
  stats.duplicate += batch.length - insertedHashes.size;

  for (const row of batch) {
    const entry = perGameStats(stats, gameNamesByRow.get(row.dedup_hash));
    if (insertedHashes.has(row.dedup_hash)) entry.inserted += 1;
    else entry.duplicate += 1;
  }
}

async function main() {
  console.log('Fetching games lookup table...');
  const { data: games, error: gamesError } = await supabase.from('games').select('id, name');
  if (gamesError) {
    console.error('Failed to fetch games table:', gamesError.message);
    process.exit(1);
  }
  const gameIdByName = new Map(games.map((g) => [g.name, g.id]));
  console.log(`  Loaded ${gameIdByName.size} games.`);

  console.log(`Reading CSV from ${CSV_PATH}...`);
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const { data: rows, errors: parseErrors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parseErrors.length > 0) {
    console.warn(`  CSV parser reported ${parseErrors.length} issue(s), continuing with parsed rows.`);
  }

  const stats = {
    total: rows.length,
    inserted: 0,
    duplicate: 0,
    skipped: 0,
    failed: 0,
    perGame: new Map(),
  };
  const skippedGameNames = new Map();

  let batch = [];
  let gameNamesByRow = new Map();
  for (const row of rows) {
    if (gameNameFilter && !gameNameFilter.has(row.game_name)) {
      continue;
    }

    const gameId = gameIdByName.get(row.game_name);
    if (gameId === undefined) {
      stats.skipped += 1;
      skippedGameNames.set(row.game_name, (skippedGameNames.get(row.game_name) ?? 0) + 1);
      continue;
    }

    perGameStats(stats, row.game_name).read += 1;

    const createdAt = toIsoTimestamp(row.timestamp_created);
    const reviewText = row.review_text ?? '';
    const dedupHash = computeDedupHash(gameId, createdAt, reviewText);

    gameNamesByRow.set(dedupHash, row.game_name);
    batch.push({
      game_id: gameId,
      review_text: reviewText,
      voted_up: parseVotedUp(row.voted_up),
      created_at: createdAt,
      playtime_forever: Number(row.playtime_forever),
      steam_review_id: row.recommendationid || null,
      dedup_hash: dedupHash,
    });

    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batch, stats, gameNamesByRow);
      batch = [];
      gameNamesByRow = new Map();
    }
  }
  if (batch.length > 0) {
    await upsertBatch(batch, stats, gameNamesByRow);
  }

  if (skippedGameNames.size > 0) {
    console.log('\nSkipped rows by unmatched game_name:');
    for (const [name, count] of skippedGameNames) {
      console.log(`  "${name}": ${count} row(s)`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total rows read: ${stats.total}`);
  console.log(`Rows inserted:   ${stats.inserted} (new)`);
  console.log(`Rows duplicate:  ${stats.duplicate} (already stored, skipped by dedup_hash)`);
  console.log(`Rows skipped:    ${stats.skipped} (unmatched game_name)`);
  if (stats.failed > 0) {
    console.log(`Rows failed:     ${stats.failed} (upsert errors)`);
  }

  console.log('\n--- Per-game ---');
  const perGame = [];
  for (const [name, entry] of stats.perGame) {
    console.log(`  ${name}: ${entry.inserted} inserted, ${entry.duplicate} duplicate${entry.failed ? `, ${entry.failed} failed` : ''}`);
    perGame.push({ game: name, ...entry });
  }

  fs.writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        total: stats.total,
        inserted: stats.inserted,
        duplicate: stats.duplicate,
        skipped: stats.skipped,
        failed: stats.failed,
        perGame,
      },
      null,
      2
    )
  );
  console.log(`\nSaved load summary to ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
