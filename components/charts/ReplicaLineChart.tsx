"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReplicaChartSurface } from "./ReplicaChartSurface";
import { ReplicaTooltip } from "./ReplicaTooltip";
import {
  colorForSeries,
  hasChartData,
  replicaChartColors,
  replicaChartEmptyNode,
  type ReplicaChartDatum,
  type ReplicaChartSeries,
} from "./chart-theme";
import { ReplicaChartLegendItem } from "./replica-chart-frame";

export function ReplicaLineChart({
  data,
  emptyMessage,
  height = 226,
  series,
  testId = "r03-line-chart",
  yUnit,
}: {
  data: ReplicaChartDatum[];
  emptyMessage?: string;
  height?: number;
  series: ReplicaChartSeries[];
  testId?: string;
  yUnit?: string;
}) {
  if (!hasChartData(data, series)) return replicaChartEmptyNode(emptyMessage);

  return (
    <div
      data-testid={testId}
      className="min-w-0 rounded-[18px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
      role="img"
      aria-label={`Line chart with ${data.length} data points`}
      tabIndex={0}
    >
      <ReplicaChartSurface height={height}>
        {(size) => (
          <LineChart width={size.width} height={size.height} data={data} margin={{ top: 10, right: 14, bottom: 2, left: -8 }}>
            <CartesianGrid stroke={replicaChartColors.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: replicaChartColors.axis, fontSize: 12, fontWeight: 600 }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={42}
              tick={{ fill: replicaChartColors.axis, fontSize: 12, fontWeight: 600 }}
              tickFormatter={(value) => `${value}${yUnit ?? ""}`}
            />
            <Tooltip content={<ReplicaTooltip series={series} />} cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }} />
            {series.map((item, index) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={colorForSeries(index, item.color)}
                strokeWidth={3}
                dot={{ r: 3, strokeWidth: 2, fill: "#FFFFFF" }}
                activeDot={{ r: 5, strokeWidth: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ReplicaChartSurface>
      {series.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {series.map((item, index) => (
            <ReplicaChartLegendItem key={item.key} color={colorForSeries(index, item.color)} label={item.label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
