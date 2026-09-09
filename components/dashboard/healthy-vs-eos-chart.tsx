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
import { mergeAlignedSeries, pickDefaultComparisonSelection } from "@/lib/aggregate";
import { TIER_COLORS, eosStyleForIndex } from "@/lib/theme";
import type { GameSeries } from "@/lib/types";

const SMOOTHING_WINDOW = 4;
const MIN_WEEKS_OFFSET = -52;
const MAX_WEEKS_OFFSET = 4;

interface HealthyVsEosChartProps {
  series: GameSeries[];
  referenceDate: Date;
}

export function HealthyVsEosChart({ series, referenceDate }: HealthyVsEosChartProps) {
  const [visible, setVisible] = useState<Set<string>>(() => pickDefaultComparisonSelection(series));

  const rows = useMemo(
    () =>
      mergeAlignedSeries(series, referenceDate, {
        smoothingWindow: SMOOTHING_WINDOW,
        minWeeksOffset: MIN_WEEKS_OFFSET,
        maxWeeksOffset: MAX_WEEKS_OFFSET,
      }),
    [series, referenceDate]
  );

  // Stable per-EoS-game index (independent of toggle state) so a game's color/dash
  // doesn't shift as other games are toggled on and off.
  const eosOrder = useMemo(
    () => series.filter((s) => s.game.is_eos).map((s) => s.game.id),
    [series]
  );
  const styleFor = (s: GameSeries) =>
    s.game.is_eos ? eosStyleForIndex(eosOrder.indexOf(s.game.id)) : { color: TIER_COLORS[s.tier], dash: undefined };

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
          4-week rolling average of sentiment over the year before EoS announcement through 4
          weeks after (0 = announced, solid line). Live games are anchored to today, as if they
          announced right now — solid colored lines are live, each shut-down game gets its own
          muted color and dash pattern.
        </CardDescription>
        <p className="text-xs text-muted-foreground/70">
          Reviews posted after a game&rsquo;s shutdown date are excluded from this comparison —
          post-shutdown reviews often reflect reactions to the closure itself (nostalgia or
          frustration) rather than conditions that led to it.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <GameToggleLegend
            series={series}
            visible={visible}
            onToggle={toggle}
            colorFor={(s) => styleFor(s).color}
          />
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
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
                  width={56}
                />
                <ReferenceLine
                  x={0}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
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
                  .map((s) => {
                    const style = styleFor(s);
                    return (
                      <Line
                        key={s.game.id}
                        type="monotone"
                        dataKey={s.game.id}
                        name={s.game.name}
                        stroke={style.color}
                        strokeWidth={2}
                        strokeDasharray={style.dash}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    );
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
