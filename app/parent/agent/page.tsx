"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import { BrainCircuit, CheckCircle2, Clock3, MessageSquareText, MoonStar, Send, ShieldCheck, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import InterventionCardPanel from "@/components/agent/InterventionCardPanel";
import CareModeToggle from "@/components/parent/CareModeToggle";
import ParentCareFocusCard from "@/components/parent/ParentCareFocusCard";
import {
  ParentActionCard,
  ParentGentleNotice,
  ParentHeroCard,
  ParentTimelineCard,
  ParentWeeklySignalGrid,
  type ParentTimelineItem,
  type ParentWeeklySignal,
} from "@/components/parent/ParentReviewKit";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import ParentTransparencyPanel from "@/components/parent/ParentTransparencyPanel";
import ParentStructuredFeedbackComposer, {
  type ParentStructuredFeedbackComposerSubmitInput,
} from "@/components/parent/ParentStructuredFeedbackComposer";
import AttachmentMediaPicker, {
  AttachmentPreviewList,
  type AttachmentDraft,
} from "@/components/communication/AttachmentMediaPicker";
import FeedbackDetailDialog from "@/components/communication/FeedbackDetailDialog";
import ParentTrendResponseCard from "@/components/parent/ParentTrendResponseCard";
import { RoleAssistantWorkspace } from "@/components/ai";
import {
  ReplicaComboChart,
  replicaChartColors,
  type ReplicaChartDatum,
} from "@/components/charts";
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
import { cn } from "@/lib/utils";
import { formatParentFeedbackStatusLabel } from "@/lib/feedback/consumption";
import {
  createAttachment as createApiAttachment,
  createFeedback as createApiFeedback,
  listAttachments as listApiAttachments,
  listFeedback as listApiFeedback,
  listMessages as listApiMessages,
  sendMessage as sendApiMessage,
  type ApiFeedback,
  type ApiMessage,
} from "@/lib/api/communication";
import type { ApiAttachment } from "@/lib/api/types";
import {
  buildHomeSchoolThreads,
  buildStructuredFeedbackMessageContent,
  formatHomeSchoolPersistStatus,
  formatHomeSchoolTime,
  getHomeSchoolConversationId,
} from "@/lib/communication/home-school";
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

const DAY_MS = 24 * 60 * 60 * 1000;

function parentAgentDateKey(value: unknown) {
  return typeof value === "string" && value.trim() ? value.slice(0, 10) : "";
}

