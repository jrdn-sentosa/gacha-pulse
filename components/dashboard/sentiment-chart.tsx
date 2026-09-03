"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import type { GameSeries } from "@/lib/types";

export function SentimentChart({ series }: { series: GameSeries[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sentiment over time</CardTitle>
        <CardDescription>Weekly % of reviews marked positive, per game.</CardDescription>
      </CardHeader>
      <CardContent>
        <WeeklyTrendChart
          series={series}
          metric={(w) => w.pctPositive}
          yDomain={[0, 100]}
          yTickFormatter={(v) => `${v}%`}
          tooltipFormatter={(v) => `${v.toFixed(1)}%`}
        />
      </CardContent>
    </Card>
  );
}
