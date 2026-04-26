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
import { formatAdminDateTimeLabel } from "@/lib/agent/admin-display-text";
import { dedupeAdminAgentResultExposure } from "@/lib/agent/admin-home-dedupe";
import { useAdminConsultationWorkspace } from "@/lib/agent/use-admin-consultation-workspace";
import type {
  AdminAgentRequestPayload,
  AdminAgentResult,
  AdminDispatchEvent,
  AdminAgentActionItem,
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

function getResultSourceLabel(source: string) {
  if (source === "ai" || source === "vivo") return "智能生成";
  if (source === "mock") return "演示结果";
  if (source === "fallback") return "本地兜底";
  return "已整理结果";
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
        title: "从识别问题，到生成动作，再到派单闭环",
        description: "园长 AI 助手会基于全园近 7 天数据判断优先级、给出责任人和时限，并把动作沉淀成可持续追踪的通知事件。",
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

  const runWorkflow = useCallback(async (
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
  }, [history, notificationEvents, payload]);

  const syncEventIntoAgentState = useCallback((event: AdminDispatchEvent) => {
    setResult((previous) =>
      previous ? attachNotificationEventToResult(previous, event) : previous
    );
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
    if (!notificationReady) return;

    if (notificationEvents.length === 0) {
      return;
    }

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

  const displayResult = result
    ? dedupeAdminAgentResultExposure(result, consultationPriorityItems)
    : null;
  const quickQuestions = displayResult?.quickQuestions ?? [...ADMIN_AGENT_QUICK_QUESTIONS];
  const scope = displayResult?.institutionScope;
  const rerunCurrentMode = () => void runWorkflow(modeConfig.workflow, { label: modeConfig.label });
  const safeDispatchStatusMessage = dispatchStatusMessage ?? "通知派单暂不可用";

  if (isWeeklyMode) {
    return (
      <RolePageShell
        badge={`园长 AI 助手 · ${INSTITUTION_NAME}`}
        title="园长周报工作区"
        description="只保留本周总结、周报追问和周报落地动作，不再混入日常优先级、历史记录和通知侧栏。"
        actions={<InlineLinkButton href="/admin" label="返回园长首页" />}
      >
        <RoleSplitLayout
          stacked
          main={
            <div className="space-y-6">
              <div className="rounded-[32px] border border-indigo-100 bg-linear-to-r from-indigo-50 via-white to-sky-50 p-6 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">周报工作区</Badge>
                      <Badge variant="outline">{INSTITUTION_NAME}</Badge>
                      <Badge variant={dispatchAvailable ? "success" : "outline"}>
                        {safeDispatchStatusMessage}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-slate-900">本周运营周报</p>
                      <p className="mt-2 max-w-3xl whitespace-normal break-words text-sm leading-6 text-slate-600">
                        当前页面只保留周报总结、周报追问、下周动作和必要的返回日常入口，方便园长直接讲清本周闭环与下周承接。
                      </p>
                    </div>
                    {requestError ? (
                      <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{requestError}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">
                    <Button type="button" variant="outline" onClick={() => switchMode("daily")}>
                      切回日常模式
                    </Button>
                    <Button type="button" variant="premium" onClick={rerunCurrentMode} disabled={loading}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                      重新生成周报
                    </Button>
                  </div>
                </div>
              </div>

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
                title="本周运营周报"
                description="周报模式下只保留本周结论、延续提醒、重点摘要与风险承接，不再展示技术元信息。"
                actions={<Badge variant="info">单一周报工作区</Badge>}
              >
                {loading && !displayResult ? (
                  <div className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-600">
                    <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                    正在生成本周运营周报...
                  </div>
                ) : displayResult ? (
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="info">{displayResult.title}</Badge>
                      </div>
                      <p className="mt-4 whitespace-normal break-words text-base leading-8 text-slate-800">
                        {displayResult.summary}
                      </p>
                    </div>

                    {displayResult.continuityNotes?.length ? (
                      <div className="rounded-3xl border border-slate-100 bg-white p-5">
                        <p className="text-sm font-semibold text-slate-900">连续性摘要</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {displayResult.continuityNotes.slice(0, 3).map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl border border-slate-100 bg-white p-5">
                        <p className="text-sm font-semibold text-slate-900">本周重点结论</p>
                        <ul className="mt-3 space-y-3">
                          {displayResult.highlights.slice(0, 6).map((item) => (
                            <li
                              key={item}
                              className="rounded-2xl bg-slate-50 px-4 py-3 whitespace-normal break-words text-sm leading-6 text-slate-600"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-100 bg-white p-5">
                        <p className="text-sm font-semibold text-slate-900">本周风险承接</p>
                        <div className="mt-3 space-y-3">
                          {displayResult.riskChildren.slice(0, 4).map((item) => (
                            <div key={item.childId} className="rounded-2xl bg-slate-50 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="whitespace-normal break-words text-sm font-medium text-slate-900">
                                    {item.childName} · {item.className}
                                  </p>
                                  <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-600">
                                    {item.reason}
                                  </p>
                                </div>
                                <PriorityLevelBadge level={item.priorityLevel} />
                              </div>
                            </div>
                          ))}
                          {displayResult.riskChildren.length === 0 ? (
                            <p className="text-sm text-slate-500">本周没有需要行政升级承接的高风险儿童。</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                    等待周报模式返回第一轮结果。
                  </div>
                )}
              </SectionCard>

              <AgentWorkspaceCard
                title="周报追问"
                description="只保留围绕本周总结的追问入口，不再混入模式切换按钮。"
                promptButtons={
                  <>
                    {quickQuestions.slice(0, 4).map((question) => (
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
                  </>
                }
              >
                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5">
                  {loading && !displayResult ? (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                      正在生成周报追问结果...
                    </div>
                  ) : displayResult ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="info">{displayResult.title}</Badge>
                      </div>
                      <p className="whitespace-normal break-words text-base leading-7 text-slate-800">
                        {displayResult.assistantAnswer}
                      </p>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">周报摘要回看</p>
                        <p className="mt-3 whitespace-normal break-words text-sm leading-6 text-slate-600">
                          {displayResult.summary}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">等待周报追问结果。</p>
                  )}
                </div>
              </AgentWorkspaceCard>

              <SectionCard
                title="周报落地动作"
                description="把周报结论直接转成下周动作、责任人和派单入口；如派单暂不可用，则先展示只读动作摘要。"
                actions={
                  <Badge variant={dispatchAvailable ? "success" : "outline"}>
                    {safeDispatchStatusMessage}
                  </Badge>
                }
              >
                {!dispatchAvailable ? (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {safeDispatchStatusMessage}
                  </div>
                ) : null}

                {displayResult ? (
                  <div className="space-y-4">
                    {displayResult.actionItems.map((item) => (
                      <div key={item.id} className="rounded-3xl border border-slate-100 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <PriorityLevelBadge level={item.priorityLevel} />
                              <EventStatusBadge
                                status={
                                  item.status === "completed"
                                    ? "completed"
                                    : item.status === "in_progress"
                                      ? "in_progress"
                                      : "pending"
                                }
                              />
                            </div>
                            <p className="whitespace-normal break-words text-base font-semibold text-slate-900">
                              {item.title}
                            </p>
                            <p className="whitespace-normal break-words text-sm leading-6 text-slate-600">
                              {item.summary}
                            </p>
                            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                              <span>责任人：{item.ownerLabel}</span>
                              <span>时限：{item.deadline}</span>
                            </div>
                          </div>
                          {dispatchAvailable ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="premium"
                                onClick={() => void handleCreateDispatch(item)}
                                disabled={isCreatingNotification(item.id) || Boolean(item.relatedEventId)}
                              >
                                {isCreatingNotification(item.id)
                                  ? "创建中..."
                                  : item.relatedEventId
                                    ? "已创建派单"
                                    : "生成派单"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">等待周报生成下周动作。</p>
                )}
              </SectionCard>
            </div>
          }
          aside={
            <div className="space-y-6">
              <SectionCard title="工作区控制" description="周报模式只保留返回日常、重新生成和返回首页这一组控制。">
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="premium"
                    className="w-full"
                    onClick={rerunCurrentMode}
                    disabled={loading}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    重新生成本周周报
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => switchMode("daily")}
                  >
                    切回日常模式
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => router.push("/admin")}
                  >
                    返回园长首页
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title="派单状态" description="这里只显示周报动作是否还能继续派单，不展示底层错误细节。">
                <div className="space-y-3 text-sm leading-6 text-slate-600">
                  <Badge variant={dispatchAvailable ? "success" : "outline"}>
                    {safeDispatchStatusMessage}
                  </Badge>
                  <p>当前周报动作数：{displayResult?.actionItems.length ?? 0}</p>
                  <p>当前已有通知事件：{notificationEvents.length}</p>
                  <p>
                    {dispatchAvailable
                      ? "当前可以继续把周报动作生成正式派单。"
                      : "当前暂不支持继续派单，周报页面会先保留动作摘要与责任人。"}
                  </p>
                </div>
              </SectionCard>
            </div>
          }
        />
      </RolePageShell>
    );
  }

  return (
    <RolePageShell
      badge={`园长 AI 助手 · ${INSTITUTION_NAME}`}
      title={modeConfig.title}
      description={modeConfig.description}
      actions={
        <>
          <InlineLinkButton href="/admin" label="返回园长首页" />
          {isWeeklyMode ? (
            <InlineLinkButton href="/admin/agent" label="切回日常模式" />
          ) : (
            <InlineLinkButton href="/admin/agent?action=weekly-report" label="打开周报模式" variant="premium" />
          )}
        </>
      }
    >
      <RoleSplitLayout
        stacked
        main={
          <div className="space-y-6">
            {isWeeklyMode ? (
              <div className="rounded-[32px] border border-indigo-100 bg-linear-to-r from-indigo-50 via-white to-sky-50 p-6 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">周报模式</Badge>
                      <Badge variant="outline">{INSTITUTION_NAME}</Badge>
                      <Badge variant="outline">周报承接入口</Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-slate-900">本周运营周报工作区</p>
                      <p className="mt-2 max-w-3xl whitespace-normal break-words text-sm leading-6 text-slate-600">
                        当前页面已切换为周报承接模式。这里会先展示本周结论、风险儿童和下周动作，再回到日常优先级与派单闭环，避免“点进来只有空白或异常页”。
                      </p>
                    </div>
                    {requestError ? (
                      <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{requestError}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">
                    <Button type="button" variant="outline" onClick={() => switchMode("daily")}>
                      切回日常模式
                    </Button>
                    <Button type="button" variant="premium" onClick={rerunCurrentMode} disabled={loading}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                      重新生成周报
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

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

            {isWeeklyMode ? (
              <SectionCard
                title="周报工作区"
                description="周报模式下，先聚焦本周总结、下周动作和风险承接，再决定是否继续追问。"
                actions={<Badge variant="info">最小稳定承接</Badge>}
              >
                {loading && !displayResult ? (
                  <div className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-600">
                    <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                    正在生成本周运营周报…
                  </div>
                ) : displayResult ? (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="info">{displayResult.title}</Badge>
                        </div>
                        <p className="mt-4 whitespace-normal break-words text-base leading-8 text-slate-800">
                          {displayResult.summary}
                        </p>
                        {displayResult.continuityNotes?.length ? (
                          <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">连续性摘要</p>
                            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                              {displayResult.continuityNotes.slice(0, 3).map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-3xl border border-slate-100 bg-white p-5">
                          <p className="text-sm font-semibold text-slate-900">下周动作</p>
                          <div className="mt-3 space-y-3">
                            {displayResult.actionItems.slice(0, 4).map((item) => (
                              <div key={item.id} className="rounded-2xl bg-slate-50 p-4">
                                <p className="whitespace-normal break-words text-sm font-medium text-slate-900">
                                  {item.action}
                                </p>
                                <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-slate-500">
                                  {item.ownerLabel} · {item.deadline}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-100 bg-white p-5">
                          <p className="text-sm font-semibold text-slate-900">本周风险儿童</p>
                          <div className="mt-3 space-y-3">
                            {displayResult.riskChildren.slice(0, 3).map((item) => (
                              <div key={item.childId} className="rounded-2xl bg-slate-50 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="whitespace-normal break-words text-sm font-medium text-slate-900">
                                      {item.childName} · {item.className}
                                    </p>
                                    <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-600">
                                      {item.reason}
                                    </p>
                                  </div>
                                  <PriorityLevelBadge level={item.priorityLevel} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">本周结论速览</p>
                      <ul className="mt-3 grid gap-3 xl:grid-cols-2">
                        {displayResult.highlights.slice(0, 6).map((item) => (
                          <li
                            key={item}
                            className="rounded-2xl bg-slate-50 px-4 py-3 whitespace-normal break-words text-sm leading-6 text-slate-600"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                    等待周报模式返回第一轮机构周报结果。
                  </div>
                )}
              </SectionCard>
            ) : null}

            <SectionCard
              title="机构上下文"
              description="这里固定展示智能判断优先级时使用的机构级上下文。"
            >
              {scope ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-slate-100 bg-white p-5">
                    <p className="text-sm font-semibold text-slate-900">近 7 天机构概览</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>今日实到 {scope.todayPresentCount} / {scope.visibleChildren}</p>
                      <p>今日出勤率 {scope.todayAttendanceRate}%</p>
                      <p>晨检异常 {scope.healthAbnormalCount} 条</p>
                      <p>成长关注 {scope.growthAttentionCount} 条</p>
                      <p>待复查 {scope.pendingReviewCount} 条</p>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-white p-5">
                    <p className="text-sm font-semibold text-slate-900">当前运营链路</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>重点班级 {scope.riskClassCount} 个</p>
                      <p>家长反馈 {scope.feedbackCount} 条</p>
                      <p>待推进派单 {scope.pendingDispatchCount} 条</p>
                      <p>机构 {scope.institutionName}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">正在生成机构上下文。</p>
              )}
            </SectionCard>

            <SectionCard
              title="今日重点会诊 / 高风险优先事项"
              description="把高风险会诊直接抬到园长 AI 助手顶部，先看谁最值得今天推进，再继续追问和派单。"
              actions={<Badge variant="warning">重点会诊</Badge>}
            >
              <RiskPriorityBoard
                items={consultationPriorityItems}
                layoutVariant="stacked"
                isLoading={feedStatus === "loading"}
                sourceBadgeLabel={feedBadge.label}
                sourceBadgeVariant={feedBadge.variant}
                onCreateConsultationNotification={handleCreateConsultationNotification}
                isCreatingConsultationNotification={isCreatingNotification}
                dispatchAvailable={dispatchAvailable}
                dispatchStatusMessage={dispatchStatusMessage ?? "通知派单暂不可用"}
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

            <SectionCard
              title={isWeeklyMode ? "周报关联优先事项" : "当前优先事项"}
              description={
                isWeeklyMode
                  ? "周报结论最终仍会落到具体优先事项、风险儿童和高压力班级。"
                  : "结构化展示当前最重要的机构级问题。"
              }
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={rerunCurrentMode}
                  disabled={loading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {isWeeklyMode ? "刷新周报关联优先级" : "重新生成"}
                </Button>
              }
            >
              {displayResult ? (
                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                    {displayResult.priorityTopItems.map((item) => (
                      <div key={item.id} className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <PriorityLevelBadge level={item.priorityLevel} />
                          <span className="text-xs font-medium text-slate-500">分值 {item.priorityScore}</span>
                        </div>
                        <p className="mt-4 whitespace-normal break-words text-lg font-semibold text-slate-900">
                          {item.targetName}
                        </p>
                        <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">
                          {item.reason}
                        </p>
                        <div className="mt-4 space-y-2 text-sm text-slate-600">
                          <p>负责人：{item.recommendedOwner.label}</p>
                          <p>时限：{formatAdminDateTimeLabel(item.recommendedDeadline)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-100 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">重点风险儿童</p>
                      <div className="mt-4 space-y-3">
                        {displayResult.riskChildren.slice(0, 4).map((item) => (
                          <div key={item.childId} className="rounded-2xl bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="whitespace-normal break-words text-sm font-medium text-slate-900">
                                  {item.childName} · {item.className}
                                </p>
                                <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-600">
                                  {item.reason}
                                </p>
                              </div>
                              <PriorityLevelBadge level={item.priorityLevel} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-100 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">高压力班级</p>
                      <div className="mt-4 space-y-3">
                        {displayResult.riskClasses.slice(0, 4).map((item) => (
                          <div key={item.className} className="rounded-2xl bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="whitespace-normal break-words text-sm font-medium text-slate-900">
                                  {item.className}
                                </p>
                                <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-600">
                                  {item.reason}
                                </p>
                              </div>
                              <PriorityLevelBadge level={item.priorityLevel} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">等待生成今日机构优先事项。</p>
              )}
            </SectionCard>

            <AgentWorkspaceCard
              title={isWeeklyMode ? "周报追问与模式切换" : "快捷问题"}
              description={
                isWeeklyMode
                  ? "周报模式下支持继续追问，也保留回到日常优先级的稳定入口。"
                  : "用园长常见问题直接继续追问，结果仍保持结构化呈现。"
              }
              promptButtons={
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
                  {isWeeklyMode ? (
                    <Button
                      variant="secondary"
                      className="rounded-full"
                      onClick={() => switchMode("daily")}
                      disabled={loading}
                    >
                      切回日常模式
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="rounded-full"
                      onClick={() => switchMode("weekly")}
                      disabled={loading}
                    >
                      打开本周运营周报
                    </Button>
                  )}
                </>
              }
            >
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5">
                {loading ? (
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                    正在生成机构级判断结果…
                  </div>
                ) : displayResult ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{displayResult.title}</Badge>
                    </div>
                    <p className="whitespace-normal break-words text-base leading-7 text-slate-800">
                      {displayResult.assistantAnswer}
                    </p>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">当前摘要</p>
                        <p className="mt-3 whitespace-normal break-words text-sm leading-6 text-slate-600">
                          {displayResult.summary}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">关键提示</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {displayResult.highlights.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">等待 AI 助手返回结构化结果。</p>
                )}
              </div>
            </AgentWorkspaceCard>

            <SectionCard
              title={isWeeklyMode ? "周报落地动作" : "结构化行动建议"}
              description={
                isWeeklyMode
                  ? "把周报结论直接转成下周动作、责任人和派单入口。"
                  : "每条建议都带责任人、截止时间和派单入口。"
              }
              actions={
                <Badge variant={dispatchAvailable ? "success" : "outline"}>
                  {dispatchAvailable ? "支持派单" : safeDispatchStatusMessage}
                </Badge>
              }
            >
              {!dispatchAvailable ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {safeDispatchStatusMessage}
                </div>
              ) : null}
              {displayResult ? (
                <div className="space-y-4">
                  {displayResult.actionItems.map((item) => (
                    <div key={item.id} className="rounded-3xl border border-slate-100 bg-white p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <PriorityLevelBadge level={item.priorityLevel} />
                            <EventStatusBadge
                              status={
                                item.status === "completed"
                                  ? "completed"
                                  : item.status === "in_progress"
                                    ? "in_progress"
                                    : "pending"
                              }
                            />
                          </div>
                          <p className="whitespace-normal break-words text-base font-semibold text-slate-900">
                            {item.title}
                          </p>
                          <p className="whitespace-normal break-words text-sm leading-6 text-slate-600">
                            {item.summary}
                          </p>
                          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                            <span>负责人：{item.ownerLabel}</span>
                            <span>时限：{item.deadline}</span>
                          </div>
                        </div>
                        {dispatchAvailable ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="premium"
                              onClick={() => void handleCreateDispatch(item)}
                              disabled={isCreatingNotification(item.id) || Boolean(item.relatedEventId)}
                            >
                              {isCreatingNotification(item.id)
                                ? "创建中…"
                                : item.relatedEventId
                                  ? "已创建派单"
                                  : "生成派单"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">等待 AI 助手生成行动建议。</p>
              )}
            </SectionCard>

            <SectionCard title="历史记录" description="保留本次会话中已经生成过的机构级回答。">
              <div className="space-y-3">
                {history.length > 0 ? (
                  history.map((entry) => (
                    <div key={entry.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                          <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">
                            {entry.result.summary}
                          </p>
                        </div>
                        <Badge variant="outline">{getResultSourceLabel(entry.result.source)}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">还没有历史记录。</p>
                )}
              </div>
            </SectionCard>
          </div>
        }
        aside={
          <div className={isWeeklyMode ? "grid gap-6 xl:grid-cols-2" : "space-y-6"}>
            <SectionCard title="当前状态" description="园长 AI 助手当前聚焦的机构级结果摘要。">
              {displayResult ? (
                <div className="space-y-3 text-sm text-slate-600">
                  <p>当前标题：{displayResult.title}</p>
                  <p>重点事项：{displayResult.priorityTopItems.length} 条</p>
                  <p>风险儿童：{displayResult.riskChildren.length} 名</p>
                  <p>高压力班级：{displayResult.riskClasses.length} 个</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">等待首轮结果。</p>
              )}
            </SectionCard>

            <SectionCard title="家长协同薄弱点" description="方便园长快速追问家园协同链路。">
              {displayResult && displayResult.feedbackRiskItems.length > 0 ? (
                <div className="space-y-3">
                  {displayResult.feedbackRiskItems.slice(0, 4).map((item) => (
                    <div key={item.childId} className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="whitespace-normal break-words text-sm font-medium text-slate-900">
                            {item.childName} · {item.className}
                          </p>
                          <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-600">
                            {item.reason}
                          </p>
                        </div>
                        <Badge variant="outline">{item.priorityLevel}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">当前没有明显的家长协同薄弱点。</p>
              )}
            </SectionCard>

            <SectionCard
              title="通知派单"
              description="这里显示已沉淀的通知事件；当派单暂不可用时保留只读态，不提供状态更新入口。"
              actions={
                <Badge variant={dispatchAvailable ? "success" : "outline"}>
                  {dispatchAvailable ? "支持派单" : safeDispatchStatusMessage}
                </Badge>
              }
            >
              {!dispatchAvailable ? (
                <div className="mb-4 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{safeDispatchStatusMessage}</p>
                </div>
              ) : null}
              {notificationEvents.length > 0 ? (
                <div className="space-y-3">
                  {notificationEvents.slice(0, 6).map((event) => (
                    <div key={event.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                          <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">
                            {event.summary}
                          </p>
                        </div>
                        <EventStatusBadge status={event.status} />
                      </div>
                      {dispatchAvailable ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleUpdateEventStatus(event.id, "in_progress")}
                            disabled={updatingEventId === event.id || event.status === "in_progress"}
                          >
                            {updatingEventId === event.id ? "更新中…" : "标记处理中"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleUpdateEventStatus(event.id, "completed")}
                            disabled={updatingEventId === event.id || event.status === "completed"}
                          >
                            标记完成
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  还没有已创建的派单。
                </div>
              )}
            </SectionCard>

            {requestError ? (
              <SectionCard title="运行状态" description="请求失败时保留错误提示，便于说明当前兜底状态。">
                <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{requestError}</p>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title={isWeeklyMode ? "周报入口与返回路径" : "推荐入口"}
              description={
                isWeeklyMode
                  ? "保留周报重试、返回日常模式和追问入口，避免用户进入后没有承接路径。"
                  : "常用机构级工作流入口。"
              }
            >
              <div className="space-y-3">
                {isWeeklyMode ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                    onClick={rerunCurrentMode}
                  >
                    <RefreshCw className="h-4 w-4 text-indigo-500" />
                    重新生成本周运营周报
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                    onClick={() => switchMode("weekly")}
                  >
                    <FileText className="h-4 w-4 text-indigo-500" />
                    打开本周运营周报
                  </button>
                )}

                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  onClick={() =>
                    isWeeklyMode
                      ? switchMode("daily")
                      : void runWorkflow("question-follow-up", {
                          question: "今天最该优先处理的 3 件事是什么？",
                          label: "今天最该优先处理的 3 件事是什么？",
                        })
                  }
                >
                  <ClipboardList className="h-4 w-4 text-amber-500" />
                  {isWeeklyMode ? "切回日常优先级模式" : "查看机构优先级 TOP 3"}
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  onClick={() =>
                    void runWorkflow("question-follow-up", {
                      question: "哪些家长反馈长期缺失？",
                      label: "哪些家长反馈长期缺失？",
                    })
                  }
                >
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  看家长协同薄弱点
                </button>
              </div>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
  );
}
