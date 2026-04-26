"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import { BrainCircuit, Clock3, Send, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import InterventionCardPanel from "@/components/agent/InterventionCardPanel";
import CareModeToggle from "@/components/parent/CareModeToggle";
import ParentCareFocusCard from "@/components/parent/ParentCareFocusCard";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import ParentTransparencyPanel from "@/components/parent/ParentTransparencyPanel";
import ParentStructuredFeedbackComposer, {
  type ParentStructuredFeedbackComposerSubmitInput,
} from "@/components/parent/ParentStructuredFeedbackComposer";
import ParentTrendResponseCard from "@/components/parent/ParentTrendResponseCard";
import {
  AgentWorkspaceCard,
  InlineLinkButton,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildParentAgentChildContext,
  buildParentAgentFollowUpPayload,
  buildParentAgentFollowUpResult,
  buildParentAgentSuggestionResult,
  buildParentChildSuggestionSnapshot,
  PARENT_AGENT_QUICK_QUESTIONS,
  type ParentAgentChildContext,
  type ParentAgentResult,
} from "@/lib/agent/parent-agent";
import { buildParentAgentTransparencyModel } from "@/lib/agent/parent-transparency";
import {
  buildParentMessageReflexionPayload,
  mergeParentMessageReflexionResult,
} from "@/lib/agent/parent-message-reflexion";
import {
  buildParentTrendQueryPayload,
  isLikelyTrendQuestion,
  PARENT_TREND_QUICK_QUESTIONS,
} from "@/lib/agent/parent-trend";
import { resolveDefaultParentStoryBookDemoSeedId } from "@/lib/agent/parent-storybook-demo-seeds";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import type {
  AiFollowUpResponse,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  ParentMessageReflexionResponse,
  ParentTrendQueryResponse,
} from "@/lib/ai/types";
import { getLocalToday } from "@/lib/date";
import { buildReminderItems } from "@/lib/mobile/reminders";
import { getHydrationDisplayState } from "@/lib/hydration-display";
import { useCareMode } from "@/lib/care-mode";
import { buildParentSpeechScript } from "@/lib/voice/browser-tts";
import { sanitizeParentFacingText } from "@/lib/agent/parent-copy";
import { formatParentFeedbackStatusLabel } from "@/lib/feedback/consumption";
import {
  buildInterventionTasksFromCard,
  materializeTasksFromLegacy,
  pickActiveTask,
} from "@/lib/tasks/task-model";
import { formatDisplayDate, getAgeText, useApp } from "@/lib/store";

type HistoryItem = {
  id: string;
  question: string;
  result: ParentAgentResult;
};

function formatTimelineTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ParentAgentPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childFromQuery = searchParams.get("child");
  const routeIntent = searchParams.get("intent");
  const { careMode, setCareMode } = useCareMode();
  const {
    currentUser,
    children,
    attendanceRecords,
    getParentFeed,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    taskCheckInRecords,
    addGuardianFeedback,
    checkInTask,
    interventionCards,
    consultations,
    reminders,
    mobileDrafts,
    markMobileDraftSyncStatus,
    persistAppSnapshotNow,
    upsertReminder,
    updateReminderStatus,
    getChildInterventionCard,
    getLatestConsultationForChild,
  } = useApp();

  const parentFeed = getParentFeed();
  const authorizedChildIds = useMemo(
    () => new Set(parentFeed.map((item) => item.child.id)),
    [parentFeed]
  );
  const defaultChildId =
    childFromQuery && authorizedChildIds.has(childFromQuery)
      ? childFromQuery
      : parentFeed[0]?.child.id ?? "";
  const [selectedChildId, setSelectedChildId] = useState(defaultChildId);
  const [question, setQuestion] = useState("");
  const [currentResult, setCurrentResult] = useState<ParentAgentResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [latestTrendQuery, setLatestTrendQuery] = useState<string | null>(null);
  const [latestTrendResult, setLatestTrendResult] = useState<ParentTrendQueryResponse | null>(null);
  const [showMoreContent, setShowMoreContent] = useState(false);
  const [, setReflexionLoading] = useState(false);
  const [parentMessageStatus, setParentMessageStatus] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [suggestionRefreshNonce, setSuggestionRefreshNonce] = useState(0);
  const [feedbackNotePrefill, setFeedbackNotePrefill] = useState<{
    value: string;
    token: number;
  } | null>(null);
  const reflexionRequestRef = useRef(0);
  const reflexionAbortRef = useRef<AbortController | null>(null);
  const selectedChildIdRef = useRef(selectedChildId);
  const autoTrendHandledRef = useRef<string | null>(null);

  const resolvedChildId =
    selectedChildId && authorizedChildIds.has(selectedChildId)
      ? selectedChildId
      : childFromQuery && authorizedChildIds.has(childFromQuery)
        ? childFromQuery
        : parentFeed[0]?.child.id ?? "";
  const selectedFeed = useMemo(
    () => parentFeed.find((item) => item.child.id === resolvedChildId) ?? parentFeed[0],
    [parentFeed, resolvedChildId]
  );
  const displayedTrendQuestion = latestTrendQuery;
  const displayedTrendResult = latestTrendResult;
  const displayedTrendError = trendError;
  const displayedTrendLoading = trendLoading;
  const hasVisibleTrendCard = Boolean(
    displayedTrendQuestion || displayedTrendLoading || displayedTrendError || displayedTrendResult
  );

  const baseContext = useMemo(() => {
    if (!selectedFeed) return null;

    return buildParentAgentChildContext({
      child: selectedFeed.child,
      smartInsights: selectedFeed.suggestions,
      healthCheckRecords,
      mealRecords,
      growthRecords,
      guardianFeedbacks,
      taskCheckInRecords,
      weeklyTrend: selectedFeed.weeklyTrend,
    });
  }, [guardianFeedbacks, growthRecords, healthCheckRecords, mealRecords, selectedFeed, taskCheckInRecords]);

  const activeContext = useMemo(() => {
    if (!baseContext) return null;
    return {
      ...baseContext,
      currentInterventionCard: currentResult?.interventionCard ?? null,
    };
  }, [baseContext, currentResult]);

  const snapshot = useMemo(
    () => (baseContext ? buildParentChildSuggestionSnapshot(baseContext) : null),
    [baseContext]
  );
  const parentDrafts = useMemo(
    () =>
      mobileDrafts.filter(
        (draft) => draft.targetRole === "parent" && (!selectedFeed || draft.childId === selectedFeed.child.id)
      ),
    [mobileDrafts, selectedFeed]
  );
  const latestInterventionCard = useMemo(
    () => (selectedFeed ? getChildInterventionCard(selectedFeed.child.id) : undefined),
    [getChildInterventionCard, selectedFeed]
  );
  const latestConsultation = useMemo(
    () => (selectedFeed ? getLatestConsultationForChild(selectedFeed.child.id) : undefined),
    [getLatestConsultationForChild, selectedFeed]
  );
  const displayInterventionCard = currentResult?.interventionCard ?? latestInterventionCard;
  const displayConsultation = currentResult?.consultation ?? latestConsultation;
  const feedbackInitialSelections = useMemo(() => {
    const latestFeedback = selectedFeed?.latestFeedback;
    if (latestFeedback) {
      return {
        executionStatus: latestFeedback.executionStatus ?? "partial",
        executionCount: latestFeedback.executionCount ?? 1,
        executorRole: latestFeedback.executorRole ?? "parent",
        childReaction: latestFeedback.childReaction ?? "accepted",
        improvementStatus: latestFeedback.improvementStatus ?? "slight_improvement",
        barriers: latestFeedback.barriers ?? [],
        expandDetails: Boolean(latestFeedback.freeNote),
      };
    }

    if (!displayInterventionCard) {
      return undefined;
    }

    return {
      executionStatus: "partial" as const,
      executionCount: 1,
      executorRole: "parent" as const,
      childReaction: "accepted" as const,
      improvementStatus: "slight_improvement" as const,
    };
  }, [displayInterventionCard, selectedFeed?.latestFeedback]);
  const structuredFeedbackTaskContext = useMemo(() => {
    if (!selectedFeed || !displayInterventionCard) return null;

    const childId = selectedFeed.child.id;
    const seededTasks = buildInterventionTasksFromCard(displayInterventionCard, {
      legacyWeeklyTaskId: baseContext?.task.id,
    });
    const tasks = materializeTasksFromLegacy({
      existingTasks: seededTasks.tasks,
      interventionCards: [displayInterventionCard],
      consultations: displayConsultation ? [displayConsultation] : [],
      reminders: reminders.filter(
        (item) => item.childId === childId || item.targetId === childId
      ),
      guardianFeedbacks: guardianFeedbacks.filter((item) => item.childId === childId),
      taskCheckIns: taskCheckInRecords.filter((item) => item.childId === childId),
    });

    return {
      tasks,
      activeTask: pickActiveTask(tasks, childId, "parent"),
    };
  }, [
    baseContext?.task.id,
    displayConsultation,
    displayInterventionCard,
    guardianFeedbacks,
    reminders,
    selectedFeed,
    taskCheckInRecords,
  ]);
  const displayTonightTopAction = displayInterventionCard?.tonightHomeAction ?? currentResult?.tonightTopAction ?? baseContext?.task.description ?? "";
  const displayWhyNow =
    currentResult?.whyNow ??
    displayConsultation?.summary ??
    "系统综合近 7 天业务数据、教师观察和家长反馈，为今晚优先选出一条最值得执行的家庭动作。";
  const displayObservationPoints =
    displayInterventionCard?.observationPoints ?? currentResult?.tonightObservationPoints ?? [];
  const displayTeacherObservation =
    displayInterventionCard?.tomorrowObservationPoint ??
    currentResult?.teacherTomorrowObservation ??
    "明早继续反馈今晚执行结果，方便教师继续观察。";
  const careFocusSpeechText = buildParentSpeechScript({
    title: `${selectedFeed?.child.name ?? "孩子"} 今晚先做什么`,
    sections: [
      { label: "今晚就做", text: displayTonightTopAction },
      { label: "为什么现在做", text: displayWhyNow },
      { label: "明天老师继续看", text: displayTeacherObservation },
    ],
    outro: "浏览器播报，仅用于当前设备预览，不是后端真实语音。",
  });
  const currentResultSpeechText = buildParentSpeechScript({
    title: "家长当前建议",
    sections: [
      { label: "今晚动作", text: displayTonightTopAction },
      { label: "为什么推荐", text: displayWhyNow },
      { label: "明天继续看", text: displayTeacherObservation },
      {
        label: "48 小时复查",
        text: displayConsultation?.followUp48h?.[0] ?? displayInterventionCard?.reviewIn48h,
      },
    ],
    outro: "浏览器播报，仅用于当前设备预览，不是后端真实语音。",
  });
  const transparencyModel = useMemo(
    () =>
      baseContext && selectedFeed
        ? buildParentAgentTransparencyModel({
            context: baseContext,
            currentResult,
            consultation: displayConsultation,
            trendResult: displayedTrendResult,
            pendingFeedback: !selectedFeed.hasFeedbackToday,
          })
        : null,
    [baseContext, currentResult, displayConsultation, displayedTrendResult, selectedFeed]
  );
  const hydrationDisplay = selectedFeed ? getHydrationDisplayState(selectedFeed.weeklyTrend.hydrationAvg) : null;
  const familyTaskReminder = useMemo(
    () =>
      reminders.find(
        (item) =>
          item.targetRole === "parent" &&
          item.childId === selectedFeed?.child.id &&
          item.reminderType === "family-task"
      ),
    [reminders, selectedFeed]
  );
  const questionLoading = suggestionLoading || followUpLoading || displayedTrendLoading;
  const storybookDemoSeedId = selectedFeed
    ? resolveDefaultParentStoryBookDemoSeedId({
        childId: selectedFeed.child.id,
        currentUserId: currentUser.id,
        accountKind: currentUser.accountKind,
      })
    : null;
  const storybookHref =
    selectedFeed && storybookDemoSeedId
      ? `/parent/storybook?child=${selectedFeed.child.id}&demoSeed=${storybookDemoSeedId}`
      : `/parent/storybook?child=${selectedFeed?.child.id ?? ""}`;
  const unifiedTrendQuestion = useMemo(
    () =>
      selectedFeed
        ? `${selectedFeed.child.name} 最近趋势怎么样？`
        : "我想看孩子最近趋势",
    [selectedFeed]
  );

  useEffect(() => {
    if (resolvedChildId && resolvedChildId !== selectedChildId) {
      setSelectedChildId(resolvedChildId);
    }
  }, [resolvedChildId, selectedChildId]);

  useEffect(() => {
    if (!selectedFeed) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("child", selectedFeed.child.id);
    nextParams.delete("trace");
    nextParams.delete("trendCase");
    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) {
      return;
    }

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(nextQuery ? `${pathname}?${nextQuery}${hash}` : `${pathname}${hash}`, { scroll: false });
  }, [pathname, router, searchParams, selectedFeed]);

  useEffect(() => {
    selectedChildIdRef.current = selectedFeed?.child.id ?? "";
  }, [selectedFeed]);

  useEffect(() => {
    return () => {
      reflexionAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    reflexionRequestRef.current += 1;
    reflexionAbortRef.current?.abort();
    reflexionAbortRef.current = null;
    setHistory([]);
    setQuestion("");
    setTrendLoading(false);
    setTrendError(null);
    setLatestTrendQuery(null);
    setLatestTrendResult(null);
    setReflexionLoading(false);
    setParentMessageStatus(null);
    setFeedbackStatus(null);
    setFeedbackNotePrefill(null);
  }, [resolvedChildId]);

  useEffect(() => {
    if (!careMode) return;
    setShowMoreContent(false);
  }, [careMode, resolvedChildId]);

  useEffect(() => {
    if (!selectedFeed || !currentResult) return;

    buildReminderItems({
      childId: selectedFeed.child.id,
      targetRole: "parent",
      targetId: selectedFeed.child.id,
      childName: selectedFeed.child.name,
      interventionCard: currentResult.interventionCard,
      consultation: currentResult.consultation,
    }).forEach((item) => upsertReminder(item));
  }, [currentResult, selectedFeed, upsertReminder]);

  const readRouteError = useCallback(
    async (response: Response, fallbackMessage: string) => {
      try {
        const body = (await response.json()) as { error?: string; detail?: string };
        return body.error ?? body.detail ?? fallbackMessage;
      } catch {
        return fallbackMessage;
      }
    },
    []
  );

  const normalizeTrendFailureMessage = useCallback((message: string, status?: number) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return "家长趋势查询暂时不可用，请稍后再试。";
    }

    const lower = trimmed.toLowerCase();
    const looksLikeBrainUnavailable =
      status === 503 ||
      trimmed.includes("FastAPI brain") ||
      trimmed.includes("brain") ||
      trimmed.includes("后端趋势服务") ||
      trimmed.includes("未接通");
    if (looksLikeBrainUnavailable) {
      return "趋势解读暂时不可用，请稍后再试。";
    }

    if (status === 504 || lower.includes("timeout") || trimmed.includes("超时")) {
      return "趋势解读响应超时，请稍后再试。";
    }

    if (trimmed.includes("demo_snapshot") || trimmed.includes("回退") || trimmed.includes("降级")) {
      return "当前结果来自演示快照，不是实时机构数据。";
    }

    return "家长趋势查询暂时不可用，请稍后再试。";
  }, []);

  const readTrendRouteError = useCallback(
    async (response: Response) => {
      const rawMessage = await readRouteError(response, "家长趋势查询暂时不可用，请稍后再试。");
      return normalizeTrendFailureMessage(rawMessage, response.status);
    },
    [normalizeTrendFailureMessage, readRouteError]
  );

  const normalizeParentMessageFailureMessage = useCallback((message: string, status?: number) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return "已先展示当前建议，补充说明会在稍后继续完善。";
    }

    const lower = trimmed.toLowerCase();
    const looksLikeServiceUnavailable =
      status === 503 ||
      trimmed.includes("FastAPI brain") ||
      lower.includes("brain") ||
      lower.includes("reflexion") ||
      trimmed.includes("后端") ||
      trimmed.includes("未接通");
    if (looksLikeServiceUnavailable) {
      return "已先展示当前建议，补充说明会在服务恢复后继续完善。";
    }

    if (status === 504 || lower.includes("timeout") || trimmed.includes("超时")) {
      return "已先展示当前建议，补充说明生成得比平时慢一些，请稍后再看。";
    }

    if (lower.includes("fallback") || trimmed.includes("回退") || trimmed.includes("降级")) {
      return "已先展示当前可用建议，补充说明会继续按后续反馈更新。";
    }

    return sanitizeParentFacingText(trimmed);
  }, []);

  const readParentMessageRouteError = useCallback(
    async (response: Response) => {
      const rawMessage = await readRouteError(
        response,
        "已先展示当前建议，补充说明会在稍后继续完善。"
      );
      return normalizeParentMessageFailureMessage(rawMessage, response.status);
    },
    [normalizeParentMessageFailureMessage, readRouteError]
  );

  const enrichParentMessageResult = useCallback(async (params: {
    context: ParentAgentChildContext;
    snapshotPayload: ChildSuggestionSnapshot;
    baseResult: ParentAgentResult;
    historyId?: string;
  }) => {
    const requestId = ++reflexionRequestRef.current;
    const childId = params.context.child.id;
    const controller = new AbortController();

    reflexionAbortRef.current?.abort();
    reflexionAbortRef.current = controller;

    setReflexionLoading(true);
    setParentMessageStatus("正在把建议整理成更适合家长阅读的表达。");

    try {
      const payload = buildParentMessageReflexionPayload({
        context: params.context,
        snapshot: params.snapshotPayload,
        result: params.baseResult,
      });
      const response = await fetch("/api/ai/parent-message-reflexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await readParentMessageRouteError(response));
      }

      const data = (await response.json()) as ParentMessageReflexionResponse;
      if (
        reflexionRequestRef.current !== requestId ||
        selectedChildIdRef.current !== childId
      ) {
        return;
      }

      const nextResult = mergeParentMessageReflexionResult({
        baseResult: params.baseResult,
        response: data,
      });

      setCurrentResult(nextResult);
      if (params.historyId) {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === params.historyId ? { ...item, result: nextResult } : item
          )
        );
      }

      if (data.fallback || data.evaluationMeta.fallback) {
        setParentMessageStatus("已优先展示当前可用建议。");
      } else if (!data.evaluationMeta.canSend) {
        setParentMessageStatus("已展示当前建议，后续会继续结合新反馈更新。");
      } else {
        setParentMessageStatus(null);
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        reflexionRequestRef.current !== requestId ||
        selectedChildIdRef.current !== childId
      ) {
        return;
      }

      setParentMessageStatus(
        normalizeParentMessageFailureMessage(
          error instanceof Error
            ? error.message
            : "已先展示当前建议，补充说明会在稍后继续完善。"
        )
      );
    } finally {
      if (
        reflexionRequestRef.current === requestId &&
        selectedChildIdRef.current === childId
      ) {
        setReflexionLoading(false);
      }
      if (reflexionAbortRef.current === controller) {
        reflexionAbortRef.current = null;
      }
    }
  }, [normalizeParentMessageFailureMessage, readParentMessageRouteError]);

  const submitTrendQuery = useCallback(async (nextQuestion: string) => {
    if (!selectedFeed) return;

    setTrendLoading(true);
    setTrendError(null);
    setLatestTrendQuery(nextQuestion);
    setLatestTrendResult(null);

    try {
      const payload = buildParentTrendQueryPayload({
        question: nextQuestion,
        childId: selectedFeed.child.id,
        children,
        attendanceRecords,
        mealRecords,
        growthRecords,
        guardianFeedbacks,
        healthCheckRecords,
        taskCheckInRecords,
        interventionCards,
        consultations,
        mobileDrafts,
        reminders,
      });

      const response = await fetch("/api/ai/parent-trend-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readTrendRouteError(response));
      }

      const data = (await response.json()) as ParentTrendQueryResponse;
      setLatestTrendResult(data);
      setQuestion("");
    } catch (error) {
      const message = normalizeTrendFailureMessage(
        error instanceof Error ? error.message : "趋势查询暂时不可用，请稍后再试。"
      );
      setTrendError(message);
    } finally {
      setTrendLoading(false);
    }
  }, [
    attendanceRecords,
    children,
    consultations,
    growthRecords,
    guardianFeedbacks,
    healthCheckRecords,
    interventionCards,
    mealRecords,
    mobileDrafts,
    normalizeTrendFailureMessage,
    readTrendRouteError,
    reminders,
    selectedFeed,
    taskCheckInRecords,
  ]);

  async function submitFollowUp(prefilledQuestion?: string) {
    if (!activeContext || !currentResult) return;
    const nextQuestion = (prefilledQuestion ?? question).trim();
    if (!nextQuestion) return;

    if (isLikelyTrendQuestion(nextQuestion)) {
      await submitTrendQuery(nextQuestion);
      return;
    }

    setTrendError(null);
    setLatestTrendQuery(null);
    setLatestTrendResult(null);
    setFollowUpLoading(true);
    try {
      const payload = buildParentAgentFollowUpPayload({
        context: activeContext,
        question: nextQuestion,
        suggestionResult: currentResult,
        history: history.map((item) => ({ question: item.question, answer: item.result.assistantAnswer })),
      });

      const response = await fetch("/api/ai/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("follow-up failed");
      }

      const data = (await response.json()) as AiFollowUpResponse;
      const nextResult = buildParentAgentFollowUpResult({
        context: activeContext,
        baseResult: currentResult,
        response: data,
      });

      parentDrafts
        .filter((draft) => draft.syncStatus === "local_pending")
        .forEach((draft) => markMobileDraftSyncStatus(draft.draftId, "synced"));

      setCurrentResult(nextResult);
      const historyId = `${Date.now()}-${history.length}`;
      setHistory((prev) => [
        ...prev,
        { id: historyId, question: nextQuestion, result: nextResult },
      ]);
      void enrichParentMessageResult({
        context: activeContext,
        snapshotPayload: payload.snapshot as ChildSuggestionSnapshot,
        baseResult: nextResult,
        historyId,
      });
      setQuestion("");
    } finally {
      setFollowUpLoading(false);
    }
  }

  useEffect(() => {
    if (routeIntent !== "query_trend" || !selectedFeed) {
      return;
    }

    const autoTrendKey = `${selectedFeed.child.id}:${routeIntent}`;
    if (autoTrendHandledRef.current === autoTrendKey) {
      return;
    }

    autoTrendHandledRef.current = autoTrendKey;
    setQuestion(unifiedTrendQuestion);
    void submitTrendQuery(unifiedTrendQuestion);
  }, [routeIntent, selectedFeed, submitTrendQuery, unifiedTrendQuestion]);

  useEffect(() => {
    if (!baseContext || !snapshot) return;

    let cancelled = false;
    const controller = new AbortController();
    const context = baseContext;
    const snapshotPayload = snapshot;

    async function fetchSuggestion() {
      setSuggestionLoading(true);

      try {
        const response = await fetch("/api/ai/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: snapshotPayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("fetch suggestion failed");
        }

        const data = (await response.json()) as AiSuggestionResponse;
        if (!cancelled) {
          const baseResult = buildParentAgentSuggestionResult({
            context,
            suggestion: data,
          });
          setCurrentResult(baseResult);
          void enrichParentMessageResult({
            context,
            snapshotPayload,
            baseResult,
          });
        }
      } catch {
        if (!cancelled) {
          const fallback = buildFallbackSuggestion(snapshotPayload);
          const baseResult = buildParentAgentSuggestionResult({
            context,
            suggestion: fallback,
          });
          setCurrentResult(baseResult);
          void enrichParentMessageResult({
            context,
            snapshotPayload,
            baseResult,
          });
        }
      } finally {
        if (!cancelled) {
          setSuggestionLoading(false);
        }
      }
    }

    void fetchSuggestion();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [baseContext, enrichParentMessageResult, snapshot, suggestionRefreshNonce]);

  async function submitStructuredFeedback(
    input: ParentStructuredFeedbackComposerSubmitInput
  ) {
    if (!selectedFeed || !displayInterventionCard) {
      setFeedbackStatus("当前还没有可提交的今晚建议，请先确认当前孩子的行动卡。");
      return false;
    }

    setFeedbackStatus("正在提交今晚反馈...");

    flushSync(() => {
      addGuardianFeedback({
        childId: input.childId,
        executionStatus: input.executionStatus,
        executionCount: input.executionCount,
        executorRole: input.executorRole,
        childReaction: input.childReaction,
        improvementStatus: input.improvementStatus,
        barriers: input.barriers,
        notes: input.notes,
        relatedTaskId: input.relatedTaskId,
        relatedConsultationId: input.relatedConsultationId,
        interventionCardId: input.interventionCardId ?? displayInterventionCard.id,
        attachments: input.attachments,
        sourceChannel: "parent-agent",
      });

      if (input.executionStatus !== "not_started") {
        checkInTask(
          selectedFeed.child.id,
          input.relatedTaskId ?? displayInterventionCard.id,
          getLocalToday()
        );
      }

      parentDrafts
        .filter((draft) => draft.syncStatus === "local_pending")
        .forEach((draft) => markMobileDraftSyncStatus(draft.draftId, "synced"));

      if (familyTaskReminder) {
        updateReminderStatus(familyTaskReminder.reminderId, "acknowledged");
      }
    });

    const persistResult = await persistAppSnapshotNow();
    setFeedbackNotePrefill(null);
    setSuggestionRefreshNonce((current) => current + 1);

    if (persistResult.status === "failed") {
      setFeedbackStatus("反馈已记在当前设备，但远端保存还没成功，请稍后再试。");
      return false;
    }

    setFeedbackStatus(
      persistResult.status === "saved"
        ? "今晚反馈已提交，家长建议会按这条新反馈继续更新。"
        : "今晚反馈已记录在当前设备，家长建议会按这条新反馈继续更新。"
    );
    return true;
  }

  function snoozeFamilyReminder() {
    if (!familyTaskReminder) {
      setFeedbackStatus("当前没有可稍后提醒的家庭任务提醒。");
      return;
    }

    updateReminderStatus(familyTaskReminder.reminderId, "snoozed");
    setFeedbackStatus("已设置稍后提醒，任务卡状态会同步保存在本地。");
  }

  if (!selectedFeed || !baseContext || !snapshot) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<BrainCircuit className="h-6 w-6" />}
          title="当前没有可展示的孩子数据"
          description="请先从家长首页确认当前孩子档案是否可见。"
        />
      </div>
    );
  }

  const hasMultipleChildren = parentFeed.length > 1;
  const normalPageActions = (
    <>
      <CareModeToggle
        careMode={careMode}
        onChange={setCareMode}
        className="w-full sm:w-[320px]"
      />
      <InlineLinkButton href="/parent" label="返回家长首页" />
      <InlineLinkButton
        href={storybookHref}
        label="打开今日微绘本"
        variant="secondary"
      />
      <InlineLinkButton
        href={`/parent/agent?child=${selectedFeed.child.id}`}
        label="刷新当前建议"
        variant="premium"
      />
    </>
  );
  const carePageActions = (
    <>
      <CareModeToggle
        careMode={careMode}
        onChange={setCareMode}
        className="w-full sm:w-[320px]"
      />
      <InlineLinkButton href="/parent" label="返回家长首页" />
      <InlineLinkButton
        href={`/parent/agent?child=${selectedFeed.child.id}`}
        label="刷新当前建议"
        variant="premium"
      />
    </>
  );

  if (careMode) {
    return (
      <RolePageShell
        badge={`家长 AI 助手 · 当前孩子 ${selectedFeed.child.name}`}
        title="今晚先做一件事，做完再给老师一个最短反馈。"
        description="关怀模式把首屏收敛成大字行动摘要，先让祖辈和低数字熟练度照护者看懂今晚做什么、明天看什么、为什么现在做。"
        actions={carePageActions}
      >
        <RoleSplitLayout
          stacked
          aside={null}
          main={
            <div className="space-y-6">
              <ParentCareFocusCard
                badge="关怀模式"
                title={`今晚先陪 ${selectedFeed.child.name} 做这一件事`}
                description={
                  currentResult?.summary ??
                  "先完成今晚动作，再把孩子的反应告诉老师。"
                }
                items={[
                  {
                    label: "今晚就做这件事",
                    value: displayTonightTopAction,
                    tone: "amber",
                  },
                  {
                    label: "明天老师会继续看",
                    value: displayTeacherObservation,
                    tone: "sky",
                  },
                  {
                    label: "为什么现在做",
                    value: displayWhyNow,
                    tone: "emerald",
                  },
                ]}
                actions={
                  <>
                    <ParentSpeakButton
                      text={careFocusSpeechText}
                      label="读给我听"
                      careMode
                      variant="secondary"
                    />
                    <Link href="#feedback" className="sm:flex-1">
                      <Button className="min-h-12 w-full rounded-2xl text-base">
                        做完后去反馈
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 rounded-2xl text-base sm:flex-1"
                      onClick={() => setShowMoreContent((prev) => !prev)}
                    >
                      {showMoreContent ? "收起更多内容" : "查看更多内容"}
                    </Button>
                  </>
                }
              />

              <div id="feedback">
                <SectionCard
                  title="做完后告诉老师"
                  description="首屏只保留最关键的三项反馈，补充情况可以稍后再填。"
                >
                  <ParentStructuredFeedbackComposer
                    careMode
                    key={`${selectedFeed.child.id}-${displayInterventionCard?.id ?? "no-card"}-${feedbackNotePrefill?.token ?? "no-prefill"}-care`}
                    childId={selectedFeed.child.id}
                    interventionCard={displayInterventionCard}
                    activeTask={structuredFeedbackTaskContext?.activeTask}
                    consultation={displayConsultation}
                    feedbackPrompt={currentResult?.feedbackPrompt}
                    reminderStatus={familyTaskReminder?.status}
                    latestFeedback={selectedFeed.latestFeedback}
                    statusMessage={feedbackStatus}
                    notePrefill={feedbackNotePrefill}
                    initialSelections={feedbackInitialSelections}
                    onSubmit={submitStructuredFeedback}
                    onSnoozeReminder={snoozeFamilyReminder}
                  />
                </SectionCard>
              </div>

              {showMoreContent ? (
                <div className="space-y-6">
                  <AgentWorkspaceCard
                    title="老师建议摘要"
                    description="关怀模式下只保留结果标题、摘要、今晚动作和明天观察点。"
                    badgeLabel="今晚建议"
                  >
                    {suggestionLoading || !currentResult ? (
                      <div className="rounded-3xl border border-slate-100 bg-white p-5 text-base text-slate-500">
                        正在整理今晚最重要的一件事……
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {parentMessageStatus ? (
                          <p className="text-sm leading-6 text-slate-600">
                            {parentMessageStatus}
                          </p>
                        ) : null}
                        <div className="rounded-[28px] border border-indigo-100 bg-indigo-50/60 p-5">
                          <ParentSpeakButton
                            text={currentResultSpeechText}
                            label="读给我听"
                            careMode
                            variant="secondary"
                            className="mb-4"
                          />
                          <p className="text-xl font-semibold text-slate-950">
                            {currentResult.title}
                          </p>
                          <p className="mt-3 text-base leading-8 text-slate-700">
                            {currentResult.summary}
                          </p>
                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-3xl border border-white/80 bg-white/90 p-4">
                              <p className="text-sm font-semibold text-slate-500">
                                今晚要做
                              </p>
                              <p className="mt-3 text-lg font-semibold leading-8 text-slate-950">
                                {displayTonightTopAction}
                              </p>
                            </div>
                            <div className="rounded-3xl border border-white/80 bg-white/90 p-4">
                              <p className="text-sm font-semibold text-slate-500">
                                明天继续看
                              </p>
                              <p className="mt-3 text-lg font-semibold leading-8 text-slate-950">
                                {displayTeacherObservation}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </AgentWorkspaceCard>

                  {transparencyModel ? (
                    <ParentTransparencyPanel
                      careMode
                      model={transparencyModel}
                      title="这条建议为什么值得先做"
                      description="先给一句话摘要和提醒，详细来源默认收起。"
                    />
                  ) : null}

                  <SectionCard
                    title="当前孩子情况"
                    description="更多内容里再看孩子档案、最近风险和成长记录。"
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl border border-slate-100 bg-white p-4">
                        <p className="text-lg font-semibold text-slate-900">
                          {selectedFeed.child.name}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {selectedFeed.child.className} · {getAgeText(selectedFeed.child.birthDate)} ·
                          出生于 {formatDisplayDate(selectedFeed.child.birthDate)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedFeed.child.allergies.length > 0 ? (
                            selectedFeed.child.allergies.map((item) => (
                              <Badge key={item} variant="warning">
                                过敏：{item}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="success">暂无过敏重点</Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-3xl bg-amber-50 p-4">
                          <p className="text-xs text-amber-700">近 7 天重点原因</p>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                            {baseContext.focusReasons[0]}
                          </p>
                        </div>
                        <div className="rounded-3xl bg-sky-50 p-4">
                          <p className="text-xs text-sky-700">补水状态</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {hydrationDisplay?.statusLabel ?? "暂无"}
                          </p>
                          <p className="mt-1 text-xs text-sky-800/80">
                            主动性：{hydrationDisplay?.initiativeLabel ?? "待观察"}
                          </p>
                        </div>
                        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
                          <p className="text-xs text-slate-500">最近家长反馈</p>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                            {selectedFeed.latestFeedback
                              ? formatParentFeedbackStatusLabel(selectedFeed.latestFeedback.status)
                              : "最近尚未形成反馈"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="成长行为与影像记录"
                    description="需要看上下文时，再打开最近的成长记录和图片。"
                  >
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <div className="space-y-3">
                        {selectedFeed.weeklyGrowth.slice(0, 4).map((record) => (
                          <div
                            key={record.id}
                            className="rounded-3xl border border-slate-100 bg-white p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {record.category}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  {formatTimelineTime(record.createdAt)}
                                </p>
                              </div>
                              <Badge
                                variant={record.needsAttention ? "warning" : "success"}
                              >
                                {record.needsAttention ? "需继续观察" : "稳定亮点"}
                              </Badge>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {record.description}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedFeed.mediaGallery.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            className="overflow-hidden rounded-3xl border border-slate-100 bg-white"
                          >
                            <div className="relative aspect-[4/3] bg-slate-100">
                              <Image
                                src={item.thumbnailUrl}
                                alt={item.title}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 260px"
                              />
                            </div>
                            <div className="space-y-2 p-4">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {item.title}
                                </p>
                                <Badge
                                  variant={item.source === "meal" ? "info" : "secondary"}
                                >
                                  {item.source === "meal" ? "餐食图" : "成长影像"}
                                </Badge>
                              </div>
                              <p className="text-xs leading-5 text-slate-500">
                                {item.summary}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="继续追问与趋势"
                    description="如果要进一步追问，完整 AI 工作区放在这里。"
                  >
                    <div className="space-y-4">
                      <Textarea
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        placeholder="继续追问，例如：今晚如果孩子不配合，先从哪一步开始？"
                        className="min-h-28 bg-white"
                      />
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-xs font-medium tracking-[0.14em] text-slate-400">
                            继续追问
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {currentResult?.recommendedQuestions.slice(0, 3).map((item) => (
                              <Button
                                key={item}
                                type="button"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => void submitFollowUp(item)}
                                disabled={questionLoading}
                              >
                                {item}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-medium tracking-[0.14em] text-slate-400">
                            趋势快问
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {PARENT_TREND_QUICK_QUESTIONS.map((item) => (
                              <Button
                                key={item}
                                type="button"
                                variant="outline"
                                className="rounded-full border-sky-200 bg-sky-50/70 text-sky-700 hover:bg-sky-100"
                                onClick={() => {
                                  setQuestion(item);
                                  void submitFollowUp(item);
                                }}
                                disabled={questionLoading || !currentResult}
                              >
                                {item}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-3">
                        <Button
                          className="gap-2 rounded-xl"
                          onClick={() => void submitFollowUp()}
                          disabled={questionLoading || !question.trim() || !currentResult}
                        >
                          <Send className="h-4 w-4" />
                          {followUpLoading
                            ? "追问中…"
                            : trendLoading
                              ? "查询趋势中…"
                              : "发送追问"}
                        </Button>
                      </div>
                      <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                        {currentResult ? (
                          <div className="prose prose-sm max-w-none text-slate-700">
                            <ReactMarkdown>{sanitizeParentFacingText(currentResult.assistantAnswer)}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            建议生成后，这里会显示整理好的说明。
                          </p>
                        )}
                      </div>
                      {followUpLoading ? (
                        <div className="rounded-3xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
                          AI 正在整理最新追问，请稍候…
                        </div>
                      ) : null}
                      {hasVisibleTrendCard ? (
                        <ParentTrendResponseCard
                          question={displayedTrendQuestion}
                          result={displayedTrendResult}
                          loading={displayedTrendLoading}
                          error={displayedTrendError}
                          onRetry={
                            displayedTrendQuestion
                              ? () => void submitTrendQuery(displayedTrendQuestion)
                              : undefined
                          }
                        />
                      ) : null}
                    </div>
                  </SectionCard>

                  {displayInterventionCard ? (
                    <div id="intervention">
                      <SectionCard
                        title="当前干预卡详情"
                        description="要看完整干预卡、沟通话术和教师后续跟进，再展开这里。"
                      >
                        <InterventionCardPanel
                          card={displayInterventionCard}
                          audience="parent"
                          footer={
                            <div className="grid gap-4 lg:grid-cols-1">
                              <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                                <p className="text-sm font-semibold text-slate-900">
                                  家长沟通话术
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                  {sanitizeParentFacingText(displayInterventionCard.parentMessageDraft)}
                                </p>
                              </div>
                            </div>
                          }
                        />
                      </SectionCard>
                    </div>
                  ) : null}

                  <SectionCard title="会话历史" description="保留这次会话里的追问和 AI 回答。">
                    <div className="space-y-3">
                      {history.length > 0 ? (
                        history.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-3xl border border-slate-100 bg-white p-4"
                          >
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Clock3 className="h-3.5 w-3.5" />
                              追问记录
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {item.question}
                            </p>
                            <div className="prose prose-sm mt-3 max-w-none text-slate-600">
                              <ReactMarkdown>{sanitizeParentFacingText(item.result.assistantAnswer)}</ReactMarkdown>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          还没有追问记录，先点一个快捷问题或直接输入你的问题。
                        </p>
                      )}
                    </div>
                  </SectionCard>

                  {hasMultipleChildren ? (
                    <SectionCard
                      title="切换孩子"
                      description="如果一个账号下有多个孩子，可以从这里切换。"
                    >
                      <div className="space-y-2">
                        {parentFeed.map((item) => (
                          <button
                            key={item.child.id}
                            type="button"
                            onClick={() => setSelectedChildId(item.child.id)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                              item.child.id === selectedFeed.child.id
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {item.child.name}
                          </button>
                        ))}
                      </div>
                    </SectionCard>
                  ) : null}

                  <SectionCard
                    title="推荐继续追问"
                    description="需要继续细化今晚动作时，再从这里进入。"
                  >
                    <div className="space-y-3">
                      {(currentResult?.recommendedQuestions ?? PARENT_AGENT_QUICK_QUESTIONS).map(
                        (item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => void submitFollowUp(item)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                            disabled={questionLoading || !currentResult}
                          >
                            <div className="flex items-start gap-3">
                              <Sparkles className="mt-0.5 h-4 w-4 text-indigo-500" />
                              <span>{item}</span>
                            </div>
                          </button>
                        )
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard title="其他入口" description="更多页面入口保留在这里，不占首屏。">
                    <div className="space-y-3 text-sm text-slate-600">
                      <Link
                        href={`/parent?child=${selectedFeed.child.id}`}
                        className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        返回家长首页
                      </Link>
                      <Link
                        href="#intervention"
                        className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看当前干预卡详情
                      </Link>
                    </div>
                  </SectionCard>
                </div>
              ) : null}
            </div>
          }
        />
      </RolePageShell>
    );
  }

  return (
    <RolePageShell
      badge={`家长 AI 助手 · 当前儿童 ${selectedFeed.child.name}`}
      title="把今晚怎么做、做完怎么反馈、明天老师继续看什么，放进同一条 AI 闭环里"
      description="这一版家长助手会把今晚怎么做、做完怎么反馈、以及明天老师继续看什么，串成一条完整主路径。"
      actions={normalPageActions}
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
            <SectionCard title="当前儿童信息卡" description="先确认正在查看哪个孩子，再决定今晚先做什么。">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  <p className="text-lg font-semibold text-slate-900">{selectedFeed.child.name}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedFeed.child.className} · {getAgeText(selectedFeed.child.birthDate)} · 出生于 {formatDisplayDate(selectedFeed.child.birthDate)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedFeed.child.allergies.length > 0 ? (
                      selectedFeed.child.allergies.map((item) => (
                        <Badge key={item} variant="warning">
                          过敏：{item}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="success">暂无过敏重点</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">今晚家庭任务</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{displayInterventionCard?.title ?? baseContext.task.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{displayTonightTopAction}</p>
                  <p className="mt-3 text-sm font-medium text-sky-700">{baseContext.task.durationText} · {baseContext.task.tag}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">为什么推荐：{displayWhyNow}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="最近风险摘要" description="AI 先用真实业务数据找出今晚最值得处理的信号。">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-amber-50 p-4">
                  <p className="text-xs text-amber-700">近 7 天重点原因</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{baseContext.focusReasons[0]}</p>
                </div>
                <div className="rounded-3xl bg-sky-50 p-4">
                  <p className="text-xs text-sky-700">补水状态</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{hydrationDisplay?.statusLabel ?? "暂无"}</p>
                  <p className="mt-1 text-xs text-sky-800/80">补水主动性：{hydrationDisplay?.initiativeLabel ?? "待观察"}</p>
                </div>
                <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
                  <p className="text-xs text-slate-500">最近家长反馈</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                    {selectedFeed.latestFeedback
                      ? formatParentFeedbackStatusLabel(selectedFeed.latestFeedback.status)
                      : "最近尚未形成反馈"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {baseContext.focusReasons.map((item) => (
                  <Badge key={item} variant="secondary">{item}</Badge>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="成长行为与影像记录" description="只展示当前孩子的成长观察、餐食图片和影像记录，方便家长提问前先看原始上下文。">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-3">
                  {selectedFeed.weeklyGrowth.slice(0, 4).map((record) => (
                    <div key={record.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{record.category}</p>
                          <p className="mt-1 text-xs text-slate-400">{formatTimelineTime(record.createdAt)}</p>
                        </div>
                        <Badge variant={record.needsAttention ? "warning" : "success"}>
                          {record.needsAttention ? "需继续观察" : "稳定亮点"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{record.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {record.tags.slice(0, 4).map((tag) => (
                          <Badge key={`${record.id}-${tag}`} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedFeed.mediaGallery.slice(0, 4).map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
                      <div className="relative aspect-[4/3] bg-slate-100">
                        <Image
                          src={item.thumbnailUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 260px"
                        />
                      </div>
                      <div className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <Badge variant={item.source === "meal" ? "info" : "secondary"}>
                            {item.source === "meal" ? "餐食图" : "成长影像"}
                          </Badge>
                        </div>
                        <p className="text-xs leading-5 text-slate-500">{item.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <AgentWorkspaceCard
              title="今日建议摘要"
              description="先读系统给出的今晚动作，再用快捷问题继续追问。"
              badgeLabel="今晚建议"
              promptButtons={
                <>
                  {PARENT_AGENT_QUICK_QUESTIONS.map((item) => (
                    <Button
                      key={item}
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setQuestion(item);
                        void submitFollowUp(item);
                      }}
                      disabled={questionLoading || !currentResult}
                    >
                      {item}
                    </Button>
                  ))}
                </>
              }
            >
              {suggestionLoading || !currentResult ? (
                <div className="rounded-3xl border border-slate-100 bg-white p-5 text-sm text-slate-500">
                  正在基于最近 7 天数据生成家长端建议…
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
                    {parentMessageStatus ? (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {parentMessageStatus}
                      </p>
                    ) : null}
                    <ParentSpeakButton
                      text={currentResultSpeechText}
                      label="浏览器播报"
                      className="mt-3"
                    />
                    <p className="mt-3 text-lg font-semibold text-slate-900">{currentResult.title}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{currentResult.summary}</p>
                    <div className="mt-4 rounded-2xl bg-white/80 p-4">
                      <p className="text-sm font-semibold text-slate-900">今晚最该做的一件事</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{displayTonightTopAction}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-900">为什么现在做</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{displayWhyNow}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-100 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">今晚观察点</p>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                        {displayObservationPoints.map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-3xl border border-slate-100 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">明天老师继续看</p>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{displayTeacherObservation}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        48 小时内复查：{displayConsultation?.followUp48h?.[0] ?? displayInterventionCard?.reviewIn48h ?? "继续观察并补一条反馈。"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </AgentWorkspaceCard>

            {transparencyModel ? (
              <ParentTransparencyPanel
                model={transparencyModel}
                title="这条建议怎么来的"
                description="把当前建议的数据来源、可信度和老师侧闭环状态说明清楚，再继续追问。"
              />
            ) : null}

            <SectionCard title="AI 回复区" description="支持普通追问和趋势问答，回答会自动带上当前干预卡、最近反馈和趋势图卡。">
              <div className="space-y-4">
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="继续追问，例如：今晚我具体先做哪一步？如果孩子不配合怎么办？"
                  className="min-h-28 bg-white"
                />
                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-xs font-medium tracking-[0.14em] text-slate-400">继续追问</p>
                    <div className="flex flex-wrap gap-2">
                      {currentResult?.recommendedQuestions.slice(0, 3).map((item) => (
                        <Button
                          key={item}
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => void submitFollowUp(item)}
                          disabled={questionLoading}
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium tracking-[0.14em] text-slate-400">趋势快问</p>
                    <div className="flex flex-wrap gap-2">
                      {PARENT_TREND_QUICK_QUESTIONS.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          variant="outline"
                          className="rounded-full border-sky-200 bg-sky-50/70 text-sky-700 hover:bg-sky-100"
                          onClick={() => {
                            setQuestion(item);
                            void submitFollowUp(item);
                          }}
                          disabled={questionLoading || !currentResult}
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    className="gap-2 rounded-xl"
                    onClick={() => void submitFollowUp()}
                    disabled={questionLoading || !question.trim() || !currentResult}
                  >
                    <Send className="h-4 w-4" />
                    {followUpLoading ? "追问中…" : trendLoading ? "查询趋势中…" : "发送追问"}
                  </Button>
                </div>
                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                  {currentResult ? (
                    <div className="prose prose-sm max-w-none text-slate-700">
                      <ReactMarkdown>{sanitizeParentFacingText(currentResult.assistantAnswer)}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">建议生成后，这里会展示整理好的说明。</p>
                  )}
                </div>
                {followUpLoading ? (
                  <div className="rounded-3xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
                    AI 正在整理最新追问，请稍候…
                  </div>
                ) : null}
                {hasVisibleTrendCard ? (
                  <ParentTrendResponseCard
                    question={displayedTrendQuestion}
                    result={displayedTrendResult}
                    loading={displayedTrendLoading}
                    error={displayedTrendError}
                    onRetry={displayedTrendQuestion ? () => void submitTrendQuery(displayedTrendQuestion) : undefined}
                  />
                ) : null}
              </div>
            </SectionCard>

            {displayInterventionCard ? (
              <div id="intervention">
                <SectionCard title="今晚行动卡" description="把今晚动作、观察点和沟通话术放在一起，方便家里照着执行。">
                    <InterventionCardPanel
                      card={displayInterventionCard}
                      audience="parent"
                      footer={
                        <div className="grid gap-4 lg:grid-cols-1">
                          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">家长沟通话术</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              {sanitizeParentFacingText(displayInterventionCard.parentMessageDraft)}
                            </p>
                          </div>
                        </div>
                      }
                  />
                </SectionCard>
              </div>
            ) : null}

            <div id="feedback">
              <SectionCard title="提交今晚反馈" description="把今晚做了没有、孩子反应和补充情况记下来，下一轮建议会继续参考。">
                <ParentStructuredFeedbackComposer
                  key={`${selectedFeed.child.id}-${displayInterventionCard?.id ?? "no-card"}-${feedbackNotePrefill?.token ?? "no-prefill"}`}
                  childId={selectedFeed.child.id}
                  interventionCard={displayInterventionCard}
                  activeTask={structuredFeedbackTaskContext?.activeTask}
                  consultation={displayConsultation}
                  feedbackPrompt={currentResult?.feedbackPrompt}
                  reminderStatus={familyTaskReminder?.status}
                  latestFeedback={selectedFeed.latestFeedback}
                  statusMessage={feedbackStatus}
                  notePrefill={feedbackNotePrefill}
                  initialSelections={feedbackInitialSelections}
                  onSubmit={submitStructuredFeedback}
                  onSnoozeReminder={snoozeFamilyReminder}
                />
              </SectionCard>
            </div>

            <SectionCard title="本次追问记录" description="保留这次对话里的提问和回答，方便继续往下问。">
              <div className="space-y-3">
                {history.length > 0 ? (
                  history.map((item) => (
                    <div key={item.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        追问记录
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{item.question}</p>
                      <div className="prose prose-sm mt-3 max-w-none text-slate-600">
                        <ReactMarkdown>{sanitizeParentFacingText(item.result.assistantAnswer)}</ReactMarkdown>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">还没有追问记录，先点一个快捷问题或直接输入你的问题。</p>
                )}
              </div>
            </SectionCard>
          </div>
        }
        aside={
          <div className="space-y-6">
            <SectionCard title="当前孩子摘要" description="这里固定显示当前孩子和今晚任务，避免问串对象。">
              <ul className="space-y-3 text-sm text-slate-600">
                <li>当前儿童：{selectedFeed.child.name}</li>
                <li>当前班级：{selectedFeed.child.className}</li>
                <li>当前任务：{baseContext.task.title}</li>
                <li>最近反馈：{selectedFeed.latestFeedback?.status ?? "最近暂无反馈"}</li>
              </ul>
            </SectionCard>

            <SectionCard title="切换儿童" description="如示例家长账号下有多个孩子，可从这里切换。">
              <div className="space-y-2">
                {parentFeed.map((item) => (
                  <button
                    key={item.child.id}
                    type="button"
                    onClick={() => setSelectedChildId(item.child.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      item.child.id === selectedFeed.child.id
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {item.child.name}
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="推荐继续追问" description="用来串起家长今晚执行、明天老师复查和 48 小时闭环。">
              <div className="space-y-3">
                {(currentResult?.recommendedQuestions ?? PARENT_AGENT_QUICK_QUESTIONS).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void submitFollowUp(item)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                    disabled={questionLoading || !currentResult}
                  >
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 text-indigo-500" />
                      <span>{item}</span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="首页联动入口" description="把首页里的任务、干预卡预览和待反馈入口真正串起来。">
              <div className="space-y-3 text-sm text-slate-600">
                <Link href={`/parent?child=${selectedFeed.child.id}`} className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
                  返回家长首页查看干预卡预览
                </Link>
                <Link href={`#intervention`} className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
                  查看当前干预卡详情
                </Link>
                <Link href={`#feedback`} className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
                  直接提交今晚反馈
                </Link>
              </div>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
  );
}
