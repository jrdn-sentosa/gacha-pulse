"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GameToggleLegend } from "@/components/dashboard/game-toggle-legend";
import { mergeAlignedSeries } from "@/lib/aggregate";
import { TIER_COLORS } from "@/lib/theme";
import type { GameSeries } from "@/lib/types";

interface HealthyVsEosChartProps {
  series: GameSeries[];
  referenceDate: Date;
}

export function HealthyVsEosChart({ series, referenceDate }: HealthyVsEosChartProps) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(series.map((s) => s.game.id))
  );

  const rows = useMemo(
    () => mergeAlignedSeries(series, referenceDate),
    [series, referenceDate]
  );

  function toggle(id: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Healthy vs. EoS trajectories</CardTitle>
        <CardDescription>
          Sentiment aligned by weeks relative to EoS announcement (0 = announced). Live games are
          anchored to today, as if they announced right now — solid lines are live, dashed lines
          are games that have already shut down.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <GameToggleLegend series={series} visible={visible} onToggle={toggle} />
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="weeksOffset"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) => `Wk ${v}`}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <ReferenceLine
                  x={0}
                  stroke="var(--foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                  label={{ value: "Announced", fontSize: 11, fill: "var(--muted-foreground)", position: "top" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => `Week ${v} relative to announcement`}
                  formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
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
                      strokeDasharray={s.game.is_eos ? "5 3" : undefined}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
