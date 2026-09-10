"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import { cn } from "@/lib/utils";
import type { GameSeries } from "@/lib/types";

export function VolumeChart({ series }: { series: GameSeries[] }) {
  const [logScale, setLogScale] = useState(true);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-1.5 text-lg">
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Review volume over time
          </CardTitle>
          <CardDescription>
            4-week rolling average of weekly review count, per game — smoothed to cut
            week-to-week noise.
          </CardDescription>
        </div>
        <button
          type="button"
          onClick={() => setLogScale((v) => !v)}
          aria-pressed={logScale}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            logScale
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {logScale ? "Log scale" : "Linear scale"}
        </button>
      </CardHeader>
      <CardContent>
        <WeeklyTrendChart
          series={series}
          metric={(w) => w.total}
          yDomain={[0, "auto"]}
          yTickFormatter={(v) => `${v}`}
          tooltipFormatter={(v) => `${v.toFixed(0)} reviews`}
          smoothingWindow={4}
          defaultSelection="one-per-tier"
          yScale={logScale ? "log" : "linear"}
        />
      </CardContent>
    </Card>
  );
}
