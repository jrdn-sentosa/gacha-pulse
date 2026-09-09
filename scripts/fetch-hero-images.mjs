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

// Steam's static CDN is unauthenticated but best treated gently; space out requests.
const REQUEST_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// library_hero.jpg is a wide (~3840x1240) Steam library banner — not exposed by
// the appdetails API, so we probe the CDN directly and only keep it on a 200.
function heroImageUrl(appid) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_hero.jpg`;
}

async function checkHeroImage(appid) {
  const url = heroImageUrl(appid);
  const res = await fetch(url, { method: 'HEAD' });
  if (res.status === 200) return url;
  if (res.status === 404) return null;
  throw new Error(`HTTP ${res.status}`);
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
      const heroImage = await checkHeroImage(game.steam_appid);
      if (!heroImage) {
        console.log(`  [skip] ${game.name} (appid ${game.steam_appid}): no library_hero.jpg on CDN`);
        stats.missing += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from('games')
        .update({ hero_image: heroImage })
        .eq('id', game.id);
      if (updateError) {
        console.error(`  [fail] ${game.name}: ${updateError.message}`);
        stats.failed += 1;
        continue;
      }

      console.log(`  [ok]   ${game.name} (appid ${game.steam_appid}) -> ${heroImage}`);
      stats.resolved += 1;
    } catch (err) {
      console.error(`  [fail] ${game.name} (appid ${game.steam_appid}): ${err.message}`);
      stats.failed += 1;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Resolved: ${stats.resolved}`);
  console.log(`Missing:  ${stats.missing} (no hero_image; UI falls back to header_image)`);
  console.log(`Failed:   ${stats.failed} (network/db errors; re-run to retry)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
