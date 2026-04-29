"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import DirectorAgentReplica from "@/components/admin/pixel-replica/DirectorAgentReplica";
import DirectorWeeklyReportReplica from "@/components/admin/pixel-replica/DirectorWeeklyReportReplica";
import EmptyState from "@/components/EmptyState";
import {
  ADMIN_AGENT_QUICK_QUESTIONS,
  attachNotificationEventToResult,
  attachNotificationEventsToResult,
  buildAdminHomeViewModel,
} from "@/lib/agent/admin-agent";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import { dedupeAdminAgentResultExposure } from "@/lib/agent/admin-home-dedupe";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import type {
  AdminAgentActionItem,
  AdminAgentRequestPayload,
  AdminAgentResult,
  AdminDispatchEvent,
} from "@/lib/agent/admin-types";
import type { AiFollowUpMessage } from "@/lib/ai/types";
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
  const {
    priorityItems: consultationPriorityItems,
    notificationEvents,
    notificationReady,
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
    localConsultations: getLatestConsultations(),
    consultationFeedOptions: {
      limit: 4,
      escalatedOnly: true,
    },
  });
  const [result, setResult] = useState<AdminAgentResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
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
          const errorMessage =
            isRecord(data) && typeof data.error === "string" ? data.error : "园长 AI 助手请求失败";
          setRequestError(errorMessage);
          setResult(null);
          return;
        }

        if (!isAdminAgentResult(data)) {
          setResult(null);
          setRequestError(
            workflow === "weekly-ops-report"
              ? "周报模式返回结构不完整，请重试或切回日常模式。"
              : "园长 AI 助手返回结构异常，请稍后重试。"
          );
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
      } catch (error) {
        console.error("[ADMIN_AGENT] Failed to run workflow", error);
        setRequestError("园长 AI 助手请求失败");
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

  if (isWeeklyMode) {
    return (
      <DirectorWeeklyReportReplica
        institutionName={INSTITUTION_NAME}
        result={displayResult}
        loading={loading}
        requestError={requestError}
        dispatchAvailable={dispatchAvailable}
        dispatchStatusMessage={safeDispatchStatusMessage}
        trendLabels={directorViewModel.trendLabels}
        attendanceTrendSeries={directorViewModel.attendanceTrendSeries}
        classDistribution={directorViewModel.classDistribution}
        onRerun={rerunCurrentMode}
        onSwitchDaily={() => switchMode("daily")}
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
