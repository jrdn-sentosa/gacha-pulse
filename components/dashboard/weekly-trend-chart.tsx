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
import { mergeWeeklySeries } from "@/lib/aggregate";
import { TIER_COLORS } from "@/lib/theme";
import { GameToggleLegend } from "@/components/dashboard/game-toggle-legend";
import type { GameSeries, WeeklyPoint } from "@/lib/types";

interface WeeklyTrendChartProps {
  series: GameSeries[];
  metric: (point: WeeklyPoint) => number | null;
  yDomain: [number | string, number | string];
  yTickFormatter: (value: number) => string;
  tooltipFormatter: (value: number) => string;
}

export function WeeklyTrendChart({
  series,
  metric,
  yDomain,
  yTickFormatter,
  tooltipFormatter,
}: WeeklyTrendChartProps) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(series.map((s) => s.game.id))
  );

  const rows = useMemo(() => mergeWeeklySeries(series, metric), [series, metric]);

  function toggle(id: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
            {series
              .filter((s) => visible.has(s.game.id))
              .map((s) => (
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
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
