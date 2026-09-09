import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const PAGE_SIZE = 1000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

/** Same formula as load-reviews-to-supabase.mjs — kept in sync manually since this
 * script only runs once per historical backlog, not on every pipeline run. */
function computeDedupHash(gameId, createdAtIso, reviewText) {
  return crypto
    .createHash('md5')
    .update(`${gameId}${createdAtIso}${reviewText ?? ''}`)
    .digest('hex');
}

/** Postgres/PostgREST serializes timestamptz without the loader's own millisecond+"Z"
 * formatting (e.g. "2025-10-10T06:55:36+00:00" instead of "...T06:55:36.000Z"). Routing
 * it back through `Date` normalizes it to exactly what the loader computed at insert
 * time, so a backfilled row's hash matches what a future re-fetch of the same review
 * would compute — verified against a live round-trip before running this for real.
 */
function normalizeIso(createdAt) {
  return new Date(createdAt).toISOString();
}

async function main() {
  console.log('Backfilling reviews.dedup_hash for all existing rows...');
  console.log('(one-time migration — existing dedup_hash values predate the content-based formula)\n');

  let from = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from('reviews')
      .select('id, game_id, created_at, review_text')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to read a page of reviews:', error.message);
      process.exit(1);
    }
    if (rows.length === 0) break;

    const updates = rows.map((row) => ({
      id: row.id,
      dedup_hash: computeDedupHash(row.game_id, normalizeIso(row.created_at), row.review_text ?? ''),
    }));

    const { data: updated, error: updateError } = await supabase
      .from('reviews')
      .upsert(updates, { onConflict: 'id' })
      .select('id');

    if (updateError) {
      console.error(`  Batch update failed (rows ${from}-${from + rows.length - 1}): ${updateError.message}`);
      totalFailed += rows.length;
    } else {
      totalUpdated += updated.length;
    }

    totalProcessed += rows.length;
    console.log(`  Processed ${totalProcessed} rows so far (this page: ${rows.length})...`);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log('\n--- Summary ---');
  console.log(`Rows processed: ${totalProcessed}`);
  console.log(`Rows updated:   ${totalUpdated}`);
  if (totalFailed > 0) {
    console.log(`Rows failed:    ${totalFailed}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
