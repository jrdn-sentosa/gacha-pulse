import type { GameSeries, Tier } from "./types";

export interface PullCardData {
  id: string;
  name: string;
  steamAppid: string;
  headerImage: string | null;
  is_eos: boolean;
  tier: Tier;
  currentSentiment: number | null;
  reviewCount: number;
  eosShutdownDate: string | null;
}

export function toPullCardData(series: GameSeries): PullCardData {
  return {
    id: series.game.id,
    name: series.game.name,
    steamAppid: series.game.steam_appid,
    headerImage: series.game.header_image,
    is_eos: series.game.is_eos,
    tier: series.tier,
    currentSentiment: series.currentSentiment,
    reviewCount: series.weekly.reduce((sum, w) => sum + w.total, 0),
    eosShutdownDate: series.game.eos_shutdown_date,
  };
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