function parentAgentAddDays(key: string, days: number) {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function parentAgentAverage(values: Array<number | null | undefined>) {
  const finiteValues = values.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return finiteValues.length > 0
    ? Math.round(finiteValues.reduce((sum, item) => sum + item, 0) / finiteValues.length)
    : null;
}

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
    messages,
    conversations,
    markMobileDraftSyncStatus,
    persistAppSnapshotNow,
    sendHomeSchoolMessage,
    markHomeSchoolMessageRead,
    markParentReminderRead,
    updateParentReminderStatus,
    upsertReminder,
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
  const [homeSchoolMessageDraft, setHomeSchoolMessageDraft] = useState("");
  const [homeSchoolMessageStatus, setHomeSchoolMessageStatus] = useState<string | null>(null);
  const [homeSchoolMessageSending, setHomeSchoolMessageSending] = useState(false);
  const [homeSchoolAttachmentDrafts, setHomeSchoolAttachmentDrafts] = useState<AttachmentDraft[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [apiFeedbacks, setApiFeedbacks] = useState<ApiFeedback[]>([]);
  const [apiAttachments, setApiAttachments] = useState<ApiAttachment[]>([]);
  const [feedbackDetailId, setFeedbackDetailId] = useState<string | null>(null);
  const [feedbackDetailOpen, setFeedbackDetailOpen] = useState(false);
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
  const feedbackSectionRef = useRef<HTMLDivElement | null>(null);

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
  const childQueryWasUnauthorized = Boolean(childFromQuery && !authorizedChildIds.has(childFromQuery));
  const refreshE04CommunicationData = useCallback(async () => {
    if (!resolvedChildId) return;
    try {
      const [nextMessages, nextFeedbacks, nextAttachments] = await Promise.all([
        listApiMessages(resolvedChildId),
        listApiFeedback(resolvedChildId),
        listApiAttachments({ childId: resolvedChildId }),
      ]);
      setApiMessages(nextMessages);
      setApiFeedbacks(nextFeedbacks);
      setApiAttachments(nextAttachments);
    } catch (error) {
      setHomeSchoolMessageStatus(error instanceof Error ? error.message : "E01 通信数据读取失败。");
    }
  }, [resolvedChildId]);
  const communicationMessages = apiMessages.length > 0 ? apiMessages : messages;
  const selectedHomeSchoolThread = useMemo(() => {
    if (!selectedFeed) return null;
    return (
      buildHomeSchoolThreads({
        messages: communicationMessages,
        conversations,
        children: [selectedFeed.child],
      }).find((thread) => thread.childId === selectedFeed.child.id) ?? null
    );
  }, [communicationMessages, conversations, selectedFeed]);
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
    sanitizeParentFacingText(currentResult?.whyNow) ||
    sanitizeParentFacingText(displayConsultation?.summary) ||
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
  const storybookHref = `/parent/storybook?child=${selectedFeed?.child.id ?? ""}`;
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
    if (typeof window === "undefined" || window.location.hash !== "#feedback") {
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    const scrollToFeedback = () => {
      if (cancelled) return;
      const target = feedbackSectionRef.current ?? document.getElementById("feedback");
      if (!target) return;

      target.focus({ preventScroll: true });
      const top = target.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    };

    window.requestAnimationFrame(scrollToFeedback);
    [120, 360, 720].forEach((delay) => {
      timers.push(window.setTimeout(scrollToFeedback, delay));
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    careMode,
    currentResult,
    displayInterventionCard?.id,
    followUpLoading,
    selectedFeed?.child.id,
    suggestionLoading,
  ]);

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
    setHomeSchoolMessageDraft("");
    setHomeSchoolMessageStatus(null);
    setHomeSchoolAttachmentDrafts([]);
    setFeedbackDetailId(null);
    setFeedbackDetailOpen(false);
    setFeedbackNotePrefill(null);
  }, [resolvedChildId]);

  useEffect(() => {
    void refreshE04CommunicationData();
  }, [refreshE04CommunicationData]);

  useEffect(() => {
    if (!selectedHomeSchoolThread) return;
    selectedHomeSchoolThread.messages
      .filter((message) => message.senderRole === "teacher" && !message.readBy.includes(currentUser.id))
      .forEach((message) => markHomeSchoolMessageRead(message.messageId));
  }, [currentUser.id, markHomeSchoolMessageRead, selectedHomeSchoolThread]);

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

  async function sendParentFreeHomeSchoolMessage() {
    const content = homeSchoolMessageDraft.trim();
    if (!selectedFeed) return;

    if (!content && homeSchoolAttachmentDrafts.length === 0) {
      setHomeSchoolMessageStatus("请输入要同步给老师的内容或附件。");
      return;
    }

    setHomeSchoolMessageSending(true);
    setHomeSchoolMessageStatus("正在通过 E01 API 发送给老师...");
    try {
      const message = await sendApiMessage({
        childId: selectedFeed.child.id,
        conversationId: getHomeSchoolConversationId(selectedFeed.child.id),
        content: content || "附件消息",
      });
      await Promise.all(
        homeSchoolAttachmentDrafts.map((draft) =>
          createApiAttachment({
            childId: selectedFeed.child.id,
            relatedType: "message",
            relatedId: message.messageId,
            kind: draft.kind,
            fileName: draft.fileName,
            mimeType: draft.mimeType,
            byteSize: draft.byteSize,
            localPreviewUrl: draft.localPreviewUrl,
            durationMs: draft.durationMs,
          })
        )
      );
      setHomeSchoolMessageDraft("");
      setHomeSchoolAttachmentDrafts([]);
      await refreshE04CommunicationData();
      setHomeSchoolMessageStatus("E01 API 已保存，刷新后仍可见。");
    } catch (error) {
      setHomeSchoolMessageStatus(error instanceof Error ? `发送失败：${error.message}` : "发送失败。");
    } finally {
      setHomeSchoolMessageSending(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function sendParentFreeHomeSchoolMessageLegacy() {
    const content = homeSchoolMessageDraft.trim();
    if (!selectedFeed) return;

    if (!content) {
      setHomeSchoolMessageStatus("请输入要同步给老师的内容。");
      return;
    }

    setHomeSchoolMessageSending(true);
    setHomeSchoolMessageStatus("正在发送给老师...");
    const result = sendHomeSchoolMessage({
      childId: selectedFeed.child.id,
      classId: selectedFeed.child.className,
      conversationId: getHomeSchoolConversationId(selectedFeed.child.id),
      content,
    });
    setHomeSchoolMessageSending(false);

    if (result.status === "failed") {
      setHomeSchoolMessageStatus(`发送失败：${result.error ?? result.message}`);
      return;
    }

    setHomeSchoolMessageDraft("");
    setHomeSchoolMessageStatus(`${formatHomeSchoolPersistStatus(result.status)}，老师刷新后可见。`);
  }

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
    const payload = buildParentAgentFollowUpPayload({
      context: activeContext,
      question: nextQuestion,
      suggestionResult: currentResult,
      history: history.map((item) => ({ question: item.question, answer: item.result.assistantAnswer })),
    });

    try {
      const response = await fetch("/api/ai/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        throw new Error(body?.message ?? body?.error ?? "follow-up failed");
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
    } catch (error) {
      setParentMessageStatus(
        `AI 追问暂时不可用：${error instanceof Error ? error.message : "provider_unavailable"}`
      );
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
          const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(body?.message ?? body?.error ?? "fetch suggestion failed");
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
      } catch (error) {
        if (!cancelled) {
          setCurrentResult(null);
          setParentMessageStatus(
            `AI 建议暂时不可用：${error instanceof Error ? error.message : "provider_unavailable"}`
          );
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

    if (input.childId !== selectedFeed.child.id) {
      setFeedbackStatus("当前反馈对象与页面选择的孩子不一致，请刷新后重试。");
      return false;
    }

    setFeedbackStatus("正在提交今晚反馈...");

    let savedFeedbackId = "";
    try {
      const detail = await createApiFeedback({
        ...input,
        sourceChannel: "parent-agent",
        content: buildStructuredFeedbackMessageContent({
          childName: selectedFeed.child.name,
          executionStatus: input.executionStatus,
          childReaction: input.childReaction,
          improvementStatus: input.improvementStatus,
          notes: input.notes,
          barriers: input.barriers,
        }),
      });
      savedFeedbackId = detail.feedback.feedbackId;
      await sendApiMessage({
        childId: input.childId,
        conversationId: getHomeSchoolConversationId(input.childId),
        content: detail.feedback.content,
      });
      await Promise.all(
        (input.attachmentDrafts ?? []).map((draft) =>
          createApiAttachment({
            childId: input.childId,
            relatedType: "feedback",
            relatedId: savedFeedbackId,
            kind: draft.kind,
            fileName: draft.fileName,
            mimeType: draft.mimeType,
            byteSize: draft.byteSize,
            localPreviewUrl: draft.localPreviewUrl,
            durationMs: draft.durationMs,
          })
        )
      );
      await refreshE04CommunicationData();
      setFeedbackDetailId(savedFeedbackId);
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? `E01 API 保存失败：${error.message}` : "E01 API 保存失败。");
      return false;
    }

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

    });

    const persistResult = await persistAppSnapshotNow();
    setFeedbackNotePrefill(null);
    setSuggestionRefreshNonce((current) => current + 1);

    if (persistResult.status === "failed") {
      setFeedbackStatus("反馈已记在当前设备，但远端保存还没成功，请稍后再试。");
      return false;
    }

    const messageResult = sendHomeSchoolMessage({
      childId: input.childId,
      classId: selectedFeed.child.className,
      conversationId: getHomeSchoolConversationId(input.childId),
      content: buildStructuredFeedbackMessageContent({
        childName: selectedFeed.child.name,
        executionStatus: input.executionStatus,
        childReaction: input.childReaction,
        improvementStatus: input.improvementStatus,
        notes: input.notes,
        barriers: input.barriers,
      }),
    });

    if (messageResult.status === "failed") {
      setFeedbackStatus(
        `今晚反馈已保存，但家园沟通写入失败：${messageResult.error ?? messageResult.message}`
      );
      return false;
    }

    if (familyTaskReminder) {
      const reminderResult = markParentReminderRead(familyTaskReminder.reminderId);
      if (reminderResult.status === "failed") {
        setFeedbackStatus(
          `今晚反馈和家园沟通已保存，但提醒已读状态保存失败：${reminderResult.error ?? reminderResult.message}`
        );
        return false;
      }
    }

    setFeedbackStatus(
      `${formatHomeSchoolPersistStatus(messageResult.status)}：今晚反馈已提交，并已写入家园沟通。`
    );
    return true;
  }

  function snoozeFamilyReminder() {
    if (!familyTaskReminder) {
      setFeedbackStatus("当前没有可稍后提醒的家庭任务提醒。");
      return;
    }

    const result = updateParentReminderStatus(familyTaskReminder.reminderId, "snoozed");
    if (result.status === "failed") {
      setFeedbackStatus(`稍后提醒保存失败：${result.error ?? result.message}`);
      return;
    }

    setFeedbackStatus(
      result.status === "local_only"
        ? "已设置稍后提醒，并写入 D01 本地演示持久化。"
        : "已设置稍后提醒。"
    );
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

  const renderHomeSchoolCommunication = () => {
    const threadMessages = selectedHomeSchoolThread?.messages ?? [];

    return (
      <>
      <div
        data-testid="parent-communication-panel"
        className="mt-5 rounded-3xl border border-slate-100 bg-white p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <MessageSquareText className="h-4 w-4" />
              家园沟通记录
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {selectedFeed.child.name} · {selectedFeed.child.className}
            </p>
          </div>
          <Badge variant={selectedHomeSchoolThread?.status === "pending" ? "warning" : "secondary"}>
            {selectedHomeSchoolThread?.status === "pending"
              ? "等待老师回复"
              : selectedHomeSchoolThread?.status === "handled"
                ? "已处理"
                : "已同步"}
          </Badge>
        </div>

        {childQueryWasUnauthorized ? (
          <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            当前链接中的 child 参数不属于本家长账号，已切换到授权孩子。
          </p>
        ) : null}

        <div data-testid="parent-message-list" className="mt-4 space-y-3">
          {threadMessages.length > 0 ? (
            threadMessages.map((message) => {
              const isParent = message.senderRole === "parent";
              return (
                <div
                  key={message.messageId}
                  className={cn(
                    "rounded-2xl border px-4 py-3",
                    isParent
                      ? "border-indigo-100 bg-indigo-50/70"
                      : "border-emerald-100 bg-emerald-50/70"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
                    <span>{isParent ? "家长" : message.senderName}</span>
                    <span>{formatHomeSchoolTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {message.content}
                  </p>
                  <div className="mt-3">
                    <AttachmentPreviewList
                      items={apiAttachments.filter(
                        (attachment) => attachment.relatedType === "message" && attachment.relatedId === message.messageId
                      )}
                      compact
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
              当前孩子还没有家园沟通记录，发送后会保存在演示持久层并同步给对应老师。
            </div>
          )}
        </div>

        {apiFeedbacks.length > 0 ? (
          <div data-testid="parent-feedback-detail-list" className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">反馈详情</p>
              <span className="text-xs text-slate-500">{apiFeedbacks.length} 条</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {apiFeedbacks.slice(0, 3).map((feedback) => (
                <Button
                  key={feedback.feedbackId}
                  data-testid="parent-open-feedback-detail"
                  data-feedback-id={feedback.feedbackId}
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setFeedbackDetailId(feedback.feedbackId);
                    setFeedbackDetailOpen(true);
                  }}
                >
                  查看反馈详情
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <Textarea
            data-testid="parent-message-input"
            value={homeSchoolMessageDraft}
            onChange={(event) => setHomeSchoolMessageDraft(event.target.value)}
            placeholder="输入要同步给老师的情况，例如：今晚情绪稳定，但入睡还是偏慢。"
            className="min-h-24 bg-white"
          />
          <AttachmentMediaPicker
            value={homeSchoolAttachmentDrafts}
            onChange={setHomeSchoolAttachmentDrafts}
            accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
            disabled={homeSchoolMessageSending}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-h-5 text-sm text-slate-500">{homeSchoolMessageStatus}</p>
            <Button
              data-testid="parent-send-message"
              type="button"
              className="rounded-full"
              disabled={homeSchoolMessageSending}
              onClick={() => void sendParentFreeHomeSchoolMessage()}
            >
              <Send className="mr-2 h-4 w-4" />
              {homeSchoolMessageSending ? "发送中" : "发送给老师"}
            </Button>
          </div>
        </div>
      </div>
      <FeedbackDetailDialog
        feedbackId={feedbackDetailId}
        open={feedbackDetailOpen}
        onOpenChange={setFeedbackDetailOpen}
      />
      </>
    );
  };

  const agentChildMeta = `${selectedFeed.child.className} · ${getAgeText(
    selectedFeed.child.birthDate
  )} · 出生于 ${formatDisplayDate(selectedFeed.child.birthDate)}`;
  const agentHasPendingFeedback = !selectedFeed.hasFeedbackToday;
  const agentHasHealthWarning = baseContext.weeklyHealthChecks.some((item) => item.isAbnormal);
  const agentStatusLabel = suggestionLoading
    ? "正在整理建议"
    : agentHasPendingFeedback
      ? "待反馈"
      : "闭环已同步";
  const agentStatusVariant = suggestionLoading
    ? "info"
    : agentHasPendingFeedback
      ? "warning"
      : "success";
  const agentHeroPills = [
    { label: "今晚任务", value: baseContext.task.durationText, tone: "indigo" as const },
    { label: "近 7 天饮食", value: `${baseContext.weeklyMeals.length} 条`, tone: "sky" as const },
    {
      label: "晨检记录",
      value: `${baseContext.weeklyHealthChecks.length} 天`,
      tone: agentHasHealthWarning ? ("amber" as const) : ("emerald" as const),
    },
    {
      label: "最近反馈",
      value: selectedFeed.latestFeedback
        ? formatParentFeedbackStatusLabel(selectedFeed.latestFeedback.status)
        : "待补充",
      tone: agentHasPendingFeedback ? ("amber" as const) : ("emerald" as const),
    },
  ];
  const agentTimelineItems: ParentTimelineItem[] = [
    {
      id: "action",
      title: "今晚先做",
      meta: displayInterventionCard?.title ?? baseContext.task.title,
      description: displayTonightTopAction || "当前建议正在整理中。",
      tone: "indigo",
      icon: <Sparkles className="h-4 w-4" />,
      status: suggestionLoading ? "整理中" : "先执行",
      statusVariant: suggestionLoading ? "info" : "info",
    },
    {
      id: "feedback",
      title: "做完反馈",
      meta: agentHasPendingFeedback ? "今晚还缺一条反馈" : "反馈已进入上下文",
      description: currentResult?.feedbackPrompt ?? "提交是否执行、孩子反应和补充情况，下一轮建议会继续参考。",
      tone: agentHasPendingFeedback ? "amber" : "emerald",
      icon: <Send className="h-4 w-4" />,
      status: agentHasPendingFeedback ? "待提交" : "已同步",
      statusVariant: agentHasPendingFeedback ? "warning" : "success",
    },
    {
      id: "teacher",
      title: "明天老师继续看",
      meta: displayConsultation ? "已关联会诊/复查上下文" : "教师端继续观察",
      description: displayTeacherObservation,
      tone: "sky",
      icon: <Clock3 className="h-4 w-4" />,
      status: displayConsultation ? "复查闭环" : "观察点",
      statusVariant: displayConsultation ? "warning" : "info",
    },
  ];
  const agentWeeklySignals: ParentWeeklySignal[] = [
    {
      label: "饮食趋势",
      value: `${baseContext.weeklyTrend.balancedRate}%`,
      helper: `蔬菜 ${baseContext.weeklyTrend.vegetableDays} 天 · 蛋白 ${baseContext.weeklyTrend.proteinDays} 天`,
      tone: "sky",
    },
    {
      label: "补水状态",
      value: hydrationDisplay?.statusLabel ?? "暂无",
      helper: hydrationDisplay?.initiativeLabel ?? "待观察",
      tone: "indigo",
    },
    {
      label: "成长观察",
      value: `${baseContext.weeklyGrowthRecords.length} 条`,
      helper: `${baseContext.attentionGrowthRecords.length} 条需继续观察`,
      tone: baseContext.attentionGrowthRecords.length > 0 ? "amber" : "emerald",
    },
    {
      label: "家庭反馈",
      value: `${baseContext.weeklyFeedbacks.length} 条`,
      helper: agentHasPendingFeedback ? "今晚反馈待提交。" : "反馈已进入建议上下文。",
      tone: agentHasPendingFeedback ? "amber" : "emerald",
    },
  ];
  const agentTrendReferenceDate =
    [
      ...baseContext.weeklyHealthChecks.map((record) => parentAgentDateKey(record.date)),
      ...baseContext.weeklyMeals.map((record) => parentAgentDateKey(record.date)),
      ...baseContext.weeklyGrowthRecords.map((record) => parentAgentDateKey(record.createdAt)),
      ...baseContext.weeklyFeedbacks.map((record) => parentAgentDateKey(record.date)),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);
  const agentTrendDates = Array.from({ length: 7 }, (_, index) => parentAgentAddDays(agentTrendReferenceDate, index - 6));
  const agentTrendRows: ReplicaChartDatum[] = agentTrendDates.map((date) => {
    const dayMeals = baseContext.weeklyMeals.filter((record) => parentAgentDateKey(record.date) === date);
    const dayHealth = baseContext.weeklyHealthChecks.filter((record) => parentAgentDateKey(record.date) === date);
    return {
      label: date.slice(5),
      health: parentAgentAverage(dayHealth.map((record) => record.temperature)),
      diet: parentAgentAverage(dayMeals.map((record) => record.nutritionScore)),
      growth: baseContext.weeklyGrowthRecords.filter((record) => parentAgentDateKey(record.createdAt) === date).length,
      feedback: baseContext.weeklyFeedbacks.filter((record) => parentAgentDateKey(record.date) === date).length,
      reminders: reminders.filter(
        (record) =>
          (record.childId === selectedFeed.child.id || record.targetId === selectedFeed.child.id) &&
          parentAgentDateKey(record.scheduledAt) === date
      ).length,
    };
  });
  const parentAiParityHero = (
    <section className="overflow-hidden rounded-[2rem] border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f4f7ff_48%,#fff7ed_100%)] p-4 shadow-[0_24px_70px_rgb(99_102_241_/_0.14)] sm:p-5">
      <div className="relative overflow-hidden rounded-[1.6rem] bg-[linear-gradient(135deg,#f8fbff_0%,#f5f3ff_55%,#fff7ed_100%)] p-5">
        <div className="absolute right-3 top-3 hidden h-36 w-52 overflow-hidden rounded-[2rem] bg-white/70 shadow-inner sm:block">
          <Image
            src="/pixel-replica/parent/parent-agent-robot.png"
            alt=""
            fill
            unoptimized
            className="object-contain object-right-top"
            sizes="208px"
          />
        </div>
        <div className="relative max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" className="rounded-full px-3 py-1">AI 助手 · 共育建议</Badge>
            <Badge variant={agentHasPendingFeedback ? "warning" : "success"} className="rounded-full px-3 py-1">
              {agentStatusLabel}
            </Badge>
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">
            晚上好，{currentUser.name}
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
            基于 {selectedFeed.child.name} 近期表现和老师观察，为您整理今晚可执行的共育建议。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CareModeToggle careMode={careMode} onChange={setCareMode} variant="compact" />
            <Button asChild variant="outline" className="min-h-11 rounded-2xl bg-white/80">
              <Link href={`/parent/agent?child=${selectedFeed.child.id}`}>刷新建议</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-white bg-white/92 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-black text-indigo-600">1</span>
                <div>
                  <h3 className="text-xl font-bold text-slate-950">今晚推荐这样做</h3>
                  <p className="mt-1 text-sm text-slate-500">只保留最容易完成的家庭动作。</p>
                </div>
              </div>
              <Link href="#feedback" className="hidden rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 sm:block">
                做完去反馈
              </Link>
            </div>
            <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
              {[
                { icon: MoonStar, title: displayTonightTopAction, helper: displayWhyNow },
                { icon: Sparkles, title: "亲子共读 10-15 分钟", helper: "睡前不看屏幕，用孩子熟悉的故事复述今天的开心事。" },
                { icon: CheckCircle2, title: "给孩子积极反馈", helper: "及时肯定努力，帮助孩子形成稳定体验。" },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ede9fe,#dbeafe)] text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-6 text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{item.helper}</p>
                    </div>
                    {index === 1 ? (
                      <span className="relative hidden h-16 w-28 shrink-0 overflow-hidden rounded-2xl bg-slate-50 sm:block">
                        <Image
                          src="/pixel-replica/parent/parent-agent-reading.png"
                          alt=""
                          fill
                          unoptimized
                          className="object-cover"
                          sizes="112px"
                        />
                      </span>
                    ) : null}
                    <span className="mt-1 h-5 w-5 rounded-full border-2 border-slate-300" />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-2xl bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-700">
              小贴士：保持轻松愉快的氛围，简单而持续的陪伴最有效。
            </div>
          </div>

          <div id="feedback-overview" className="rounded-[1.5rem] border border-white bg-white/92 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-black text-emerald-600">2</span>
              <div>
                <h3 className="text-xl font-bold text-slate-950">您完成后的反馈</h3>
                <p className="mt-1 text-sm text-slate-500">您的反馈会帮助老师明天更好地支持 {selectedFeed.child.name}。</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {["完成得很好", "部分完成", "有一些挑战", "没来得及"].map((item, index) => (
                <Link
                  key={item}
                  href="#feedback"
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-center text-sm font-semibold shadow-sm",
                    index === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"
                  )}
                >
                  {item}
                </Link>
              ))}
            </div>
            <Link href="#feedback" className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6366f1,#8b5cf6)] px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-200">
              提交反馈给老师
            </Link>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[1.5rem] border border-white bg-white/92 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-lg font-black text-sky-600">3</span>
              <h3 className="text-lg font-bold text-slate-950">明天老师会继续关注</h3>
            </div>
            <div className="mt-4 grid gap-3">
              {[
                ["情绪稳定性", "在活动中的情绪变化与调节情况"],
                ["语言表达", "主动表达想法与交流意愿"],
                ["同伴互动", "与同伴的合作与互动情况"],
              ].map(([title, helper]) => (
                <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{helper}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
              <p className="text-sm leading-6 text-indigo-700">隐私保护承诺：我们严格保护孩子的个人信息安全。</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
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
        headerVariant="hidden"
        testId="r07-parent-agent-page"
        actions={carePageActions}
      >
        <RoleSplitLayout
          stacked
          aside={null}
          main={
            <div className="space-y-6">
              {parentAiParityHero}

              <RoleAssistantWorkspace
                roleLabel="家长端"
                title="家长 AI 助手"
                description="今日状态、老师消息总结、绘本朗读解释、饮食建议、健康提醒解释和家园沟通草稿统一显示来源与 provider 状态。"
                prompts={[...PARENT_AGENT_QUICK_QUESTIONS, ...PARENT_TREND_QUICK_QUESTIONS]}
                value={question}
                onValueChange={setQuestion}
                onSubmit={() => void submitFollowUp()}
                onPromptClick={(item) => {
                  setQuestion(item);
                  void submitFollowUp(item);
                }}
                loading={questionLoading}
                error={trendError ?? parentMessageStatus}
                source={currentResult?.source}
                model={currentResult?.model}
                response={
                  currentResult ? (
                    <ReactMarkdown>{sanitizeParentFacingText(currentResult.assistantAnswer)}</ReactMarkdown>
                  ) : (
                    <p>AI 建议生成后会显示在这里；provider missing-env 时不展示本地伪成功。</p>
                  )
                }
                actionCards={
                  <div className="space-y-3">
                    <Link href={storybookHref} className="block rounded-2xl border border-indigo-100 bg-white/90 p-3 text-sm font-semibold text-indigo-700">
                      成长绘本朗读/解释
                    </Link>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-emerald-100 bg-white/90 p-3 text-left text-sm font-semibold text-emerald-700"
                      onClick={() => void submitFollowUp("请帮我生成一段今晚发给老师的沟通草稿")}
                      disabled={questionLoading || !currentResult}
                    >
                      家园沟通草稿
                    </button>
                  </div>
                }
              />

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

              <div
                id="feedback"
                ref={feedbackSectionRef}
                tabIndex={-1}
                data-testid="r07-parent-agent-feedback-section"
                className="scroll-mt-24 scroll-mb-[calc(env(safe-area-inset-bottom)+8rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:scroll-mb-0 lg:pb-0"
              >
                <SectionCard
                  title="做完后告诉老师"
                  description="首屏只保留最关键的三项反馈，补充情况可以稍后再填。"
                >
                  <ParentStructuredFeedbackComposer
                    careMode
                    key={`${selectedFeed.child.id}-${displayInterventionCard?.id ?? "no-card"}-${feedbackNotePrefill?.token ?? "no-prefill"}-care`}
                    childId={selectedFeed.child.id}
                    childName={selectedFeed.child.name}
                    childClassName={selectedFeed.child.className}
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
                  {renderHomeSchoolCommunication()}
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
                                unoptimized
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
      headerVariant="hidden"
      testId="r07-parent-agent-page"
      actions={normalPageActions}
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
            {parentAiParityHero}

            <RoleAssistantWorkspace
              roleLabel="家长端"
              title="家长 AI 助手"
              description="今日状态、老师消息总结、绘本朗读解释、饮食建议、健康提醒解释和家园沟通草稿统一显示来源与 provider 状态。"
              prompts={[...PARENT_AGENT_QUICK_QUESTIONS, ...PARENT_TREND_QUICK_QUESTIONS]}
              value={question}
              onValueChange={setQuestion}
              onSubmit={() => void submitFollowUp()}
              onPromptClick={(item) => {
                setQuestion(item);
                void submitFollowUp(item);
              }}
              loading={questionLoading}
              error={trendError ?? parentMessageStatus}
              source={currentResult?.source}
              model={currentResult?.model}
              response={
                currentResult ? (
                  <ReactMarkdown>{sanitizeParentFacingText(currentResult.assistantAnswer)}</ReactMarkdown>
                ) : (
                  <p>AI 建议生成后会显示在这里；provider missing-env 时不展示本地伪成功。</p>
                )
              }
              actionCards={
                <div className="space-y-3">
                  <Link href={storybookHref} className="block rounded-2xl border border-indigo-100 bg-white/90 p-3 text-sm font-semibold text-indigo-700">
                    成长绘本朗读/解释
                  </Link>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-emerald-100 bg-white/90 p-3 text-left text-sm font-semibold text-emerald-700"
                    onClick={() => void submitFollowUp("请帮我生成一段今晚发给老师的沟通草稿")}
                    disabled={questionLoading || !currentResult}
                  >
                    家园沟通草稿
                  </button>
                </div>
              }
            />

            <ParentHeroCard
              eyebrow="家长 AI 闭环"
              title={`${selectedFeed.child.name} 今晚怎么做`}
              description="把 AI 建议、家庭动作、反馈入口和老师明天继续看的内容放在一条主路径里。"
              childName={selectedFeed.child.name}
              childMeta={agentChildMeta}
              allergies={selectedFeed.child.allergies}
              statusLabel={agentStatusLabel}
              statusVariant={agentStatusVariant}
              pills={agentHeroPills}
              actions={
                <>
                  <InlineLinkButton href="#feedback" label="做完后去反馈" variant="premium" />
                  <InlineLinkButton href={`?child=${selectedFeed.child.id}&intent=query_trend`} label="看近 7 天趋势" />
                </>
              }
            />

            <ParentTimelineCard
              title="今晚闭环顺序"
              description="先做一件事，再反馈孩子反应，明天老师接着观察同一个重点。"
              items={agentTimelineItems}
            />

            <SectionCard title="近 7 天记录摘要" description="趋势只保留家长看得懂的关键指标，完整问答仍在 AI 回复区。">
              <ParentWeeklySignalGrid items={agentWeeklySignals} />
              <div className="mt-5">
                <ReplicaComboChart
                  data={agentTrendRows}
                  testId="r03-parent-agent-trend"
                  series={[
                    { key: "health", label: "健康趋势", color: replicaChartColors.green, kind: "line", unit: "°C" },
                    { key: "diet", label: "饮食趋势", color: replicaChartColors.amber, kind: "line", unit: "分" },
                    { key: "growth", label: "成长行为", color: replicaChartColors.primary, unit: "条" },
                    { key: "feedback", label: "反馈状态", color: replicaChartColors.sky, unit: "条" },
                    { key: "reminders", label: "提醒状态", color: replicaChartColors.red, unit: "条" },
                  ]}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {baseContext.focusReasons.map((item) => (
                  <Badge key={item} variant="secondary">{item}</Badge>
                ))}
              </div>
            </SectionCard>

            <div className="grid gap-3 md:grid-cols-3">
              <ParentActionCard
                title="查看完整行动卡"
                description="看今晚动作、观察点和给家里人的沟通话术。"
                href="#intervention"
                actionLabel="查看行动卡"
                icon={<Sparkles className="h-5 w-5" />}
              />
              <ParentActionCard
                title="直接提交反馈"
                description="只填做了没有、孩子反应和有没有更好一点。"
                href="#feedback"
                actionLabel="去反馈"
                tone="amber"
                icon={<Send className="h-5 w-5" />}
              />
              <ParentActionCard
                title="打开成长绘本"
                description="用更亲和的方式回看今天的成长记录。"
                href={storybookHref}
                actionLabel="打开绘本"
                tone="emerald"
                icon={<Sparkles className="h-5 w-5" />}
              />
            </div>

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
                          unoptimized
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

            <ParentGentleNotice
              title="反馈只需要先完成最短三步"
              description="做了没有、孩子反应、有没有更好一点会优先进入建议闭环；补充语音和备注可以按需要再展开。"
            />

            <div
              id="feedback"
              ref={feedbackSectionRef}
              tabIndex={-1}
              data-testid="r07-parent-agent-feedback-section"
              className="scroll-mt-24 scroll-mb-[calc(env(safe-area-inset-bottom)+8rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:scroll-mb-0 lg:pb-0"
            >
              <SectionCard title="提交今晚反馈" description="把今晚做了没有、孩子反应和补充情况记下来，下一轮建议会继续参考。">
                <ParentStructuredFeedbackComposer
                  key={`${selectedFeed.child.id}-${displayInterventionCard?.id ?? "no-card"}-${feedbackNotePrefill?.token ?? "no-prefill"}`}
                  childId={selectedFeed.child.id}
                  childName={selectedFeed.child.name}
                  childClassName={selectedFeed.child.className}
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
                {renderHomeSchoolCommunication()}
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
