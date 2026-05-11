"use client";

import { useMemo, useState } from "react";
import {
  colorForSeries,
  formatChartNumber,
  hasChartData,
  readNumericValue,
  replicaChartColors,
  replicaChartEmptyNode,
  type ReplicaChartDatum,
  type ReplicaChartSeries,
} from "./chart-theme";
import { ReplicaChartSurface } from "./ReplicaChartSurface";
import { ReplicaChartLegendItem } from "./replica-chart-frame";

type HoverPoint = {
  index: number;
  x: number;
  y: number;
};

export function ReplicaComboChart({
  data,
  emptyMessage,
  height = 226,
  series,
  testId = "r03-combo-chart",
  yUnit,
}: {
  data: ReplicaChartDatum[];
  emptyMessage?: string;
  height?: number;
  series: ReplicaChartSeries[];
  testId?: string;
  yUnit?: string;
}) {
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);
  const chartData = useMemo(() => data, [data]);

  if (!hasChartData(chartData, series)) return replicaChartEmptyNode(emptyMessage);

  return (
    <div
      data-testid={testId}
      className="min-w-0 rounded-[18px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
      role="img"
      aria-label={`Combo chart with ${chartData.length} data points`}
      tabIndex={0}
    >
      <ReplicaChartSurface height={height}>
        {(size) => (
          <ComboSvg
            data={chartData}
            height={size.height}
            hoverPoint={hoverPoint}
            onHover={setHoverPoint}
            series={series}
            width={size.width}
            yUnit={yUnit}
          />
        )}
      </ReplicaChartSurface>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {series.map((item, index) => (
          <ReplicaChartLegendItem key={item.key} color={colorForSeries(index, item.color)} label={item.label} />
        ))}
      </div>
    </div>
  );
}

