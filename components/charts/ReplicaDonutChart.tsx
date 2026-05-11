"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { ReplicaChartSurface } from "./ReplicaChartSurface";
import { ReplicaTooltip } from "./ReplicaTooltip";
import {
  colorForSeries,
  formatChartNumber,
  hasDonutData,
  replicaChartEmptyNode,
  type ReplicaDonutDatum,
} from "./chart-theme";
import { ReplicaChartLegendItem } from "./replica-chart-frame";

export function ReplicaDonutChart({
  data,
  emptyMessage,
  height = 226,
  testId = "r03-donut-chart",
  totalLabel = "合计",
  unit = "",
}: {
  data: ReplicaDonutDatum[];
  emptyMessage?: string;
  height?: number;
  testId?: string;
  totalLabel?: string;
  unit?: string;
}) {
  const visibleData = data.filter((item) => Number.isFinite(item.value));
  if (!hasDonutData(visibleData)) return replicaChartEmptyNode(emptyMessage);

  const total = visibleData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div data-testid={testId} className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)] sm:items-center">
      <div className="relative min-w-0" style={{ height }}>
        <ReplicaChartSurface height={height}>
          {(size) => (
            <PieChart width={size.width} height={size.height} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={visibleData}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={3}
              stroke="#FFFFFF"
              strokeWidth={4}
            >
              {visibleData.map((item, index) => (
                <Cell key={item.label} fill={colorForSeries(index, item.color)} />
              ))}
            </Pie>
            <Tooltip content={<ReplicaTooltip series={[{ key: "value", label: "数量", unit }]} />} />
            </PieChart>
          )}
        </ReplicaChartSurface>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-black leading-none text-[#172554]">{formatChartNumber(total, unit)}</p>
            <p className="mt-1 text-xs font-semibold text-[#7A86A6]">{totalLabel}</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 text-xs text-slate-500">
        {visibleData.map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-[12px] bg-[#F8FAFF] px-3 py-2">
            <ReplicaChartLegendItem color={colorForSeries(index, item.color)} label={item.label} />
            <span className="font-bold text-[#172554]">{formatChartNumber(item.value, unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
