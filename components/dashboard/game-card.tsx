"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_COLORS } from "@/lib/theme";
import type { GameSeries } from "@/lib/types";

interface GameCardProps {
  series: GameSeries;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function GameCard({ series, selected, onSelect }: GameCardProps) {
  const { game, tier, currentSentiment, trend } = series;
  const color = TIER_COLORS[tier];

  return (
    <button
      type="button"
      onClick={() => onSelect(game.id)}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-full border bg-card px-4 py-2 text-left transition-all hover:-translate-y-0.5 hover:bg-accent/50",
        selected && "bg-accent/60"
      )}
      style={{
        borderColor: selected ? color : `${color}40`,
        boxShadow: selected ? `0 0 0 1px ${color}, 0 8px 24px -12px ${color}` : undefined,
      }}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}99` }}
      />
      <span className="flex flex-col leading-tight">
        <span className="max-w-[9rem] truncate text-sm font-medium text-foreground">
          {game.name}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {currentSentiment !== null ? (
            <span className="font-mono tabular-nums">{currentSentiment.toFixed(0)}% positive</span>
          ) : (
            <span>No review data</span>
          )}
          <TrendIcon trend={trend} />
        </span>
      </span>
    </button>
  );
}

function TrendIcon({ trend }: { trend: GameSeries["trend"] }) {
  if (trend === "up") return <ArrowUp className="h-3 w-3 text-emerald-400" />;
  if (trend === "down") return <ArrowDown className="h-3 w-3 text-rose-400" />;
  if (trend === "flat") return <Minus className="h-3 w-3 text-muted-foreground" />;
  return null;
}
