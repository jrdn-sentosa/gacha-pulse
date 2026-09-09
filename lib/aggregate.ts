import { differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { tierFor } from "./theme";
import type { Game, GameSeries, RawReview, ReviewPhase, WeeklyPoint } from "./types";

/** Weeks below this many reviews are too noisy to trust a % positive figure for — shown as a gap instead. */
const MIN_WEEKLY_SAMPLE = 5;

/** Monday-aligned week bucket key, e.g. "2026-06-15". */
function weekKey(dateIso: string): string {
  const weekStart = startOfWeek(parseISO(dateIso), { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

/**
 * Classifies a date against a game's EoS timeline:
 *   no announcement       -> "live"
 *   before announcement   -> "pre_announcement"
 *   announcement..shutdown -> "announced"
 *   after shutdown        -> "post_shutdown"
 * Applied per weekly bucket (weekStart) rather than per review — buckets are
 * narrow enough that this matches a per-review classification in practice.
 */
function reviewPhaseFor(date: Date, game: Pick<Game, "eos_announced_date" | "eos_shutdown_date">): ReviewPhase {
  if (!game.eos_announced_date) return "live";
  const announced = parseISO(game.eos_announced_date);
  if (date < announced) return "pre_announcement";
  if (game.eos_shutdown_date && date > parseISO(game.eos_shutdown_date)) return "post_shutdown";
  return "announced";
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
      .map(([key, b]) => {
        const weekStart = parseISO(key);
        return {
          weekStart,
          weekLabel: format(weekStart, "MMM d, yyyy"),
          positive: b.positive,
          total: b.total,
          pctPositive: b.total >= MIN_WEEKLY_SAMPLE ? (b.positive / b.total) * 100 : null,
          avgPlaytimeHours: b.playtimeCount > 0 ? b.playtimeSum / b.playtimeCount / 60 : null,
          reviewPhase: reviewPhaseFor(weekStart, game),
        };
      })
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

/** The dataKey a game's post-shutdown ("aftermath") line segment is stored under in a MergedWeekRow. */
export function aftermathKey(gameId: string): string {
  return `${gameId}__after`;
}

/**
 * Splits one game's already-computed values into a "main" series (nulled out from the
 * first post_shutdown week on) and an "after" series (nulled out everywhere else) — the
 * last pre-shutdown point is duplicated into "after" so the two segments visually
 * connect with no gap where a chart renders them as solid vs. dashed lines.
 */
function splitByAftermath(
  weekly: WeeklyPoint[],
  values: (number | null)[]
): { main: (number | null)[]; after: (number | null)[] } {
  const firstAfterIndex = weekly.findIndex((w) => w.reviewPhase === "post_shutdown");
  const bridgeIndex = firstAfterIndex > 0 ? firstAfterIndex - 1 : -1;
  const main: (number | null)[] = [];
  const after: (number | null)[] = [];
  weekly.forEach((w, i) => {
    const isAfter = w.reviewPhase === "post_shutdown";
    main.push(isAfter ? null : values[i]);
    after.push(isAfter || i === bridgeIndex ? values[i] : null);
  });
  return { main, after };
}

/**
 * Unions every game's weekly buckets onto shared rows keyed by calendar week, for multi-line
 * charts. Each game gets two dataKeys — its id (pre/at-shutdown) and aftermathKey(id)
 * (post_shutdown) — so a chart can render the aftermath as a visually distinct segment.
 */
export function mergeWeeklySeries(
  series: GameSeries[],
  metric: (point: WeeklyPoint) => number | null
): MergedWeekRow[] {
  const map = new Map<string, MergedWeekRow>();
  for (const s of series) {
    const { main, after } = splitByAftermath(s.weekly, s.weekly.map(metric));
    s.weekly.forEach((w, i) => {
      const key = format(w.weekStart, "yyyy-MM-dd");
      let row = map.get(key);
      if (!row) {
        row = { weekStart: w.weekStart, weekLabel: w.weekLabel };
        map.set(key, row);
      }
      row[s.game.id] = main[i];
      row[aftermathKey(s.game.id)] = after[i];
    });
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
}

/** Trailing N-point mean at each index, averaging over whatever non-null points fall in the window. */
function trailingAverage(values: (number | null)[], windowSize: number): (number | null)[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - windowSize + 1), i + 1).filter((v): v is number => v !== null);
    return window.length > 0 ? window.reduce((sum, v) => sum + v, 0) / window.length : null;
  });
}

/**
 * Same shape as mergeWeeklySeries, but each game's own values are first smoothed
 * with a trailing rolling average — cuts week-to-week noise on the line chart
 * without needing to touch the underlying weekly buckets. Still splits into
 * main/aftermath dataKeys the same way.
 */
export function mergeWeeklySeriesSmoothed(
  series: GameSeries[],
  metric: (point: WeeklyPoint) => number | null,
  windowSize: number
): MergedWeekRow[] {
  const map = new Map<string, MergedWeekRow>();
  for (const s of series) {
    const smoothed = trailingAverage(s.weekly.map(metric), windowSize);
    const { main, after } = splitByAftermath(s.weekly, smoothed);
    s.weekly.forEach((w, i) => {
      const key = format(w.weekStart, "yyyy-MM-dd");
      let row = map.get(key);
      if (!row) {
        row = { weekStart: w.weekStart, weekLabel: w.weekLabel };
        map.set(key, row);
      }
      row[s.game.id] = main[i];
      row[aftermathKey(s.game.id)] = after[i];
    });
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
}

/**
 * Picks one representative game id per tier (gold/purple/blue/gray) — used to seed
 * a chart's default legend selection so it opens readable instead of all 10 at once.
 * Skips any tier with no games. Highest current sentiment wins within live tiers;
 * the most recently shut-down game wins for gray/EoS.
 */
export function pickOneGamePerTier(series: GameSeries[]): Set<string> {
  const ids = new Set<string>();
  for (const tier of ["gold", "purple", "blue"] as const) {
    const best = series
      .filter((s) => s.tier === tier)
      .sort((a, b) => (b.currentSentiment ?? -1) - (a.currentSentiment ?? -1))[0];
    if (best) ids.add(best.game.id);
  }
  const mostRecentEos = series
    .filter((s) => s.tier === "gray")
    .sort((a, b) => (b.game.eos_shutdown_date ?? "").localeCompare(a.game.eos_shutdown_date ?? ""))[0];
  if (mostRecentEos) ids.add(mostRecentEos.game.id);
  return ids;
}

/**
 * Picks a small, readable default selection for the trajectory comparison chart: the
 * healthiest live game plus the two most recently announced EoS games — 2-3 games total
 * instead of all 10, with the rest toggleable via the legend.
 */
export function pickDefaultComparisonSelection(series: GameSeries[]): Set<string> {
  const ids = new Set<string>();
  const bestLive = series
    .filter((s) => !s.game.is_eos)
    .sort((a, b) => (b.currentSentiment ?? -1) - (a.currentSentiment ?? -1))[0];
  if (bestLive) ids.add(bestLive.game.id);

  const recentEos = series
    .filter((s) => s.game.is_eos)
    .sort((a, b) => (b.game.eos_announced_date ?? "").localeCompare(a.game.eos_announced_date ?? ""))
    .slice(0, 2);
  recentEos.forEach((s) => ids.add(s.game.id));

  return ids;
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

export interface MergeAlignedSeriesOptions {
  /** Window size (in weeks) for a trailing rolling average — omit for raw weekly values. */
  smoothingWindow?: number;
  /** Earliest weeksOffset to include (default -52, i.e. one year before alignment). */
  minWeeksOffset?: number;
  /** Latest weeksOffset to include (default 4). */
  maxWeeksOffset?: number;
}

/**
 * Merges every game's sentiment trend onto a shared "weeks relative to EoS announcement" axis —
 * excludes post_shutdown weeks so the trajectory only shows the run-up to shutdown, not
 * reactions to the closure itself. Bounded to [minWeeksOffset, maxWeeksOffset] so a long-lived
 * game's early history doesn't dwarf shorter-lived games on the shared axis; a game with less
 * history than the window just shows what it has, unpadded.
 */
export function mergeAlignedSeries(
  series: GameSeries[],
  fallbackNow: Date,
  { smoothingWindow, minWeeksOffset = -52, maxWeeksOffset = 4 }: MergeAlignedSeriesOptions = {}
): AlignedRow[] {
  const map = new Map<number, AlignedRow>();
  for (const s of series) {
    const reference = referenceDateForGame(s.game, fallbackNow);
    const beforeShutdown = s.weekly.filter((w) => w.reviewPhase !== "post_shutdown");
    const values = smoothingWindow
      ? trailingAverage(
          beforeShutdown.map((w) => w.pctPositive),
          smoothingWindow
        )
      : beforeShutdown.map((w) => w.pctPositive);
    const aligned = alignByReferenceDate(beforeShutdown, reference);
    aligned.forEach((p, i) => {
      if (p.weeksOffset < minWeeksOffset || p.weeksOffset > maxWeeksOffset) return;
      let row = map.get(p.weeksOffset);
      if (!row) {
        row = { weeksOffset: p.weeksOffset };
        map.set(p.weeksOffset, row);
      }
      row[s.game.id] = values[i];
    });
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
