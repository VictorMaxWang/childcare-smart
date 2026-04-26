"use client";

import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/role-shell/RoleScaffold";
import {
  buildAdminQualityMetricGroups,
  formatAdminQualitySource,
  formatConfidence,
  formatMetricPrimaryValue,
  formatMetricSourceMode,
  formatRatio,
  getBusinessSnapshotSource,
  getConfidenceBadgeVariant,
  getCoverageBadgeVariant,
  getModeBadgeVariant,
  type AdminQualityMetric,
  type AdminQualityMetricsResponse,
} from "@/lib/agent/admin-quality-metrics";
import { useAdminQualityMetrics } from "@/lib/agent/use-admin-quality-metrics";

function PanelActions({
  windowDays,
  source,
  fallback,
  warningCount,
}: {
  windowDays: number;
  source: string;
  fallback: boolean;
  warningCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 sm:justify-end">
      <Badge variant="info">{windowDays} 日窗口</Badge>
      <Badge variant="outline">主数据源 {formatAdminQualitySource(source)}</Badge>
      {fallback ? <Badge variant="warning">本地兜底</Badge> : null}
      {warningCount > 0 ? <Badge variant="outline">{warningCount} 条说明</Badge> : null}
    </div>
  );
}

function MetricCard({ metric }: { metric: AdminQualityMetric }) {
  const primaryValue = formatMetricPrimaryValue(metric);

  return (
    <Card className="rounded-3xl border-slate-200 bg-white shadow-sm hover:shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">{metric.label}</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{primaryValue.value}</p>
            <p className="pb-1 text-sm font-medium text-slate-500">{primaryValue.unit}</p>
          </div>
        </div>

        <p className="min-h-20 text-sm leading-6 text-slate-600">{metric.summary}</p>

        <div className="flex flex-wrap gap-2">
          <Badge variant={getModeBadgeVariant(metric.source.mode)}>
            {formatMetricSourceMode(metric.source.mode)}
          </Badge>
          <Badge variant={getConfidenceBadgeVariant(metric.confidence)}>
            置信 {formatConfidence(metric.confidence)}
          </Badge>
          <Badge variant={getCoverageBadgeVariant(metric.coverage.coverageRatio)}>
            覆盖 {formatRatio(metric.coverage.coverageRatio)}
          </Badge>
        </div>

        {metric.fallback || metric.source.demoOnly || metric.warnings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {metric.fallback ? <Badge variant="warning">本地兜底</Badge> : null}
            {metric.source.demoOnly ? <Badge variant="outline">演示数据</Badge> : null}
            {metric.warnings.length > 0 ? (
              <Badge variant="outline">{metric.warnings.length} 条说明</Badge>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1 text-xs leading-5 text-slate-500">
          <p>
            业务快照：
            <span className="ml-1 font-medium text-slate-700">
              {formatAdminQualitySource(metric.source.businessSnapshotSource)}
            </span>
          </p>
          {metric.source.note ? <p>{metric.source.note}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricGroupSection({ data }: { data: AdminQualityMetricsResponse }) {
  const groups = buildAdminQualityMetricGroups(data);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.id} className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{group.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">{group.description}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((sectionIndex) => (
        <div key={sectionIndex} className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="h-4 w-64 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(sectionIndex === 1 ? [0, 1] : [0, 1, 2]).map((cardIndex) => (
              <Card key={`${sectionIndex}-${cardIndex}`} className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-3">
                    <div className="h-4 w-36 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-8 w-28 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="h-3 w-40 animate-pulse rounded-full bg-slate-100" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="space-y-2 text-sm leading-6">
          <p className="font-semibold text-slate-900">质量指标暂不可用</p>
          <p className="text-slate-600">
            当前不会影响上方风险优先区和园长首页主流程；待数据接口恢复后，这里会继续展示治理第二视角。
          </p>
          {error ? <p className="text-slate-500">原因：{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminQualityMetricsPanel({
  institutionId,
}: {
  institutionId?: string;
}) {
  const { data, status, error } = useAdminQualityMetrics({
    institutionId,
  });

  const businessSnapshotSource = data ? getBusinessSnapshotSource(data) : "loading";

  return (
    <SectionCard
      title="机构质量驾驶舱"
      description="在风险优先级之外，再看近 7 天闭环执行、家园协同与治理信号，形成园长首页的第二层治理视角。"
      actions={
        status === "ready" && data ? (
          <PanelActions
            windowDays={data.window.days}
            source={data.source}
            fallback={data.fallback}
            warningCount={data.warnings.length}
          />
        ) : status === "loading" ? (
          <Badge variant="outline">指标加载中</Badge>
        ) : (
          <Badge variant="warning">指标暂不可用</Badge>
        )
      }
    >
      {status === "loading" ? (
        <LoadingState />
      ) : status === "unavailable" || !data ? (
        <ErrorState error={error} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
            <p>
              业务快照：
              <span className="ml-1 font-medium text-slate-700">
                {formatAdminQualitySource(businessSnapshotSource)}
              </span>
            </p>
            <p>
              时间范围：
              <span className="ml-1 font-medium text-slate-700">
                {data.window.startDate} 至 {data.window.endDate}
              </span>
            </p>
          </div>

          {data.warnings.length > 0 ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              <p className="font-semibold">数据说明</p>
              <div className="mt-2 space-y-1.5 text-amber-800">
                {data.warnings.slice(0, 2).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}

          <MetricGroupSection data={data} />
        </div>
      )}
    </SectionCard>
  );
}
