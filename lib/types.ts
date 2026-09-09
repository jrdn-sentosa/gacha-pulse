export interface Game {
  id: string;
  name: string;
  steam_appid: string;
  is_eos: boolean;
  eos_announced_date: string | null;
  eos_shutdown_date: string | null;
  header_image: string | null;
  hero_image: string | null;
}

export interface RawReview {
  game_id: string;
  voted_up: boolean;
  created_at: string;
  playtime_forever: number | null;
}

export type Tier = "gold" | "purple" | "blue" | "gray";

/**
 * Where a review falls relative to its game's EoS timeline:
 * "live" (no announcement), "pre_announcement", "announced" (between
 * announcement and shutdown), or "post_shutdown" (after the game closed).
 */
export type ReviewPhase = "live" | "pre_announcement" | "announced" | "post_shutdown";

export interface WeeklyPoint {
  weekStart: Date;
  weekLabel: string;
  positive: number;
  total: number;
  pctPositive: number | null;
  avgPlaytimeHours: number | null;
  reviewPhase: ReviewPhase;
}

export interface GameSeries {
  game: Game;
  weekly: WeeklyPoint[];
  tier: Tier;
  currentSentiment: number | null;
  trend: "up" | "down" | "flat" | null;
}
