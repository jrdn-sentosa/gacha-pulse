"use client";

import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import type { GameSeries } from "@/lib/types";

export function SentimentChart({ series }: { series: GameSeries[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg">
          <TrendingUp className="h-4 w-4 text-muted-foreground" /> Sentiment over time
        </CardTitle>
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
