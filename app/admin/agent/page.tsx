"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BrainCircuit,
  ClipboardList,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  AdminActionDock,
  AdminBand,
  AdminDataItem,
  AdminEmptyState,
  AdminSubsection,
  type AdminTone,
} from "@/components/admin/AdminVisuals";
import RiskPriorityBoard from "@/components/admin/RiskPriorityBoard";
import EmptyState from "@/components/EmptyState";
import {
  AgentWorkspaceCard,
  InlineLinkButton,
  MetricGrid,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADMIN_AGENT_QUICK_QUESTIONS,
  attachNotificationEventToResult,
  attachNotificationEventsToResult,
} from "@/lib/agent/admin-agent";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import { dedupeAdminAgentResultExposure } from "@/lib/agent/admin-home-dedupe";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import type {
  AdminAgentActionItem,
  AdminAgentRequestPayload,
  AdminAgentResult,
  AdminDispatchEvent,
  InstitutionPriorityItem,
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

function getPriorityTone(level: InstitutionPriorityItem["priorityLevel"]): AdminTone {
  if (level === "P1") return "amber";
  if (level === "P2") return "sky";
  return "slate";
}

function getResultSourceLabel(source: string) {
  if (source === "ai" || source === "vivo") return "智能生成";
  if (source === "mock") return "演示结果";
  if (source === "fallback") return "本地兜底";
  return "已整理结果";
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionEventStatus(
  status: AdminAgentActionItem["status"]
): AdminDispatchEvent["status"] {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  return "pending";
}

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

function RequestErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,16,40,0.94),rgba(12,11,30,0.88))] px-4 py-3 text-sm text-white/78 shadow-[var(--shadow-card)]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
      <p>{message}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <AdminEmptyState tone="indigo" className="flex items-center gap-3">
      <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
      <span>{label}</span>
    </AdminEmptyState>
  );
}

function ActionItemCard({
  item,
  dispatchAvailable,
  dispatchStatusMessage,
  isCreating,
  onCreateDispatch,
}: {
  item: AdminAgentActionItem;
  dispatchAvailable: boolean;
  dispatchStatusMessage: string;
  isCreating: boolean;
  onCreateDispatch: (item: AdminAgentActionItem) => Promise<void>;
}) {
  return (
    <AdminDataItem
      tone={getPriorityTone(item.priorityLevel)}
      title={item.title}
      description={item.summary}
      badge={<PriorityLevelBadge level={item.priorityLevel} />}
      meta={
        <>
          <p>责任人：{item.ownerLabel}</p>
          <p>截止时间：{item.deadline}</p>
        </>
      }
      footer={
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={getActionEventStatus(item.status)} />
            <Badge variant="outline">{item.targetName}</Badge>
          </div>
          {dispatchAvailable ? (
            <Button
              type="button"
              size="sm"
              variant="premium"
              onClick={() => void onCreateDispatch(item)}
              disabled={isCreating || Boolean(item.relatedEventId)}
            >
              {isCreating ? "创建中…" : item.relatedEventId ? "已创建派单" : "生成派单"}
            </Button>
          ) : (
            <Badge variant="outline">{dispatchStatusMessage}</Badge>
          )}
        </div>
      }
    >
      <p className="text-sm leading-6 text-white/68">{item.action}</p>
    </AdminDataItem>
  );
}

