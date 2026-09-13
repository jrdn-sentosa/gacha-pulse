import { Crown, ShieldCheck, TriangleAlert, PowerOff, type LucideIcon } from "lucide-react";
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

/** Icon paired with each tier's status label/badge across the app. */
export const TIER_ICONS: Record<Tier, LucideIcon> = {
  gold: Crown,
  purple: ShieldCheck,
  blue: TriangleAlert,
  gray: PowerOff,
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

/** Badge classes for the sentiment classifier's predicted label, in "Try the Models". */
export const SENTIMENT_BADGE_CLASSES: Record<"positive" | "negative", string> = {
  positive: "bg-tier-gold/15 text-tier-gold",
  negative: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

/**
 * Badge classes + labels for the EoS-risk pipeline's interpretation band, in
 * "Try the Models" -- reuses the same gold/purple/blue "how healthy" scale as the status
 * bands above, plus destructive/red for "high" (there's no live-game tier that maps to
 * "this game is now over," so red is borrowed from the sentiment-negative case instead).
 */
export const RISK_BAND_LABELS: Record<string, string> = {
  low: "Low",
  moderate: "Moderate",
  elevated: "Elevated",
  high: "High",
};

export const RISK_BAND_BADGE_CLASSES: Record<string, string> = {
  low: "bg-tier-gold/15 text-tier-gold",
  moderate: "bg-tier-purple/15 text-tier-purple",
  elevated: "bg-tier-blue/15 text-tier-blue",
  high: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};
