"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, ShieldAlert, Workflow } from "lucide-react";
import AdminQualityMetricsPanel from "@/components/admin/AdminQualityMetricsPanel";
import RiskPriorityBoard from "@/components/admin/RiskPriorityBoard";
import EmptyState from "@/components/EmptyState";
import UnifiedIntentEntryCard from "@/components/intent/UnifiedIntentEntryCard";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";
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
import { formatAdminDateTimeLabel } from "@/lib/agent/admin-display-text";
import { dedupeAdminHomeExposure } from "@/lib/agent/admin-home-dedupe";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import type { AdminDispatchEvent, InstitutionPriorityItem } from "@/lib/agent/admin-types";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import { INSTITUTION_NAME, useApp } from "@/lib/store";

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
  return <Badge variant="outline">待派发</Badge>;
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
            requestError instanceof Error ? requestError.message : "园长周报预览暂时不可用"
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
          title="当前园长账号还没有可展示的机构数据"
          description="请先使用示例园长账号，或为机构管理员账号初始化机构级数据。"
        />
      </div>
    );
  }

  return (
    <RolePageShell
      badge={`园长首页 · ${INSTITUTION_NAME} · ${TODAY_TEXT}`}
      title="先看机构优先级，再决定今天最该推动什么"
      description="首页保留今日优先级、重点风险、待处理事项和周报预览，帮助园长快速进入决策和派单闭环。"
      actions={
        <>
          <InlineLinkButton href="/admin/agent" label="进入园长 AI 助手" variant="premium" />
          <InlineLinkButton href="/admin/agent?action=weekly-report" label="生成本周运营周报" />
        </>
      }
    >
      <RoleSplitLayout
        stacked
        main={
          <div className="space-y-6">
            <UnifiedIntentEntryCard
              roleHint="admin"
              sourcePage="/admin"
              title="一站式直达机构优先级、周报或 AI 入口"
              placeholder="例如：帮我看今天机构最该先处理什么，或者生成本周周报。"
              examples={[
                "帮我看今天机构最该先处理什么",
                "生成本周周报",
                "开始一次会诊",
              ]}
              institutionId={currentUser.institutionId}
              compact
              initiallyCollapsed
              collapsedSummary="需要时再展开：查看今天机构最该先处理什么、生成周报，或跳转到园长 AI 助手。"
            />

            <MetricGrid
              items={displayHome.heroStats.map((item, index) => ({
                ...item,
                tone: index === 0 ? "amber" : index === 1 ? "sky" : index === 2 ? "emerald" : "indigo",
              }))}
            />

            <SectionCard
              title="今日重点会诊 / 高风险优先事项"
              description="把教师发起的一键会诊直接升级成园长今天最该盯的决策区。"
              actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{dispatchStatusMessage}</Badge>}
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
                    : feedStatus === "ready"
                      ? "当前还没有需要升级到园长侧的重点会诊"
                      : undefined
                }
                emptyDescription={
                  feedStatus === "unavailable"
                    ? "系统会先展示本地已有结论，待机构数据恢复后自动更新。"
                    : feedStatus === "ready"
                      ? "当教师端产生新的重点会诊后，这里会持续展示风险等级、决策结论和关键依据。"
                      : undefined
                }
              />
            </SectionCard>

            <SectionCard
              title="今日机构优先级 TOP 3"
              description="优先展示最该盯的三件事，移动端首屏优先显示这里。"
              actions={<Badge variant="warning">机构级排序</Badge>}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {displayHome.priorityTopItems.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <PriorityLevelBadge level={item.priorityLevel} />
                      <span className="text-xs font-medium text-slate-500">分值 {item.priorityScore}</span>
                    </div>
                    <p className="mt-4 text-lg font-semibold text-slate-900">{item.targetName}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>建议负责人：{item.recommendedOwner.label}</p>
                      <p>建议时限：{formatAdminDateTimeLabel(item.recommendedDeadline)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <AdminQualityMetricsPanel institutionId={currentUser.institutionId} />

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="重点风险儿童"
                description="优先展示当前需要园长过目的重点儿童名单。"
              >
                <div className="space-y-3">
                  {displayHome.riskChildren.length > 0 ? (
                    displayHome.riskChildren.map((item) => (
                      <div key={item.childId} className="rounded-3xl border border-slate-100 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {item.childName} · {item.className}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
                          </div>
                          <PriorityLevelBadge level={item.priorityLevel} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">当前没有进入高优先级列表的儿童。</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="问题最集中的班级"
                description="用班级维度看闭环压力和整改优先级。"
              >
                <div className="space-y-3">
                  {displayHome.riskClasses.length > 0 ? (
                    displayHome.riskClasses.map((item) => (
                      <div key={item.className} className="rounded-3xl border border-slate-100 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.className}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
                          </div>
                          <PriorityLevelBadge level={item.priorityLevel} />
                        </div>
                        <div className="mt-3 text-xs text-slate-500">
                          关联问题 {item.issueCount} 项 · 负责人 {item.ownerLabel}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">当前没有进入高优先级列表的班级问题。</p>
                  )}
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="待处理事项与派单"
              description="整改建议与通知派单汇总在一起，方便后续直接进入 AI 助手推动作业闭环。"
              actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{dispatchStatusMessage}</Badge>}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-3">
                  {displayHome.pendingItems.length > 0 ? (
                    displayHome.pendingItems.map((item) => (
                      <div
                        key={item}
                        className="rounded-3xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-700"
                      >
                        {item}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      当前没有新的待处理事项需要园长继续承接。
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {displayHome.pendingDispatches.length > 0 ? (
                    displayHome.pendingDispatches.map((event) => (
                      <div key={event.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                          <EventStatusBadge status={event.status} />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          截止 {formatAdminDateTimeLabel(event.recommendedDeadline)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      当前还没有已经创建的派单。
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        }
        aside={
          <div className="space-y-6">
            <AssistantEntryCard
              title="进入园长 AI 助手"
              description="把机构上下文、优先级排序、快捷追问和派单动作合并到一个操作入口。"
              href="/admin/agent"
              buttonLabel="进入机构运营 AI 助手"
            >
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                <li>{displayHome.actionEntrySummary}</li>
                <li>当前服务对象：{INSTITUTION_NAME}</li>
                <li>建议流程：先问优先级，再派单，再看周报。</li>
              </ul>
            </AssistantEntryCard>

            <WeeklyReportPreviewCard
              title="本周运营周报预览"
              description="首页只保留闭环率、反馈率、问题热点和下周治理重点的轻量预览，不替代完整周报工作区。"
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

            <SectionCard title="园长今日顺序" description="适合录屏和现场演示的处理顺序。">
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-3">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  先看机构优先级 TOP 3。
                </li>
                <li className="flex items-center gap-3">
                  <ClipboardCheck className="h-4 w-4 text-emerald-500" />
                  再确认重点儿童、班级和家长协同薄弱点。
                </li>
                <li className="flex items-center gap-3">
                  <Workflow className="h-4 w-4 text-indigo-500" />
                  最后进入 AI 助手生成动作建议并沉淀派单。
                </li>
              </ol>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
  );
}
