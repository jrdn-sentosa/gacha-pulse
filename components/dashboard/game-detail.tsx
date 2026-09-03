"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { DetailLineChart } from "@/components/dashboard/detail-line-chart";
import { TIER_COLORS, TIER_LABELS } from "@/lib/theme";
import type { GameSeries } from "@/lib/types";

interface GameDetailProps {
  series: GameSeries;
  onBack: () => void;
}

export function GameDetail({ series, onBack }: GameDetailProps) {
  const { game, tier, currentSentiment, weekly } = series;
  const color = TIER_COLORS[tier];

  const announced = game.eos_announced_date ? parseISO(game.eos_announced_date) : null;
  const shutdown = game.eos_shutdown_date ? parseISO(game.eos_shutdown_date) : null;

  const referenceLines = [
    announced ? { date: announced, label: "Announced" } : null,
    shutdown ? { date: shutdown, label: "Shutdown" } : null,
  ].filter((r): r is { date: Date; label: string } => r !== null);

  const windDownPct =
    announced && shutdown
      ? Math.min(
          100,
          Math.max(
            0,
            (differenceInCalendarDays(new Date(), announced) /
              differenceInCalendarDays(shutdown, announced)) *
              100
          )
        )
      : null;

  const totalReviews = weekly.reduce((sum, w) => sum + w.total, 0);
  const overallAvgPlaytimeHours = (() => {
    const withPlaytime = weekly.filter((w) => w.avgPlaytimeHours !== null);
    if (withPlaytime.length === 0) return null;
    const totalWeighted = withPlaytime.reduce(
      (sum, w) => sum + (w.avgPlaytimeHours ?? 0) * w.total,
      0
    );
    const totalCount = withPlaytime.reduce((sum, w) => sum + w.total, 0);
    return totalCount > 0 ? totalWeighted / totalCount : null;
  })();

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to overview
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              {game.name}
            </h2>
            <Badge
              variant="outline"
              style={{ borderColor: `${color}66`, color }}
            >
              {TIER_LABELS[tier]}
            </Badge>
          </div>
          <a
            href={`https://store.steampowered.com/app/${game.steam_appid}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Steam store page <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="font-display text-4xl font-bold tabular-nums" style={{ color }}>
            {currentSentiment !== null ? `${currentSentiment.toFixed(0)}%` : "—"}
          </span>
          <span className="text-xs text-muted-foreground">trailing 4-week sentiment</span>
        </div>
      </div>

      {currentSentiment !== null && (
        <ProgressPrimitive.Root value={currentSentiment} max={100} className="flex flex-wrap gap-3">
          <ProgressTrack>
            <ProgressIndicator style={{ backgroundColor: color }} />
          </ProgressTrack>
        </ProgressPrimitive.Root>
      )}

      {announced && shutdown && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Announced {format(announced, "MMM d, yyyy")}
              </span>
              <span className="text-muted-foreground">
                Shutdown {format(shutdown, "MMM d, yyyy")}
              </span>
            </div>
            {windDownPct !== null && (
              <ProgressPrimitive.Root value={windDownPct} max={100} className="flex flex-wrap gap-3">
                <ProgressTrack>
                  <ProgressIndicator style={{ backgroundColor: TIER_COLORS.gray }} />
                </ProgressTrack>
              </ProgressPrimitive.Root>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total reviews" value={totalReviews.toLocaleString()} />
        <StatCard
          label="Avg. playtime at review"
          value={
            overallAvgPlaytimeHours !== null ? `${overallAvgPlaytimeHours.toFixed(0)}h` : "—"
          }
        />
        <StatCard label="Weeks of data" value={weekly.length.toString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sentiment history</CardTitle>
          <CardDescription>Weekly % positive across the full review history.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailLineChart
            weekly={weekly}
            metric={(w) => w.pctPositive}
            color={color}
            yDomain={[0, 100]}
            yTickFormatter={(v) => `${v}%`}
            tooltipFormatter={(v) => `${v.toFixed(1)}%`}
            referenceLines={referenceLines}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review volume</CardTitle>
          <CardDescription>Weekly review count across the full review history.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailLineChart
            weekly={weekly}
            metric={(w) => w.total}
            color={color}
            yDomain={[0, "auto"]}
            yTickFormatter={(v) => `${v}`}
            tooltipFormatter={(v) => `${v.toFixed(0)} reviews`}
            referenceLines={referenceLines}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Average playtime trend</CardTitle>
          <CardDescription>
            Mean hours played by reviewers at the time they left a review, per week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailLineChart
            weekly={weekly}
            metric={(w) => w.avgPlaytimeHours}
            color={color}
            yDomain={[0, "auto"]}
            yTickFormatter={(v) => `${v}h`}
            tooltipFormatter={(v) => `${v.toFixed(1)}h`}
            referenceLines={referenceLines}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
