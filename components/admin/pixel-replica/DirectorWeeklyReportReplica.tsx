"use client";

import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  Download,
  FileJson,
  HeartPulse,
  RefreshCw,
  Share2,
  Sparkles,
  Utensils,
} from "lucide-react";
import type { AdminAgentActionItem, AdminAgentResult } from "@/lib/agent/admin-types";
import type { ApiWeeklyReport, WeeklyReportExportFormat } from "@/lib/api/types";
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
} from "./directorReplicaData";
import {
  DirectorReplicaPage,
  DonutChart,
  MiniLineChart,
  ReplicaButton,
  ReplicaMetric,
  ReplicaPanel,
  ReplicaPill,
} from "./DirectorReplicaPrimitives";

function priorityTone(priority: string) {
  if (priority === "P1" || priority === "高") return "red" as const;
  if (priority === "P2" || priority === "中") return "orange" as const;
  return "blue" as const;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function reportSummary(report: ApiWeeklyReport | null) {
  const payloadSummary =
    report?.payload && typeof report.payload.summary === "object" && report.payload.summary !== null
      ? (report.payload.summary as Record<string, unknown>)
      : {};
  return {
    recordCount: readNumber(payloadSummary.recordCount),
    healthAbnormalCount: readNumber(payloadSummary.healthAbnormalCount),
    highRiskConsultationCount: readNumber(payloadSummary.highRiskConsultationCount),
    unresolvedFeedbackCount: readNumber(payloadSummary.unresolvedFeedbackCount),
    childCount: readNumber(payloadSummary.childCount),
  };
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
  savedReports,
  selectedReport,
  includeArchivedReports,
  historyLoading,
  actionStatus,
  onRerun,
  onSwitchDaily,
  onSaveReport,
  onSelectReport,
  onToggleArchived,
  onExportReport,
  onShareReport,
  onArchiveReport,
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
  savedReports: ApiWeeklyReport[];
  selectedReport: ApiWeeklyReport | null;
  includeArchivedReports: boolean;
  historyLoading: boolean;
  actionStatus: string | null;
  onRerun: () => void;
  onSwitchDaily: () => void;
  onSaveReport: () => void;
  onSelectReport: (reportId: string) => void;
  onToggleArchived: () => void;
  onExportReport: (format: WeeklyReportExportFormat) => void;
  onShareReport: () => void;
  onArchiveReport: (action: "archive" | "restore") => void;
  onCreateDispatch: (actionItem: AdminAgentActionItem) => void;
  isCreatingNotification: (actionItemId: string) => boolean;
}) {
  const scope = result?.institutionScope;
  const actionItems = result?.actionItems ?? [];
  const selectedSummary = reportSummary(selectedReport);
  const canUseSelectedReport = Boolean(selectedReport);
  const feedbackExpectedCount = scope?.feedbackExpectedChildCount ?? 0;
  const feedbackCompletedCount = scope?.feedbackCompletedChildCount ?? 0;
  const summary = result?.summary ?? (loading ? "正在生成本周运营报表..." : "暂无周报结果，请重新生成。");

  const weeklyTrendRows: ReplicaChartDatum[] = trendLabels.map((label, index) => ({
    label,
    attendance: attendanceTrendSeries[index] ?? 0,
    health: scope?.healthAbnormalCount ?? 0,
    growth: scope?.growthAttentionCount ?? 0,
    feedback: scope?.feedbackCompletionRate ?? 0,
  }));
  const weeklyRiskRows: ReplicaDonutDatum[] = [
    { label: "晨检异常", value: scope?.healthAbnormalCount ?? 0, color: replicaChartColors.red },
    { label: "重点儿童", value: result?.riskChildren.length ?? 0, color: replicaChartColors.amber },
    { label: "待复盘", value: scope?.pendingReviewCount ?? 0, color: replicaChartColors.sky },
    { label: "待派单", value: actionItems.filter((item) => !item.relatedEventId).length, color: replicaChartColors.primary },
  ];
  const weeklyClassRows: ReplicaChartDatum[] = classDistribution.map((item) => ({
    label: item.label,
    children: item.value,
    risk: result?.riskChildren.filter((child) => child.className === item.label).length ?? 0,
    actions: actionItems.filter((action) => action.targetType === "class" && action.targetName === item.label).length,
  }));
  const weeklyQualityRows: ReplicaChartDatum[] = savedReports.slice(0, 6).map((report) => {
    const itemSummary = reportSummary(report);
    const completion =
      report.status === "shared" ? 100 : report.status === "generated" ? 80 : report.status === "draft" ? 50 : 0;
    return {
      label: report.periodEnd.slice(5),
      records: itemSummary.recordCount,
      abnormal: itemSummary.healthAbnormalCount,
      completion,
    };
  });
  const weeklyClosureRows: ReplicaChartDatum[] = [
    {
      label: "反馈",
      total: feedbackExpectedCount,
      done: feedbackCompletedCount,
      rate: scope?.feedbackCompletionRate ?? 0,
    },
    {
      label: "派单",
      total: actionItems.length,
      done: actionItems.filter((item) => item.relatedEventId || item.status === "completed").length,
      rate:
        actionItems.length > 0
          ? Math.round(
              (actionItems.filter((item) => item.relatedEventId || item.status === "completed").length /
                actionItems.length) *
                100
            )
          : 0,
    },
    {
      label: "周报",
      total: savedReports.length,
      done: savedReports.filter((report) => report.status === "shared" || report.status === "generated").length,
      rate:
        savedReports.length > 0
          ? Math.round(
              (savedReports.filter((report) => report.status === "shared" || report.status === "generated").length /
                savedReports.length) *
                100
            )
          : 0,
    },
  ];

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
          <ReplicaButton
            variant="outline"
            disabled={!canUseSelectedReport || actionStatus?.startsWith("export")}
            onClick={() => onExportReport("markdown")}
          >
            <Download className="h-4 w-4" />
            导出周报
          </ReplicaButton>
          <ReplicaButton
            variant="outline"
            disabled={!canUseSelectedReport || actionStatus === "sharing"}
            onClick={onShareReport}
          >
            <Share2 className="h-4 w-4" />
            分享周报
          </ReplicaButton>
          <ReplicaButton
            variant="soft"
            disabled={actionStatus === "saving"}
            onClick={onSaveReport}
            data-testid="weekly-save-report"
          >
            <FileJson className="h-4 w-4" />
            保存周报
          </ReplicaButton>
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

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <ReplicaPanel
          title="周报历史"
          actions={
            <ReplicaButton variant="ghost" onClick={onToggleArchived} className="h-8 px-3 text-xs">
              {includeArchivedReports ? "隐藏归档" : "查看归档"}
            </ReplicaButton>
          }
        >
          <div data-testid="weekly-history-list" className="space-y-3">
            {historyLoading ? (
              <p className="rounded-[14px] bg-[#F8FAFF] p-4 text-sm text-[#7A86A6]">正在加载周报历史...</p>
            ) : savedReports.length > 0 ? (
              savedReports.slice(0, 6).map((report) => (
                <button
                  key={report.reportId}
                  type="button"
                  onClick={() => onSelectReport(report.reportId)}
                  className={`w-full rounded-[14px] border px-4 py-3 text-left text-sm transition ${
                    selectedReport?.reportId === report.reportId
                      ? "border-[#635BFF] bg-[#F5F4FF] text-[#172554]"
                      : "border-[#E8ECF7] bg-white text-[#596681] hover:border-[#C8CEF0]"
                  }`}
                >
                  <span className="block font-semibold">{report.title}</span>
                  <span className="mt-1 block text-xs">
                    {report.periodStart} - {report.periodEnd} · {report.status}
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                暂无已保存周报，生成后点击保存周报。
              </p>
            )}
          </div>
        </ReplicaPanel>

        <ReplicaPanel title="周报详情">
          <div data-testid="weekly-report-detail" className="space-y-4">
            {selectedReport ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <ReplicaMetric label="儿童" value={`${selectedSummary.childCount}`} subValue="scope" tone="blue" />
                  <ReplicaMetric label="记录" value={`${selectedSummary.recordCount}`} subValue="period" tone="green" />
                  <ReplicaMetric label="异常" value={`${selectedSummary.healthAbnormalCount}`} subValue="health" tone="purple" />
                  <ReplicaMetric label="高风险" value={`${selectedSummary.highRiskConsultationCount}`} subValue="consult" tone="orange" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["json", "markdown", "html", "share-text"] as WeeklyReportExportFormat[]).map((format) => (
                    <ReplicaButton
                      key={format}
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      disabled={Boolean(actionStatus)}
                      onClick={() => onExportReport(format)}
                      data-testid={format === "markdown" ? "weekly-export-markdown" : undefined}
                    >
                      {format}
                    </ReplicaButton>
                  ))}
                  <ReplicaButton
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    disabled={Boolean(actionStatus)}
                    onClick={onShareReport}
                    data-testid="weekly-share-report"
                  >
                    分享
                  </ReplicaButton>
                  <ReplicaButton
                    variant={selectedReport.status === "archived" ? "soft" : "outline"}
                    className="h-8 px-3 text-xs"
                    disabled={Boolean(actionStatus)}
                    onClick={() => onArchiveReport(selectedReport.status === "archived" ? "restore" : "archive")}
                    data-testid="weekly-archive-report"
                  >
                    {selectedReport.status === "archived" ? "恢复" : "归档"}
                  </ReplicaButton>
                </div>
                {selectedReport.share ? (
                  <p className="rounded-[14px] bg-[#F8FAFF] p-3 text-xs leading-5 text-[#596681]">
                    {selectedReport.share.summary}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#D8DEEF] bg-[#FBFCFF] p-4 text-sm text-[#7A86A6]">
                选择历史周报查看详情，或保存当前生成结果。
              </p>
            )}
          </div>
        </ReplicaPanel>
      </div>

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

          <div data-testid="r03-weekly-chart-suite" className="grid gap-5 xl:grid-cols-2">
            <ReplicaPanel title="周报趋势折线" actions={<ReplicaPill tone="purple">真实周报数据</ReplicaPill>}>
              <ReplicaLineChart
                data={weeklyTrendRows}
                testId="r03-weekly-trend-chart"
                yUnit="%"
                series={[
                  { key: "attendance", label: "出勤率", color: replicaChartColors.primary, unit: "%" },
                  { key: "health", label: "健康异常", color: replicaChartColors.red, unit: "项" },
                  { key: "growth", label: "成长关注", color: replicaChartColors.green, unit: "项" },
                  { key: "feedback", label: "反馈完成", color: replicaChartColors.amber, unit: "%" },
                ]}
              />
            </ReplicaPanel>
            <ReplicaPanel title="风险与派单分布" actions={<ReplicaPill tone="orange">闭环对象</ReplicaPill>}>
              <ReplicaDonutChart
                data={weeklyRiskRows}
                testId="r03-weekly-risk-donut"
                totalLabel="周报风险"
                unit="项"
              />
            </ReplicaPanel>
            <ReplicaPanel title="班级 ranking / 对比" actions={<ReplicaPill tone="blue">班级维度</ReplicaPill>}>
              <ReplicaBarChart
                data={weeklyClassRows}
                testId="r03-weekly-class-ranking"
                series={[
                  { key: "children", label: "儿童数", color: replicaChartColors.primary, unit: "人" },
                  { key: "risk", label: "重点儿童", color: replicaChartColors.amber, unit: "人" },
                  { key: "actions", label: "周报动作", color: replicaChartColors.sky, unit: "项" },
                ]}
              />
            </ReplicaPanel>
            <ReplicaPanel title="周报质量与完成度" actions={<ReplicaPill tone="green">历史周报</ReplicaPill>}>
              <ReplicaComboChart
                data={weeklyQualityRows.length > 0 ? weeklyQualityRows : weeklyClosureRows}
                testId="r03-weekly-quality-combo"
                series={[
                  { key: weeklyQualityRows.length > 0 ? "records" : "total", label: "记录量", color: replicaChartColors.sky, unit: "条" },
                  { key: weeklyQualityRows.length > 0 ? "abnormal" : "done", label: "风险/完成", color: replicaChartColors.red, unit: "项" },
                  { key: weeklyQualityRows.length > 0 ? "completion" : "rate", label: "完成度", color: replicaChartColors.primary, kind: "line", unit: "%" },
                ]}
              />
            </ReplicaPanel>
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
              <ReplicaButton onClick={onSwitchDaily} variant="soft" className="mt-5 w-full">
                查看反馈详情
              </ReplicaButton>
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
