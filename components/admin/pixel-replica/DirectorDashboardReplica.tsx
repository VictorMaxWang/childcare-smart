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
import {
  chartLabels,
  childArchiveRows,
  classDistribution,
  closureSteps,
  directorReplicaAssets,
  trendTabs,
  weeklyPendingRows,
  weeklyTrendSeries,
} from "./directorReplicaData";
import {
  DirectorReplicaPage,
  DonutChart,
  MiniLineChart,
  ReplicaButton,
  ReplicaButtonLink,
  ReplicaMetric,
  ReplicaPanel,
  ReplicaPill,
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
}: {
  home: AdminHomeViewModel;
  institutionName: string;
  currentUserName: string;
  todayText: string;
  weeklyReport: WeeklyReportResponse | null;
  weeklyReportLoading: boolean;
  weeklyReportError: string | null;
  weeklyReportPeriodLabel: string;
}) {
  const scope = home.adminContext.institutionScope;
  const riskChildrenCount = Math.max(scope.riskChildrenCount, home.riskChildren.length);
  const pendingDispatchCount = Math.max(scope.pendingDispatchCount, home.pendingDispatches.length);
  const weeklySummary = weeklyReport?.summary ?? home.weeklySummary;

  const metrics = [
    {
      label: "出勤率",
      value: `${scope.todayAttendanceRate || scope.attendanceRate}%`,
      subValue: `出勤 ${scope.todayPresentCount} / 应出勤 ${scope.visibleChildren}`,
      delta: "环比 ↑ 3%",
      icon: <CalendarCheck2 className="h-4 w-4" />,
      tone: "blue" as const,
    },
    {
      label: "晨检异常率",
      value: `${scope.healthAbnormalCount || 1.2}%`,
      subValue: `异常 ${scope.healthAbnormalCount || 1} / 应检 ${Math.max(scope.visibleChildren - 24, 1)}`,
      delta: "环比 ↓ 0.6%",
      icon: <HeartPulse className="h-4 w-4" />,
      tone: "purple" as const,
    },
    {
      label: "饮食均衡率",
      value: "88%",
      subValue: "均衡 92 / 应评估 105",
      delta: "环比 ↑ 2%",
      icon: <Utensils className="h-4 w-4" />,
      tone: "orange" as const,
    },
    {
      label: "活动参与率",
      value: "92%",
      subValue: "参与 110 / 应参与 120",
      delta: "环比 ↑ 4%",
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
          <ReplicaButton variant="outline">
            <Download className="h-4 w-4" />
            导出周报
          </ReplicaButton>
          <ReplicaButton variant="outline">
            <Share2 className="h-4 w-4" />
            分享周报
          </ReplicaButton>
          <ReplicaButtonLink href="/admin/agent?action=weekly-report">
            <RefreshCw className="h-4 w-4" />
            刷新数据
          </ReplicaButtonLink>
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
                  <ReplicaMetric {...metric} />
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
              <MiniLineChart data={weeklyTrendSeries} labels={chartLabels} />
            </ReplicaPanel>

            <ReplicaPanel title="本周分布概览">
              <DonutChart totalLabel="在园儿童" totalValue={`${scope.visibleChildren || 108}人`} segments={classDistribution} />
            </ReplicaPanel>
          </div>

          <ReplicaPanel title="闭环进度总览" actions={<ReplicaPill tone="blue">本周待办 {Math.max(home.pendingItems.length, 5)} 项</ReplicaPill>}>
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
              <div className="overflow-hidden rounded-[15px] border border-[#E8ECF7]">
                <table className="w-full text-left text-sm">
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
                    {(home.priorityTopItems.length ? home.priorityTopItems.slice(0, 3) : weeklyPendingRows).map((item) => {
                      const isPriority = "targetName" in item;
                      return (
                        <tr key={isPriority ? item.id : item.title}>
                          <td className="px-4 py-3 font-semibold text-[#172554]">{isPriority ? item.recommendedAction : item.title}</td>
                          <td className="px-4 py-3">{isPriority ? item.targetName : item.target}</td>
                          <td className="px-4 py-3">
                            <ReplicaPill tone={isPriority ? priorityTone(item.priorityLevel) : item.priority === "高" ? "red" : "orange"}>
                              {isPriority ? item.priorityLevel : item.priority}
                            </ReplicaPill>
                          </td>
                          <td className="px-4 py-3">{isPriority ? item.recommendedDeadline.slice(5, 16) : item.deadline}</td>
                          <td className="px-4 py-3">
                            <ReplicaPill tone="blue">{isPriority ? "待派单" : item.status}</ReplicaPill>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </ReplicaPanel>
        </div>

        <aside className="space-y-5">
          <ReplicaPanel title="风险与预警" actions={<ReplicaPill tone="slate">较上周变化 ↓ 1项</ReplicaPill>}>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-[15px] border border-red-100 bg-red-50 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-semibold text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  风险预警
                </span>
                <strong className="text-xl text-red-600">{Math.max(scope.healthAbnormalCount, 1)}项</strong>
              </div>
              <div className="flex items-center justify-between rounded-[15px] border border-orange-100 bg-orange-50 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-semibold text-orange-600">
                  <UsersRound className="h-4 w-4" />
                  关注儿童
                </span>
                <strong className="text-xl text-orange-600">{Math.max(riskChildrenCount, 3)}人</strong>
              </div>
              <div className="flex items-center justify-between rounded-[15px] border border-blue-100 bg-blue-50 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-semibold text-blue-600">
                  <ClipboardCheck className="h-4 w-4" />
                  待跟进事项
                </span>
                <strong className="text-xl text-blue-600">{Math.max(pendingDispatchCount, 5)}项</strong>
              </div>
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="AI 洞察建议" actions={<ReplicaPill tone="purple">AI</ReplicaPill>}>
            <p className="text-sm leading-7 text-[#596681]">
              本周整体运营保持稳定，出勤与健康状况良好，饮食均衡率与活动参与率较上周小幅提升。建议继续关注个别儿童睡眠与饮水情况。
            </p>
            <ReplicaButtonLink href="/admin/agent" className="mt-5 w-full">
              查看完整 AI 分析
            </ReplicaButtonLink>
          </ReplicaPanel>

          <ReplicaPanel title="儿童档案抽屉" description="混合参考儿童档案管理面板，用于园长快速定位。">
            <div className="space-y-3">
              {childArchiveRows.map((row) => (
                <div key={row.name} className="rounded-[15px] border border-[#E8ECF7] bg-[#FBFCFF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[#172554]">{row.name}</p>
                      <p className="mt-1 text-xs text-[#7A86A6]">
                        {row.className} · {row.age} · {row.guardian}
                      </p>
                    </div>
                    <ReplicaPill tone={row.status === "待跟进" ? "orange" : "green"}>{row.status}</ReplicaPill>
                  </div>
                  <p className="mt-3 text-xs text-[#596681]">{row.health}</p>
                </div>
              ))}
            </div>
          </ReplicaPanel>

          <ReplicaPanel title="本周家园反馈">
            <div className="rounded-[18px] bg-gradient-to-br from-[#F3F0FF] to-white p-6 text-center">
              <p className="text-[44px] font-bold leading-none text-[#635BFF]">{scope.feedbackCompletionRate || 100}%</p>
              <p className="mt-2 text-sm font-semibold text-[#172554]">完成率</p>
              <p className="mt-3 text-xs text-[#7A86A6]">已完成 96 / 应完成 96</p>
              <ReplicaButtonLink href="/admin/agent?action=weekly-report" variant="soft" className="mt-5 w-full">
                查看反馈详情
              </ReplicaButtonLink>
            </div>
          </ReplicaPanel>
        </aside>
      </div>
    </DirectorReplicaPage>
  );
}
