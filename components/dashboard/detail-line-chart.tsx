"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import type { WeeklyPoint } from "@/lib/types";

interface DetailReferenceLine {
  date: Date;
  label: string;
}

interface DetailLineChartProps {
  weekly: WeeklyPoint[];
  metric: (point: WeeklyPoint) => number | null;
  color: string;
  yDomain: [number | string, number | string];
  yTickFormatter: (value: number) => string;
  tooltipFormatter: (value: number) => string;
  referenceLines?: DetailReferenceLine[];
}

export function DetailLineChart({
  weekly,
  metric,
  color,
  yDomain,
  yTickFormatter,
  tooltipFormatter,
  referenceLines,
}: DetailLineChartProps) {
  const points = weekly.map((w) => ({
    t: w.weekStart.getTime(),
    value: metric(w),
    isAftermath: w.reviewPhase === "post_shutdown",
  }));

  // Split into two dataKeys so the post-shutdown segment can render dashed/muted —
  // the last pre-shutdown point is duplicated into `valueAfter` so the two segments
  // connect with no visual gap at the boundary.
  const firstAftermathIndex = points.findIndex((p) => p.isAftermath);
  const hasAftermath = firstAftermathIndex !== -1;
  const bridgeIndex = firstAftermathIndex > 0 ? firstAftermathIndex - 1 : -1;

  const rows = points.map((p, i) => ({
    t: p.t,
    value: p.isAftermath ? null : p.value,
    valueAfter: p.isAftermath || i === bridgeIndex ? p.value : null,
  }));

  const gradientId = `fill-${color.replace("#", "")}`;
  const maxT = rows[rows.length - 1]?.t;
  const shutdownDate = referenceLines?.find((r) => r.label === "Shutdown")?.date;
  const shadeStart = shutdownDate ? shutdownDate.getTime() : rows[firstAftermathIndex]?.t;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => format(new Date(t), "MMM yyyy")}
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
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(t) =>
                typeof t === "number" ? format(new Date(t), "MMM d, yyyy") : ""
              }
              formatter={(value) => [tooltipFormatter(Number(value)), ""]}
            />
            {hasAftermath && shadeStart !== undefined && maxT !== undefined && (
              <ReferenceArea
                x1={shadeStart}
                x2={maxT}
                fill="var(--muted-foreground)"
                fillOpacity={0.08}
                ifOverflow="extendDomain"
              />
            )}
            {referenceLines?.map((r) => (
              <ReferenceLine
                key={r.label}
                x={r.date.getTime()}
                stroke={color}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{ value: r.label, fontSize: 11, fill: "var(--muted-foreground)", position: "top" }}
              />
            ))}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              connectNulls
              isAnimationActive={false}
            />
            {hasAftermath && (
              <Area
                type="monotone"
                dataKey="valueAfter"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeOpacity={0.5}
                fill={`url(#${gradientId})`}
                fillOpacity={0.35}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {hasAftermath && (
        <p className="text-xs text-muted-foreground/70">
          Shaded region: reviews posted after shutdown, shown for context but excluded from
          trend analysis.
        </p>
      )}
    </div>
  );
}
