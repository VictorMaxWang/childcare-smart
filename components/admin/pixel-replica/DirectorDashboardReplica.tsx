"use client";

import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  ClipboardCheck,
  Download,
  HeartPulse,
  RefreshCw,
  Share2,
  Utensils,
  UsersRound,
} from "lucide-react";
import type { AdminHomeViewModel, InstitutionPriorityLevel } from "@/lib/agent/admin-types";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import type { AdminCommunicationSummary } from "@/lib/communication/home-school";
import { formatHomeSchoolTime } from "@/lib/communication/home-school";
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
  ReplicaUnavailableButton,
} from "./DirectorReplicaPrimitives";

function priorityTone(level: InstitutionPriorityLevel) {
  if (level === "P1") return "red";
  if (level === "P2") return "orange";
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
  communicationSummary,
  onMarkCommunicationHandled,
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
  communicationSummary: AdminCommunicationSummary;
  onMarkCommunicationHandled: (conversationId: string) => void;
  onRefresh: () => void;
}) {
  const scope = home.adminContext.institutionScope;
  const riskChildrenCount = scope.riskChildrenCount;
  const pendingDispatchCount = scope.pendingDispatchCount;
  const weeklySummary = weeklyReport?.summary ?? home.weeklySummary;
  const latestDietCoverage = home.dietTrendSeries.at(-1) ?? 0;
  const closureSteps = [
    { label: "识别问题", value: `${home.priorityTopItems.length}`, status: home.priorityTopItems.length > 0 ? "待推进" : "暂无" },
    { label: "生成动作", value: `${home.adminContext.actionItems.length}`, status: home.adminContext.actionItems.length > 0 ? "已生成" : "暂无" },
    { label: "派单执行", value: `${pendingDispatchCount}`, status: pendingDispatchCount > 0 ? "进行中" : "暂无" },
    { label: "复盘优化", value: `${scope.pendingReviewCount}`, status: scope.pendingReviewCount > 0 ? "待复查" : "暂无" },
  ];
  const feedbackExpectedCount = scope.feedbackExpectedChildCount ?? 0;
  const feedbackCompletedCount = scope.feedbackCompletedChildCount ?? 0;

  const metrics = [
    {
      label: "出勤率",
      value: `${scope.todayAttendanceRate}%`,
      subValue: `出勤 ${scope.todayPresentCount} / 应出勤 ${scope.visibleChildren}`,
      href: "/children",
      icon: <CalendarCheck2 className="h-4 w-4" />,
      tone: "blue" as const,
    },
    {
      label: "晨检异常",
      value: `${scope.healthAbnormalCount}项`,
      subValue: `近 7 天异常记录 ${scope.healthAbnormalCount} 项`,
      href: "/health",
      icon: <HeartPulse className="h-4 w-4" />,
      tone: "purple" as const,
    },
    {
      label: "饮食记录覆盖",
      value: `${latestDietCoverage}%`,
      subValue: "按近 7 天真实饮食记录计算",
      href: "/diet",
      icon: <Utensils className="h-4 w-4" />,
      tone: "orange" as const,
    },
    {
      label: "成长关注",
      value: `${scope.growthAttentionCount}项`,
      subValue: `待复查 ${scope.pendingReviewCount} 项`,
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
          <ReplicaUnavailableButton variant="outline">
            <Download className="h-4 w-4" />
            导出周报
          </ReplicaUnavailableButton>
          <ReplicaUnavailableButton variant="outline">
            <Share2 className="h-4 w-4" />
            分享周报
          </ReplicaUnavailableButton>
          <ReplicaButton onClick={onRefresh} disabled={weeklyReportLoading}>
            <RefreshCw className={`h-4 w-4 ${weeklyReportLoading ? "animate-spin" : ""}`} />
            刷新数据
          </ReplicaButton>
        </>
      }
    >
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
              <ReplicaButtonLink href="/admin/agent?action=weekly-report" variant="soft" className="mt-5 w-full">
                查看反馈详情
              </ReplicaButtonLink>
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
