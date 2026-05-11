"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

export function ReplicaBarChart({
  data,
  emptyMessage,
  height = 226,
  series,
  testId = "r03-bar-chart",
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
    <div data-testid={testId} className="min-w-0">
      <ReplicaChartSurface height={height}>
        {(size) => (
          <BarChart width={size.width} height={size.height} data={data} margin={{ top: 10, right: 14, bottom: 2, left: -8 }}>
            <CartesianGrid stroke={replicaChartColors.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: replicaChartColors.axis, fontSize: 12, fontWeight: 600 }}
              interval={0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={42}
              tick={{ fill: replicaChartColors.axis, fontSize: 12, fontWeight: 600 }}
              tickFormatter={(value) => `${value}${yUnit ?? ""}`}
            />
            <Tooltip content={<ReplicaTooltip series={series} />} cursor={{ fill: "rgba(99, 91, 255, 0.06)" }} />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={colorForSeries(index, item.color)}
                radius={[8, 8, 4, 4]}
                maxBarSize={42}
              />
            ))}
          </BarChart>
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
