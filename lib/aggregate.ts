import { differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { tierFor } from "./theme";
import type { Game, GameSeries, RawReview, WeeklyPoint } from "./types";

/** Weeks below this many reviews are too noisy to trust a % positive figure for — shown as a gap instead. */
const MIN_WEEKLY_SAMPLE = 5;

/** Monday-aligned week bucket key, e.g. "2026-06-15". */
function weekKey(dateIso: string): string {
  const weekStart = startOfWeek(parseISO(dateIso), { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

/**
 * Buckets raw review rows into weekly sentiment/volume/playtime points, per game.
 * All aggregation happens client-side over rows already fetched from Supabase.
 */
export function buildGameSeries(games: Game[], reviews: RawReview[]): GameSeries[] {
  const byGame = new Map<string, RawReview[]>();
  for (const r of reviews) {
    const list = byGame.get(r.game_id);
    if (list) list.push(r);
    else byGame.set(r.game_id, [r]);
  }

  return games.map((game) => {
    const gameReviews = byGame.get(game.id) ?? [];

    const buckets = new Map<
      string,
      { positive: number; total: number; playtimeSum: number; playtimeCount: number }
    >();

    for (const r of gameReviews) {
      const key = weekKey(r.created_at);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { positive: 0, total: 0, playtimeSum: 0, playtimeCount: 0 };
        buckets.set(key, bucket);
      }
      bucket.total += 1;
      if (r.voted_up) bucket.positive += 1;
      if (typeof r.playtime_forever === "number") {
        bucket.playtimeSum += r.playtime_forever;
        bucket.playtimeCount += 1;
      }
    }

    const weekly: WeeklyPoint[] = Array.from(buckets.entries())
      .map(([key, b]) => ({
        weekStart: parseISO(key),
        weekLabel: format(parseISO(key), "MMM d, yyyy"),
        positive: b.positive,
        total: b.total,
        pctPositive: b.total >= MIN_WEEKLY_SAMPLE ? (b.positive / b.total) * 100 : null,
        avgPlaytimeHours: b.playtimeCount > 0 ? b.playtimeSum / b.playtimeCount / 60 : null,
      }))
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    const currentSentiment = trailingSentiment(weekly, 4);
    const priorSentiment = trailingSentiment(weekly.slice(0, -4), 4);
    const trend = trendFrom(currentSentiment, priorSentiment);
    const tier = tierFor(game.is_eos, currentSentiment);

    return { game, weekly, tier, currentSentiment, trend };
  });
}

/** Weighted % positive over the trailing N weeks of data (not a simple average of weekly %s). */
function trailingSentiment(weekly: WeeklyPoint[], windowSize: number): number | null {
  const window = weekly.slice(-windowSize);
  const positive = window.reduce((sum, w) => sum + w.positive, 0);
  const total = window.reduce((sum, w) => sum + w.total, 0);
  return total > 0 ? (positive / total) * 100 : null;
}

function trendFrom(current: number | null, prior: number | null): GameSeries["trend"] {
  if (current === null || prior === null) return null;
  const delta = current - prior;
  if (delta > 2) return "up";
  if (delta < -2) return "down";
  return "flat";
}

interface MergedWeekRow {
  weekStart: Date;
  weekLabel: string;
  [gameId: string]: number | Date | string | null;
}

/** Unions every game's weekly buckets onto shared rows keyed by calendar week, for multi-line charts. */
export function mergeWeeklySeries(
  series: GameSeries[],
  metric: (point: WeeklyPoint) => number | null
): MergedWeekRow[] {
  const map = new Map<string, MergedWeekRow>();
  for (const s of series) {
    for (const w of s.weekly) {
      const key = format(w.weekStart, "yyyy-MM-dd");
      let row = map.get(key);
      if (!row) {
        row = { weekStart: w.weekStart, weekLabel: w.weekLabel };
        map.set(key, row);
      }
      row[s.game.id] = metric(w);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
}

/** The date each game's trajectory should be aligned against: announcement date for EoS games, "now" for live ones. */
export function referenceDateForGame(game: Game, fallbackNow: Date): Date {
  if (game.is_eos && game.eos_announced_date) return parseISO(game.eos_announced_date);
  return fallbackNow;
}

interface AlignedRow {
  weeksOffset: number;
  [gameId: string]: number | null;
}

/** Merges every game's sentiment trend onto a shared "weeks relative to EoS announcement" axis. */
export function mergeAlignedSeries(series: GameSeries[], fallbackNow: Date): AlignedRow[] {
  const map = new Map<number, AlignedRow>();
  for (const s of series) {
    const reference = referenceDateForGame(s.game, fallbackNow);
    const aligned = alignByReferenceDate(s.weekly, reference);
    for (const p of aligned) {
      let row = map.get(p.weeksOffset);
      if (!row) {
        row = { weeksOffset: p.weeksOffset };
        map.set(p.weeksOffset, row);
      }
      row[s.game.id] = p.pctPositive;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.weeksOffset - b.weeksOffset);
}

export interface AlignedPoint {
  daysOffset: number;
  weeksOffset: number;
  pctPositive: number | null;
  total: number;
}

/**
 * Realigns a game's weekly series onto a "days relative to EoS announcement" axis
 * instead of calendar time, so trajectories from different eras are comparable.
 * Live games have no announcement yet, so they're anchored to `today` instead —
 * effectively "where would this game sit if it announced EoS right now."
 */
export function alignByReferenceDate(weekly: WeeklyPoint[], referenceDate: Date): AlignedPoint[] {
  return weekly.map((w) => {
    // Negative = before the reference date (announcement, or "today" for live games), 0 = at it, positive = after.
    const daysOffset = differenceInCalendarDays(w.weekStart, referenceDate);
    return {
      daysOffset,
      weeksOffset: Math.round(daysOffset / 7),
      pctPositive: w.pctPositive,
      total: w.total,
    };
  });
}