function NotificationEventCard({
  event,
  dispatchAvailable,
  updatingEventId,
  onUpdateEventStatus,
}: {
  event: AdminDispatchEvent;
  dispatchAvailable: boolean;
  updatingEventId: string | null;
  onUpdateEventStatus: (
    eventId: string,
    status: AdminDispatchEvent["status"]
  ) => Promise<void>;
}) {
  return (
    <AdminDataItem
      title={event.title}
      description={event.summary}
      badge={<EventStatusBadge status={event.status} />}
      tone={event.status === "completed" ? "emerald" : event.status === "in_progress" ? "sky" : "slate"}
      meta={
        <>
          <p>责任角色：{event.recommendedOwnerRole}</p>
          <p>建议时限：{event.recommendedDeadline}</p>
        </>
      }
      footer={
        dispatchAvailable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onUpdateEventStatus(event.id, "in_progress")}
              disabled={updatingEventId === event.id || event.status === "in_progress"}
            >
              {updatingEventId === event.id ? "更新中…" : "标记处理中"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void onUpdateEventStatus(event.id, "completed")}
              disabled={updatingEventId === event.id || event.status === "completed"}
            >
              标记完成
            </Button>
          </div>
        ) : null
      }
    />
  );
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
        title: "园长周报工作区",
        description: "先收口本周结论，再安排下周动作、责任人和回到日常优先级的承接路径。",
      }
    : {
        workflow: "daily-priority" as const,
        label: "今日机构优先事项",
        title: "先判断今日优先级，再把动作沉淀成可追踪闭环",
        description:
          "园长 AI 助手基于全园近 7 天数据判断优先级，给出责任人与时限，并把动作沉淀成可持续追踪的通知事件。",
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
    feedStatus,
    feedBadge,
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
    async (
      workflow: AdminAgentRequestPayload["workflow"],
      options?: { question?: string; label?: string }
    ) => {
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
        setHistory((previous) => [
          ...previous,
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

    setResult((previous) =>
      previous ? attachNotificationEventsToResult(previous, notificationEvents) : previous
    );
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
  const scope = displayResult?.institutionScope;
  const rerunCurrentMode = () => void runWorkflow(modeConfig.workflow, { label: modeConfig.label });
  const safeDispatchStatusMessage = dispatchStatusMessage ?? "通知派单暂不可用";
  const promptButtons = (
    <>
      {quickQuestions.map((question) => (
        <Button
          key={question}
          variant="outline"
          className="rounded-full"
          onClick={() =>
            void runWorkflow("question-follow-up", {
              question,
              label: question,
            })
          }
          disabled={loading}
        >
          {question}
        </Button>
      ))}
      <Button
        variant="secondary"
        className="rounded-full"
        onClick={() => switchMode(isWeeklyMode ? "daily" : "weekly")}
        disabled={loading}
      >
        {isWeeklyMode ? "切回日常模式" : "打开本周运营周报"}
      </Button>
    </>
  );

  const statusSummary = displayResult ? (
    <>
      <AdminDataItem
        tone="indigo"
        title={displayResult.title}
        description={displayResult.summary}
        badge={<Badge variant="info">{getResultSourceLabel(displayResult.source)}</Badge>}
        meta={
          <>
            <p>生成时间：{formatGeneratedAt(displayResult.generatedAt)}</p>
            <p>优先事项：{displayResult.priorityTopItems.length} 条</p>
            <p>建议动作：{displayResult.actionItems.length} 条</p>
          </>
        }
      />
      <AdminDataItem
        tone="amber"
        description={`风险儿童 ${displayResult.riskChildren.length} 名 · 高压力班级 ${displayResult.riskClasses.length} 个`}
      />
      <AdminDataItem
        tone="emerald"
        description={`通知事件 ${notificationEvents.length} 条 · 会诊升级 ${consultationPriorityItems.length} 条`}
      />
    </>
  ) : loading ? (
    <LoadingState label={isWeeklyMode ? "正在生成周报工作区摘要…" : "正在生成日常工作区摘要…"} />
  ) : (
    <AdminEmptyState>{isWeeklyMode ? "等待周报工作区结果。" : "等待今日机构优先事项结果。"}</AdminEmptyState>
  );

  const feedbackWeakness = displayResult?.feedbackRiskItems.length ? (
    <div className="space-y-3">
      {displayResult.feedbackRiskItems.slice(0, 4).map((item) => (
        <AdminDataItem
          key={item.childId}
          tone={getPriorityTone(item.priorityLevel)}
          title={`${item.childName} · ${item.className}`}
          description={item.reason}
          badge={<PriorityLevelBadge level={item.priorityLevel} />}
          meta={
            <>
              <p>建议承接：{item.recommendedOwner}</p>
              <p>最近反馈：{item.lastFeedbackDate ?? "暂无记录"}</p>
            </>
          }
        />
      ))}
    </div>
  ) : (
    <AdminEmptyState>当前没有明显的家长协同薄弱点。</AdminEmptyState>
  );

  const notificationPanel = notificationEvents.length ? (
    <div className="space-y-3">
      {notificationEvents.slice(0, 6).map((event) => (
        <NotificationEventCard
          key={event.id}
          event={event}
          dispatchAvailable={dispatchAvailable}
          updatingEventId={updatingEventId}
          onUpdateEventStatus={handleUpdateEventStatus}
        />
      ))}
    </div>
  ) : (
    <AdminEmptyState>还没有已创建的派单。</AdminEmptyState>
  );

  const entryLinks = (
    <div className="space-y-3">
      <button
        type="button"
        className="admin-entry-link text-left text-sm"
        onClick={() => router.push("/admin")}
      >
        <span className="admin-entry-link__icon">
          <ClipboardList className="h-4 w-4" />
        </span>
        返回园长首页
      </button>
      <button
        type="button"
        className="admin-entry-link text-left text-sm"
        onClick={() => switchMode(isWeeklyMode ? "daily" : "weekly")}
      >
        <span className="admin-entry-link__icon">
          <FileText className="h-4 w-4" />
        </span>
        {isWeeklyMode ? "切回日常优先级模式" : "打开本周运营周报"}
      </button>
      <button
        type="button"
        className="admin-entry-link text-left text-sm"
        onClick={() =>
          void runWorkflow("question-follow-up", {
            question: "今天最该优先处理的 3 件事是什么？",
            label: "今天最该优先处理的 3 件事是什么？",
          })
        }
        disabled={loading}
      >
        <span className="admin-entry-link__icon">
          <Sparkles className="h-4 w-4" />
        </span>
        查看机构优先级前三项
      </button>
    </div>
  );

  const dailyMain = (
    <div className="space-y-6">
      <AdminBand
        tone="indigo"
        eyebrow={
          <>
            <Badge variant="info">日常治理工作区</Badge>
            <Badge variant="outline">{INSTITUTION_NAME}</Badge>
            <Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>
          </>
        }
        title="先确认今日最重要的问题，再决定谁来推进、何时闭环。"
        description="页面级只保留轻氛围，主要层次通过主结果、优先级分组、追问解释和动作区来建立。"
        actions={
          <>
            <Button type="button" variant="outline" onClick={rerunCurrentMode} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              重新生成
            </Button>
            <Button type="button" variant="premium" onClick={() => switchMode("weekly")}>
              打开周报模式
            </Button>
          </>
        }
      >
        {requestError ? <RequestErrorBanner message={requestError} /> : null}
        <div className="grid gap-3 md:grid-cols-3">{statusSummary}</div>
      </AdminBand>

      {scope ? (
        <MetricGrid
          items={[
            {
              label: "今日实到",
              value: `${scope.todayPresentCount}/${scope.visibleChildren}`,
              tone: "emerald",
            },
            { label: "重点风险儿童", value: `${scope.riskChildrenCount}`, tone: "amber" },
            { label: "反馈完成率", value: `${scope.feedbackCompletionRate}%`, tone: "sky" },
            { label: "待推进派单", value: `${scope.pendingDispatchCount}`, tone: "indigo" },
          ]}
        />
      ) : null}

      <SectionCard
        title="核心结果 / 优先级区"
        description="把今日核心判断、机构优先级前三项和治理重点收进同一工作区，不再让零散卡片分散决策注意力。"
        actions={<Badge variant="info">主结果脊柱</Badge>}
        surface="luminous"
        glow="soft"
        className="border-white/10"
      >
        {loading && !displayResult ? (
          <LoadingState label="正在生成今日机构优先事项…" />
        ) : displayResult ? (
          <div className="space-y-4">
            <AdminSubsection
              tone="indigo"
              title="核心结果"
              description="先读结论，再进入优先级和动作建议。"
              actions={<Badge variant="info">{displayResult.title}</Badge>}
            >
              <p className="text-sm leading-7 text-white/72">{displayResult.assistantAnswer}</p>
            </AdminSubsection>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.04fr)_minmax(320px,0.96fr)]">
              <AdminSubsection
                title="机构优先级前三项"
                description="维持园长的第一决策视角。"
                tone="amber"
              >
                <div className="space-y-3">
                  {displayResult.priorityTopItems.map((item) => (
                    <AdminDataItem
                      key={item.id}
                      tone={getPriorityTone(item.priorityLevel)}
                      title={item.targetName}
                      description={item.reason}
                      badge={<PriorityLevelBadge level={item.priorityLevel} />}
                      meta={
                        <>
                          <p>优先分：{item.priorityScore}</p>
                          <p>建议责任人：{item.recommendedOwner.label}</p>
                          <p>建议时限：{item.recommendedDeadline}</p>
                        </>
                      }
                    />
                  ))}
                </div>
              </AdminSubsection>

              <AdminSubsection
                title="治理重点"
                description="用摘要提示维持第二层治理视角。"
                tone="slate"
                actions={<Badge variant="outline">{getResultSourceLabel(displayResult.source)}</Badge>}
              >
                <div className="space-y-3">
                  {displayResult.highlights.slice(0, 6).map((item) => (
                    <AdminDataItem key={item} description={item} />
                  ))}
                </div>
              </AdminSubsection>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <AdminSubsection title="重点风险儿童" description="谁最需要园长越级关注。" tone="rose">
                <div className="space-y-3">
                  {displayResult.riskChildren.length > 0 ? (
                    displayResult.riskChildren.slice(0, 4).map((item) => (
                      <AdminDataItem
                        key={item.childId}
                        tone={getPriorityTone(item.priorityLevel)}
                        title={`${item.childName} · ${item.className}`}
                        description={item.reason}
                        badge={<PriorityLevelBadge level={item.priorityLevel} />}
                        meta={`责任建议：${item.ownerLabel} · 时限：${item.deadline}`}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>当前没有进入高优先级列表的风险儿童。</AdminEmptyState>
                  )}
                </div>
              </AdminSubsection>

              <AdminSubsection title="高压力班级" description="从班级层面判断治理承压点。" tone="sky">
                <div className="space-y-3">
                  {displayResult.riskClasses.length > 0 ? (
                    displayResult.riskClasses.slice(0, 4).map((item) => (
                      <AdminDataItem
                        key={item.className}
                        tone={getPriorityTone(item.priorityLevel)}
                        title={item.className}
                        description={item.reason}
                        badge={<PriorityLevelBadge level={item.priorityLevel} />}
                        meta={`关联问题 ${item.issueCount} 项 · 责任建议：${item.ownerLabel}`}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>当前没有进入高优先级列表的班级问题。</AdminEmptyState>
                  )}
                </div>
              </AdminSubsection>
            </div>
          </div>
        ) : (
          <AdminEmptyState>等待 AI 助手返回结构化结果。</AdminEmptyState>
        )}
      </SectionCard>

      <SectionCard
        title="今日重点会诊 / 高风险优先事项"
        description="重点会诊区保持第一决策视角不变，只统一板头、空态和配对式双面板材质。"
        actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>}
        surface="luminous"
        glow="soft"
        className="border-white/10"
      >
        <RiskPriorityBoard
          items={consultationPriorityItems}
          layoutVariant="split"
          isLoading={feedStatus === "loading"}
          sourceBadgeLabel={feedBadge.label}
          sourceBadgeVariant={feedBadge.variant}
          onCreateConsultationNotification={handleCreateConsultationNotification}
          isCreatingConsultationNotification={isCreatingNotification}
          dispatchAvailable={dispatchAvailable}
          dispatchStatusMessage={safeDispatchStatusMessage}
          emptyTitle={
            feedStatus === "unavailable"
              ? "重点会诊数据暂时不可用"
              : feedStatus === "ready"
                ? "当前还没有升级到园长侧的重点会诊"
                : undefined
          }
          emptyDescription={
            feedStatus === "unavailable"
              ? "系统会先展示本地已有结论；如果这里仍为空，说明当前没有可展示的重点会诊。"
              : feedStatus === "ready"
                ? "当教师端产生新的高风险会诊后，这里会持续显示风险等级、决策卡和关键依据。"
                : undefined
          }
        />
      </SectionCard>

      <AgentWorkspaceCard
        title="追问与动作区"
        description="继续追问当前结果，但不再给高密度卡片逐个加重动效。"
        badgeLabel="日常追问"
        promptButtons={promptButtons}
      >
        {loading && !displayResult ? (
          <LoadingState label="正在生成追问结果…" />
        ) : displayResult ? (
          <div className="space-y-4">
            <AdminSubsection
              tone="sky"
              title="当前解释"
              description="保留一块连续阅读区，减少多张同级白卡打断。"
            >
              <p className="text-sm leading-7 text-white/72">{displayResult.assistantAnswer}</p>
            </AdminSubsection>

            <AdminActionDock
              tone="indigo"
              title="工作区摘要"
              description="把当前结果和下一步路径收在同一层级。"
              actions={<Badge variant="outline">{displayResult.actionItems.length} 条动作建议</Badge>}
            >
              <div className="flex flex-wrap gap-3 text-xs leading-5 text-white/46">
                <span>优先事项 {displayResult.priorityTopItems.length} 条</span>
                <span>会诊升级 {consultationPriorityItems.length} 条</span>
                <span>通知事件 {notificationEvents.length} 条</span>
              </div>
            </AdminActionDock>
          </div>
        ) : (
          <AdminEmptyState>等待 AI 助手返回结构化结果。</AdminEmptyState>
        )}
      </AgentWorkspaceCard>

      <SectionCard
        title="结构化行动建议"
        description="动作条目统一到同一套 admin primitives；强调路径和闭环，而不是展示型炫技。"
        actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>}
      >
        {!dispatchAvailable ? <RequestErrorBanner message={safeDispatchStatusMessage} /> : null}
        {displayResult ? (
          <div className="space-y-4">
            <AdminActionDock
              tone="amber"
              title="行动 Dock"
              description="每条动作保留责任人、时限和派单入口；派单不可用时退化为只读摘要。"
              actions={<Badge variant="warning">{displayResult.actionItems.length} 条待处理</Badge>}
            >
              <div className="flex flex-wrap gap-3 text-xs leading-5 text-white/46">
                <span>日常闭环优先级</span>
                <span>派单状态同步到通知侧栏</span>
              </div>
            </AdminActionDock>

            <div className="space-y-3">
              {displayResult.actionItems.length > 0 ? (
                displayResult.actionItems.map((item) => (
                  <ActionItemCard
                    key={item.id}
                    item={item}
                    dispatchAvailable={dispatchAvailable}
                    dispatchStatusMessage={safeDispatchStatusMessage}
                    isCreating={isCreatingNotification(item.id)}
                    onCreateDispatch={handleCreateDispatch}
                  />
                ))
              ) : (
                <AdminEmptyState>当前没有需要新建的动作建议。</AdminEmptyState>
              )}
            </div>
          </div>
        ) : (
          <AdminEmptyState>等待 AI 助手生成行动建议。</AdminEmptyState>
        )}
      </SectionCard>

      <SectionCard title="历史记录" description="保留本次会话中已生成过的机构级回答。">
        <div className="space-y-3">
          {history.length > 0 ? (
            history.map((entry) => (
              <AdminDataItem
                key={entry.id}
                title={entry.label}
                description={entry.result.summary}
                badge={<Badge variant="outline">{getResultSourceLabel(entry.result.source)}</Badge>}
                meta={`生成时间：${formatGeneratedAt(entry.result.generatedAt)}`}
              />
            ))
          ) : (
            <AdminEmptyState>还没有历史记录。</AdminEmptyState>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const dailyAside = (
    <div className="space-y-6 xl:sticky xl:top-5">
      <SectionCard title="当前状态" description="园长 AI 助手当前聚焦的机构级结果摘要。">
        <div className="grid gap-3">{statusSummary}</div>
      </SectionCard>

      <SectionCard title="家长协同薄弱点" description="方便园长快速追问家园协同链路。">
        {feedbackWeakness}
      </SectionCard>

      <SectionCard
        title="通知派单"
        description="这里展示已沉淀的通知事件；当派单暂不可用时保留只读态。"
        actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>}
      >
        {!dispatchAvailable ? <RequestErrorBanner message={safeDispatchStatusMessage} /> : null}
        {notificationPanel}
      </SectionCard>

      <SectionCard title="工作区入口" description="保留首页、周报与常用追问入口。">
        {entryLinks}
      </SectionCard>
    </div>
  );

  const weeklyMain = (
    <div className="space-y-6">
      <AdminBand
        tone="indigo"
        eyebrow={
          <>
            <Badge variant="info">周报工作区</Badge>
            <Badge variant="outline">{INSTITUTION_NAME}</Badge>
            <Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>
          </>
        }
        title="主报告面板承接本周结论，次级解释面板负责追问，行动区负责落地。"
        description="周报模式下不再混入日常优先级的整页噪音，只保留最关键的总结、解释和动作承接。"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => switchMode("daily")}>
              切回日常模式
            </Button>
            <Button type="button" variant="premium" onClick={rerunCurrentMode} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              重新生成周报
            </Button>
          </>
        }
      >
        {requestError ? <RequestErrorBanner message={requestError} /> : null}
        <div className="grid gap-3 md:grid-cols-3">{statusSummary}</div>
      </AdminBand>

      {scope ? (
        <MetricGrid
          items={[
            {
              label: "本周到园基线",
              value: `${scope.todayPresentCount}/${scope.visibleChildren}`,
              tone: "emerald",
            },
            { label: "本周风险儿童", value: `${scope.riskChildrenCount}`, tone: "amber" },
            { label: "反馈完成率", value: `${scope.feedbackCompletionRate}%`, tone: "sky" },
            { label: "待承接动作", value: `${scope.pendingDispatchCount}`, tone: "indigo" },
          ]}
        />
      ) : null}

      <SectionCard
        title="周报主内容脊柱"
        description="周报主报告面板只保留本周总结、连续性摘要、重点结论与风险承接。"
        actions={<Badge variant="info">主报告面板</Badge>}
        surface="luminous"
        glow="soft"
        className="border-white/10"
      >
        {loading && !displayResult ? (
          <LoadingState label="正在生成本周运营周报…" />
        ) : displayResult ? (
          <div className="space-y-4">
            <AdminSubsection
              tone="indigo"
              title={displayResult.title}
              description="先收口本周总结，再展开重点结论和风险承接。"
              actions={<Badge variant="outline">{getResultSourceLabel(displayResult.source)}</Badge>}
            >
              <p className="text-sm leading-7 text-white/72">{displayResult.summary}</p>
            </AdminSubsection>

            <div className="grid gap-4 lg:grid-cols-2">
              <AdminSubsection title="连续性摘要" description="帮助判断本周结论与上周工作的衔接。" tone="slate">
                {displayResult.continuityNotes?.length ? (
                  <div className="space-y-3">
                    {displayResult.continuityNotes.slice(0, 4).map((item) => (
                      <AdminDataItem key={item} description={item} />
                    ))}
                  </div>
                ) : (
                  <AdminEmptyState>当前没有额外的连续性提醒。</AdminEmptyState>
                )}
              </AdminSubsection>

              <AdminSubsection title="本周重点结论" description="保留周报解释的第二层摘要。" tone="sky">
                <div className="space-y-3">
                  {displayResult.highlights.slice(0, 6).map((item) => (
                    <AdminDataItem key={item} description={item} />
                  ))}
                </div>
              </AdminSubsection>
            </div>

            <AdminSubsection title="本周风险承接" description="需要行政继续跟进的高风险儿童与班级。" tone="amber">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  {displayResult.riskChildren.length > 0 ? (
                    displayResult.riskChildren.slice(0, 4).map((item) => (
                      <AdminDataItem
                        key={item.childId}
                        tone={getPriorityTone(item.priorityLevel)}
                        title={`${item.childName} · ${item.className}`}
                        description={item.reason}
                        badge={<PriorityLevelBadge level={item.priorityLevel} />}
                        meta={`责任建议：${item.ownerLabel} · 时限：${item.deadline}`}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>本周没有需要行政升级承接的高风险儿童。</AdminEmptyState>
                  )}
                </div>
                <div className="space-y-3">
                  {displayResult.riskClasses.length > 0 ? (
                    displayResult.riskClasses.slice(0, 4).map((item) => (
                      <AdminDataItem
                        key={item.className}
                        tone={getPriorityTone(item.priorityLevel)}
                        title={item.className}
                        description={item.reason}
                        badge={<PriorityLevelBadge level={item.priorityLevel} />}
                        meta={`关联问题 ${item.issueCount} 项 · 责任建议：${item.ownerLabel}`}
                      />
                    ))
                  ) : (
                    <AdminEmptyState>本周没有额外的班级治理升级项。</AdminEmptyState>
                  )}
                </div>
              </div>
            </AdminSubsection>
          </div>
        ) : (
          <AdminEmptyState>等待周报模式返回第一轮结果。</AdminEmptyState>
        )}
      </SectionCard>

      <AgentWorkspaceCard
        title="追问 / 模式切换"
        description="周报工作区只保留围绕本周总结的追问，以及回到日常优先级的稳定入口。"
        badgeLabel="周报追问"
        promptButtons={promptButtons}
      >
        {loading && !displayResult ? (
          <LoadingState label="正在生成周报追问结果…" />
        ) : displayResult ? (
          <div className="space-y-4">
            <AdminSubsection tone="sky" title="次级解释面板" description="追问结果保持单一阅读区，不再拆成多列白卡。">
              <p className="text-sm leading-7 text-white/72">{displayResult.assistantAnswer}</p>
            </AdminSubsection>

            <AdminActionDock
              tone="indigo"
              title="周报摘要回看"
              description="追问前后始终能看到同一份周报摘要。"
              actions={<Badge variant="outline">{displayResult.highlights.length} 条重点</Badge>}
            >
              <p className="text-sm leading-6 text-white/68">{displayResult.summary}</p>
            </AdminActionDock>
          </div>
        ) : (
          <AdminEmptyState>等待周报追问结果。</AdminEmptyState>
        )}
      </AgentWorkspaceCard>

      <SectionCard
        title="落地动作与派单状态"
        description="周报结论直接转成下周动作、责任人和派单入口；派单不可用时统一退化为只读动作摘要。"
        actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>}
      >
        {!dispatchAvailable ? <RequestErrorBanner message={safeDispatchStatusMessage} /> : null}
        {displayResult ? (
          <div className="space-y-4">
            <AdminActionDock
              tone="amber"
              title="行动 Dock"
              description="主报告之后立刻进入行动承接，避免周报结论停留在展示层。"
              actions={<Badge variant="warning">{displayResult.actionItems.length} 条下周动作</Badge>}
            >
              <div className="flex flex-wrap gap-3 text-xs leading-5 text-white/46">
                <span>当前通知事件 {notificationEvents.length} 条</span>
                <span>{dispatchAvailable ? "支持继续派单" : "当前仅保留只读态"}</span>
              </div>
            </AdminActionDock>

            <div className="space-y-3">
              {displayResult.actionItems.length > 0 ? (
                displayResult.actionItems.map((item) => (
                  <ActionItemCard
                    key={item.id}
                    item={item}
                    dispatchAvailable={dispatchAvailable}
                    dispatchStatusMessage={safeDispatchStatusMessage}
                    isCreating={isCreatingNotification(item.id)}
                    onCreateDispatch={handleCreateDispatch}
                  />
                ))
              ) : (
                <AdminEmptyState>等待周报生成下周动作。</AdminEmptyState>
              )}
            </div>
          </div>
        ) : (
          <AdminEmptyState>等待周报工作区生成落地动作。</AdminEmptyState>
        )}
      </SectionCard>
    </div>
  );

  const weeklyAside = (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="辅助状态" description="保留周报工作区当前承接状态与责任分布。">
        {displayResult ? (
          <div className="space-y-3">
            <AdminDataItem
              tone="indigo"
              title="当前工作区状态"
              description={`当前标题：${displayResult.title}`}
              badge={<Badge variant="outline">{getResultSourceLabel(displayResult.source)}</Badge>}
              meta={
                <>
                  <p>建议动作：{displayResult.actionItems.length} 条</p>
                  <p>风险儿童：{displayResult.riskChildren.length} 名</p>
                  <p>高压力班级：{displayResult.riskClasses.length} 个</p>
                </>
              }
            />
            <AdminSubsection title="责任承接分布" description="帮助园长判断动作是否过于集中在单一角色。">
              <div className="space-y-3">
                {displayResult.recommendedOwnerMap.length > 0 ? (
                  displayResult.recommendedOwnerMap.map((item) => (
                    <AdminDataItem
                      key={`${item.ownerRole}-${item.ownerLabel}`}
                      description={`${item.ownerLabel} · ${item.count} 条`}
                    />
                  ))
                ) : (
                  <AdminEmptyState>当前没有责任分布数据。</AdminEmptyState>
                )}
              </div>
            </AdminSubsection>
          </div>
        ) : (
          <AdminEmptyState>等待周报状态摘要。</AdminEmptyState>
        )}
      </SectionCard>

      <SectionCard
        title="通知派单与入口"
        description="保留周报模式下的派单状态与稳定入口，不再混入额外展示块。"
        actions={<Badge variant={dispatchAvailable ? "success" : "outline"}>{safeDispatchStatusMessage}</Badge>}
      >
        <div className="space-y-4">
          {!dispatchAvailable ? <RequestErrorBanner message={safeDispatchStatusMessage} /> : null}
          {notificationEvents.length > 0 ? (
            <div className="space-y-3">
              {notificationEvents.slice(0, 4).map((event) => (
                <NotificationEventCard
                  key={event.id}
                  event={event}
                  dispatchAvailable={dispatchAvailable}
                  updatingEventId={updatingEventId}
                  onUpdateEventStatus={handleUpdateEventStatus}
                />
              ))}
            </div>
          ) : (
            <AdminEmptyState>还没有由周报承接生成的派单。</AdminEmptyState>
          )}
          {entryLinks}
        </div>
      </SectionCard>
    </div>
  );

  return (
    <RolePageShell
      intensity="light"
      badge={`园长治理工作区 · ${INSTITUTION_NAME}`}
      title={modeConfig.title}
      description={modeConfig.description}
      actions={
        <>
          <InlineLinkButton href="/admin" label="返回园长首页" />
          {isWeeklyMode ? (
            <InlineLinkButton href="/admin/agent" label="切回日常模式" />
          ) : (
            <InlineLinkButton
              href="/admin/agent?action=weekly-report"
              label="打开周报模式"
              variant="premium"
            />
          )}
        </>
      }
    >
      <div className="admin-workbench-shell">
        <RoleSplitLayout
          stacked={isWeeklyMode}
          main={isWeeklyMode ? weeklyMain : dailyMain}
          aside={isWeeklyMode ? weeklyAside : dailyAside}
        />
      </div>
    </RolePageShell>
  );
}
