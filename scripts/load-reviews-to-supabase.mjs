import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', 'data', 'steam_reviews.csv');
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

async function insertBatch(batch, stats) {
  const { error } = await supabase.from('reviews').insert(batch);
  if (error) {
    console.error(`  Batch insert failed (${batch.length} rows): ${error.message}`);
    stats.failed += batch.length;
  } else {
    stats.inserted += batch.length;
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

  const stats = { total: rows.length, inserted: 0, skipped: 0, failed: 0 };
  const skippedGameNames = new Map();

  let batch = [];
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

    batch.push({
      game_id: gameId,
      review_text: row.review_text,
      voted_up: parseVotedUp(row.voted_up),
      created_at: toIsoTimestamp(row.timestamp_created),
      playtime_forever: Number(row.playtime_forever),
    });

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch, stats);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await insertBatch(batch, stats);
  }

  if (skippedGameNames.size > 0) {
    console.log('\nSkipped rows by unmatched game_name:');
    for (const [name, count] of skippedGameNames) {
      console.log(`  "${name}": ${count} row(s)`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total rows read: ${stats.total}`);
  console.log(`Rows inserted:   ${stats.inserted}`);
  console.log(`Rows skipped:    ${stats.skipped} (unmatched game_name)`);
  if (stats.failed > 0) {
    console.log(`Rows failed:     ${stats.failed} (insert errors)`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
