"use client";

import { GameCard } from "@/components/dashboard/game-card";
import type { GameSeries } from "@/lib/types";

interface GameCardRowProps {
  series: GameSeries[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function GameCardRow({ series, selectedId, onSelect }: GameCardRowProps) {
  const live = series
    .filter((s) => !s.game.is_eos)
    .sort((a, b) => (b.currentSentiment ?? -1) - (a.currentSentiment ?? -1));
  const eos = series
    .filter((s) => s.game.is_eos)
    .sort((a, b) => (b.game.eos_shutdown_date ?? "").localeCompare(a.game.eos_shutdown_date ?? ""));

  const ordered = [...live, ...eos];

  return (
    <div className="flex flex-wrap gap-2.5">
      {ordered.map((s) => (
        <GameCard
          key={s.game.id}
          series={s}
          selected={selectedId === s.game.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
