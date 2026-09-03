"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
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
  const rows = weekly.map((w) => ({
    t: w.weekStart.getTime(),
    value: metric(w),
  }));

  const gradientId = `fill-${color.replace("#", "")}`;

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
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
            width={48}
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
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