function ComboSvg({
  data,
  height,
  hoverPoint,
  onHover,
  series,
  width,
  yUnit,
}: {
  data: ReplicaChartDatum[];
  height: number;
  hoverPoint: HoverPoint | null;
  onHover: (point: HoverPoint | null) => void;
  series: ReplicaChartSeries[];
  width: number;
  yUnit?: string;
}) {
  const padding = { top: 12, right: 16, bottom: 34, left: 44 };
  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);
  const barSeries = series.filter((item) => item.kind !== "line");
  const lineSeries = series.filter((item) => item.kind === "line");
  const values = data.flatMap((row) => series.map((item) => readNumericValue(row[item.key]))).filter((item): item is number => item !== null);
  const maxValue = Math.max(1, Math.ceil(Math.max(...values, 0) * 1.15));
  const categoryWidth = innerWidth / Math.max(1, data.length);
  const barWidth = Math.min(24, Math.max(8, (categoryWidth * 0.48) / Math.max(1, barSeries.length)));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));
  const xCenter = (index: number) => padding.left + categoryWidth * index + categoryWidth / 2;
  const yFor = (value: number) => padding.top + innerHeight - (value / maxValue) * innerHeight;
  const activeRow = hoverPoint ? data[hoverPoint.index] : null;
  const xLabelStep = width < 420 ? Math.max(1, Math.ceil(data.length / 4)) : width < 560 ? Math.max(1, Math.ceil(data.length / 6)) : 1;

  return (
    <div className="relative h-full w-full min-w-0" onMouseLeave={() => onHover(null)}>
      <svg
        role="img"
        aria-label="R03 组合统计图"
        className="block h-full w-full"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        {yTicks.map((tick, index) => {
          const y = yFor(tick);
          return (
            <g key={`grid-${index}-${tick}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={replicaChartColors.grid} strokeDasharray="3 5" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-[#94A3B8] text-[12px] font-semibold">
                {formatChartNumber(tick, yUnit)}
              </text>
            </g>
          );
        })}
        {data.map((row, index) => {
          const shouldRenderLabel = index === 0 || index === data.length - 1 || index % xLabelStep === 0;
          if (!shouldRenderLabel) return null;
          return (
            <text
              key={`x-${row.label}`}
              x={xCenter(index)}
              y={height - 10}
              textAnchor="middle"
              className="fill-[#94A3B8] text-[12px] font-semibold"
            >
              {row.label}
            </text>
          );
        })}
        {barSeries.map((item) => {
          const seriesIndex = series.findIndex((entry) => entry.key === item.key);
          const barIndex = barSeries.findIndex((entry) => entry.key === item.key);
          return data.map((row, index) => {
            const value = readNumericValue(row[item.key]);
            if (value === null) return null;
            const barX = xCenter(index) - (barSeries.length * barWidth) / 2 + barIndex * barWidth + 1.5;
            const barY = yFor(value);
            const radius = Math.min(8, barWidth / 2);
            return (
              <rect
                key={`bar-${item.key}-${row.label}`}
                data-r03-chart-hotspot="true"
                x={barX}
                y={barY}
                width={Math.max(3, barWidth - 3)}
                height={Math.max(1, padding.top + innerHeight - barY)}
                rx={radius}
                fill={colorForSeries(seriesIndex, item.color)}
                opacity={hoverPoint && hoverPoint.index !== index ? 0.48 : 1}
                aria-label={`${row.label} ${item.label} ${formatChartNumber(value, item.unit ?? yUnit)}`}
                onMouseEnter={() => onHover({ index, x: xCenter(index), y: barY })}
                onFocus={() => onHover({ index, x: xCenter(index), y: barY })}
                onBlur={() => onHover(null)}
                tabIndex={0}
              />
            );
          });
        })}
        {lineSeries.map((item) => {
          const seriesIndex = series.findIndex((entry) => entry.key === item.key);
          const points = data
            .map((row, index) => {
              const value = readNumericValue(row[item.key]);
              return value === null ? null : { index, x: xCenter(index), y: yFor(value) };
            })
            .filter((point): point is { index: number; x: number; y: number } => point !== null);
          const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
          return (
            <g key={`line-${item.key}`}>
              <path d={path} fill="none" stroke={colorForSeries(seriesIndex, item.color)} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point) => (
                <circle
                  key={`dot-${item.key}-${point.index}`}
                  data-r03-chart-hotspot="true"
                  cx={point.x}
                  cy={point.y}
                  r={hoverPoint?.index === point.index ? 5 : 3.5}
                  fill="#FFFFFF"
                  stroke={colorForSeries(seriesIndex, item.color)}
                  strokeWidth={2.5}
                  aria-label={`${data[point.index]?.label ?? ""} ${item.label} ${formatChartNumber(readNumericValue(data[point.index]?.[item.key]), item.unit ?? yUnit)}`}
                  onMouseEnter={() => onHover(point)}
                  onFocus={() => onHover(point)}
                  onBlur={() => onHover(null)}
                  tabIndex={0}
                />
              ))}
            </g>
          );
        })}
        {data.map((row, index) => (
          <rect
            key={`hotspot-${row.label}`}
            data-r03-chart-hotspot="true"
            x={padding.left + categoryWidth * index}
            y={padding.top}
            width={categoryWidth}
            height={innerHeight}
            fill="transparent"
            onMouseEnter={() => onHover({ index, x: xCenter(index), y: padding.top + innerHeight * 0.38 })}
            onMouseMove={() => onHover({ index, x: xCenter(index), y: padding.top + innerHeight * 0.38 })}
            onFocus={() => onHover({ index, x: xCenter(index), y: padding.top + innerHeight * 0.38 })}
            onBlur={() => onHover(null)}
            aria-label={`${row.label} chart data`}
            tabIndex={0}
          />
        ))}
      </svg>
      {activeRow && hoverPoint ? (
        <div
          data-testid="r03-chart-tooltip"
          className="pointer-events-none absolute z-10 min-w-40 rounded-[14px] border border-[#E2E8F0] bg-white/96 px-3 py-2 text-xs shadow-[0_18px_42px_rgb(15_23_42_/_0.14)] backdrop-blur"
          style={{
            left: Math.min(Math.max(hoverPoint.x + 10, 8), Math.max(8, width - 176)),
            top: Math.min(Math.max(hoverPoint.y - 28, 8), Math.max(8, height - 120)),
          }}
        >
          <p className="mb-2 font-bold text-[#172554]">{activeRow.label}</p>
          <div className="space-y-1.5">
            {series.map((item, index) => {
              const value = readNumericValue(activeRow[item.key]);
              if (value === null) return null;
              return (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                    <i className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForSeries(index, item.color) }} />
                    {item.label}
                  </span>
                  <strong className="text-[#172554]">{formatChartNumber(value, item.unit ?? yUnit)}</strong>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
