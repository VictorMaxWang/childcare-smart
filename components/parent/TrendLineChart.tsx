"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ParentTrendSeries } from "@/lib/ai/types";
import { getHydrationDisplayState } from "@/lib/hydration-display";

const SERIES_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

type ChartRow = {
  date: string;
  label: string;
  [key: string]: string | number | null;
};

export interface TrendLineChartProps {
  labels?: string[];
  series: ParentTrendSeries[];
  xAxis?: string[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatValue(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) {
    return "无记录";
  }

  if (unit === "ml") {
    return `${Math.round(value)} ml`;
  }
  if (unit === "count") {
    return `${Math.round(value)} 次`;
  }
  if (unit === "celsius") {
    return `${value.toFixed(1)} °C`;
  }
  if (unit === "score") {
    return `${Math.round(value)} 分`;
  }
  return `${value}`;
}

function getSeriesDisplayLabel(series: ParentTrendSeries) {
  return series.id === "hydration_ml" ? "补水状态" : series.label;
}

function formatSeriesValue(series: ParentTrendSeries, value: number | null) {
  if (series.id === "hydration_ml") {
    if (value === null || Number.isNaN(value)) {
      return "无记录";
    }

    return getHydrationDisplayState(value).statusLabel;
  }

  return formatValue(value, series.unit);
}

function buildSupportMetricSummary(series: ParentTrendSeries[]) {
  return series.map((item) => {
    const latestPoint = [...item.data].reverse().find((point) => point.value !== null);
    const latestValue = typeof latestPoint?.value === "number" ? latestPoint.value : null;

    return {
      id: item.id,
      label: getSeriesDisplayLabel(item),
      value: formatSeriesValue(item, latestValue),
      date: latestPoint?.label ?? "暂无",
    };
  });
}

function formatTrendChartErrorMessage(error: string | null) {
  if (!error) return null;

  const trimmed = error.trim();
  if (!trimmed) {
    return "趋势图暂时无法显示，请稍后再试。";
  }

  const lower = trimmed.toLowerCase();
  if (
    trimmed.includes("FastAPI brain") ||
    trimmed.includes("brain") ||
    trimmed.includes("未接通") ||
    trimmed.includes("后端趋势服务")
  ) {
    return "后端趋势服务暂时未接通，趋势图先不展示实时数据。";
  }

  if (lower.includes("timeout") || trimmed.includes("超时")) {
    return "后端趋势服务响应超时，趋势图暂时无法刷新。";
  }

  return trimmed;
}

function TrendTooltip({
  active,
  payload,
  label,
  seriesMeta,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | null }>;
  label?: string;
  seriesMeta: ParentTrendSeries[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-100 bg-white/95 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 space-y-2">
        {seriesMeta.map((series, index) => {
          const row = payload.find((item) => item.dataKey === series.id);
          const value = typeof row?.value === "number" ? row.value : null;

          return (
            <div key={series.id} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
                />
                <span>{getSeriesDisplayLabel(series)}</span>
              </div>
              <span className="font-semibold text-slate-900">{formatSeriesValue(series, value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TrendLineChart({
  labels,
  series,
  xAxis,
  loading = false,
  error = null,
  onRetry,
}: TrendLineChartProps) {
  const primarySeries = series[0] ?? null;
  const overlaySeries = useMemo(() => {
    if (!primarySeries) return [];
    return series
      .slice(1)
      .filter((item) => item.unit === primarySeries.unit)
      .slice(0, 2);
  }, [primarySeries, series]);
  const supportMetricSeries = useMemo(() => {
    if (!primarySeries) return [];
    return series.slice(1).filter((item) => item.unit !== primarySeries.unit);
  }, [primarySeries, series]);
  const chartSeries = useMemo(
    () => (primarySeries ? [primarySeries, ...overlaySeries] : []),
    [overlaySeries, primarySeries]
  );

  const chartRows = useMemo<ChartRow[]>(() => {
    if (!primarySeries) return [];

    const axisLabels = xAxis?.length ? xAxis : labels;
    const seriesMaps = chartSeries.map((item) => ({
      id: item.id,
      points: new Map(item.data.map((point) => [point.date, point])),
    }));

    return primarySeries.data.map((point, index) => {
      const row: ChartRow = {
        date: point.date,
        label: axisLabels?.[index] ?? point.label ?? point.date,
      };

      seriesMaps.forEach((item) => {
        const nextPoint = item.points.get(point.date);
        row[item.id] = typeof nextPoint?.value === "number" ? nextPoint.value : null;
      });

      return row;
    });
  }, [chartSeries, labels, primarySeries, xAxis]);

  const supportMetrics = useMemo(() => buildSupportMetricSummary(supportMetricSeries), [supportMetricSeries]);
  const validPrimaryCount = useMemo(
    () => primarySeries?.data.filter((point) => typeof point.value === "number").length ?? 0,
    [primarySeries]
  );
  const displayError = formatTrendChartErrorMessage(error);
  const visibleTickStep = chartRows.length > 14 ? 4 : chartRows.length > 7 ? 2 : 1;

  if (loading) {
    return (
      <div className="space-y-4" data-testid="trend-chart-loading">
        <div className="flex gap-2">
          <div className="h-6 w-20 rounded-full bg-slate-100" />
          <div className="h-6 w-28 rounded-full bg-slate-100" />
          <div className="h-6 w-24 rounded-full bg-slate-100" />
        </div>
        <div className="h-48 rounded-3xl border border-slate-100 bg-slate-50" />
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50/80 p-4" data-testid="trend-chart-error">
        <p className="text-sm font-semibold text-rose-700">趋势图暂时不可用</p>
        <p className="mt-2 text-sm leading-6 text-rose-700/90">{displayError}</p>
        {onRetry ? (
          <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={onRetry}>
            重新查询趋势
          </Button>
        ) : null}
      </div>
    );
  }

  if (!primarySeries || chartRows.length === 0) {
    return (
      <div
        className="flex h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center"
        data-testid="trend-chart-empty"
      >
        <BarChart3 className="h-5 w-5 text-slate-400" />
        <p className="mt-3 text-sm font-semibold text-slate-700">当前时间窗内没有可展示的数据</p>
        <p className="mt-1 text-sm text-slate-500">可以换一个趋势问题，或等更多记录积累后再看。</p>
      </div>
    );
  }

  if (validPrimaryCount < 2) {
    return (
      <div className="space-y-4" data-testid="trend-chart-insufficient">
        <div className="flex flex-wrap gap-2">
          {chartSeries.map((item, index) => (
            <Badge key={item.id} variant={index === 0 ? "info" : "secondary"} className="gap-2 px-3 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
              />
              {getSeriesDisplayLabel(item)}
            </Badge>
          ))}
        </div>
        <div className="flex h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
          <BarChart3 className="h-5 w-5 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700">当前有效记录不足，暂时无法形成趋势线</p>
          <p className="mt-1 text-sm text-slate-500">至少需要 2 个有效点位，现阶段更适合把图表作为参考。</p>
        </div>
        {supportMetrics.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {supportMetrics.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{item.value}</p>
                <p className="mt-1 text-xs text-slate-500">最近记录：{item.date}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="trend-chart-ready">
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {chartSeries.map((item, index) => (
          <Badge key={item.id} variant={index === 0 ? "info" : "secondary"} className="gap-2 px-3 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
              />
              {getSeriesDisplayLabel(item)}
            </Badge>
          ))}
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickFormatter={(value, index) => (index % visibleTickStep === 0 ? String(value) : "")}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              width={34}
            />
            <Tooltip content={<TrendTooltip seriesMeta={chartSeries} />} />
            {chartSeries.map((item, index) => (
              <Line
                key={item.id}
                type="monotone"
                dataKey={item.id}
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={index === 0 ? 3 : 2}
                strokeDasharray={item.kind === "bar" ? "4 4" : undefined}
                connectNulls={false}
                dot={index === 0 ? { r: 2.5, fill: SERIES_COLORS[index % SERIES_COLORS.length] } : false}
                activeDot={{ r: 4 }}
                opacity={index === 0 ? 1 : 0.7}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {supportMetrics.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {supportMetrics.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500">最近记录：{item.date}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
