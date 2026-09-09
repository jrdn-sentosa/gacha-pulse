"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { aftermathKey, mergeWeeklySeries, mergeWeeklySeriesSmoothed, pickOneGamePerTier } from "@/lib/aggregate";
import { TIER_COLORS } from "@/lib/theme";
import { GameToggleLegend } from "@/components/dashboard/game-toggle-legend";
import type { GameSeries, WeeklyPoint } from "@/lib/types";

interface WeeklyTrendChartProps {
  series: GameSeries[];
  metric: (point: WeeklyPoint) => number | null;
  yDomain: [number | string, number | string];
  yTickFormatter: (value: number) => string;
  tooltipFormatter: (value: number) => string;
  /** Window size (in weeks) for a trailing rolling average — omit for raw weekly values. */
  smoothingWindow?: number;
  /** "one-per-tier" opens the chart with just one gold/purple/blue/gray game selected, instead of all of them. */
  defaultSelection?: "all" | "one-per-tier";
}

export function WeeklyTrendChart({
  series,
  metric,
  yDomain,
  yTickFormatter,
  tooltipFormatter,
  smoothingWindow,
  defaultSelection = "all",
}: WeeklyTrendChartProps) {
  const [visible, setVisible] = useState<Set<string>>(() =>
    defaultSelection === "one-per-tier"
      ? pickOneGamePerTier(series)
      : new Set(series.map((s) => s.game.id))
  );

  const rows = useMemo(
    () =>
      smoothingWindow
        ? mergeWeeklySeriesSmoothed(series, metric, smoothingWindow)
        : mergeWeeklySeries(series, metric),
    [series, metric, smoothingWindow]
  );

  function toggle(id: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleSeries = series.filter((s) => visible.has(s.game.id));
  const hasVisibleAftermath = visibleSeries.some((s) =>
    s.weekly.some((w) => w.reviewPhase === "post_shutdown")
  );

  return (
    <div className="flex flex-col gap-4">
      <GameToggleLegend series={series} visible={visible} onToggle={toggle} />
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={(d: Date) => format(d, "MMM yyyy")}
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={yTickFormatter}
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(d) => (d instanceof Date ? format(d, "MMM d, yyyy") : "")}
              formatter={(value, name) => [tooltipFormatter(Number(value)), name]}
            />
            {visibleSeries.map((s) => (
              <Line
                key={s.game.id}
                type="monotone"
                dataKey={s.game.id}
                name={s.game.name}
                stroke={TIER_COLORS[s.tier]}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {visibleSeries.map((s) => (
              <Line
                key={aftermathKey(s.game.id)}
                type="monotone"
                dataKey={aftermathKey(s.game.id)}
                name={`${s.game.name} (after shutdown)`}
                stroke={TIER_COLORS[s.tier]}
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeOpacity={0.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasVisibleAftermath && (
        <p className="text-xs text-muted-foreground/70">
          Dashed segments show reviews posted after a game&rsquo;s shutdown — often reflecting
          reactions to the closure rather than the game&rsquo;s ongoing trend.
        </p>
      )}
    </div>
  );
}
