"use client";

import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  Download,
  HeartPulse,
  RefreshCw,
  Share2,
  Sparkles,
  Utensils,
} from "lucide-react";
import type { AdminAgentActionItem, AdminAgentResult } from "@/lib/agent/admin-types";
import {
  directorReplicaAssets,
} from "./directorReplicaData";
import {
  DirectorReplicaPage,
  DonutChart,
  MiniLineChart,
  ReplicaButton,
  ReplicaMetric,
  ReplicaPanel,
  ReplicaPill,
  ReplicaUnavailableButton,
} from "./DirectorReplicaPrimitives";

function priorityTone(priority: string) {
  if (priority === "P1" || priority === "高") return "red" as const;
  if (priority === "P2" || priority === "中") return "orange" as const;
  return "blue" as const;
}

export default function DirectorWeeklyReportReplica({
  institutionName,
  result,
  loading,
  requestError,
  dispatchAvailable,
  dispatchStatusMessage,
  trendLabels,
  attendanceTrendSeries,
  classDistribution,
  onRerun,
  onSwitchDaily,
  onCreateDispatch,
  isCreatingNotification,
}: {
  institutionName: string;
  result: AdminAgentResult | null;
  loading: boolean;
  requestError: string | null;
  dispatchAvailable: boolean;
  dispatchStatusMessage: string;
  trendLabels: string[];
  attendanceTrendSeries: number[];
  classDistribution: Array<{ label: string; value: number; detail: string; color: string }>;
  onRerun: () => void;
  onSwitchDaily: () => void;
  onCreateDispatch: (actionItem: AdminAgentActionItem) => void;
  isCreatingNotification: (actionItemId: string) => boolean;
}) {
  const scope = result?.institutionScope;
  const actionItems = result?.actionItems ?? [];
  const feedbackExpectedCount = scope?.feedbackExpectedChildCount ?? 0;
  const feedbackCompletedCount = scope?.feedbackCompletedChildCount ?? 0;
  const summary = result?.summary ?? (loading ? "正在生成本周运营报表..." : "暂无周报结果，请重新生成。");

  const metrics = [
    {
      label: "出勤管理",
      value: `${scope?.todayAttendanceRate ?? scope?.attendanceRate ?? 0}%`,
      subValue: `出勤 ${scope?.todayPresentCount ?? 0} / 应出勤 ${scope?.visibleChildren ?? 0}`,
      icon: <CalendarCheck2 className="h-4 w-4" />,
      tone: "blue" as const,
    },
    {
      label: "健康管理",
      value: `${scope?.healthAbnormalCount ?? 0}项`,
      subValue: `近 7 天异常记录 ${scope?.healthAbnormalCount ?? 0} 项`,
      icon: <HeartPulse className="h-4 w-4" />,
      tone: "purple" as const,
    },
    {
      label: "家园反馈",
      value: `${scope?.feedbackCompletionRate ?? 0}%`,
      subValue: feedbackExpectedCount > 0 ? `完成 ${feedbackCompletedCount} / 应完成 ${feedbackExpectedCount}` : "暂无绑定家长反馈对象",
      icon: <Utensils className="h-4 w-4" />,
      tone: "orange" as const,
    },
    {
      label: "成长发展",
      value: `${scope?.growthAttentionCount ?? 0}项`,
      subValue: `待复盘 ${scope?.pendingReviewCount ?? 0} 项`,
      icon: <Activity className="h-4 w-4" />,
      tone: "green" as const,
    },
  ];

  return (
    <DirectorReplicaPage
      eyebrow={`园长周报工作区 · ${institutionName}`}
      title="园长周报工作区"
      description="数据统计周期：周一 00:00 - 周日 24:00。复刻运营报表总览、风险趋势、指标卡片与待跟进事项。"
      actions={
        <>
          <ReplicaUnavailableButton variant="outline">
            <Download className="h-4 w-4" />
            导出周报
          </ReplicaUnavailableButton>
          <ReplicaUnavailableButton variant="outline">
            <Share2 className="h-4 w-4" />
            分享周报
          </ReplicaUnavailableButton>
          <ReplicaButton onClick={onRerun} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新生成周报
          </ReplicaButton>
        </>
      }
    >
      {requestError ? (
        <div className="rounded-[16px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {requestError}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_1.08fr]">
            <ReplicaPanel className="overflow-hidden" bodyClassName="p-0">
              <div className="relative min-h-[160px] overflow-hidden px-6 py-6">
                <div className="relative z-10 max-w-[260px]">
                  <ReplicaPill tone="purple">本周核心摘要</ReplicaPill>
                  <p className="mt-4 text-sm leading-7 text-[#596681]">{loading ? "正在生成本周运营报表..." : summary}</p>
                </div>
                <Image
                  src={directorReplicaAssets.weeklyChartDecoration}
                  alt=""
                  width={260}
                  height={160}
                  unoptimized
                  className="absolute right-5 top-5 hidden h-[112px] w-[96px] rounded-xl object-cover object-top opacity-25 md:block"
                />
              </div>
            </ReplicaPanel>

            <ReplicaPanel title="风险与异常趋势">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[14px] border border-red-100 bg-red-50 px-4 py-3 text-red-600">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    风险预警
                  </p>
                  <p className="mt-2 text-xl font-bold">{scope?.healthAbnormalCount ?? 0}项</p>
                </div>
                <div className="rounded-[14px] border border-orange-100 bg-orange-50 px-4 py-3 text-orange-600">
                  <p className="text-sm font-semibold">关注儿童</p>
                  <p className="mt-2 text-xl font-bold">{result?.riskChildren.length ?? 0}人</p>
                </div>
                <div className="rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 text-blue-600">
                  <p className="text-sm font-semibold">待跟进事项</p>
                  <p className="mt-2 text-xl font-bold">{actionItems.length}项</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 divide-x divide-[#E8ECF7] rounded-[14px] border border-[#E8ECF7] bg-[#FBFCFF] py-3 text-center text-sm">
                <span className="text-[#596681]">真实记录</span>
                <span className="text-[#596681]">实时统计</span>
                <span className="text-[#596681]">待闭环</span>
              </div>
            </ReplicaPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            {metrics.map((metric) => (
              <ReplicaMetric key={metric.label} {...metric} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
            <ReplicaPanel title="关键趋势分析" actions={<ReplicaPill tone="purple">出勤趋势</ReplicaPill>}>
              <MiniLineChart data={attendanceTrendSeries} labels={trendLabels} />
            </ReplicaPanel>
            <ReplicaPanel title="本周分布概览">
              {classDistribution.length > 0 ? (
                <DonutChart totalLabel="在园儿童" totalValue={`${scope?.visibleChildren ?? 0}人`} segments={classDistribution} />
              ) : (
                <div className="rounded-[15px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-5 text-sm text-[#7A86A6]">
                  暂无可展示的班级分布数据。
                </div>
              )}
            </ReplicaPanel>
          </div>

          <ReplicaPanel
            title="待跟进事项"
            actions={
              <ReplicaButton variant="ghost" onClick={onSwitchDaily}>
                回到日常优先级
              </ReplicaButton>
            }
          >
            <div className="overflow-hidden rounded-[15px] border border-[#E8ECF7]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFF] text-xs text-[#7A86A6]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">事项内容</th>
                    <th className="px-4 py-3 font-semibold">关联对象</th>
                    <th className="px-4 py-3 font-semibold">优先级</th>
                    <th className="px-4 py-3 font-semibold">截止时间</th>
                    <th className="px-4 py-3 font-semibold">状态</th>
                    <th className="px-4 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1F8] text-[#596681]">
                  {actionItems.length > 0 ? (
                    actionItems.slice(0, 4).map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-semibold text-[#172554]">{row.title}</td>
                        <td className="px-4 py-3">{row.targetName}</td>
                        <td className="px-4 py-3">
                          <ReplicaPill tone={priorityTone(row.priorityLevel)}>{row.priorityLevel}</ReplicaPill>
                        </td>
                        <td className="px-4 py-3">{row.deadline}</td>
                        <td className="px-4 py-3">
                          <ReplicaPill tone={row.status === "completed" ? "green" : "blue"}>
                            {row.relatedEventId ? "已派单" : "待派单"}
                          </ReplicaPill>
                        </td>
                        <td className="px-4 py-3">
                          <ReplicaButton
                            variant="soft"
                            className="h-8 px-3 text-xs"
                            disabled={!dispatchAvailable || isCreatingNotification(row.id) || Boolean(row.relatedEventId)}
                            onClick={() => onCreateDispatch(row)}
                          >
                            {isCreatingNotification(row.id) ? "派单中" : row.relatedEventId ? "已派单" : "派单"}
                          </ReplicaButton>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#7A86A6]">
                        当前没有 AI 生成的待跟进事项。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!dispatchAvailable ? <p className="mt-3 text-xs text-orange-600">{dispatchStatusMessage}</p> : null}
          </ReplicaPanel>
        </div>

        <aside className="space-y-5">
          <ReplicaPanel title="AI 周报结论" actions={<ReplicaPill tone="purple">由 AI 助手生成</ReplicaPill>}>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEEFFF] text-[#635BFF]">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="text-sm leading-7 text-[#596681]">
                {result?.assistantAnswer ??
                  "暂无 AI 周报结论，请重新生成周报。"}
              </p>
            </div>
            <ReplicaButton onClick={onSwitchDaily} className="mt-5 w-full">
              查看完整 AI 分析
            </ReplicaButton>
          </ReplicaPanel>

          <ReplicaPanel title="本周家园反馈">
            <div className="rounded-[18px] bg-gradient-to-br from-[#F3F0FF] to-white p-6 text-center">
              <p className="text-[44px] font-bold leading-none text-[#635BFF]">{scope?.feedbackCompletionRate ?? 0}%</p>
              <p className="mt-2 text-sm font-semibold text-[#172554]">完成率</p>
              <p className="mt-3 text-xs text-[#7A86A6]">
                {feedbackExpectedCount > 0 ? `已完成 ${feedbackCompletedCount} / 应完成 ${feedbackExpectedCount}` : "暂无绑定家长反馈对象"}
              </p>
              <ReplicaUnavailableButton variant="soft" className="mt-5 w-full">
                查看反馈详情
              </ReplicaUnavailableButton>
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="周报生成状态">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-[14px] bg-[#F8FAFF] px-4 py-3">
                <span className="text-sm text-[#596681]">生成来源</span>
                <ReplicaPill tone="purple">{result?.source === "ai" ? "AI" : result?.source === "fallback" ? "兜底" : "规则"}</ReplicaPill>
              </div>
              <div className="flex items-center justify-between rounded-[14px] bg-[#F8FAFF] px-4 py-3">
                <span className="text-sm text-[#596681]">建议动作</span>
                <strong className="text-[#172554]">{actionItems.length}条</strong>
              </div>
              <div className="flex items-center justify-between rounded-[14px] bg-[#F8FAFF] px-4 py-3">
                <span className="text-sm text-[#596681]">重点儿童</span>
                <strong className="text-[#172554]">{result?.riskChildren.length ?? 0}人</strong>
              </div>
            </div>
          </ReplicaPanel>
        </aside>
      </div>
    </DirectorReplicaPage>
  );
}
