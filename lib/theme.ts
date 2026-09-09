import type { Tier } from "./types";

export const TIER_COLORS: Record<Tier, string> = {
  gold: "#F2B705",
  purple: "#A855F7",
  blue: "#38BDF8",
  gray: "#6B7280",
};

export const TIER_LABELS: Record<Tier, string> = {
  gold: "Healthy",
  purple: "Stable",
  blue: "At risk",
  gray: "Ended",
};

/**
 * Rarity-tier accent used as a consistent health/risk signal across the dashboard.
 * EoS games always read as "gray" regardless of their historical sentiment —
 * the tier communicates current status, not lifetime quality.
 */
export function tierFor(isEos: boolean, currentSentiment: number | null): Tier {
  if (isEos) return "gray";
  if (currentSentiment === null) return "purple";
  if (currentSentiment >= 85) return "gold";
  if (currentSentiment >= 70) return "purple";
  return "blue";
}
