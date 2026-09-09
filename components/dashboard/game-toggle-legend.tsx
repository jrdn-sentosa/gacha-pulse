"use client";

import { cn } from "@/lib/utils";
import { TIER_COLORS } from "@/lib/theme";
import type { GameSeries } from "@/lib/types";

interface GameToggleLegendProps {
  series: GameSeries[];
  visible: Set<string>;
  onToggle: (id: string) => void;
}

export function GameToggleLegend({ series, visible, onToggle }: GameToggleLegendProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {series.map((s) => {
        const active = visible.has(s.game.id);
        const color = TIER_COLORS[s.tier];
        return (
          <button
            key={s.game.id}
            type="button"
            onClick={() => onToggle(s.game.id)}
            title={s.game.name}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-100",
              active ? "opacity-100" : "opacity-35"
            )}
            style={{ borderColor: `${color}55`, color }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="max-w-[10rem] truncate">{s.game.name}</span>
          </button>
        );
      })}
    </div>
  );
}
