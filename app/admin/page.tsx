"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, ShieldAlert, Workflow } from "lucide-react";
import {
  AdminDataItem,
  AdminEmptyState,
} from "@/components/admin/AdminVisuals";
import AdminQualityMetricsPanel from "@/components/admin/AdminQualityMetricsPanel";
import EmptyState from "@/components/EmptyState";
import UnifiedIntentEntryCard from "@/components/intent/UnifiedIntentEntryCard";
import {
  AssistantEntryCard,
  InlineLinkButton,
  MetricGrid,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { buildAdminHomeViewModel, buildAdminWeeklyReportSnapshot } from "@/lib/agent/admin-agent";
import { dedupeAdminHomeExposure } from "@/lib/agent/admin-home-dedupe";
import type { AdminDispatchEvent, InstitutionPriorityItem } from "@/lib/agent/admin-types";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import { INSTITUTION_NAME, useApp } from "@/lib/store";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";
import RiskPriorityBoard from "@/components/admin/RiskPriorityBoard";

const TODAY_TEXT = new Date().toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

function PriorityLevelBadge({ level }: { level: InstitutionPriorityItem["priorityLevel"] }) {
  if (level === "P1") return <Badge variant="warning">P1</Badge>;
  if (level === "P2") return <Badge variant="info">P2</Badge>;
  return <Badge variant="secondary">P3</Badge>;
}

function EventStatusBadge({ status }: { status: AdminDispatchEvent["status"] }) {
  if (status === "completed") return <Badge variant="success">已完成</Badge>;
  if (status === "in_progress") return <Badge variant="info">处理中</Badge>;
  return <Badge variant="outline">待派单</Badge>;
}

function getPriorityTone(level: InstitutionPriorityItem["priorityLevel"]) {
  if (level === "P1") return "amber";
  if (level === "P2") return "sky";
  return "slate";
}

export default function AdminHomePage() {
  const {
    currentUser,
    visibleChildren,
    attendanceRecords,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
    mealRecords,
    getAdminBoardData,
    getWeeklyDietTrend,
    getSmartInsights,
    getLatestConsultations,
  } = useApp();
  const latestConsultations = getLatestConsultations();
  const {
    priorityItems: consultationPriorityItems,
    feedStatus,
    feedBadge,
    notificationEvents,
    createConsultationScopedNotification,
    isCreatingNotification,
    dispatchAvailable,
  } = useAdminConsultationWorkspace({
    institutionName: INSTITUTION_NAME,
    visibleChildren,
    localConsultations: latestConsultations,
    consultationFeedOptions: {
      limit: 4,
      escalatedOnly: true,
    },
  });
  const dispatchStatusMessage = dispatchAvailable ? "可直接创建派单" : "先看优先事项，派单可稍后补建";
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState<string | null>(null);

  const adminHomePayload = useMemo(
    () => ({
      workflow: "daily-priority" as const,
      currentUser: {
        name: currentUser.name,
        institutionName: INSTITUTION_NAME,
        institutionId: currentUser.institutionId,
        role: currentUser.role,
      },
      visibleChildren,
      attendanceRecords,
      healthCheckRecords,
      growthRecords,
      guardianFeedbacks,
      mealRecords,
      adminBoardData: getAdminBoardData(),
      weeklyTrend: getWeeklyDietTrend(),
      smartInsights: getSmartInsights(),
      notificationEvents,
    }),
    [
      attendanceRecords,
      currentUser.institutionId,
      currentUser.name,
      currentUser.role,
      getAdminBoardData,
      getSmartInsights,
      getWeeklyDietTrend,
      growthRecords,
      guardianFeedbacks,
      healthCheckRecords,
      mealRecords,
      notificationEvents,
      visibleChildren,
    ]
  );
  const home = useMemo(() => buildAdminHomeViewModel(adminHomePayload), [adminHomePayload]);
  const displayHome = useMemo(
    () => dedupeAdminHomeExposure(home, consultationPriorityItems),
    [consultationPriorityItems, home]
  );
  const weeklyReportPayload = useMemo(
    () => ({
      role: "admin" as const,
      snapshot: buildAdminWeeklyReportSnapshot(adminHomePayload, home.adminContext),
    }),
    [adminHomePayload, home.adminContext]
  );
  const weeklyReportKey = useMemo(() => JSON.stringify(weeklyReportPayload), [weeklyReportPayload]);

  useEffect(() => {
    if (visibleChildren.length === 0) return;

    const cached = weeklyReportCacheRef.current.get(weeklyReportKey);
    if (cached) {
      setWeeklyReport(cached);
      setWeeklyReportError(null);
      setWeeklyReportLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadWeeklyReportPreview() {
      setWeeklyReportLoading(true);
      setWeeklyReportError(null);

      try {
        const data = await fetchWeeklyReport(weeklyReportPayload, {
          signal: controller.signal,
        });

        if (!cancelled) {
          weeklyReportCacheRef.current.set(weeklyReportKey, data);
          setWeeklyReport(data);
        }
      } catch (requestError) {
        if (!cancelled && !controller.signal.aborted) {
          setWeeklyReportError(
            requestError instanceof Error ? requestError.message : "园长周报预览暂时不可用。"
          );
        }
      } finally {
        if (!cancelled) {
          setWeeklyReportLoading(false);
        }
      }
    }

    void loadWeeklyReportPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visibleChildren.length, weeklyReportKey, weeklyReportPayload]);

  if (visibleChildren.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="当前园长账号还没有可展示的机构数据。"
          description="请先使用示例园长账号，或为机构管理员账号初始化机构级数据。"
        />
      </div>
    );
  }

  const adminHeroAside = (
    <div className="admin-workbench-shell space-y-3">
      <div className="hero-note-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={feedBadge.variant}>{feedBadge.label}</Badge>
          <Badge variant={dispatchAvailable ? "success" : "outline"}>{dispatchStatusMessage}</Badge>
        </div>
        <p className="mt-4 text-base font-semibold text-white">
          首屏只保留今日最该判断的机构级优先事项，先定顺序，再定责任人和闭环窗口。
        </p>
        <p className="mt-2 text-sm leading-6 text-white/64">
          重点会诊 {consultationPriorityItems.length} 条，待承接派单 {displayHome.pendingDispatches.length} 条，
          最新通知 {notificationEvents.length} 条。
        </p>
      </div>
      <MetricGrid
        items={displayHome.heroStats.map((item, index) => ({
          ...item,
          tone:
            index === 0 ? "amber" : index === 1 ? "sky" : index === 2 ? "emerald" : "indigo",
        }))}
        className="sm:grid-cols-2"
      />
    </div>
  );

  return (
    <RolePageShell
      intensity="light"
      badge={`园长工作台 · ${INSTITUTION_NAME} · ${TODAY_TEXT}`}
      title="先判断今日机构优先级，再决定谁负责推进与何时闭环。"
      description="首页保持轻氛围和强可读性：首屏只放今日决策区、核心指标与机构级主行动，其余内容按治理深度顺序下沉。"
      actions={
        <>
          <InlineLinkButton href="/admin/agent" label="进入园长 AI 助手" variant="premium" />
          <InlineLinkButton href="/admin/agent?action=weekly-report" label="进入完整周报工作区" />
        </>
      }
      heroAside={adminHeroAside}
    >
      <div className="admin-workbench-shell">
        <RoleSplitLayout
          main={
            <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)]">
              <SectionCard
                title="今日重点会诊 / 高风险决策"
                description="教师端升级到机构级的重点会诊直接进入首页主决策区，优先服务今天的判断、承接和派单。"
                actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{dispatchStatusMessage}</Badge>}
                surface="luminous"
                glow="brand"
                className="border-white/10"
              >
                <RiskPriorityBoard
                  items={consultationPriorityItems}
                  layoutVariant="stacked"
                  isLoading={feedStatus === "loading"}
                  sourceBadgeLabel={feedBadge.label}
                  sourceBadgeVariant={feedBadge.variant}
                  onCreateConsultationNotification={createConsultationScopedNotification}
                  isCreatingConsultationNotification={isCreatingNotification}
                  dispatchAvailable={dispatchAvailable}
                  dispatchStatusMessage={dispatchStatusMessage}
                  emptyTitle={
                    feedStatus === "unavailable"
                      ? "重点会诊数据暂时不可用"
                      : "当前还没有需要优先处理的重点会诊"
                  }
                  emptyDescription={
                    feedStatus === "unavailable"
                      ? "系统会先展示本地已有结论，待机构数据恢复后自动更新。"
                      : "当教师端产生新的重点会诊后，这里会自动同步风控等级、决策结论和派单动作。"
                  }
                />
              </SectionCard>

              <SectionCard
                title="今日机构优先级"
                description="只保留今天最该推进的三件事，减少首页噪音，让园长先完成排序再进入细项。"
                surface="glass"
                glow="soft"
                actions={<Badge variant="outline">前三项</Badge>}
              >
                <div className="space-y-3">
                  {displayHome.priorityTopItems.map((item) => (
                    <AdminDataItem
                      key={item.id}
                      tone={getPriorityTone(item.priorityLevel)}
                      title={item.targetName}
                      description={item.reason}
                      badge={<PriorityLevelBadge level={item.priorityLevel} />}
                      meta={
                        <>
                          <p>优先分：{item.priorityScore}</p>
                          <p>建议负责人：{item.recommendedOwner.label}</p>
                          <p>建议时限：{item.recommendedDeadline}</p>
                        </>
                      }
                    />
                  ))}
                </div>
              </SectionCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
              <WeeklyReportPreviewCard
                title="本周运营周报预览"
                description="作为第二层主阅读区，只保留闭环率、热点问题和下周治理重点，不替代完整周报工作区。"
                role="admin"
                periodLabel={weeklyReportPayload.snapshot.periodLabel}
                report={weeklyReport}
                loading={weeklyReportLoading}
                error={weeklyReportError}
                ctaHref="/admin/agent?action=weekly-report"
                ctaLabel="进入完整周报工作区"
                ctaVariant="premium"
                showRuntimeMeta={false}
              />

              <AdminQualityMetricsPanel institutionId={currentUser.institutionId} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="高风险儿童"
                description="按儿童维度查看当前最需要行政越级关注的对象。"
                surface="glass"
                glow="soft"
              >
                <div className="space-y-3">
                  {displayHome.riskChildren.length > 0 ? (
                    displayHome.riskChildren.map((item) => (
                      <AdminDataItem
                        key={item.childId}
                        tone={getPriorityTone(item.priorityLevel)}
                        title={`${item.childName} · ${item.className}`}
                        description={item.reason}
                        badge={<PriorityLevelBadge level={item.priorityLevel} />}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>当前没有进入高优先级列表的儿童。</AdminEmptyState>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="高压力班级"
                description="按班级维度看治理承压点和整改单点，作为第三层下钻入口。"
                surface="glass"
                glow="soft"
              >
                <div className="space-y-3">
                  {displayHome.riskClasses.length > 0 ? (
                    displayHome.riskClasses.map((item) => (
                      <AdminDataItem
                        key={item.className}
                        tone={getPriorityTone(item.priorityLevel)}
                        title={item.className}
                        description={item.reason}
                        badge={<PriorityLevelBadge level={item.priorityLevel} />}
                        meta={`关联问题 ${item.issueCount} 项 · 负责人 ${item.ownerLabel}`}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>当前没有进入高优先级列表的班级问题。</AdminEmptyState>
                  )}
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="待派单与执行顺序"
              description="把整改建议与执行状态收口到第三层，保证首页仍然是治理决策页，而不是长列表。"
              actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{dispatchStatusMessage}</Badge>}
              surface="glass"
              glow="soft"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-3">
                  {displayHome.pendingItems.length > 0 ? (
                    displayHome.pendingItems.map((item) => (
                      <AdminDataItem key={item} description={item} tone="slate" />
                    ))
                  ) : (
                    <AdminEmptyState>当前没有新的待处理事项需要园长继续承接。</AdminEmptyState>
                  )}
                </div>
                <div className="space-y-3">
                  {displayHome.pendingDispatches.length > 0 ? (
                    displayHome.pendingDispatches.map((event) => (
                      <AdminDataItem
                        key={event.id}
                        title={event.title}
                        tone={event.status === "completed" ? "emerald" : event.status === "in_progress" ? "sky" : "amber"}
                        badge={<EventStatusBadge status={event.status} />}
                        meta={`建议时限：${event.recommendedDeadline}`}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>当前还没有已经创建的派单。</AdminEmptyState>
                  )}
                </div>
              </div>
            </SectionCard>
            </div>
          }
          aside={
            <div className="space-y-6 xl:sticky xl:top-5">
            <UnifiedIntentEntryCard
              roleHint="admin"
              sourcePage="/admin"
              title="一句话进入园长 AI 助手"
              placeholder="例如：今天机构最该优先处理什么，或生成本周园长周报"
              examples={["今天机构最该优先处理什么", "生成本周园长周报", "开始一次重点会诊"]}
              institutionId={currentUser.institutionId}
              compact
              initiallyCollapsed
              collapsedSummary="需要时再展开：优先级判断、周报生成与派单动作都从这里进入。"
            />

            <AssistantEntryCard
              title="进入园长 AI 助手"
              description="把机构上下文、优先级排序、快速追问和派单动作合并到一个持续工作入口。"
              href="/admin/agent"
              buttonLabel="进入机构运营 AI 助手"
            >
              <ul className="space-y-3 text-sm leading-6 text-white/62">
                <li>{displayHome.actionEntrySummary}</li>
                <li>当前服务对象：{INSTITUTION_NAME}</li>
                <li>推荐路径：先看重点会诊，再看质量指标，最后进入 AI 助手生成动作。</li>
              </ul>
            </AssistantEntryCard>

            <SectionCard
              title="园长今日顺序"
              description="保持成熟工作台的阅读路径：先判断，再复核，再进入动作。"
              surface="glass"
              glow="soft"
            >
              <div className="space-y-3">
                <AdminDataItem
                  tone="amber"
                  title="先看重点会诊与前三项"
                  description="先确认今天必须推进的治理事项，再决定是否立刻派单。"
                  badge={<ShieldAlert className="h-4 w-4 text-indigo-500" />}
                />
                <AdminDataItem
                  tone="emerald"
                  title="再看周报预览与质量指标"
                  description="用第二层视角确认本周趋势、闭环薄弱点与治理信号。"
                  badge={<ClipboardCheck className="h-4 w-4 text-indigo-500" />}
                />
                <AdminDataItem
                  tone="indigo"
                  title="最后进入 AI 助手落动作"
                  description="把机构级判断转成可跟踪动作，而不是停留在展示与汇总。"
                  badge={<Workflow className="h-4 w-4 text-indigo-500" />}
                />
              </div>
            </SectionCard>
            </div>
          }
        />
      </div>
    </RolePageShell>
  );
}
