"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  ClipboardCheck,
  Clock3,
  Download,
  HeartPulse,
  Link2,
  ListChecks,
  RefreshCw,
  Share2,
  ShieldCheck,
  Utensils,
  UsersRound,
} from "lucide-react";
import type { AdminHomeViewModel, InstitutionPriorityLevel } from "@/lib/agent/admin-types";
import type {
  AdminGovernanceActionItem,
  AdminGovernanceDemoViewModel,
  AdminGovernanceRiskItem,
} from "@/lib/agent/admin-governance-demo";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import type { ApiAdminSummary } from "@/lib/api/types";
import type { AdminCommunicationSummary } from "@/lib/communication/home-school";
import { formatHomeSchoolTime } from "@/lib/communication/home-school";
import { cn } from "@/lib/utils";
import {
  ReplicaBarChart,
  ReplicaComboChart,
  ReplicaDonutChart,
  ReplicaLineChart,
  replicaChartColors,
  type ReplicaChartDatum,
  type ReplicaDonutDatum,
} from "@/components/charts";
import {
  directorReplicaAssets,
  trendTabs,
} from "./directorReplicaData";
import {
  DirectorReplicaPage,
  DonutChart,
  MiniLineChart,
  ReplicaButton,
  ReplicaButtonLink,
  ReplicaMetricLink,
  ReplicaPanel,
  ReplicaPill,
} from "./DirectorReplicaPrimitives";

export interface AdminFamilyFeedbackWriteback {
  feedbackId: string;
  childName: string;
  className: string;
  executionStatusLabel: string;
  childReactionLabel: string;
  improvementStatusLabel: string;
  notes: string;
  submittedAtLabel: string;
  sourceLabel: string;
}

type ReplicaTone = "blue" | "purple" | "green" | "orange" | "red" | "slate";

function priorityTone(level: InstitutionPriorityLevel) {
  if (level === "P1") return "red";
  if (level === "P2") return "orange";
  return "blue";
}

function governanceActionTone(action: AdminGovernanceActionItem): ReplicaTone {
  return action.tone;
}

function governanceRiskTone(item: AdminGovernanceRiskItem): ReplicaTone {
  if (item.priorityLabel === "P1") return "red";
  if (item.priorityLabel === "P2") return "orange";
  return "blue";
}

