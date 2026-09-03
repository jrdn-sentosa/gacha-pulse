"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import type { GameSeries } from "@/lib/types";

export function VolumeChart({ series }: { series: GameSeries[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review volume over time</CardTitle>
        <CardDescription>Weekly review count, per game.</CardDescription>
      </CardHeader>
      <CardContent>
        <WeeklyTrendChart
          series={series}
          metric={(w) => w.total}
          yDomain={[0, "auto"]}
          yTickFormatter={(v) => `${v}`}
          tooltipFormatter={(v) => `${v.toFixed(0)} reviews`}
        />
      </CardContent>
    </Card>
  );
}
