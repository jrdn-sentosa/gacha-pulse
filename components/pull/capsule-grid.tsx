"use client";

import { CapsuleCard } from "@/components/pull/capsule-card";
import type { PullCardData } from "@/lib/pull";

interface CapsuleGridProps {
  games: PullCardData[];
}

/** Static roster summary — every card is already revealed by the time this renders. */
export function CapsuleGrid({ games }: CapsuleGridProps) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
      {games.map((game) => (
        <CapsuleCard key={game.id} game={game} revealed instant />
      ))}
    </div>
  );
}