export default function DirectorDashboardReplica({
  home,
  institutionName,
  currentUserName,
  todayText,
  weeklyReport,
  weeklyReportLoading,
  weeklyReportError,
  weeklyReportPeriodLabel,
  adminSummary,
  adminSummaryLoading,
  adminSummaryError,
  communicationSummary,
  governanceDemo,
  familyFeedbackWritebacks,
  latestFamilyFeedback,
  onMarkCommunicationHandled,
  onOpenFeedbackDetail,
  onRefresh,
}: {
  home: AdminHomeViewModel;
  institutionName: string;
  currentUserName: string;
  todayText: string;
  weeklyReport: WeeklyReportResponse | null;
  weeklyReportLoading: boolean;
  weeklyReportError: string | null;
  weeklyReportPeriodLabel: string;
  adminSummary: ApiAdminSummary | null;
  adminSummaryLoading: boolean;
  adminSummaryError: string | null;
  communicationSummary: AdminCommunicationSummary;
  governanceDemo: AdminGovernanceDemoViewModel;
  familyFeedbackWritebacks?: AdminFamilyFeedbackWriteback[];
  latestFamilyFeedback?: AdminFamilyFeedbackWriteback | null;
  onMarkCommunicationHandled: (conversationId: string) => void;
  onOpenFeedbackDetail: () => void;
  onRefresh: () => void;
}) {
  const scope = home.adminContext.institutionScope;
  const riskChildrenCount = scope.riskChildrenCount;
  const pendingDispatchCount = scope.pendingDispatchCount;
  const weeklySummary = weeklyReport?.summary ?? home.weeklySummary;
  const latestDietCoverage = home.dietTrendSeries.at(-1) ?? 0;
  const apiMetricSource = adminSummaryLoading
    ? "API 聚合刷新中"
    : adminSummaryError
      ? "API 聚合暂不可用"
      : adminSummary
        ? "E01 API/service scope 聚合"
        : "等待 API 聚合";
  const closureSteps = [
    { label: "识别问题", value: `${home.priorityTopItems.length}`, status: home.priorityTopItems.length > 0 ? "待推进" : "暂无" },
    { label: "生成动作", value: `${home.adminContext.actionItems.length}`, status: home.adminContext.actionItems.length > 0 ? "已生成" : "暂无" },
    { label: "派单执行", value: `${pendingDispatchCount}`, status: pendingDispatchCount > 0 ? "进行中" : "暂无" },
    { label: "复盘优化", value: `${scope.pendingReviewCount}`, status: scope.pendingReviewCount > 0 ? "待复查" : "暂无" },
  ];
  const feedbackExpectedCount = scope.feedbackExpectedChildCount ?? 0;
  const feedbackCompletedCount = scope.feedbackCompletedChildCount ?? 0;
  const assignmentCounts = adminSummary?.assignmentCounts ?? {
    pending: pendingDispatchCount,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    total: pendingDispatchCount,
    sourceRecordIds: [],
  };
  const assignmentCompletionRate =
    assignmentCounts.total > 0 ? Math.round((assignmentCounts.completed / assignmentCounts.total) * 100) : 0;
  const operationTrendRows: ReplicaChartDatum[] = home.trendLabels.map((label, index) => ({
    label,
    attendance: home.attendanceTrendSeries[index] ?? 0,
    health: home.healthTrendSeries[index] ?? 0,
    diet: home.dietTrendSeries[index] ?? 0,
    growth: home.growthTrendSeries[index] ?? 0,
  }));
  const riskDistributionRows: ReplicaDonutDatum[] = [
    { label: "晨检异常", value: adminSummary?.healthAbnormalCount ?? scope.healthAbnormalCount, color: replicaChartColors.red },
    { label: "重点跟进记录", value: riskChildrenCount, color: replicaChartColors.amber },
    { label: "高风险会诊", value: adminSummary?.highRiskConsultationCount ?? 0, color: replicaChartColors.violet },
    { label: "未处理反馈", value: adminSummary?.unresolvedFeedbackCount ?? 0, color: replicaChartColors.sky },
    { label: "待派单", value: assignmentCounts.pending + assignmentCounts.inProgress + assignmentCounts.overdue, color: replicaChartColors.primary },
  ];
  const classComparisonRows: ReplicaChartDatum[] =
    adminSummary?.classStats.map((item) => ({
      label: item.classId,
      children: item.childCount,
      health: item.healthAbnormalCount,
      meal: item.mealRecordCount,
      growth: item.growthRecordCount,
      feedback: item.unresolvedFeedbackCount,
    })) ??
    home.classDistribution.map((item) => ({
      label: item.label,
      children: item.value,
      health: 0,
      meal: 0,
      growth: 0,
      feedback: 0,
    }));
  const closureChartRows: ReplicaChartDatum[] = [
    {
      label: "家园反馈",
      total: feedbackExpectedCount,
      done: feedbackCompletedCount,
      rate: scope.feedbackCompletionRate,
    },
    {
      label: "沟通线程",
      total: communicationSummary.totalThreads,
      done: communicationSummary.handledThreads,
      rate:
        communicationSummary.totalThreads > 0
          ? Math.round((communicationSummary.handledThreads / communicationSummary.totalThreads) * 100)
          : 0,
    },
    {
      label: "派单闭环",
      total: assignmentCounts.total,
      done: assignmentCounts.completed,
      rate: assignmentCompletionRate,
    },
  ];
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const selectedRisk = useMemo(
    () =>
      governanceDemo.riskItems.find((item) => item.id === selectedRiskId) ??
      governanceDemo.riskItems[0] ??
      null,
    [governanceDemo.riskItems, selectedRiskId]
  );
  const feedbackWritebackRows =
    familyFeedbackWritebacks && familyFeedbackWritebacks.length > 0
      ? familyFeedbackWritebacks
      : latestFamilyFeedback
        ? [latestFamilyFeedback]
        : [];
  const highRiskPendingCount = governanceDemo.riskItems.filter((item) => item.priorityLabel === "P1").length;

  const metrics = [
    {
      label: "出勤率",
      value: `${scope.todayAttendanceRate}%`,
      subValue: adminSummary
        ? `儿童 ${adminSummary.childCount} · 今日记录 ${adminSummary.todayRecordCount}`
        : `出勤 ${scope.todayPresentCount} / 应出勤 ${scope.visibleChildren}`,
      href: "/children",
      icon: <CalendarCheck2 className="h-4 w-4" />,
      tone: "blue" as const,
    },
    {
      label: "晨检异常",
      value: `${adminSummary?.healthAbnormalCount ?? scope.healthAbnormalCount}项`,
      subValue: adminSummary ? `源记录 ${adminSummary.sourceRecordIds.length} 条` : `近 7 天异常记录 ${scope.healthAbnormalCount} 项`,
      href: "/health",
      icon: <HeartPulse className="h-4 w-4" />,
      tone: "purple" as const,
    },
    {
      label: "饮食记录覆盖",
      value: adminSummary ? `${adminSummary.mealRecordCount}条` : `${latestDietCoverage}%`,
      subValue: adminSummary ? "来自服务端真实饮食记录" : "按近 7 天真实饮食记录计算",
      href: "/diet",
      icon: <Utensils className="h-4 w-4" />,
      tone: "orange" as const,
    },
    {
      label: "成长关注",
      value: `${adminSummary?.growthRecordCount ?? scope.growthAttentionCount}项`,
      subValue: adminSummary ? `未处理反馈 ${adminSummary.unresolvedFeedbackCount} · 高风险 ${adminSummary.highRiskConsultationCount}` : `待复查 ${scope.pendingReviewCount} 项`,
      href: "/growth",
      icon: <Activity className="h-4 w-4" />,
      tone: "green" as const,
    },
  ];

  return (
    <DirectorReplicaPage
      eyebrow={`${institutionName} · ${todayText}`}
      title={`您好，${currentUserName}`}
      description={`数据统计周期：${weeklyReportPeriodLabel}。以园长数据看板为主体，保留儿童档案与闭环管理入口。`}
      actions={
        <>
          <ReplicaButtonLink href="/admin/agent?action=weekly-report" variant="outline">
            <Download className="h-4 w-4" />
            导出周报
          </ReplicaButtonLink>
          <ReplicaButtonLink href="/admin/agent?action=weekly-report" variant="outline">
            <Share2 className="h-4 w-4" />
            分享周报
          </ReplicaButtonLink>
          <ReplicaButton onClick={onRefresh} disabled={weeklyReportLoading}>
            <RefreshCw className={`h-4 w-4 ${weeklyReportLoading ? "animate-spin" : ""}`} />
            刷新数据
          </ReplicaButton>
        </>
      }
    >
      <div data-testid="admin-governance-hero" className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <ReplicaPanel
          title="风险优先级板"
          description="按 P1/P2、会诊风险、状态和生成时间排序，点击可在同屏查看承接详情。"
          actions={<ReplicaPill tone="red">待处理重点复核 {highRiskPendingCount}</ReplicaPill>}
        >
          <div data-testid="admin-risk-priority-compact" className="space-y-3">
            {governanceDemo.riskItems.map((item, index) => {
              const selected = selectedRisk?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`admin-risk-item-${item.targetId}`}
                  onClick={() => setSelectedRiskId(item.id)}
                  className={cn(
                    "w-full rounded-[16px] border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#635BFF]/30",
                    selected
                      ? "border-[#635BFF] bg-[#F4F3FF] shadow-[0_12px_28px_rgba(99,91,255,0.12)]"
                      : "border-[#E8ECF7] bg-[#FBFCFF] hover:border-[#C8CEF4] hover:bg-white"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReplicaPill tone={governanceRiskTone(item)}>{item.priorityLabel}</ReplicaPill>
                        <span className="text-[11px] font-semibold text-[#7A86A6]">#{index + 1}</span>
                        <span className="text-[11px] font-semibold text-[#7A86A6]">{item.statusLabel}</span>
                      </div>
                      <p className="mt-2 break-words text-sm font-bold text-[#172554]">
                        {item.childName} · {item.riskLabel}
                      </p>
                      <p className="mt-1 text-xs text-[#7A86A6]">{item.className} · {item.generatedAtLabel}</p>
                    </div>
                    <ArrowRight className={cn("mt-1 h-4 w-4 shrink-0", selected ? "text-[#635BFF]" : "text-[#A7B0CA]")} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#596681]">{item.signal}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#596681] ring-1 ring-[#E8ECF7]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </ReplicaPanel>

        <div className="space-y-5">
          <ReplicaPanel title="个案信号转机构动作" actions={<ReplicaPill tone="purple">链路摘要</ReplicaPill>}>
            <div data-testid="admin-governance-chain-summary" className="space-y-3">
              <p className="text-sm font-bold text-[#172554]">
                {selectedRisk ? `${selectedRisk.childName} · ${selectedRisk.priorityLabel}` : "暂无选中风险"}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    label: "信号",
                    value: selectedRisk?.signal ?? "等待风险信号",
                    tone: "red" as const,
                  },
                  {
                    label: "机构动作",
                    value:
                      selectedRisk?.schoolActions[0] ??
                      selectedRisk?.governanceActions[0] ??
                      "等待园内动作",
                    tone: "purple" as const,
                  },
                  {
                    label: "复查/回流",
                    value:
                      selectedRisk?.followUpActions[0] ??
                      selectedRisk?.feedbackNotes[0] ??
                      "等待 48 小时复查",
                    tone: "green" as const,
                  },
                ].map((step) => (
                  <div key={step.label} className="rounded-[14px] bg-[#FBFCFF] p-3 ring-1 ring-[#E8ECF7]">
                    <ReplicaPill tone={step.tone}>{step.label}</ReplicaPill>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#596681]">{step.value}</p>
                  </div>
                ))}
              </div>
              <a href="#admin-risk-priority-detail" className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B58DE]">
                查看完整 trace 与承接卡
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </ReplicaPanel>

          <ReplicaPanel
            title="质量驾驶舱"
            description="关键治理指标直接来自会诊、任务、反馈和材料解析数据。"
            actions={<ReplicaPill tone="green">趋势变化</ReplicaPill>}
          >
            <div data-testid="admin-quality-cockpit" className="grid gap-3 sm:grid-cols-2">
              {governanceDemo.qualityMetrics.map((metric) => (
                <div key={metric.key} className="rounded-[15px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[#7A86A6]">{metric.label}</p>
                    <ReplicaPill tone={metric.tone}>{metric.trend}</ReplicaPill>
                  </div>
                  <p className="mt-3 text-2xl font-bold leading-none text-[#172554]">{metric.value}</p>
                  <p className="mt-2 text-xs leading-5 text-[#596681]">{metric.detail}</p>
                </div>
              ))}
            </div>
            <div data-testid="admin-governance-trend" className="mt-4 space-y-2">
              {governanceDemo.trendRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[42px_1fr] items-center gap-3 text-xs">
                  <span className="font-semibold text-[#7A86A6]">{row.label}</span>
                  <div className="grid gap-1">
                    <div className="h-1.5 rounded-full bg-red-100">
                      <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.min(100, row.risk * 8)}%` }} />
                    </div>
                    <div className="h-1.5 rounded-full bg-emerald-100">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, row.feedback * 8)}%` }} />
                    </div>
                    <div className="h-1.5 rounded-full bg-violet-100">
                      <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.min(100, row.action * 8)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="个案信号转机构动作详情" actions={<ReplicaPill tone="purple">链路摘要</ReplicaPill>}>
            <div data-testid="admin-governance-chain-detail-summary" className="space-y-3">
              <p className="text-sm font-bold text-[#172554]">
                {selectedRisk ? `${selectedRisk.childName} · ${selectedRisk.priorityLabel}` : "暂无选中风险"}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    label: "信号",
                    value: selectedRisk?.signal ?? "等待风险信号",
                    tone: "red" as const,
                  },
                  {
                    label: "机构动作",
                    value:
                      selectedRisk?.schoolActions[0] ??
                      selectedRisk?.governanceActions[0] ??
                      "等待园内动作",
                    tone: "purple" as const,
                  },
                  {
                    label: "复查/回流",
                    value:
                      selectedRisk?.followUpActions[0] ??
                      selectedRisk?.feedbackNotes[0] ??
                      "等待 48 小时复查",
                    tone: "green" as const,
                  },
                ].map((step) => (
                  <div key={step.label} className="rounded-[14px] bg-[#FBFCFF] p-3 ring-1 ring-[#E8ECF7]">
                    <ReplicaPill tone={step.tone}>{step.label}</ReplicaPill>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#596681]">{step.value}</p>
                  </div>
                ))}
              </div>
              <a href="#admin-risk-priority-detail" className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B58DE]">
                查看完整 trace 与承接卡
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="周度摘要" actions={<ReplicaPill tone="blue">非空周报</ReplicaPill>}>
            <div data-testid="admin-weekly-governance-summary" className="space-y-4">
              <p className="text-sm leading-7 text-[#596681]">{governanceDemo.weeklySummary.summary}</p>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { title: "本周亮点", items: governanceDemo.weeklySummary.highlights, tone: "green" as const },
                  { title: "风险提醒", items: governanceDemo.weeklySummary.risks, tone: "red" as const },
                  { title: "下周动作", items: governanceDemo.weeklySummary.nextWeekActions, tone: "blue" as const },
                ].map((section) => (
                  <div key={section.title} className="rounded-[15px] bg-[#FBFCFF] p-3 ring-1 ring-[#E8ECF7]">
                    <ReplicaPill tone={section.tone}>{section.title}</ReplicaPill>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[#596681]">
                      {section.items.slice(0, 3).map((item) => (
                        <li key={item} className="break-words">{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </ReplicaPanel>
        </div>
      </div>

      <ReplicaPanel
        title="个案信号转机构动作"
        description={governanceDemo.bridgeSummary}
        actions={
          <a
            href="#admin-risk-priority-detail"
            className="inline-flex h-8 items-center gap-2 rounded-full bg-[#EEF4FF] px-3 text-xs font-semibold text-[#5B58DE] ring-1 ring-[#DDE5FF]"
          >
            <Link2 className="h-3.5 w-3.5" />
            完整 trace 风险板
          </a>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
          <div data-testid="admin-risk-detail" className="rounded-[16px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
            {selectedRisk ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReplicaPill tone={governanceRiskTone(selectedRisk)}>{selectedRisk.priorityLabel}</ReplicaPill>
                      <ReplicaPill tone="slate">{selectedRisk.statusLabel}</ReplicaPill>
                    </div>
                    <h3 className="mt-3 break-words text-lg font-bold text-[#172554]">
                      {selectedRisk.childName} · {selectedRisk.riskLabel}
                    </h3>
                    <p className="mt-1 text-xs text-[#7A86A6]">{selectedRisk.className} · {selectedRisk.generatedAtLabel}</p>
                  </div>
                  <ShieldCheck className="h-6 w-6 text-[#635BFF]" />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[14px] bg-white p-3 ring-1 ring-[#E8ECF7]">
                    <p className="text-xs font-bold text-[#172554]">触发信号</p>
                    <p className="mt-2 text-xs leading-5 text-[#596681]">{selectedRisk.signal}</p>
                  </div>
                  <div className="rounded-[14px] bg-white p-3 ring-1 ring-[#E8ECF7]">
                    <p className="text-xs font-bold text-[#172554]">证据来源</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#596681]">
                      {(selectedRisk.evidenceSources.length > 0 ? selectedRisk.evidenceSources : ["教师观察、成长记录、家庭反馈已纳入 trace。"]).slice(0, 4).map((item) => (
                        <li key={item} className="break-words">{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[14px] bg-white p-3 ring-1 ring-[#E8ECF7]">
                    <p className="text-xs font-bold text-[#172554]">园内动作</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#596681]">
                      {(selectedRisk.schoolActions.length > 0 ? selectedRisk.schoolActions : selectedRisk.governanceActions).slice(0, 3).map((item) => (
                        <li key={item} className="break-words">{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[14px] bg-white p-3 ring-1 ring-[#E8ECF7]">
                    <p className="text-xs font-bold text-[#172554]">家庭反馈</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#596681]">
                      {(selectedRisk.feedbackNotes.length > 0 ? selectedRisk.feedbackNotes : selectedRisk.familyActions).slice(0, 3).map((item) => (
                        <li key={item} className="break-words">{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 rounded-[14px] border border-orange-100 bg-orange-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-orange-700">
                    <Clock3 className="h-4 w-4" />
                    48 小时复查
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-orange-800">
                    {(selectedRisk.followUpActions.length > 0 ? selectedRisk.followUpActions : ["48 小时内复查并回填园内承接结果。"]).slice(0, 3).map((item) => (
                      <li key={item} className="break-words">{item}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-sm text-[#7A86A6]">暂无可展示的风险详情。</p>
            )}
          </div>

          <div className="space-y-4">
            <section id="admin-review-48h-tasks" data-testid="admin-review-48h-tasks" className="rounded-[16px] border border-[#E8ECF7] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[#172554]">48 小时复查任务</h3>
                <ReplicaPill tone="orange">{governanceDemo.reviewTasks48h.length} 项</ReplicaPill>
              </div>
              <div className="mt-3 space-y-3">
                {governanceDemo.reviewTasks48h.slice(0, 4).map((task) => (
                  <article key={task.id} className="rounded-[14px] bg-[#FBFCFF] p-3 ring-1 ring-[#E8ECF7]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-xs font-bold text-[#172554]">{task.title}</p>
                        <p className="mt-1 text-[11px] text-[#7A86A6]">{task.childName} · {task.ownerLabel} · {task.dueLabel}</p>
                      </div>
                      <ReplicaPill tone={task.statusLabel === "已闭环" ? "green" : "orange"}>{task.statusLabel}</ReplicaPill>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#596681]">{task.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <section data-testid="admin-governance-actions" className="rounded-[16px] border border-[#E8ECF7] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[#172554]">园内治理动作</h3>
                <ListChecks className="h-4 w-4 text-[#635BFF]" />
              </div>
              <div className="mt-3 space-y-3">
                {governanceDemo.governanceActions.map((action) => (
                  <a
                    key={action.id}
                    href={action.href}
                    className="block rounded-[14px] bg-[#FBFCFF] p-3 ring-1 ring-[#E8ECF7] transition hover:bg-white hover:ring-[#C8CEF4]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-xs font-bold text-[#172554]">{action.title}</p>
                        <p className="mt-1 text-[11px] text-[#7A86A6]">{action.targetName} · {action.ownerLabel}</p>
                      </div>
                      <ReplicaPill tone={governanceActionTone(action)}>{action.statusLabel}</ReplicaPill>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#596681]">{action.detail}</p>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </ReplicaPanel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <ReplicaPanel className="overflow-hidden" bodyClassName="p-0">
            <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-[#6463FF] via-[#6D7CFF] to-[#9DD7FF] px-6 py-6 text-white">
              <div className="relative z-10 max-w-[520px]">
                <h2 className="text-xl font-bold">本周机构核心摘要</h2>
                <p className="mt-4 text-sm leading-7 text-white/90">
                  {weeklyReportLoading ? "正在生成本周运营摘要..." : weeklySummary}
                </p>
                {weeklyReportError ? <p className="mt-2 text-xs text-white/80">{weeklyReportError}</p> : null}
                <p data-testid="admin-api-summary" className="mt-2 text-xs font-semibold text-white/80">
                  {apiMetricSource}
                </p>
              </div>
              <Image
                src={directorReplicaAssets.dashboardCluster}
                alt=""
                width={320}
                height={190}
                unoptimized
                className="pointer-events-none absolute right-5 top-4 hidden h-[170px] w-[220px] rounded-xl object-cover object-top opacity-30 md:block"
              />
            </div>
            <div className="grid gap-0 border-t border-[#E7EBF7] bg-white lg:grid-cols-4">
              {metrics.map((metric, index) => (
                <div key={metric.label} className={index > 0 ? "border-t border-[#E7EBF7] lg:border-l lg:border-t-0" : ""}>
                  <ReplicaMetricLink {...metric} />
                </div>
              ))}
            </div>
          </ReplicaPanel>

          <div data-testid="r03-admin-chart-suite" className="grid gap-5 xl:grid-cols-2">
            <ReplicaPanel title="全园运营趋势" actions={<ReplicaPill tone="purple">真实记录 7 天</ReplicaPill>}>
              <ReplicaLineChart
                data={operationTrendRows}
                testId="r03-admin-trend-chart"
                yUnit="%"
                series={[
                  { key: "attendance", label: "出勤趋势", color: replicaChartColors.primary, unit: "%" },
                  { key: "health", label: "健康异常趋势", color: replicaChartColors.red, unit: "%" },
                  { key: "diet", label: "饮食完成率", color: replicaChartColors.amber, unit: "%" },
                  { key: "growth", label: "成长行为趋势", color: replicaChartColors.green, unit: "%" },
                ]}
              />
            </ReplicaPanel>
            <ReplicaPanel title="风险儿童与待办分布" actions={<ReplicaPill tone="orange">风险分布</ReplicaPill>}>
              <ReplicaDonutChart
                data={riskDistributionRows}
                testId="r03-admin-risk-donut"
                totalLabel="风险/待办"
                unit="项"
              />
            </ReplicaPanel>
            <ReplicaPanel title="班级运营对比" actions={<ReplicaPill tone="blue">36/18/18 基线</ReplicaPill>}>
              <ReplicaBarChart
                data={classComparisonRows}
                testId="r03-admin-class-comparison"
                series={[
                  { key: "children", label: "班级人数", color: replicaChartColors.primary, unit: "人" },
                  { key: "health", label: "晨检异常", color: replicaChartColors.red, unit: "项" },
                  { key: "meal", label: "饮食记录", color: replicaChartColors.amber, unit: "条" },
                  { key: "growth", label: "成长记录", color: replicaChartColors.green, unit: "条" },
                ]}
              />
            </ReplicaPanel>
            <ReplicaPanel title="反馈与派单闭环" actions={<ReplicaPill tone="green">闭环统计</ReplicaPill>}>
              <ReplicaComboChart
                data={closureChartRows}
                testId="r03-admin-closure-combo"
                series={[
                  { key: "total", label: "应处理", color: replicaChartColors.sky, unit: "项" },
                  { key: "done", label: "已闭环", color: replicaChartColors.green, unit: "项" },
                  { key: "rate", label: "完成率", color: replicaChartColors.primary, kind: "line", unit: "%" },
                ]}
              />
            </ReplicaPanel>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <ReplicaPanel title="关键趋势分析" actions={<ReplicaPill tone="purple">出勤趋势</ReplicaPill>}>
              <div className="mb-5 flex flex-wrap gap-3">
                {trendTabs.map((tab, index) => (
                  <span
                    key={tab}
                    className={
                      index === 0
                        ? "rounded-lg bg-[#F0EFFF] px-3 py-1.5 text-xs font-semibold text-[#635BFF]"
                        : "rounded-lg px-3 py-1.5 text-xs font-semibold text-[#7A86A6]"
                    }
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <MiniLineChart data={home.attendanceTrendSeries} labels={home.trendLabels} />
            </ReplicaPanel>

            <ReplicaPanel title="本周分布概览">
              {home.classDistribution.length > 0 ? (
                <DonutChart totalLabel="在园儿童" totalValue={`${scope.visibleChildren}人`} segments={home.classDistribution} />
              ) : (
                <div className="rounded-[15px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-5 text-sm text-[#7A86A6]">
                  暂无可展示的班级分布数据。
                </div>
              )}
            </ReplicaPanel>
          </div>

          <ReplicaPanel title="闭环进度总览" actions={<ReplicaPill tone="blue">本周待办 {home.pendingItems.length} 项</ReplicaPill>}>
            <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
              <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-2">
                {closureSteps.map((step, index) => (
                  <div key={step.label} className="rounded-[15px] bg-[#F8FAFF] p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEEFFF] text-[#635BFF]">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-xs text-[#7A86A6]">{step.label}</p>
                        <p className="mt-1 text-xl font-bold text-[#172554]">{step.value}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-[#23B26D]">{step.status}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:hidden">
                {home.priorityTopItems.length > 0 ? home.priorityTopItems.slice(0, 3).map((item) => (
                  <article key={item.id} className="rounded-[15px] border border-[#E8ECF7] bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#7A86A6]">事项内容</p>
                        <p className="mt-1 break-words text-sm font-bold leading-6 text-[#172554]">{item.recommendedAction}</p>
                      </div>
                      <ReplicaPill tone={priorityTone(item.priorityLevel)}>{item.priorityLevel}</ReplicaPill>
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs text-[#596681]">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="shrink-0 text-[#7A86A6]">关联对象</dt>
                        <dd className="min-w-0 break-words text-right font-semibold text-[#172554]">{item.targetName}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="shrink-0 text-[#7A86A6]">截止时间</dt>
                        <dd className="font-semibold text-[#172554]">{item.recommendedDeadline.slice(5, 16)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="shrink-0 text-[#7A86A6]">状态</dt>
                        <dd><ReplicaPill tone="blue">待派单</ReplicaPill></dd>
                      </div>
                    </dl>
                  </article>
                )) : (
                  <div className="rounded-[15px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-5 text-center text-sm text-[#7A86A6]">
                    当前没有进入高优先级列表的待办事项。
                  </div>
                )}
              </div>
              <div className="hidden overflow-x-auto rounded-[15px] border border-[#E8ECF7] md:block">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-[#F8FAFF] text-xs text-[#7A86A6]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">事项内容</th>
                      <th className="px-4 py-3 font-semibold">关联对象</th>
                      <th className="px-4 py-3 font-semibold">优先级</th>
                      <th className="px-4 py-3 font-semibold">截止时间</th>
                      <th className="px-4 py-3 font-semibold">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1F8] text-[#596681]">
                    {home.priorityTopItems.length > 0 ? home.priorityTopItems.slice(0, 3).map((item) => {
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-semibold text-[#172554]">{item.recommendedAction}</td>
                          <td className="px-4 py-3">{item.targetName}</td>
                          <td className="px-4 py-3">
                            <ReplicaPill tone={priorityTone(item.priorityLevel)}>{item.priorityLevel}</ReplicaPill>
                          </td>
                          <td className="px-4 py-3">{item.recommendedDeadline.slice(5, 16)}</td>
                          <td className="px-4 py-3">
                            <ReplicaPill tone="blue">待派单</ReplicaPill>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#7A86A6]">
                          当前没有进入高优先级列表的待办事项。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </ReplicaPanel>
        </div>

        <aside className="space-y-5">
          <ReplicaPanel title="风险与预警" actions={<ReplicaPill tone="slate">真实数据</ReplicaPill>}>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-[15px] border border-red-100 bg-red-50 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-semibold text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  风险预警
                </span>
                <strong className="text-xl text-red-600">{scope.healthAbnormalCount}项</strong>
              </div>
              <div className="flex items-center justify-between rounded-[15px] border border-orange-100 bg-orange-50 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-semibold text-orange-600">
                  <UsersRound className="h-4 w-4" />
                  关注儿童
                </span>
                <strong className="text-xl text-orange-600">{riskChildrenCount}人</strong>
              </div>
              <div className="flex items-center justify-between rounded-[15px] border border-blue-100 bg-blue-50 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-semibold text-blue-600">
                  <ClipboardCheck className="h-4 w-4" />
                  待跟进事项
                </span>
                <strong className="text-xl text-blue-600">{pendingDispatchCount}项</strong>
              </div>
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="AI 洞察建议" actions={<ReplicaPill tone="purple">AI</ReplicaPill>}>
            <p className="text-sm leading-7 text-[#596681]">
              {home.weeklyHighlights[0] ?? home.actionEntrySummary}
            </p>
            <ReplicaButtonLink href="/admin/agent" className="mt-5 w-full">
              查看完整 AI 分析
            </ReplicaButtonLink>
          </ReplicaPanel>

          <ReplicaPanel title="儿童档案抽屉" description="混合参考儿童档案管理面板，用于园长快速定位。">
            <div className="space-y-3">
              {home.childArchiveRows.length > 0 ? home.childArchiveRows.map((row) => (
                <div key={row.id} className="rounded-[15px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[#172554]">{row.name}</p>
                      <p className="mt-1 text-xs text-[#7A86A6]">
                        {row.className} · {row.age} · {row.guardian}
                      </p>
                    </div>
                    <ReplicaPill tone={row.status === "P1" ? "red" : row.status === "P2" ? "orange" : "green"}>{row.status}</ReplicaPill>
                  </div>
                  <p className="mt-3 text-xs text-[#596681]">{row.health}</p>
                </div>
              )) : (
                <div className="rounded-[15px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                  当前没有可展示的幼儿档案。
                </div>
              )}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="本周家园反馈">
            <div className="rounded-[18px] bg-gradient-to-br from-[#F3F0FF] to-white p-6 text-center">
              <p className="text-[44px] font-bold leading-none text-[#635BFF]">{scope.feedbackCompletionRate}%</p>
              <p className="mt-2 text-sm font-semibold text-[#172554]">完成率</p>
              <p className="mt-3 text-xs text-[#7A86A6]">
                {feedbackExpectedCount > 0 ? `已完成 ${feedbackCompletedCount} / 应完成 ${feedbackExpectedCount}` : "暂无绑定家长反馈对象"}
              </p>
              {latestFamilyFeedback && feedbackWritebackRows.length === 0 ? (
                <article
                  data-testid="admin-family-feedback-writeback"
                  className="mt-5 rounded-[15px] border border-[#DCE5FF] bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#172554]">
                        {latestFamilyFeedback.childName} · 家庭执行结果
                      </p>
                      <p className="mt-1 text-xs text-[#7A86A6]">
                        {latestFamilyFeedback.className} · {latestFamilyFeedback.submittedAtLabel}
                      </p>
                    </div>
                    <ReplicaPill tone="green">已回流</ReplicaPill>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-[#596681]">
                    <div className="flex items-center justify-between gap-3">
                      <dt>执行</dt>
                      <dd className="text-right font-semibold text-[#172554]">{latestFamilyFeedback.executionStatusLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>孩子反应</dt>
                      <dd className="text-right font-semibold text-[#172554]">{latestFamilyFeedback.childReactionLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>效果</dt>
                      <dd className="text-right font-semibold text-[#172554]">{latestFamilyFeedback.improvementStatusLabel}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#596681]">
                    {latestFamilyFeedback.notes}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-[#23B26D]">{latestFamilyFeedback.sourceLabel}</p>
                </article>
              ) : null}
              <div id="admin-family-feedback-flow" data-testid="admin-family-feedback-flow" className="mt-5 space-y-3 text-left">
                <p className="text-sm font-bold text-[#172554]">家庭反馈回流情况</p>
                {feedbackWritebackRows.slice(0, 4).map((feedback) => (
                  <article
                    key={feedback.feedbackId}
                    data-testid="admin-family-feedback-writeback"
                    className="rounded-[15px] border border-[#DCE5FF] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold text-[#172554]">
                          {feedback.childName} · 家庭执行结果
                        </p>
                        <p className="mt-1 text-xs text-[#7A86A6]">
                          {feedback.className} · {feedback.submittedAtLabel}
                        </p>
                      </div>
                      <ReplicaPill tone="green">已回流</ReplicaPill>
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs text-[#596681]">
                      <div className="flex items-center justify-between gap-3">
                        <dt>执行</dt>
                        <dd className="text-right font-semibold text-[#172554]">{feedback.executionStatusLabel}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt>孩子反应</dt>
                        <dd className="text-right font-semibold text-[#172554]">{feedback.childReactionLabel}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt>效果</dt>
                        <dd className="text-right font-semibold text-[#172554]">{feedback.improvementStatusLabel}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#596681]">
                      {feedback.notes}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-[#23B26D]">{feedback.sourceLabel}</p>
                  </article>
                ))}
              </div>
              <ReplicaButton data-testid="admin-open-feedback-detail" onClick={onOpenFeedbackDetail} variant="soft" className="mt-5 w-full">
                查看反馈详情
              </ReplicaButton>
            </div>
          </ReplicaPanel>

          <ReplicaPanel
            title="家园沟通汇总"
            description="来自 messages / conversations 持久层。"
            actions={<ReplicaPill tone={communicationSummary.pendingThreads > 0 ? "orange" : "green"}>{communicationSummary.pendingThreads} 待回复</ReplicaPill>}
          >
            <div data-testid="admin-communication-summary" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["总会话", communicationSummary.totalThreads],
                  ["待教师回复", communicationSummary.pendingThreads],
                  ["已回复", communicationSummary.repliedThreads],
                  ["已处理", communicationSummary.handledThreads],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-[15px] border border-[#E8ECF7] bg-[#FBFCFF] px-3 py-3">
                    <p className="text-xl font-bold text-[#172554]">{value}</p>
                    <p className="mt-1 text-xs text-[#7A86A6]">{label}</p>
                  </div>
                ))}
              </div>

              {communicationSummary.classBreakdown.length > 0 ? (
                <div className="space-y-2">
                  {communicationSummary.classBreakdown.map((item) => (
                    <div key={item.classId} className="flex items-center justify-between rounded-[14px] bg-[#F6F8FC] px-3 py-2 text-xs text-[#596681]">
                      <span>{item.classId}</span>
                      <span>
                        {item.totalThreads} 条 · 待回复 {item.pendingThreads} · 已处理 {item.handledThreads}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[15px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                  当前没有真实家园沟通消息。
                </div>
              )}

              <div className="space-y-3">
                {communicationSummary.recentThreads.map((thread) => (
                  <div key={thread.conversationId} className="rounded-[15px] border border-[#E8ECF7] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-[#172554]">
                          {thread.childName} · {thread.classId}
                        </p>
                        <p className="mt-1 text-xs text-[#7A86A6]">
                          {formatHomeSchoolTime(thread.updatedAt)} · {thread.status === "pending" ? "待教师回复" : thread.status === "handled" ? "已处理" : "已回复"}
                        </p>
                      </div>
                      {thread.status !== "handled" ? (
                        <ReplicaButton
                          data-testid="admin-mark-communication-handled"
                          variant="soft"
                          className="h-8 px-3 text-xs"
                          onClick={() => onMarkCommunicationHandled(thread.conversationId)}
                        >
                          标记处理
                        </ReplicaButton>
                      ) : (
                        <ReplicaPill tone="green">已处理</ReplicaPill>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#596681]">
                      {thread.latestMessage?.content ?? "暂无消息正文"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </ReplicaPanel>
        </aside>
      </div>
    </DirectorReplicaPage>
  );
}
