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
 * Muted, mutually-distinguishable tones for EoS games on the trajectory comparison
 * chart — cycled by index so each shut-down game reads as its own line instead of
 * all collapsing into one gray. Paired 1:1 with EOS_DASH_PATTERNS for a redundant
 * (color + dash) encoding that still works for colorblind viewers.
 */
export const EOS_PALETTE = ["#B45309", "#9F1239", "#65735B", "#78716C", "#92400E", "#57534E"];

/** Dash patterns paired by index with EOS_PALETTE — see its comment. */
export const EOS_DASH_PATTERNS = ["6 3", "2 2", "9 3 2 3", "1 3", "8 2", "4 2 1 2"];

export function eosStyleForIndex(index: number): { color: string; dash: string } {
  return {
    color: EOS_PALETTE[index % EOS_PALETTE.length],
    dash: EOS_DASH_PATTERNS[index % EOS_DASH_PATTERNS.length],
  };
}

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
