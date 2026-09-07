import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

// Steam's appdetails API is unauthenticated but rate-limited; space out requests.
const REQUEST_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHeaderImage(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  const entry = json[String(appid)];
  if (!entry?.success || !entry.data?.header_image) {
    return null;
  }
  return entry.data.header_image;
}

async function main() {
  console.log('Fetching games...');
  const { data: games, error } = await supabase
    .from('games')
    .select('id, name, steam_appid');
  if (error) {
    console.error('Failed to fetch games table:', error.message);
    process.exit(1);
  }
  console.log(`  Loaded ${games.length} games.`);

  const stats = { resolved: 0, missing: 0, failed: 0 };

  for (const [i, game] of games.entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);

    try {
      const headerImage = await fetchHeaderImage(game.steam_appid);
      if (!headerImage) {
        console.log(`  [skip] ${game.name} (appid ${game.steam_appid}): no header_image in response`);
        stats.missing += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from('games')
        .update({ header_image: headerImage })
        .eq('id', game.id);
      if (updateError) {
        console.error(`  [fail] ${game.name}: ${updateError.message}`);
        stats.failed += 1;
        continue;
      }

      console.log(`  [ok]   ${game.name} (appid ${game.steam_appid}) -> ${headerImage}`);
      stats.resolved += 1;
    } catch (err) {
      console.error(`  [fail] ${game.name} (appid ${game.steam_appid}): ${err.message}`);
      stats.failed += 1;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Resolved: ${stats.resolved}`);
  console.log(`Missing:  ${stats.missing} (no header_image; dashboard falls back to a solid color card)`);
  console.log(`Failed:   ${stats.failed} (network/db errors; re-run to retry)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
