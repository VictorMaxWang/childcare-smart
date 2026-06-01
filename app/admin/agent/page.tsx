"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import { toast } from "sonner";
import DirectorAgentReplica from "@/components/admin/pixel-replica/DirectorAgentReplica";
import DirectorWeeklyReportReplica from "@/components/admin/pixel-replica/DirectorWeeklyReportReplica";
import EmptyState from "@/components/EmptyState";
import {
  ADMIN_AGENT_QUICK_QUESTIONS,
  attachNotificationEventToResult,
  attachNotificationEventsToResult,
  buildAdminHomeViewModel,
  buildAdminLocalFallbackResult,
} from "@/lib/agent/admin-agent";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import { dedupeAdminAgentResultExposure } from "@/lib/agent/admin-home-dedupe";
import { buildAdminD01HighRiskConsultation } from "@/lib/agent/admin-local-consultation-fallback";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import type {
  AdminAgentActionItem,
  AdminAgentRequestPayload,
  AdminAgentResult,
  AdminDispatchEvent,
} from "@/lib/agent/admin-types";
import type { AiFollowUpMessage } from "@/lib/ai/types";
import {
  archiveWeeklyReport,
  createWeeklyReport,
  exportWeeklyReport,
  getWeeklyReport,
  listWeeklyReports,
  shareWeeklyReport,
} from "@/lib/api/weekly-reports";
import type { ApiWeeklyReport, WeeklyReportExportFormat } from "@/lib/api/types";
import { INSTITUTION_NAME, useApp } from "@/lib/store";

type PageMode = "daily" | "weekly";

type HistoryEntry = {
  id: string;
  workflow: AdminAgentRequestPayload["workflow"];
  label: string;
  prompt?: string;
  result: AdminAgentResult;
};

