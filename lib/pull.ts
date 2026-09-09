import type { GameSeries, Tier } from "./types";

export interface PullCardData {
  id: string;
  name: string;
  steamAppid: string;
  /** Wide (~3840x1240) Steam "library hero" art, preferred for pull/banner cards. */
  heroImage: string | null;
  /** Wide (460x215) Steam header art — fallback for the handful of games with no hero asset. */
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
    heroImage: series.game.hero_image,
    headerImage: series.game.header_image,
    is_eos: series.game.is_eos,
    tier: series.tier,
    currentSentiment: series.currentSentiment,
    reviewCount: series.weekly.reduce((sum, w) => sum + w.total, 0),
    eosShutdownDate: series.game.eos_shutdown_date,
  };
}

/** The image to actually render on a card — hero art first, header art as fallback. */
export function cardImage(card: Pick<PullCardData, "heroImage" | "headerImage">): string | null {
  return card.heroImage ?? card.headerImage;
}

/**
 * `library_hero.jpg` is a wide (~3840x1240) banner cropped with object-cover into
 * portrait/landscape card shapes — a plain center crop clips the character on a
 * handful of games whose art isn't centered. Overrides here nudge the crop by
 * Steam appid; anything absent falls back to a plain center crop.
 */
const HERO_CROP_OVERRIDES: Record<string, string> = {
  "2376580": "70% center", // TRIBE NINE — character sits in the right third of the hero art
};

export function heroObjectPosition(card: Pick<PullCardData, "steamAppid">): string {
  return HERO_CROP_OVERRIDES[card.steamAppid] ?? "center";
}

export interface BannerSelection {
  featured: PullCardData | null;
  supporting: PullCardData[];
}

/**
 * Picks the banner lineup: the healthiest live game as the featured pull,
 * plus one representative from each remaining tier (purple, blue, gray/EoS)
 * so the banner always shows the live/EoS contrast at a glance.
 */
export function pickBannerSelection(cards: PullCardData[]): BannerSelection {
  const bestOf = (tier: PullCardData["tier"]) =>
    cards
      .filter((c) => c.tier === tier)
      .sort((a, b) => (b.currentSentiment ?? -1) - (a.currentSentiment ?? -1))[0] ?? null;

  const featured = bestOf("gold") ?? bestOf("purple") ?? bestOf("blue") ?? cards[0] ?? null;
  const supporting = (["purple", "blue", "gray"] as const)
    .map((tier) => {
      const candidates = cards.filter((c) => c.tier === tier && c.id !== featured?.id);
      return candidates.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0] ?? null;
    })
    .filter((c): c is PullCardData => c !== null);

  return { featured, supporting };
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
