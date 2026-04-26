"use client";

import { AlertCircle, Info } from "lucide-react";
import TrendLineChart from "@/components/parent/TrendLineChart";
import { Badge } from "@/components/ui/badge";
import type { ParentTrendComparison, ParentTrendQueryResponse } from "@/lib/ai/types";
import { isTrendFallbackResult } from "@/lib/agent/parent-trend";

export interface ParentTrendResponseCardProps {
  question: string | null;
  result: ParentTrendQueryResponse | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatComparisonText(comparison: ParentTrendComparison) {
  if (comparison.direction === "insufficient") {
    return "前后半段样本不足，暂时先看当前记录。";
  }

  if (comparison.direction === "flat") {
    return "与前半段相比整体大体持平。";
  }

  if (comparison.deltaPct === null) {
    return comparison.direction === "up" ? "与前半段相比有改善趋势。" : "与前半段相比出现走弱。";
  }

  const rounded = Math.abs(Math.round(comparison.deltaPct));
  return comparison.direction === "up"
    ? `与前半段相比提升约 ${rounded}%。`
    : `与前半段相比下降约 ${rounded}%。`;
}

function getTrendBadgeVariant(label: ParentTrendQueryResponse["trendLabel"]) {
  if (label === "改善") return "success";
  if (label === "稳定") return "info";
  return "warning";
}

function getSourceLabel(source: string) {
  if (source === "request_snapshot") return "当前页面数据";
  if (source === "remote_snapshot") return "远端机构数据";
  if (source === "demo_snapshot") return "演示快照";
  return source;
}

function formatTrendErrorMessage(error: string | null) {
  if (!error) return null;

  const trimmed = error.trim();
  if (!trimmed) {
    return "趋势查询暂时不可用，请稍后再试。";
  }

  const lower = trimmed.toLowerCase();
  if (
    trimmed.includes("FastAPI brain") ||
    trimmed.includes("brain") ||
    trimmed.includes("未接通") ||
    trimmed.includes("后端趋势服务")
  ) {
    return "趋势解读暂时不可用，请稍后再试。";
  }

  if (lower.includes("timeout") || trimmed.includes("超时")) {
    return "趋势解读响应超时，请稍后再试。";
  }

  return trimmed;
}

export default function ParentTrendResponseCard({
  question,
  result,
  loading = false,
  error = null,
  onRetry,
}: ParentTrendResponseCardProps) {
  if (!question && !loading && !error && !result) {
    return null;
  }

  const comparisonText = result ? formatComparisonText(result.comparison) : null;
  const warnings = result?.warnings ?? [];
  const supportingSignals = result?.supportingSignals.slice(0, 2) ?? [];
  const fallbackUsed = isTrendFallbackResult(result);
  const displayError = formatTrendErrorMessage(error);

  return (
    <div
      className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"
      data-testid="parent-trend-response-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-slate-400">趋势问答结果</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{question ?? "正在整理趋势问题"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {result ? (
            <>
              <Badge variant={getTrendBadgeVariant(result.trendLabel)}>{result.trendLabel}</Badge>
              <Badge variant="secondary">{result.windowDays} 天</Badge>
              <Badge variant="secondary">{getSourceLabel(result.source)}</Badge>
              {fallbackUsed ? <Badge variant="warning">演示快照</Badge> : null}
            </>
          ) : loading ? (
            <Badge variant="info">查询中</Badge>
          ) : error ? (
            <Badge variant="warning">查询失败</Badge>
          ) : null}
        </div>
      </div>

      {displayError ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/80 p-4 text-sm leading-7 text-rose-800">
          {displayError}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <p className="text-xs text-slate-500">趋势结论</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{comparisonText}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <p className="text-xs text-slate-500">有效覆盖</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {result.dataQuality.observedDays} / {result.windowDays} 天
            </p>
            <p className="mt-1 text-xs text-slate-500">覆盖率 {formatPercent(result.dataQuality.coverageRatio)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <p className="text-xs text-slate-500">主指标</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{result.series[0]?.label ?? "暂无"}</p>
            <p className="mt-1 text-xs text-slate-500">{result.child.name ?? "当前儿童"} · {result.query.resolvedWindowDays} 天视角</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <TrendLineChart
          labels={result?.labels}
          series={result?.series ?? []}
          xAxis={result?.xAxis}
          loading={loading}
          error={error}
          onRetry={onRetry}
        />
      </div>

      {result ? (
        <div className="mt-4 space-y-4">
          {fallbackUsed ? (
            <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900">
              当前结果来自演示快照，已明确标记为非实时机构数据，适合演示趋势结构。
            </div>
          ) : null}

          <div className="rounded-2xl bg-indigo-50/70 p-4">
            <p className="text-sm font-semibold text-slate-900">解释与建议</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{result.explanation}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">有效天数 {result.dataQuality.observedDays}</Badge>
            <Badge variant="secondary">覆盖率 {formatPercent(result.dataQuality.coverageRatio)}</Badge>
            {result.dataQuality.sparse ? <Badge variant="warning">记录偏少</Badge> : null}
            {result.dataQuality.fallbackUsed ? <Badge variant="warning">已使用回退数据</Badge> : null}
          </div>

          {supportingSignals.length > 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">支持信号</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {supportingSignals.map((item, index) => (
                  <li key={`${item.sourceType}-${item.date ?? "na"}-${index}`}>
                    {item.date ? `${item.date} · ` : ""}
                    {item.summary}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-sky-600" />
              <p className="text-sm font-semibold text-slate-900">数据质量与提醒</p>
            </div>
            {warnings.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {warnings.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <AlertCircle className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">当前时间窗内没有额外 warning。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