function buildHistoryMessages(history: HistoryEntry[]) {
  const messages: AiFollowUpMessage[] = [];

  history.forEach((entry) => {
    if (entry.prompt) {
      messages.push({ role: "user", content: entry.prompt });
    }

    messages.push({ role: "assistant", content: entry.result.assistantAnswer });
  });

  return messages.slice(-8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAdminAgentResult(value: unknown): value is AdminAgentResult {
  if (!isRecord(value)) return false;

  return (
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.assistantAnswer === "string" &&
    isRecord(value.institutionScope) &&
    Array.isArray(value.priorityTopItems) &&
    Array.isArray(value.riskChildren) &&
    Array.isArray(value.riskClasses) &&
    Array.isArray(value.feedbackRiskItems) &&
    isStringArray(value.highlights) &&
    Array.isArray(value.actionItems) &&
    Array.isArray(value.recommendedOwnerMap) &&
    isStringArray(value.quickQuestions) &&
    Array.isArray(value.notificationEvents) &&
    typeof value.source === "string" &&
    typeof value.generatedAt === "string"
  );
}

function getPageMode(action: string | null): PageMode {
  return action === "weekly-report" ? "weekly" : "daily";
}

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function downloadTextFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export default function AdminAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageMode = getPageMode(searchParams.get("action"));
  const isWeeklyMode = pageMode === "weekly";
  const modeConfig = isWeeklyMode
    ? {
        workflow: "weekly-ops-report" as const,
        label: "本周运营周报",
      }
    : {
        workflow: "daily-priority" as const,
        label: "今日机构优先事项",
      };
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
  const adminAgentConsultations = useMemo(() => {
    const child = visibleChildren.find((item) => item.id === "c-1");
    const existing = latestConsultations.find((item) => item.childId === "c-1");
    return [
      buildAdminD01HighRiskConsultation({
        childName: child?.name,
        className: child?.className,
        generatedAt: existing?.generatedAt ?? new Date().toISOString(),
      }),
      ...latestConsultations.filter((item) => item.childId !== "c-1"),
    ];
  }, [latestConsultations, visibleChildren]);
  const {
    priorityItems: consultationPriorityItems,
    notificationEvents,
    notificationReady,
    feedStatusMessage,
    createNotification,
    createConsultationScopedNotification,
    updateNotificationStatus,
    isCreatingNotification,
    updatingEventId,
    dispatchAvailable = true,
    dispatchStatusMessage = null,
  } = useAdminConsultationWorkspace({
    institutionName: INSTITUTION_NAME,
    visibleChildren,
    localConsultations: adminAgentConsultations,
    consultationFeedOptions: {
      limit: 4,
      escalatedOnly: true,
    },
  });
  const [result, setResult] = useState<AdminAgentResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [weeklyReports, setWeeklyReports] = useState<ApiWeeklyReport[]>([]);
  const [selectedWeeklyReport, setSelectedWeeklyReport] = useState<ApiWeeklyReport | null>(null);
  const [includeArchivedReports, setIncludeArchivedReports] = useState(false);
  const [weeklyReportActionStatus, setWeeklyReportActionStatus] = useState<string | null>(null);
  const [weeklyReportHistoryLoading, setWeeklyReportHistoryLoading] = useState(false);
  const lastAutoRunModeRef = useRef<PageMode | null>(null);

  const payload = useMemo<AdminAgentRequestPayload>(
    () => ({
      workflow: "daily-priority",
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

  const switchMode = useCallback(
    (nextMode: PageMode) => {
      router.push(nextMode === "weekly" ? "/admin/agent?action=weekly-report" : "/admin/agent");
    },
    [router]
  );

  const runWorkflow = useCallback(
    async (workflow: AdminAgentRequestPayload["workflow"], options?: { question?: string; label?: string }) => {
      setLoading(true);
      setRequestError(null);
      setWorkflowNotice(null);

      function commitFallbackResult(fallbackReason: string) {
        const fallbackPayload: AdminAgentRequestPayload = {
          ...payload,
          workflow,
          question: options?.question,
          history: workflow === "question-follow-up" ? buildHistoryMessages(history) : undefined,
        };
        const nextResult = attachNotificationEventsToResult(
          buildAdminLocalFallbackResult(fallbackPayload, fallbackReason),
          notificationEvents
        );
        setResult(nextResult);
        setRequestError(null);
        setWorkflowNotice("远端 workflow 暂不可用，当前使用本地演示数据。");
        setHistory((prev) => [
          ...prev,
          {
            id: `${workflow}-${Date.now()}`,
            workflow,
            label:
              options?.label ??
              (workflow === "daily-priority"
                ? "浠婃棩鏈烘瀯浼樺厛浜嬮」"
                : workflow === "weekly-ops-report"
                  ? "鏈懆杩愯惀鍛ㄦ姤"
                  : options?.question ?? "缁х画杩介棶"),
            prompt: workflow === "question-follow-up" ? options?.question : undefined,
            result: nextResult,
          },
        ]);
      }

      try {
        const requestPayload: AdminAgentRequestPayload = {
          ...payload,
          workflow,
          question: options?.question,
          history: workflow === "question-follow-up" ? buildHistoryMessages(history) : undefined,
        };
        const response = await fetch("/api/ai/admin-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });
        const data = (await response.json()) as unknown;

        if (!response.ok) {
          if (response.status >= 500) {
            commitFallbackResult(`admin-agent-http-${response.status}`);
            return;
          }
          const errorMessage =
            isRecord(data) && typeof data.error === "string" ? data.error : "园长 AI 助手请求失败";
          setRequestError(errorMessage);
          setResult(null);
          return;
        }

        if (!isAdminAgentResult(data)) {
          commitFallbackResult("admin-agent-malformed-payload");
          return;
        }

        const nextResult = attachNotificationEventsToResult(data, notificationEvents);
        setResult(nextResult);
        setHistory((prev) => [
          ...prev,
          {
            id: `${workflow}-${Date.now()}`,
            workflow,
            label:
              options?.label ??
              (workflow === "daily-priority"
                ? "今日机构优先事项"
                : workflow === "weekly-ops-report"
                  ? "本周运营周报"
                  : options?.question ?? "继续追问"),
            prompt: workflow === "question-follow-up" ? options?.question : undefined,
            result: nextResult,
          },
        ]);
        if (data.source === "fallback") {
          setWorkflowNotice("远端 workflow 暂不可用，当前使用本地演示数据。");
        }
      } catch {
        commitFallbackResult("admin-agent-fetch-failed");
      } finally {
        setLoading(false);
      }
    },
    [history, notificationEvents, payload]
  );

  const syncEventIntoAgentState = useCallback((event: AdminDispatchEvent) => {
    setResult((previous) => (previous ? attachNotificationEventToResult(previous, event) : previous));
    setHistory((previous) =>
      previous.map((entry) => ({
        ...entry,
        result: attachNotificationEventToResult(entry.result, event),
      }))
    );
  }, []);

  useEffect(() => {
    if (visibleChildren.length === 0 || lastAutoRunModeRef.current === pageMode) return;

    lastAutoRunModeRef.current = pageMode;
    setResult(null);
    setRequestError(null);
    void runWorkflow(modeConfig.workflow, { label: modeConfig.label });
  }, [modeConfig.label, modeConfig.workflow, pageMode, runWorkflow, visibleChildren.length]);

  useEffect(() => {
    if (!notificationReady || notificationEvents.length === 0) return;

    setResult((previous) => (previous ? attachNotificationEventsToResult(previous, notificationEvents) : previous));
    setHistory((previous) =>
      previous.map((entry) => ({
        ...entry,
        result: attachNotificationEventsToResult(entry.result, notificationEvents),
      }))
    );
  }, [notificationEvents, notificationReady]);

  const refreshWeeklyReports = useCallback(async () => {
    setWeeklyReportHistoryLoading(true);
    try {
      const reports = await listWeeklyReports({ includeArchived: includeArchivedReports });
      setWeeklyReports(reports);
      setSelectedWeeklyReport((previous) => {
        if (!previous) return reports[0] ?? null;
        return reports.find((report) => report.reportId === previous.reportId) ?? reports[0] ?? null;
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "周报历史加载失败");
    } finally {
      setWeeklyReportHistoryLoading(false);
    }
  }, [includeArchivedReports]);

  useEffect(() => {
    if (!isWeeklyMode) return;
    void refreshWeeklyReports();
  }, [isWeeklyMode, refreshWeeklyReports]);

  function upsertWeeklyReport(report: ApiWeeklyReport) {
    setWeeklyReports((previous) => {
      const next = [report, ...previous.filter((item) => item.reportId !== report.reportId)];
      return includeArchivedReports ? next : next.filter((item) => item.status !== "archived");
    });
    setSelectedWeeklyReport(report);
  }

  async function handleSaveWeeklyReport() {
    const range = currentWeekRange();
    setWeeklyReportActionStatus("saving");
    setRequestError(null);
    try {
      const report = await createWeeklyReport({
        title: `${INSTITUTION_NAME} 周报 ${range.start}~${range.end}`,
        scopeType: "institution",
        scopeId: currentUser.institutionId,
        periodStart: range.start,
        periodEnd: range.end,
        summary: displayResult?.summary,
        payload: displayResult ? { adminAgentResult: displayResult } : undefined,
      });
      upsertWeeklyReport(report);
      toast.success("周报已保存归档");
    } catch (error) {
      const message = error instanceof Error ? error.message : "周报保存失败";
      setRequestError(message);
      toast.error(message);
    } finally {
      setWeeklyReportActionStatus(null);
    }
  }

  async function handleSelectWeeklyReport(reportId: string) {
    setWeeklyReportActionStatus("loading-detail");
    try {
      const report = await getWeeklyReport(reportId);
      upsertWeeklyReport(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : "周报详情加载失败";
      setRequestError(message);
      toast.error(message);
    } finally {
      setWeeklyReportActionStatus(null);
    }
  }

  async function handleExportWeeklyReport(format: WeeklyReportExportFormat) {
    if (!selectedWeeklyReport) return;
    setWeeklyReportActionStatus(`export-${format}`);
    try {
      const data = await exportWeeklyReport(selectedWeeklyReport.reportId, format);
      if (format === "share-text") {
        await copyText(data.content);
        toast.success("分享文本已复制");
      } else {
        downloadTextFile(data.filename, data.mimeType, data.content);
        toast.success("周报已导出");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "周报导出失败";
      setRequestError(message);
      toast.error(message);
    } finally {
      setWeeklyReportActionStatus(null);
    }
  }

  async function handleShareWeeklyReport() {
    if (!selectedWeeklyReport) return;
    setWeeklyReportActionStatus("sharing");
    try {
      const report = await shareWeeklyReport(selectedWeeklyReport.reportId);
      upsertWeeklyReport(report);
      await copyText(report.share?.localText ?? report.share?.summary ?? report.title);
      toast.success("周报分享文本已复制");
    } catch (error) {
      const message = error instanceof Error ? error.message : "周报分享失败";
      setRequestError(message);
      toast.error(message);
    } finally {
      setWeeklyReportActionStatus(null);
    }
  }

  async function handleArchiveWeeklyReport(action: "archive" | "restore") {
    if (!selectedWeeklyReport) return;
    setWeeklyReportActionStatus(action);
    try {
      const report = await archiveWeeklyReport(selectedWeeklyReport.reportId, action);
      upsertWeeklyReport(report);
      if (action === "archive" && !includeArchivedReports) {
        setWeeklyReports((previous) => previous.filter((item) => item.reportId !== report.reportId));
        setSelectedWeeklyReport((previous) => (previous?.reportId === report.reportId ? null : previous));
      }
      toast.success(action === "archive" ? "周报已归档" : "周报已恢复");
    } catch (error) {
      const message = error instanceof Error ? error.message : "周报归档失败";
      setRequestError(message);
      toast.error(message);
    } finally {
      setWeeklyReportActionStatus(null);
    }
  }

  async function handleCreateDispatch(actionItem: AdminAgentActionItem) {
    setRequestError(null);

    if (!dispatchAvailable) {
      setRequestError(dispatchStatusMessage ?? "通知派单暂不可用");
      return;
    }

    const nextEvent = await createNotification(actionItem.dispatchPayload, actionItem.id);
    if (!nextEvent) {
      setRequestError("派单创建失败");
      return;
    }

    syncEventIntoAgentState(nextEvent);
  }

  async function handleUpdateEventStatus(eventId: string, status: AdminDispatchEvent["status"]) {
    setRequestError(null);

    if (!dispatchAvailable) {
      setRequestError(dispatchStatusMessage ?? "通知派单暂不可用");
      return;
    }

    const nextEvent = await updateNotificationStatus(eventId, status);
    if (!nextEvent) {
      setRequestError("派单状态更新失败");
      return;
    }

    syncEventIntoAgentState(nextEvent);
  }

  async function handleCreateConsultationNotification(item: AdminConsultationPriorityItem) {
    setRequestError(null);

    if (!dispatchAvailable) {
      setRequestError(dispatchStatusMessage ?? "通知派单暂不可用");
      return;
    }

    const nextEvent = await createConsultationScopedNotification(item);
    if (!nextEvent) {
      setRequestError("会诊派单创建失败");
      return;
    }

    syncEventIntoAgentState(nextEvent);
  }

  const directorViewModel = useMemo(
    () => buildAdminHomeViewModel({ ...payload, workflow: modeConfig.workflow }),
    [modeConfig.workflow, payload]
  );

  if (visibleChildren.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<BrainCircuit className="h-6 w-6" />}
          title="当前没有可用于园长 AI 助手的机构数据"
          description="请先从园长首页确认机构数据是否已经加载。"
        />
      </div>
    );
  }

  const displayResult = result ? dedupeAdminAgentResultExposure(result, consultationPriorityItems) : null;
  const quickQuestions = displayResult?.quickQuestions ?? [...ADMIN_AGENT_QUICK_QUESTIONS];
  const rerunCurrentMode = () => void runWorkflow(modeConfig.workflow, { label: modeConfig.label });
  const safeDispatchStatusMessage = dispatchStatusMessage ?? "通知派单暂不可用";

  const serviceStatusMessage = [workflowNotice, feedStatusMessage].filter(Boolean).join(" ");

  if (isWeeklyMode) {
    return (
      <DirectorWeeklyReportReplica
        institutionName={INSTITUTION_NAME}
        result={displayResult}
        loading={loading}
        requestError={requestError}
        statusNotice={serviceStatusMessage || null}
        dispatchAvailable={dispatchAvailable}
        dispatchStatusMessage={safeDispatchStatusMessage}
        trendLabels={directorViewModel.trendLabels}
        attendanceTrendSeries={directorViewModel.attendanceTrendSeries}
        classDistribution={directorViewModel.classDistribution}
        savedReports={weeklyReports}
        selectedReport={selectedWeeklyReport}
        includeArchivedReports={includeArchivedReports}
        historyLoading={weeklyReportHistoryLoading}
        actionStatus={weeklyReportActionStatus}
        onRerun={rerunCurrentMode}
        onSwitchDaily={() => switchMode("daily")}
        onSaveReport={() => void handleSaveWeeklyReport()}
        onSelectReport={(reportId) => void handleSelectWeeklyReport(reportId)}
        onToggleArchived={() => setIncludeArchivedReports((value) => !value)}
        onExportReport={(format) => void handleExportWeeklyReport(format)}
        onShareReport={() => void handleShareWeeklyReport()}
        onArchiveReport={(action) => void handleArchiveWeeklyReport(action)}
        onCreateDispatch={(actionItem) => void handleCreateDispatch(actionItem)}
        isCreatingNotification={isCreatingNotification}
      />
    );
  }

  return (
    <DirectorAgentReplica
      institutionName={INSTITUTION_NAME}
      result={displayResult}
      quickQuestions={quickQuestions}
      loading={loading}
      requestError={requestError}
      statusNotice={serviceStatusMessage || null}
      dispatchAvailable={dispatchAvailable}
      dispatchStatusMessage={safeDispatchStatusMessage}
      notificationEvents={notificationEvents}
      consultationPriorityItems={consultationPriorityItems}
      onRerun={rerunCurrentMode}
      onOpenWeekly={() => switchMode("weekly")}
      onQuestion={(question) =>
        void runWorkflow("question-follow-up", {
          question,
          label: question,
        })
      }
      onCreateDispatch={(actionItem) => void handleCreateDispatch(actionItem)}
      onUpdateEventStatus={(eventId, status) => void handleUpdateEventStatus(eventId, status)}
      onCreateConsultationNotification={(item) => void handleCreateConsultationNotification(item)}
      isCreatingNotification={isCreatingNotification}
      isCreatingConsultationNotification={isCreatingNotification}
      updatingEventId={updatingEventId}
    />
  );
}
