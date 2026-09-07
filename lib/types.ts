export interface Game {
  id: string;
  name: string;
  steam_appid: string;
  is_eos: boolean;
  eos_announced_date: string | null;
  eos_shutdown_date: string | null;
  header_image: string | null;
}

export interface RawReview {
  game_id: string;
  voted_up: boolean;
  created_at: string;
  playtime_forever: number | null;
}

export type Tier = "gold" | "purple" | "blue" | "gray";

export interface WeeklyPoint {
  weekStart: Date;
  weekLabel: string;
  positive: number;
  total: number;
  pctPositive: number | null;
  avgPlaytimeHours: number | null;
}

export interface GameSeries {
  game: Game;
  weekly: WeeklyPoint[];
  tier: Tier;
  currentSentiment: number | null;
  trend: "up" | "down" | "flat" | null;
}
