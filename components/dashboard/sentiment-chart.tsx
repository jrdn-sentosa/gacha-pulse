"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import type { GameSeries } from "@/lib/types";

export function SentimentChart({ series }: { series: GameSeries[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sentiment over time</CardTitle>
        <CardDescription>
          4-week rolling average of % positive reviews, per game — smoothed to cut week-to-week
          noise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WeeklyTrendChart
          series={series}
          metric={(w) => w.pctPositive}
          yDomain={[0, 100]}
          yTickFormatter={(v) => `${v}%`}
          tooltipFormatter={(v) => `${v.toFixed(1)}%`}
          smoothingWindow={4}
          defaultSelection="one-per-tier"
        />
      </CardContent>
    </Card>
  );
}
