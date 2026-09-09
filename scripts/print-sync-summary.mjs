import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf-8'));
  } catch {
    return null;
  }
}

const fetchSummary = readJson('fetch_summary.json') ?? [];
const loadSummary = readJson('load_summary.json');

const loadByGame = new Map((loadSummary?.perGame ?? []).map((g) => [g.game, g]));

const lines = [];
lines.push('## Daily review sync');
lines.push('');
lines.push('| Game | New on Steam | Inserted | Already stored |');
lines.push('|---|---|---|---|');

for (const { game, new_reviews } of fetchSummary) {
  const load = loadByGame.get(game);
  // A game with 0 new reviews has no per-game load entry (nothing to load) — that's a
  // real 0, not missing data. Only fall back to "—" if the load step didn't run at all.
  const inserted = loadSummary ? load?.inserted ?? 0 : '—';
  const duplicate = loadSummary ? load?.duplicate ?? 0 : '—';
  lines.push(`| ${game} | ${new_reviews} | ${inserted} | ${duplicate} |`);
}

const totalNew = fetchSummary.reduce((sum, g) => sum + g.new_reviews, 0);
lines.push('');
lines.push(
  `**Totals:** ${totalNew} new review(s) found on Steam` +
    (loadSummary ? `, ${loadSummary.inserted} inserted into Supabase, ${loadSummary.duplicate} already stored.` : '.')
);

if (loadSummary?.failed) {
  lines.push('');
  lines.push(`:warning: ${loadSummary.failed} row(s) failed to load — check the job log above.`);
}

console.log(lines.join('\n'));
