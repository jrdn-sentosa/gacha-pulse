export interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  hue: "warm" | "blue";
}

/** Deterministic PRNG (mulberry32) — same output on server and client, so the
 *  generated star field never causes a hydration mismatch. */
function mulberry32(seed: number) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Most stars are small and dim; a small fraction are larger, brighter "hero"
 * stars that anchor the eye. Each star gets its own twinkle timing (varied
 * duration + a negative delay so they start mid-cycle) so they pulse
 * independently instead of flickering in sync.
 */
export function generateStars(count: number, seed = 7): Star[] {
  const random = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const isHero = random() < 0.1;
    const size = isHero ? 3 + random() * 1.2 : 1 + random() * 1;
    const opacity = isHero ? 0.75 + random() * 0.25 : 0.25 + random() * 0.45;
    stars.push({
      x: random() * 100,
      y: random() * 100,
      size,
      opacity,
      duration: 3.5 + random() * 5,
      delay: -random() * 8,
      hue: random() < 0.75 ? "warm" : "blue",
    });
  }
  return stars;
}
