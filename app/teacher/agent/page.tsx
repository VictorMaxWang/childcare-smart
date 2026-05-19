"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  AlertCircle,
  BellRing,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Clock3,
  FileText,
  Filter,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Mic,
  ScanSearch,
  Send,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import TeacherDraftConfirmationPanel from "@/components/teacher/TeacherDraftConfirmationPanel";
import TeacherAgentHistoryList, { type TeacherAgentHistoryListItem } from "@/components/teacher/TeacherAgentHistoryList";
import TeacherAgentResultCard from "@/components/teacher/TeacherAgentResultCard";
import { RoleAssistantWorkspace } from "@/components/ai";
import { TeacherActionTile, TeacherContextStrip, TeacherMiniPanel } from "@/components/teacher/TeacherOperationKit";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";
import AttachmentMediaPicker, {
  AttachmentPreviewList,
  type AttachmentDraft,
} from "@/components/communication/AttachmentMediaPicker";
import FeedbackDetailDialog from "@/components/communication/FeedbackDetailDialog";
import {
  AgentWorkspaceCard,
  InlineLinkButton,
  RolePageShell,
  RoleSplitLayout,
  SectionCard,
} from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  buildTeacherAgentResultSummary,
  buildTeacherWeeklyReportSnapshot,
  pickTeacherAgentDefaultChildId,
  pickTeacherAgentWorkflowTargetChildId,
  type TeacherAgentMode,
  type TeacherAgentRequestPayload,
  type TeacherAgentResult,
  type TeacherAgentWorkflowType,
} from "@/lib/agent/teacher-agent";
import { fetchWeeklyReport } from "@/lib/agent/weekly-report-client";
import type { MobileDraft, WeeklyReportResponse } from "@/lib/ai/types";
import { buildTeacherVoiceUnderstandFallback } from "@/lib/ai/teacher-voice-understand";
import {
  createMobileDraft,
  getDraftSyncStatusLabel,
  isLocalOnlyMobileDraft,
} from "@/lib/mobile/local-draft-cache";
import { buildReminderItems, getReminderStatusLabel } from "@/lib/mobile/reminders";
import { buildMockOcrDraft } from "@/lib/mobile/ocr-input";
import {
  buildTeacherDraftRecordsFromSource,
  createTeacherDraftPersistAdapter,
  isTeacherDraftSourceType,
  readTeacherDraftConfirmationState,
} from "@/lib/mobile/teacher-draft-records";
import {
  buildMockVoiceDraft,
  createTeacherVoiceDraftPayload,
  readTeacherVoiceDraftPayload,
} from "@/lib/mobile/voice-input";
import {
  buildHomeSchoolThreads,
  formatHomeSchoolTime,
} from "@/lib/communication/home-school";
import {
  createAttachment as createApiAttachment,
  listAttachments as listApiAttachments,
  listFeedback as listApiFeedback,
  listMessages as listApiMessages,
  replyMessage as replyApiMessage,
  type ApiFeedback,
  type ApiMessage,
} from "@/lib/api/communication";
import { updateAssignmentStatus as updateApiAssignmentStatus } from "@/lib/api/assignments";
import type { ApiAttachment } from "@/lib/api/types";
import { normalizeGuardianFeedbackCollection } from "@/lib/feedback/normalize";
import { useApp } from "@/lib/store";

const ACTION_LABELS: Record<TeacherAgentWorkflowType, string> = {
  communication: "生成家长沟通建议",
  "follow-up": "生成今日跟进行动",
  "weekly-summary": "总结本周观察",
};

const TEACHER_ASSISTANT_PROMPTS = [
  "班级待办总结 / 本周观察总结",
  "生成今日跟进行动",
  "生成家长沟通建议",
];

const TEACHER_PROMPT_WORKFLOWS: Record<string, TeacherAgentWorkflowType> = {
  "班级待办总结 / 本周观察总结": "weekly-summary",
  "生成今日跟进行动": "follow-up",
  "生成家长沟通建议": "communication",
};

type HistoryItem = TeacherAgentHistoryListItem & {
  workflow: TeacherAgentWorkflowType;
};

type TeacherAgentRequestStatus = "idle" | "pending" | "success" | "error";

type TeacherAgentRunDiagnostics = {
  provider: string;
  workflow: TeacherAgentWorkflowType | null;
  transport: string;
  fallbackReason: string | null;
  lastRequestStatus: TeacherAgentRequestStatus;
  lastError: string | null;
};

const INITIAL_AI_RUN_STATUS: TeacherAgentRunDiagnostics = {
  provider: "unknown",
  workflow: null,
  transport: "none",
  fallbackReason: null,
  lastRequestStatus: "idle",
  lastError: null,
};

const TEACHER_AGENT_TRANSPORT_HEADER = "x-smartchildcare-transport";
const TEACHER_AGENT_FALLBACK_REASON_HEADER = "x-smartchildcare-fallback-reason";

function resolveTeacherAgentProvider(result?: TeacherAgentResult | null) {
  if (!result) return "unknown";
  if (result.provider) return result.provider;
  if (result.source === "ai") return "vivo";
  if (result.source === "mock") return "mock";
  return "local-rule-fallback";
}

function hasRenderableTeacherAgentResult(value: TeacherAgentResult) {
  return (
    typeof value.summary === "string" &&
    value.summary.trim().length > 0 &&
    typeof value.targetLabel === "string" &&
    value.targetLabel.trim().length > 0 &&
    Array.isArray(value.actionItems)
  );
}

type TeacherVoiceSourceDraftItem = {
  draft: MobileDraft;
  payload: NonNullable<ReturnType<typeof readTeacherVoiceDraftPayload>>;
  pendingCount: number;
  confirmedCount: number;
  discardedCount: number;
  childName: string;
  previewSummary?: string;
};

type CommunicationTab = "pending" | "history" | "mine";

type CommunicationItem = {
  id: string;
  conversationId: string;
  messageId?: string;
  childId: string;
  senderName: string;
  childLabel: string;
  content: string;
  status: "待回复" | "已处理" | "我发起";
  timeLabel: string;
  attention: boolean;
  avatar: string;
  threadMessages: ReturnType<typeof buildHomeSchoolThreads>[number]["messages"];
  feedbackId?: string;
};

function isWorkflow(value: string | null): value is TeacherAgentWorkflowType {
  return value === "communication" || value === "follow-up" || value === "weekly-summary";
}

function feedbackTime(feedback: ApiFeedback) {
  const record = feedback as ApiFeedback & {
    updatedAt?: string;
    submittedAt?: string;
    createdAt?: string;
    date?: string;
  };
  return record.updatedAt ?? record.submittedAt ?? record.createdAt ?? record.date ?? "";
}

function latestFeedbackForChild(feedbacks: ApiFeedback[], childId: string) {
  return feedbacks
    .filter((feedback) => feedback.childId === childId)
    .sort((left, right) => feedbackTime(right).localeCompare(feedbackTime(left)))[0];
}

export default function TeacherAgentPage() {
  const searchParams = useSearchParams();
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    messages,
    conversations,
    mobileDrafts,
    reminders,
    saveMobileDraft,
    markMobileDraftSyncStatus,
    persistAppSnapshotNow,
    replyHomeSchoolMessage,
    updateHomeSchoolConversationStatus,
    upsertReminder,
    reloadAppSnapshotFromApi,
  } = useApp();
  const [scope, setScope] = useState<TeacherAgentMode>("child");
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [pendingWorkflow, setPendingWorkflow] = useState<TeacherAgentWorkflowType | null>(null);
  const [aiRunStatus, setAiRunStatus] = useState<TeacherAgentRunDiagnostics>(INITIAL_AI_RUN_STATUS);
  const [, startTransition] = useTransition();
  const isLoading = pendingWorkflow !== null;
  const showAiDiagnosticStatus =
    process.env.NODE_ENV === "development" || currentUser.accountKind === "demo";
  const preloadHandledRef = useRef<string | null>(null);
  const queryChildHandledRef = useRef<string | null>(null);
  const queryDraftHandledRef = useRef<string | null>(null);
  const sourceDraftChildHandledRef = useRef<string | null>(null);
  const manualSelectedChildRef = useRef(false);
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [selectedSourceDraftId, setSelectedSourceDraftId] = useState<string | null>(
    null
  );
  const [communicationTab, setCommunicationTab] = useState<CommunicationTab>("pending");
  const [communicationOnlyAttention, setCommunicationOnlyAttention] = useState(false);
  const [expandedCommunicationId, setExpandedCommunicationId] = useState<string | null>(null);
  const [communicationDrafts, setCommunicationDrafts] = useState<Record<string, string>>({});
  const [communicationAttachmentDrafts, setCommunicationAttachmentDrafts] = useState<Record<string, AttachmentDraft[]>>({});
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [apiFeedbacks, setApiFeedbacks] = useState<ApiFeedback[]>([]);
  const [apiAttachments, setApiAttachments] = useState<ApiAttachment[]>([]);
  const [feedbackDetailId, setFeedbackDetailId] = useState<string | null>(null);
  const [feedbackDetailOpen, setFeedbackDetailOpen] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null);
  const routeIntent = searchParams.get("intent");
  const preloadAction = searchParams.get("action");
  const queryDraftId = searchParams.get("draftId");
  const queryChildId = searchParams.get("childId");
  const seededQueryChildId = useMemo(
    () =>
      queryChildId && visibleChildren.some((child) => child.id === queryChildId)
        ? queryChildId
        : "",
    [queryChildId, visibleChildren]
  );
  const effectivePreloadAction = useMemo(() => {
    if (isWorkflow(preloadAction)) {
      return preloadAction;
    }
    if (routeIntent === "record_observation" && seededQueryChildId) {
      return "follow-up";
    }
    return null;
  }, [preloadAction, routeIntent, seededQueryChildId]);
  const intentEntryHint =
    routeIntent === "record_observation"
      ? "已从统一入口定位到观察记录入口，可先确认草稿，或直接生成今日跟进行动。"
      : null;
  const mergedGuardianFeedbacks = useMemo(
    () => normalizeGuardianFeedbackCollection([...guardianFeedbacks, ...apiFeedbacks]) ?? guardianFeedbacks,
    [apiFeedbacks, guardianFeedbacks]
  );

  const classContext = useMemo(
    () =>
      buildTeacherAgentClassContext({
        currentUser: {
          name: currentUser.name,
          className: currentUser.className,
          institutionId: currentUser.institutionId,
          role: currentUser.role,
        },
        visibleChildren,
        presentChildren,
        healthCheckRecords,
        mealRecords,
        growthRecords,
        guardianFeedbacks: mergedGuardianFeedbacks,
      }),
    [currentUser.className, currentUser.institutionId, currentUser.name, currentUser.role, mergedGuardianFeedbacks, growthRecords, healthCheckRecords, mealRecords, presentChildren, visibleChildren]
  );
  const defaultChildId = useMemo(() => pickTeacherAgentDefaultChildId(classContext) ?? "", [classContext]);
  const availableChildIds = useMemo(
    () => new Set(visibleChildren.map((child) => child.id)),
    [visibleChildren]
  );
  const activeChildId = useMemo(() => {
    if (selectedChildId && availableChildIds.has(selectedChildId)) {
      return selectedChildId;
    }

    if (seededQueryChildId && availableChildIds.has(seededQueryChildId)) {
      return seededQueryChildId;
    }

    return defaultChildId;
  }, [availableChildIds, defaultChildId, seededQueryChildId, selectedChildId]);
  const activeChildContext = useMemo(
    () => buildTeacherAgentChildContext(classContext, activeChildId),
    [activeChildId, classContext]
  );
  const latestChildResult = useMemo(
    () =>
      [...history]
        .reverse()
        .find(
          (item) =>
            item.result.mode === "child" &&
            item.result.targetChildId &&
            item.result.targetChildId === activeChildId
        )?.result ?? null,
    [activeChildId, history]
  );
  const latestClassResult = useMemo(
    () => [...history].reverse().find((item) => item.result.mode === "class")?.result ?? null,
    [history]
  );
  const currentResult = useMemo(
    () => (scope === "class" ? latestClassResult : latestChildResult),
    [latestChildResult, latestClassResult, scope]
  );
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportResponse | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState<string | null>(null);
  const weeklyReportPayload = useMemo(
    () => ({
      role: "teacher" as const,
      snapshot: buildTeacherWeeklyReportSnapshot(classContext),
    }),
    [classContext]
  );
  const weeklyReportKey = useMemo(
    () => JSON.stringify(weeklyReportPayload),
    [weeklyReportPayload]
  );
  const teacherRoleDrafts = useMemo(
    () => mobileDrafts.filter((draft) => draft.targetRole === "teacher"),
    [mobileDrafts]
  );
  const teacherDrafts = useMemo(
    () =>
      teacherRoleDrafts.filter(
        (draft) => draft.targetRole === "teacher" && (!activeChildContext || draft.childId === activeChildContext.child.id)
      ),
    [activeChildContext, teacherRoleDrafts]
  );
  const sortedTeacherDrafts = useMemo(
    () =>
      [...teacherDrafts].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      ),
    [teacherDrafts]
  );
  const allTeacherVoiceSourceDrafts = useMemo<TeacherVoiceSourceDraftItem[]>(
    () =>
      teacherRoleDrafts
        .flatMap((draft) => {
          const payload = readTeacherVoiceDraftPayload(draft.structuredPayload);
          if (!payload) {
            return [];
          }

          const records = buildTeacherDraftRecordsFromSource({ sourceDraft: draft });
          const childName =
            payload.childName ??
            visibleChildren.find((child) => child.id === draft.childId)?.name ??
            "未识别幼儿";

          return [
            {
              draft,
              payload,
              pendingCount: records.filter((record) => record.status === "pending").length,
              confirmedCount: records.filter((record) => record.status === "confirmed").length,
              discardedCount: records.filter((record) => record.status === "discarded").length,
              childName,
              previewSummary: records[0]?.editedSummary?.trim() || records[0]?.summary,
            } satisfies TeacherVoiceSourceDraftItem,
          ];
        })
        .sort((left, right) => right.draft.updatedAt.localeCompare(left.draft.updatedAt)),
    [teacherRoleDrafts, visibleChildren]
  );
  const teacherVoiceSourceDrafts = useMemo(
    () =>
      allTeacherVoiceSourceDrafts.filter(
        (item) => !activeChildContext || item.draft.childId === activeChildContext.child.id
      ),
    [activeChildContext, allTeacherVoiceSourceDrafts]
  );
  const teacherReminders = useMemo(
    () =>
      reminders.filter(
        (item) =>
          item.targetRole === "teacher" &&
          (!activeChildContext || item.childId === activeChildContext.child.id)
      ),
    [activeChildContext, reminders]
  );

  const updateAdminDispatchStatus = useCallback(
    async (assignmentId: string, status: "in_progress" | "completed") => {
      setUpdatingAssignmentId(assignmentId);
      setError(null);
      try {
        await updateApiAssignmentStatus(assignmentId, { status });
        await reloadAppSnapshotFromApi();
      } catch (err) {
        setError(err instanceof Error ? err.message : "派单状态更新失败。");
      } finally {
        setUpdatingAssignmentId(null);
      }
    },
    [reloadAppSnapshotFromApi]
  );

  const createVoiceDraft = useCallback(() => {
    if (!activeChildContext) return;
    saveMobileDraft(
      buildMockVoiceDraft({
        childId: activeChildContext.child.id,
        targetRole: "teacher",
        childName: activeChildContext.child.name,
        scenario: "teacher-observation",
      })
    );
  }, [activeChildContext, saveMobileDraft]);

  const createOcrDraft = useCallback(() => {
    if (!activeChildContext) return;
    saveMobileDraft(
      buildMockOcrDraft({
        childId: activeChildContext.child.id,
        targetRole: "teacher",
        childName: activeChildContext.child.name,
      })
    );
  }, [activeChildContext, saveMobileDraft]);

  const handleCreateMockUnderstandingDraft = useCallback(
    (transcript: string) => {
      if (!activeChildContext) return;

      const understanding = buildTeacherVoiceUnderstandFallback({
        transcript,
        childId: activeChildContext.child.id,
        childName: activeChildContext.child.name,
        attachmentName: "mock-understanding-note.txt",
        scene: "teacher-agent-t5a-demo",
        inputMode: "json",
        asrProvider: "mock-asr",
        asrMode: "teacher-agent-page-demo",
        asrSource: "mock",
        asrConfidence: null,
        asrFallback: true,
      });

      saveMobileDraft(
        createMobileDraft({
          childId: activeChildContext.child.id,
          draftType: "voice",
          targetRole: "teacher",
          content: transcript,
          attachmentName: "mock-understanding-note.txt",
          syncStatus: "local_pending",
          persistenceScope: "local",
          structuredPayload: createTeacherVoiceDraftPayload({
            childName: activeChildContext.child.name,
            transcript: understanding.transcript.text,
            upload: {
              draftContent: transcript,
              transcript: understanding.transcript.text,
              source: "mock",
              status: "mocked",
              nextAction: "teacher-agent",
              raw: {
                mode: "teacher-draft-confirmation-demo",
              },
            },
            understanding,
          }),
        })
      );
    },
    [activeChildContext, saveMobileDraft]
  );

  const selectedStructuredDraftSource = useMemo(() => {
    if (selectedSourceDraftId) {
      const selectedSource = allTeacherVoiceSourceDrafts.find(
        (item) => item.draft.draftId === selectedSourceDraftId
      );
      if (selectedSource) {
        return selectedSource;
      }
    }

    return (
      teacherVoiceSourceDrafts.find((item) => item.pendingCount > 0) ??
      teacherVoiceSourceDrafts[0] ??
      null
    );
  }, [allTeacherVoiceSourceDrafts, selectedSourceDraftId, teacherVoiceSourceDrafts]);

  const fallbackTeacherSourceDraft = useMemo(() => {
    if (selectedStructuredDraftSource) {
      return null;
    }

    return (
      sortedTeacherDrafts.find(
        (draft) =>
          isTeacherDraftSourceType(draft.draftType) && draft.content.trim().length > 0
      ) ?? null
    );
  }, [selectedStructuredDraftSource, sortedTeacherDrafts]);

  const fallbackUnderstanding = useMemo(() => {
    if (!fallbackTeacherSourceDraft) {
      return null;
    }

    return buildTeacherVoiceUnderstandFallback({
      transcript: fallbackTeacherSourceDraft.content,
      childId: fallbackTeacherSourceDraft.childId,
      childName:
        activeChildContext?.child.id === fallbackTeacherSourceDraft.childId
          ? activeChildContext.child.name
          : undefined,
      attachmentName: fallbackTeacherSourceDraft.attachmentName,
      scene: "teacher-agent-t5a-fallback",
      inputMode: "json",
      asrProvider: "mock-asr",
      asrMode:
        fallbackTeacherSourceDraft.draftType === "ocr"
          ? "ocr-text-fallback"
          : "voice-text-fallback",
      asrSource: "mock",
      asrConfidence: null,
      asrFallback: true,
    });
  }, [activeChildContext, fallbackTeacherSourceDraft]);

  const fallbackStructuredPayload = useMemo(() => {
    if (!fallbackTeacherSourceDraft || !fallbackUnderstanding) {
      return null;
    }

    return createTeacherVoiceDraftPayload({
      childName:
        activeChildContext?.child.id === fallbackTeacherSourceDraft.childId
          ? activeChildContext.child.name
          : undefined,
      transcript: fallbackUnderstanding.transcript.text,
      upload: {
        draftContent: fallbackTeacherSourceDraft.content,
        transcript: fallbackUnderstanding.transcript.text,
        source: "mock",
        status: "mocked",
        nextAction: "teacher-agent",
        raw: {
          sourceDraftId: fallbackTeacherSourceDraft.draftId,
          sourceDraftType: fallbackTeacherSourceDraft.draftType,
          mode: "teacher-draft-confirmation-fallback",
        },
      },
      understanding: fallbackUnderstanding,
    });
  }, [activeChildContext, fallbackTeacherSourceDraft, fallbackUnderstanding]);

  const draftPayloadOverrides = useMemo(() => {
    if (!fallbackTeacherSourceDraft || !fallbackStructuredPayload) {
      return undefined;
    }

    return {
      [fallbackTeacherSourceDraft.draftId]: fallbackStructuredPayload,
    };
  }, [fallbackStructuredPayload, fallbackTeacherSourceDraft]);

  const teacherDraftPersistAdapter = useMemo(
    () =>
      createTeacherDraftPersistAdapter({
        drafts: mobileDrafts,
        saveDraft: saveMobileDraft,
        persistNow: (nextDrafts) =>
          persistAppSnapshotNow({
            mobileDrafts: nextDrafts,
          }),
        structuredPayloadOverrides: draftPayloadOverrides,
      }),
    [
      draftPayloadOverrides,
      mobileDrafts,
      persistAppSnapshotNow,
      saveMobileDraft,
    ]
  );

  const draftConfirmationSource = useMemo(() => {
    if (selectedStructuredDraftSource) {
      return {
        draft: selectedStructuredDraftSource.draft,
        seed: selectedStructuredDraftSource.payload.t5Seed,
        transcript:
          selectedStructuredDraftSource.payload.transcript ||
          selectedStructuredDraftSource.payload.t5Seed.transcript,
        childName: selectedStructuredDraftSource.childName,
        sourceDraftLabel: `${selectedStructuredDraftSource.draft.draftType === "ocr" ? "图片" : "语音"}草稿`,
        sourceModeLabel: "已完成结构化整理",
        sourceSyncStatusLabel: getDraftSyncStatusLabel(
          selectedStructuredDraftSource.draft.syncStatus,
          isLocalOnlyMobileDraft(selectedStructuredDraftSource.draft) ? "local" : selectedStructuredDraftSource.draft.persistenceScope
        ),
        initialExpandedRecordId: readTeacherDraftConfirmationState(
          selectedStructuredDraftSource.payload
        )?.activeRecordId,
        copilotSource: selectedStructuredDraftSource.payload,
      };
    }

    if (fallbackTeacherSourceDraft && fallbackStructuredPayload) {
      return {
        draft: fallbackTeacherSourceDraft,
        seed: fallbackStructuredPayload.t5Seed,
        transcript:
          fallbackStructuredPayload.transcript || fallbackStructuredPayload.t5Seed.transcript,
        childName:
          visibleChildren.find((child) => child.id === fallbackTeacherSourceDraft.childId)?.name ??
          activeChildContext?.child.name,
        sourceDraftLabel: `${fallbackTeacherSourceDraft.draftType === "ocr" ? "图片" : "语音"}草稿`,
        sourceModeLabel: "本地兜底整理结果",
        sourceSyncStatusLabel: getDraftSyncStatusLabel(
          fallbackTeacherSourceDraft.syncStatus,
          isLocalOnlyMobileDraft(fallbackTeacherSourceDraft) ? "local" : fallbackTeacherSourceDraft.persistenceScope
        ),
        initialExpandedRecordId: readTeacherDraftConfirmationState(
          fallbackStructuredPayload
        )?.activeRecordId,
        copilotSource: fallbackStructuredPayload,
      };
    }

    return null;
  }, [
    fallbackStructuredPayload,
    fallbackTeacherSourceDraft,
    activeChildContext?.child.name,
    selectedStructuredDraftSource,
    visibleChildren,
  ]);

  const mockDraftPresets = useMemo(() => {
    const childName = activeChildContext?.child.name ?? "当前幼儿";

    return [
      {
        id: "health-observation",
        label: "健康观察",
        hint: "健康 + 饮食",
        transcript: `${childName} 今天午睡前体温 37.6 度，精神一般，喝水偏少，老师先记成重点观察，离园前再复查一次。`,
      },
      {
        id: "emotion-soothing",
        label: "情绪安抚",
        hint: "情绪 + 睡眠",
        transcript: `${childName} 今天入园后一直哭闹，老师安抚后好一些，但午睡前还需要陪伴，先整理成情绪观察草稿。`,
      },
      {
        id: "leave-follow-up",
        label: "离园请假",
        hint: "离园 + 健康",
        transcript: `${childName} 下午因为咳嗽提前离园，家长表示今晚会在家观察，明早再反馈是否返园。`,
      },
    ];
  }, [activeChildContext]);

  useEffect(() => {
    if (queryDraftId && queryDraftHandledRef.current !== queryDraftId) {
      queryDraftHandledRef.current = queryDraftId;
      setSelectedSourceDraftId(queryDraftId);
    }
  }, [queryDraftId]);

  useEffect(() => {
    if (
      !selectedChildId &&
      seededQueryChildId &&
      queryChildHandledRef.current !== seededQueryChildId
    ) {
      queryChildHandledRef.current = seededQueryChildId;
      setSelectedChildId(seededQueryChildId);
      return;
    }

    if (selectedChildId && !availableChildIds.has(selectedChildId)) {
      setSelectedChildId(defaultChildId);
    }
  }, [availableChildIds, defaultChildId, seededQueryChildId, selectedChildId]);

  useEffect(() => {
    const sourceDraft = selectedStructuredDraftSource?.draft ?? fallbackTeacherSourceDraft;
    if (!sourceDraft?.draftId || !sourceDraft.childId) {
      return;
    }

    if (!availableChildIds.has(sourceDraft.childId)) {
      return;
    }

    const shouldTakeOverChild =
      selectedSourceDraftId === sourceDraft.draftId ||
      !activeChildId ||
      !availableChildIds.has(activeChildId);

    if (!shouldTakeOverChild) {
      return;
    }

    if (
      sourceDraftChildHandledRef.current === sourceDraft.draftId &&
      selectedChildId === sourceDraft.childId
    ) {
      return;
    }

    sourceDraftChildHandledRef.current = sourceDraft.draftId;
    setSelectedChildId(sourceDraft.childId);
  }, [
    activeChildId,
    availableChildIds,
    fallbackTeacherSourceDraft,
    selectedChildId,
    selectedSourceDraftId,
    selectedStructuredDraftSource,
  ]);

  const handleSelectChild = useCallback(
    (nextChildId: string) => {
      manualSelectedChildRef.current = true;
      setSelectedChildId(nextChildId);
      setSelectedSourceDraftId((current) => {
        if (!current) return null;
        const selectedDraft = allTeacherVoiceSourceDrafts.find(
          (item) => item.draft.draftId === current
        );
        return selectedDraft?.draft.childId === nextChildId ? current : null;
      });
    },
    [allTeacherVoiceSourceDrafts]
  );

  const handleSelectSourceDraft = useCallback(
    (draft: MobileDraft) => {
      setSelectedSourceDraftId(draft.draftId);
      if (draft.childId && availableChildIds.has(draft.childId)) {
        manualSelectedChildRef.current = true;
        setSelectedChildId(draft.childId);
      }
    },
    [availableChildIds]
  );

  const runWorkflow = useCallback(async (workflow: TeacherAgentWorkflowType, explicitTargetChildId?: string) => {
    let workflowFeedbacks = mergedGuardianFeedbacks;
    try {
      const latestApiFeedbacks = await listApiFeedback();
      setApiFeedbacks(latestApiFeedbacks);
      workflowFeedbacks = normalizeGuardianFeedbackCollection([...guardianFeedbacks, ...latestApiFeedbacks]) ?? workflowFeedbacks;
    } catch {
      // Keep local snapshot feedback available if the communication API is temporarily unavailable.
    }

    const nextScope: TeacherAgentMode = workflow === "weekly-summary" ? "class" : "child";
    const requestedChildId =
      explicitTargetChildId && availableChildIds.has(explicitTargetChildId)
        ? explicitTargetChildId
        : manualSelectedChildRef.current && selectedChildId && availableChildIds.has(selectedChildId)
        ? selectedChildId
        : seededQueryChildId && availableChildIds.has(seededQueryChildId)
          ? seededQueryChildId
          : undefined;
    const targetChildId =
      nextScope === "child"
        ? pickTeacherAgentWorkflowTargetChildId(classContext, workflow, requestedChildId)
        : undefined;

    if (nextScope === "child" && !targetChildId) {
      const message = "当前没有可用于教师 AI 助手的幼儿数据。";
      setError(message);
      setAiRunStatus({
        provider: resolveTeacherAgentProvider(currentResult),
        workflow,
        transport: "not-started",
        fallbackReason: null,
        lastRequestStatus: "error",
        lastError: message,
      });
      return;
    }

    setError(null);
    setScope(nextScope);
    setPendingWorkflow(workflow);
    setAiRunStatus({
      provider: resolveTeacherAgentProvider(currentResult),
      workflow,
      transport: "fetch",
      fallbackReason: null,
      lastRequestStatus: "pending",
      lastError: null,
    });

    const payload: TeacherAgentRequestPayload = {
      workflow,
      scope: nextScope,
      targetChildId,
      currentUser: {
        name: currentUser.name,
        className: currentUser.className,
        institutionId: currentUser.institutionId,
        role: currentUser.role,
      },
      visibleChildren,
      presentChildren,
      healthCheckRecords,
      mealRecords,
      growthRecords,
      guardianFeedbacks: workflowFeedbacks,
    };

    try {
      const response = await fetch("/api/ai/teacher-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUser.accountKind === "demo" ? { "x-ai-force-fallback": "1" } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        const message = body?.error ?? body?.message ?? "教师 AI 助手生成结果失败。";
        setAiRunStatus({
          provider: resolveTeacherAgentProvider(currentResult),
          workflow,
          transport: response.headers.get(TEACHER_AGENT_TRANSPORT_HEADER) ?? "http-error",
          fallbackReason: response.headers.get(TEACHER_AGENT_FALLBACK_REASON_HEADER),
          lastRequestStatus: "error",
          lastError: message,
        });
        throw new Error(message);
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "教师 AI 助手生成结果失败。");
      }

      const result = (await response.json()) as TeacherAgentResult;
      if (!hasRenderableTeacherAgentResult(result)) {
        throw new Error("教师 AI 助手返回结果缺少 summary、targetLabel 或 actionItems。");
      }
      setAiRunStatus({
        provider: resolveTeacherAgentProvider(result),
        workflow,
        transport: response.headers.get(TEACHER_AGENT_TRANSPORT_HEADER) ?? result.transport ?? "next-json-fallback",
        fallbackReason: response.headers.get(TEACHER_AGENT_FALLBACK_REASON_HEADER) ?? result.fallbackReason ?? null,
        lastRequestStatus: "success",
        lastError: null,
      });
      const resultChildId = result.targetChildId ?? targetChildId;

      if (resultChildId && availableChildIds.has(resultChildId)) {
        setSelectedChildId(resultChildId);
      }

      if (resultChildId) {
        teacherRoleDrafts
          .filter(
            (draft) =>
              draft.childId === resultChildId &&
              draft.syncStatus === "local_pending" &&
              !isLocalOnlyMobileDraft(draft)
          )
          .forEach((draft) => markMobileDraftSyncStatus(draft.draftId, "synced"));

        buildReminderItems({
          childId: resultChildId,
          targetRole: "teacher",
          targetId: resultChildId,
          childName: result.targetLabel,
          interventionCard: result.interventionCard,
          consultation: result.consultation,
        }).forEach((item) => upsertReminder(item));
      }

      startTransition(() => {
        setHistory((prev) => [
          ...prev,
          {
            id: `${workflow}-${Date.now()}`,
            workflow,
            actionLabel: ACTION_LABELS[workflow],
            targetLabel: result.targetLabel,
            result,
          },
        ]);
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "教师 AI 助手生成结果失败。";
      setError(message);
      setAiRunStatus((current) => ({
        ...current,
        workflow,
        lastRequestStatus: "error",
        lastError: message,
      }));
    } finally {
      setPendingWorkflow(null);
    }
  }, [
    currentResult,
    currentUser.accountKind,
    currentUser.className,
    currentUser.institutionId,
    currentUser.name,
    currentUser.role,
    availableChildIds,
    classContext,
    guardianFeedbacks,
    mergedGuardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    mealRecords,
    presentChildren,
    seededQueryChildId,
    selectedChildId,
    teacherRoleDrafts,
    visibleChildren,
    markMobileDraftSyncStatus,
    upsertReminder,
  ]);

  const childIdFromAssistantPrompt = useCallback(
    (prompt: string) => {
      const normalized = prompt.trim();
      if (!normalized) return undefined;

      return visibleChildren.find((child) => {
        const names = [
          child.name,
          (child as { nickname?: string }).nickname,
          (child as { displayName?: string }).displayName,
        ].filter((name): name is string => Boolean(name));
        return names.some((name) => normalized.includes(name));
      })?.id;
    },
    [visibleChildren]
  );

  const workflowFromAssistantPrompt = useCallback((prompt: string): TeacherAgentWorkflowType => {
    const mappedWorkflow = TEACHER_PROMPT_WORKFLOWS[prompt];
    if (mappedWorkflow) return mappedWorkflow;
    if (/班级|本周|待办|总结|weekly-summary/u.test(prompt)) return "weekly-summary";
    if (/家长|沟通|回复|话术|同步|陈安安|午餐|communication/u.test(prompt)) return "communication";
    if (/今日跟进|跟进行动|午睡|饮水|高远舟|离园复查|follow-up/u.test(prompt)) return "follow-up";
    return "follow-up";
  }, []);

  const handleAssistantPrompt = useCallback(
    (prompt: string) => {
      setAssistantQuestion(prompt);
      if (prompt.includes("健康材料")) {
        window.location.href = "/teacher/health-file-bridge";
        return;
      }
      if (prompt.includes("会诊")) {
        window.location.href = "/teacher/high-risk-consultation";
        return;
      }
      void runWorkflow(workflowFromAssistantPrompt(prompt), childIdFromAssistantPrompt(prompt));
    },
    [childIdFromAssistantPrompt, runWorkflow, workflowFromAssistantPrompt]
  );

  const submitAssistantQuestion = useCallback(() => {
    const prompt = assistantQuestion.trim();
    if (!prompt || isLoading) return;
    void runWorkflow(workflowFromAssistantPrompt(prompt), childIdFromAssistantPrompt(prompt));
    setAssistantQuestion("");
  }, [assistantQuestion, childIdFromAssistantPrompt, isLoading, runWorkflow, workflowFromAssistantPrompt]);

  useEffect(() => {
    if (!isWorkflow(effectivePreloadAction) || visibleChildren.length === 0) return;
    if (preloadHandledRef.current === effectivePreloadAction) return;

    preloadHandledRef.current = effectivePreloadAction;
    void runWorkflow(effectivePreloadAction);
  }, [effectivePreloadAction, runWorkflow, visibleChildren.length]);

  useEffect(() => {
    if (visibleChildren.length === 0) return;

    const cached = weeklyReportCacheRef.current.get(weeklyReportKey);
    if (cached) {
      setWeeklyReport(cached);
      setWeeklyReportError(null);
      setWeeklyReportLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadWeeklyReportPreview() {
      setWeeklyReportLoading(true);
      setWeeklyReportError(null);

      try {
        const data = await fetchWeeklyReport(weeklyReportPayload, {
          signal: controller.signal,
        });

        if (!cancelled) {
          weeklyReportCacheRef.current.set(weeklyReportKey, data);
          setWeeklyReport(data);
        }
      } catch (requestError) {
        if (!cancelled && !controller.signal.aborted) {
          setWeeklyReportError(
            requestError instanceof Error ? requestError.message : "教师周报预览暂时不可用"
          );
        }
      } finally {
        if (!cancelled) {
          setWeeklyReportLoading(false);
        }
      }
    }

    void loadWeeklyReportPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visibleChildren.length, weeklyReportKey, weeklyReportPayload]);

  const refreshE04CommunicationData = useCallback(async () => {
    try {
      const [nextMessages, nextFeedbacks, nextAttachments] = await Promise.all([
        listApiMessages(),
        listApiFeedback(),
        listApiAttachments(),
      ]);
      setApiMessages(nextMessages);
      setApiFeedbacks(nextFeedbacks);
      setApiAttachments(nextAttachments);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "E01 通信数据读取失败。");
    }
  }, []);

  useEffect(() => {
    void refreshE04CommunicationData();
  }, [refreshE04CommunicationData]);

  if (visibleChildren.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<BrainCircuit className="h-6 w-6" />}
          title="当前没有可用于教师 AI 助手的班级数据"
          description="请先从教师首页确认当前班级是否已加载。"
        />
      </div>
    );
  }

  const isCommunicationMode = preloadAction === "communication";
  const communicationMessages = apiMessages.length > 0 ? apiMessages : messages;
  const homeSchoolThreads = buildHomeSchoolThreads({
    messages: communicationMessages,
    conversations,
    children: visibleChildren,
  });
  const allCommunicationItems: CommunicationItem[] = homeSchoolThreads.map((thread) => {
    const latestMessage = thread.latestMessage;
    const latestParentMessage = thread.latestParentMessage ?? latestMessage;
    const latestTeacherMessage = thread.latestTeacherMessage;
    const latestFeedback = latestFeedbackForChild(apiFeedbacks, thread.childId);
    const teacherHasReplied = thread.messages.some(
      (message) => message.senderRole === "teacher" && message.senderId === currentUser.id
    );
    const status: CommunicationItem["status"] =
      thread.status === "pending"
        ? "待回复"
        : teacherHasReplied || latestTeacherMessage?.senderId === currentUser.id
          ? "我发起"
          : "已处理";

    return {
      id: thread.conversationId,
      conversationId: thread.conversationId,
      messageId: latestParentMessage?.messageId,
      childId: thread.childId,
      senderName: latestParentMessage?.senderName ?? `${thread.childName}家长`,
      childLabel: `${thread.childName} · ${thread.classId || classContext.className}`,
      content: latestMessage?.content ?? "该会话暂无消息内容。",
      status,
      timeLabel: formatHomeSchoolTime(thread.updatedAt) || "刚刚",
      attention: thread.status === "pending",
      avatar: latestParentMessage?.senderName?.includes("爸爸") ? "👨🏻" : "👩🏻",
      threadMessages: thread.messages,
      feedbackId: latestFeedback?.feedbackId,
    };
  });
  const pendingCommunicationItems = allCommunicationItems.filter((item) => item.status === "待回复");
  const handledCommunicationItems = allCommunicationItems.filter((item) => item.status !== "待回复");
  const mineCommunicationItems = allCommunicationItems.filter((item) =>
    item.threadMessages.some((message) => message.senderRole === "teacher" && message.senderId === currentUser.id)
  );
  const communicationItemsByTab =
    communicationTab === "pending"
      ? pendingCommunicationItems
      : communicationTab === "history"
        ? handledCommunicationItems
        : mineCommunicationItems;
  const communicationItems = communicationOnlyAttention
    ? communicationItemsByTab.filter((item) => item.attention)
    : communicationItemsByTab;
  const waitingCommunicationCount = pendingCommunicationItems.length;
  const handledCommunicationCount = handledCommunicationItems.length;
  const mineCommunicationCount = mineCommunicationItems.length;
  const totalCommunicationCount = allCommunicationItems.length;
  const prepareCommunicationReply = (item: CommunicationItem) => {
    setExpandedCommunicationId(item.id);
    setCommunicationDrafts((prev) => ({
      ...prev,
      [item.id]:
        prev[item.id] ??
        currentResult?.parentMessageDraft ??
        `您好，${item.content} 我会在园内继续观察，并在离园前同步今天的重点情况。`,
    }));
  };
  const markCommunicationHandled = (item: CommunicationItem) => {
    const result = updateHomeSchoolConversationStatus(item.conversationId, "closed");
    if (result.status === "failed") {
      setError(`沟通处理状态保存失败：${result.error ?? result.message}`);
      return;
    }
    setError(null);
    setCommunicationTab("history");
  };
  const sendCommunicationReply = async (item: CommunicationItem) => {
    const draft = communicationDrafts[item.id]?.trim();
    const attachmentDrafts = communicationAttachmentDrafts[item.id] ?? [];
    if (!draft && attachmentDrafts.length === 0) {
      prepareCommunicationReply(item);
      return;
    }
    const baseMessageId = item.messageId ?? item.threadMessages[0]?.messageId;
    if (!baseMessageId) {
      setError("当前会话缺少可回复的消息。");
      return;
    }
    try {
      const reply = await replyApiMessage(baseMessageId, {
        conversationId: item.conversationId,
        content: draft || "语音/附件回复",
      });
      await Promise.all(
        attachmentDrafts.map((attachment) =>
          createApiAttachment({
            childId: item.childId,
            relatedType: "message",
            relatedId: reply.messageId,
            kind: attachment.kind,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            byteSize: attachment.byteSize,
            localPreviewUrl: attachment.localPreviewUrl,
            durationMs: attachment.durationMs,
          })
        )
      );
      setError(null);
      setCommunicationDrafts((prev) => ({ ...prev, [item.id]: "" }));
      setCommunicationAttachmentDrafts((prev) => ({ ...prev, [item.id]: [] }));
      setExpandedCommunicationId(null);
      setCommunicationTab("mine");
      await refreshE04CommunicationData();
    } catch (requestError) {
      setError(requestError instanceof Error ? `E01 回复发送失败：${requestError.message}` : "E01 回复发送失败。");
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendCommunicationReplyLegacy = (item: CommunicationItem) => {
    const draft = communicationDrafts[item.id]?.trim();
    if (!draft) {
      prepareCommunicationReply(item);
      return;
    }

    const result = replyHomeSchoolMessage({
      messageId: item.messageId,
      conversationId: item.conversationId,
      content: draft,
    });
    if (result.status === "failed") {
      setError(`家园回复发送失败：${result.error ?? result.message}`);
      return;
    }

    setError(null);
    setCommunicationDrafts((prev) => ({ ...prev, [item.id]: "" }));
    setExpandedCommunicationId(null);
    setCommunicationTab("mine");
  };
  const runCommunicationSuggestion = (item: CommunicationItem) => {
    setSelectedChildId(item.childId);
    setExpandedCommunicationId(item.id);
    setCommunicationDrafts((prev) => ({
      ...prev,
      [item.id]:
        currentResult?.parentMessageDraft ??
        prev[item.id] ??
        `您好，已收到您关于${item.childLabel}的反馈。我会结合在园观察继续跟进，并把今天重点同步给您。`,
    }));
    void runWorkflow("communication");
  };
  const pendingTaskCount =
    classContext.todayAbnormalChildren.length +
    classContext.uncheckedMorningChecks.length +
    classContext.pendingReviews.length +
    sortedTeacherDrafts.length;
  const focusIssueCards = [
    {
      label: "晨检异常",
      value: `${classContext.todayAbnormalChildren.length}`,
      tone: "bg-rose-50 text-rose-700",
      icon: ShieldAlert,
    },
    {
      label: "饮食/晨检待补",
      value: `${classContext.uncheckedMorningChecks.length}`,
      tone: "bg-amber-50 text-amber-700",
      icon: Clock3,
    },
    {
      label: "家园沟通待处理",
      value: `${waitingCommunicationCount}`,
      tone: "bg-emerald-50 text-emerald-700",
      icon: MessageSquareText,
    },
    {
      label: "成长记录补录",
      value: `${classContext.pendingReviews.length}`,
      tone: "bg-sky-50 text-sky-700",
      icon: ClipboardList,
    },
  ];
  const aiActionCards = [
    {
      title: "关注晨检异常幼儿",
      detail:
        classContext.todayAbnormalChildren[0]
          ? `${classContext.todayAbnormalChildren[0].child.name} 今日晨检异常，优先复测并同步家长。`
          : "今日暂无高风险晨检，可保持复查节奏。",
      priority: classContext.todayAbnormalChildren.length > 0 ? "高优先级" : "低优先级",
      tone: "rose",
    },
    {
      title: "补齐待复查记录",
      detail:
        classContext.pendingReviews[0]
          ? `${classContext.pendingReviews[0].child.name} 仍有待复查观察，建议补一条跟进记录。`
          : "当前复查压力较低，适合整理班级周总结。",
      priority: classContext.pendingReviews.length > 0 ? "中优先级" : "低优先级",
      tone: "amber",
    },
    {
      title: "与家长沟通今日事项",
      detail:
        activeChildContext?.child.name
          ? `围绕 ${activeChildContext.child.name} 的在园表现生成可直接发送的话术。`
          : "选择重点儿童后生成沟通建议。",
      priority: "中优先级",
      tone: "indigo",
    },
  ];

  const retryWorkflow = aiRunStatus.workflow ?? effectivePreloadAction ?? "weekly-summary";
  const pendingWorkflowLabel = pendingWorkflow ? ACTION_LABELS[pendingWorkflow] : null;

  return (
    <>
    <RolePageShell
      badge={`教师 AI 助手 · ${currentUser.className ?? "当前班级"}`}
      title="把班级数据转成可执行的教师处理建议"
      description="这一页会围绕班级上下文、单个儿童上下文和三个核心任务展开：家长沟通建议、今日跟进行动、本周观察总结。"
      testId="r06-teacher-agent-page"
      actions={
        <>
          <InlineLinkButton href="/teacher" label="返回教师工作台" />
          <InlineLinkButton href="/teacher/agent" label="刷新教师 AI 助手" variant="premium" />
        </>
      }
      headerVariant="hidden"
      className="max-w-[86rem]"
    >
      <RoleSplitLayout
        stacked
        main={
          <div className="space-y-6">
            <RoleAssistantWorkspace
              roleLabel="教师端"
              title="教师 AI 助手"
              description="班级待办总结、今日跟进行动和家长沟通建议统一走服务端教师 agent，demo 环境会稳定返回可展示结果。"
              prompts={TEACHER_ASSISTANT_PROMPTS}
              value={assistantQuestion}
              onValueChange={setAssistantQuestion}
              onSubmit={submitAssistantQuestion}
              onPromptClick={handleAssistantPrompt}
              loading={isLoading}
              error={error}
              source={currentResult?.source}
              model={
                currentResult?.provider
                  ? `${currentResult.provider}${currentResult.model ? ` / ${currentResult.model}` : ""}`
                  : currentResult?.model
              }
              response={
                <div className="space-y-2">
                  <p>{currentResult?.summary ?? "选择一个教师快捷问题，或输入班级/幼儿相关追问。"}</p>
                  {currentResult?.actionItems?.length ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {currentResult.actionItems.slice(0, 3).map((item) => (
                        <li key={item.id}>{item.action}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              }
              actionCards={
                <div className="space-y-3">
                  <a href="/teacher/health-file-bridge" className="block rounded-2xl border border-sky-100 bg-white/90 p-3 text-sm font-semibold text-sky-700">
                    健康材料解析入口
                  </a>
                  <a href="/teacher/high-risk-consultation" className="block rounded-2xl border border-rose-100 bg-white/90 p-3 text-sm font-semibold text-rose-700">
                    高风险会诊建议
                  </a>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-indigo-100 bg-white/90 p-3 text-left text-sm font-semibold text-indigo-700"
                    onClick={() => void runWorkflow("weekly-summary")}
                    disabled={isLoading}
                  >
                    班级待办总结
                  </button>
                </div>
              }
            />
            {showAiDiagnosticStatus ? (
              <div
                data-testid="teacher-agent-ai-status-bar"
                className="grid gap-2 rounded-lg border border-slate-200 bg-white/95 p-4 text-xs text-slate-600 shadow-sm md:grid-cols-3"
              >
                <span><strong className="text-slate-900">provider</strong>: {aiRunStatus.provider}</span>
                <span><strong className="text-slate-900">workflow</strong>: {aiRunStatus.workflow ?? "none"}</span>
                <span><strong className="text-slate-900">transport</strong>: {aiRunStatus.transport}</span>
                <span><strong className="text-slate-900">fallbackReason</strong>: {aiRunStatus.fallbackReason ?? "none"}</span>
                <span><strong className="text-slate-900">lastRequestStatus</strong>: {aiRunStatus.lastRequestStatus}</span>
                <span className={aiRunStatus.lastError ? "text-rose-600" : ""}>
                  <strong className="text-slate-900">lastError</strong>: {aiRunStatus.lastError ?? "none"}
                </span>
              </div>
            ) : null}
            {isCommunicationMode ? (
              <>
              <section className="mx-auto max-w-[62rem] overflow-hidden rounded-[1.65rem] border border-[#e0e7f5] bg-white/96 p-5 shadow-[0_22px_60px_rgb(70_88_140_/_0.08)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-4">
                      <Link href="/teacher" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#dfe6f3] bg-white text-[#1b2745] shadow-sm">
                        <ChevronLeft className="h-6 w-6" />
                      </Link>
                      <div>
                        <h1 className="text-3xl font-bold leading-tight text-[#101a35]">家园沟通</h1>
                        <div className="mt-4 inline-flex items-center gap-2 text-lg font-bold text-[#172345]" data-testid="d07-static-class-label">
                          <span>{classContext.className}</span>
                          <span className="rounded-full bg-[#EEF4FF] px-2.5 py-1 text-xs font-semibold text-[#5B58DE]">
                            当前班级
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" className="rounded-full text-base font-bold text-violet-600" onClick={() => void runWorkflow("communication")} disabled={isLoading}>
                    <ClipboardList className="mr-2 h-5 w-5" />
                    沟通指南
                  </Button>
                </div>

                <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-[1.25rem] border border-[#dfe7f4] bg-white px-4 py-5 shadow-[0_12px_32px_rgb(70_88_140_/_0.045)] sm:grid-cols-4">
                  {[
                    { label: "待回复", value: waitingCommunicationCount, icon: <MessageSquareText className="h-7 w-7" />, tone: "bg-violet-50 text-violet-600", badge: waitingCommunicationCount > 0 ? `${waitingCommunicationCount}` : "" },
                    { label: "待处理", value: classContext.pendingReviews.length + classContext.todayAbnormalChildren.length, icon: <Clock3 className="h-7 w-7" />, tone: "bg-orange-50 text-orange-500" },
                    { label: "已处理", value: handledCommunicationCount, icon: <CheckCircle2 className="h-7 w-7" />, tone: "bg-emerald-50 text-emerald-500" },
                    { label: "沟通总数", value: totalCommunicationCount, icon: <UsersRound className="h-7 w-7" />, tone: "bg-blue-50 text-blue-500" },
                  ].map((item, index) => (
                    <div key={item.label} className={`relative flex flex-col items-center justify-center gap-1 text-center sm:flex-row sm:gap-3 sm:text-left ${index > 0 ? "border-l border-[#e8edf6]" : ""}`}>
                      <span className={`relative flex h-14 w-14 items-center justify-center rounded-full ${item.tone}`}>
                        {item.icon}
                        {item.badge ? <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">{item.badge}</span> : null}
                      </span>
                      <span>
                        <span className="block text-2xl font-bold leading-none text-[#111b34] sm:text-3xl">{item.value}</span>
                        <span className="mt-1 block text-xs font-semibold text-[#687493] sm:mt-2 sm:text-sm">{item.label}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {error ? (
                  <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}

                <div className="mt-6 flex items-center justify-between border-b border-[#e7edf6]">
                  <div className="flex flex-wrap gap-6 sm:gap-10">
                    {[
                      { key: "pending" as const, label: `待回复 (${waitingCommunicationCount})` },
                      { key: "history" as const, label: `沟通记录 (${handledCommunicationCount})` },
                      { key: "mine" as const, label: `我发起的 (${mineCommunicationCount})` },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`pb-4 text-lg font-bold sm:text-xl ${communicationTab === tab.key ? "border-b-4 border-violet-600 text-violet-600" : "text-[#6f7a96]"}`}
                        onClick={() => setCommunicationTab(tab.key)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`mb-3 inline-flex items-center gap-2 text-base font-semibold ${communicationOnlyAttention ? "text-violet-600" : "text-[#6f7a96]"}`}
                    onClick={() => setCommunicationOnlyAttention((prev) => !prev)}
                    aria-pressed={communicationOnlyAttention}
                  >
                    {communicationOnlyAttention ? "仅看重点" : "筛选"}
                    <Filter className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {communicationItems.length > 0 ? (
                    communicationItems.map((item) => (
                    <article
                      key={item.id}
                      data-testid="communication-thread-card"
                      data-child-id={item.childId}
                      className="rounded-[1.35rem] border border-[#e0e7f5] bg-white px-4 py-4 shadow-[0_12px_32px_rgb(70_88_140_/_0.045)] sm:px-6"
                    >
                      <div className="grid grid-cols-[auto_1fr_auto] gap-4">
                        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#f2f5fb] text-4xl">
                          {item.avatar}
                          {item.status === "待回复" ? <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full bg-red-500 ring-2 ring-white" /> : null}
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-bold text-[#16213f]">{item.senderName}</h2>
                          <p className="mt-1 text-base font-semibold text-[#7a86a4]">{item.childLabel}</p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-3 py-1 text-sm font-bold ${item.status === "待回复" ? "bg-orange-50 text-orange-500" : item.status === "我发起" ? "bg-blue-50 text-blue-500" : "bg-emerald-50 text-emerald-500"}`}>{item.status}</span>
                          <p className="mt-3 text-base font-semibold text-[#8a96b2]">{item.timeLabel}</p>
                        </div>
                      </div>
                      <p className="mt-4 rounded-[0.9rem] bg-[#f3f6fb] px-4 py-3 text-base font-medium leading-7 text-[#53617f]">{item.content}</p>
                      {expandedCommunicationId === item.id ? (
                        <div className="mt-4 rounded-[0.9rem] border border-violet-100 bg-violet-50/40 p-3">
                          <div className="mb-3 space-y-2">
                            {item.threadMessages.map((message) => (
                              <div key={message.messageId} className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-6 text-[#53617f]">
                                <span className="font-semibold text-[#293653]">
                                  {message.senderRole === "teacher" ? message.senderName : "家长"}：
                                </span>
                                {message.content}
                                <div className="mt-2">
                                  <AttachmentPreviewList
                                    items={apiAttachments.filter(
                                      (attachment) => attachment.relatedType === "message" && attachment.relatedId === message.messageId
                                    )}
                                    compact
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <textarea
                            data-testid="teacher-reply-input"
                            value={communicationDrafts[item.id] ?? ""}
                            onChange={(event) =>
                              setCommunicationDrafts((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="min-h-28 w-full resize-y rounded-[0.8rem] border border-violet-100 bg-white px-3 py-2 text-sm leading-6 text-[#293653] outline-none focus:border-violet-300"
                            placeholder="输入给家长的回复内容"
                          />
                          <div className="mt-3">
                            <AttachmentMediaPicker
                              value={communicationAttachmentDrafts[item.id] ?? []}
                              onChange={(next) =>
                                setCommunicationAttachmentDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: next,
                                }))
                              }
                              accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
                            />
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Button data-testid="teacher-send-reply" type="button" variant="premium" className="rounded-full" onClick={() => void sendCommunicationReply(item)}>
                              <Send className="mr-2 h-4 w-4" />
                              发送回复
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 rounded-full border-violet-100 text-base font-bold text-violet-600"
                          onClick={() => (item.status === "待回复" ? prepareCommunicationReply(item) : setExpandedCommunicationId((prev) => (prev === item.id ? null : item.id)))}
                        >
                          <MessageSquareText className="mr-2 h-5 w-5" />
                          {item.status === "待回复" ? "回复家长" : "查看记录"}
                        </Button>
                        <Button type="button" variant="outline" className="h-12 rounded-full border-blue-100 bg-blue-50/40 text-base font-bold text-blue-500" onClick={() => runCommunicationSuggestion(item)} disabled={isLoading}>
                          <Lightbulb className="mr-2 h-5 w-5" />
                          沟通建议
                        </Button>
                        {item.feedbackId ? (
                          <Button
                            data-testid="teacher-open-feedback-detail"
                            data-feedback-id={item.feedbackId}
                            type="button"
                            variant="outline"
                            className="h-12 rounded-full border-emerald-100 bg-emerald-50/60 text-base font-bold text-emerald-600"
                            onClick={() => {
                              setFeedbackDetailId(item.feedbackId ?? null);
                              setFeedbackDetailOpen(true);
                            }}
                          >
                            查看反馈详情
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 rounded-full"
                          onClick={() => (item.status === "待回复" ? markCommunicationHandled(item) : setExpandedCommunicationId((prev) => (prev === item.id ? null : item.id)))}
                          aria-label={item.status === "待回复" ? "标记已处理" : "展开沟通记录"}
                        >
                          <ChevronDown className="h-5 w-5" />
                        </Button>
                      </div>
                    </article>
                    ))
                  ) : (
                    <EmptyState
                      icon={<MessageSquareText className="h-6 w-6" />}
                      title={communicationOnlyAttention ? "当前没有重点沟通项" : "当前没有待展示的沟通记录"}
                      description="这里只展示当前班级真实家园沟通消息。"
                    />
                  )}
                </div>

                <div className="mt-5 rounded-[1.25rem] border border-violet-100 bg-[linear-gradient(135deg,#ffffff_0%,#f5f3ff_60%,#eef6ff_100%)] p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-[#16213f]">AI 沟通建议</h2>
                    <Button type="button" variant="ghost" className="rounded-full font-bold text-violet-600" onClick={() => void runWorkflow("communication")} disabled={isLoading}>
                      换一换
                    </Button>
                  </div>
                  <div className="mt-4 rounded-[0.9rem] border border-violet-100 bg-white/82 p-4">
                    <p className="text-sm font-bold text-violet-600">基于当前选中幼儿的回复建议</p>
                    <p className="mt-2 text-base font-medium leading-7 text-[#53617f]">
                      {currentResult?.summary ?? "先选择一条待回复沟通项，或点击“沟通建议”生成可复核的话术。无真实待沟通数据时不会显示模拟家长消息。"}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="premium"
                  className="mt-6 h-14 w-full rounded-[1rem] text-lg font-bold"
                  onClick={() => {
                    const target = communicationItems[0];
                    if (target) void sendCommunicationReply(target);
                  }}
                  disabled={isLoading || communicationItems.length === 0}
                >
                  <Send className="mr-2 h-5 w-5" />
                  发送当前回复
                </Button>
              </section>
              <section className="hidden">
                <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_280px]">
                  <aside className="rounded-2xl border border-white/80 bg-white/86 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Badge variant="info" className="rounded-full px-3 py-1">家园沟通</Badge>
                        <h1 className="mt-3 text-2xl font-semibold leading-tight text-slate-950">沟通消息中心</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{classContext.className} · 待回复 {waitingCommunicationCount}</p>
                      </div>
                      <Button type="button" size="icon" variant="outline" className="rounded-2xl" onClick={() => void runWorkflow("communication")} disabled={isLoading}>
                        <MessageSquareText className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      {[
                        { label: "待回复", value: waitingCommunicationCount, tone: "text-rose-600" },
                        { label: "待处理", value: classContext.pendingReviews.length, tone: "text-amber-600" },
                        { label: "已处理", value: handledCommunicationCount, tone: "text-emerald-600" },
                        { label: "沟通总数", value: totalCommunicationCount, tone: "text-sky-600" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 space-y-2">
                      {(activeChildContext?.recentFeedbacks.length ? activeChildContext.recentFeedbacks : classContext.weeklyFeedbacks)
                        .slice(0, 5)
                        .map((feedback) => {
                          const child = classContext.visibleChildren.find((item) => item.id === feedback.childId);
                          return (
                            <button
                              key={feedback.id}
                              type="button"
                              className="w-full rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50"
                              onClick={() => child?.id && handleSelectChild(child.id)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-950">{child?.name ?? "家长反馈"}</p>
                                <span className="text-xs text-slate-400">{feedback.date}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{feedback.content || feedback.notes || "等待老师回复。"}</p>
                            </button>
                          );
                        })}
                    </div>
                  </aside>

                  <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-100 text-indigo-700">
                            <UsersRound className="h-7 w-7" />
                          </div>
                          <div>
                            <h2 className="text-xl font-semibold text-slate-950">{activeChildContext?.child.name ?? classContext.className}</h2>
                            <p className="mt-1 text-sm text-slate-500">
                              {activeChildContext ? `${activeChildContext.child.className} · 家长沟通对象` : `${classContext.visibleChildren.length} 名幼儿`}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-4">
                          {[
                            { label: "今日在园", value: `${classContext.presentChildren.length}` },
                            { label: "健康状态", value: classContext.todayAbnormalChildren.length > 0 ? "需关注" : "稳定" },
                            { label: "今日表现", value: classContext.pendingReviews.length > 0 ? "待复查" : "正常" },
                            { label: "饮食情况", value: "待同步" },
                          ].map((item) => (
                            <div key={item.label} className="rounded-2xl bg-slate-50 px-3 py-3">
                              <p className="text-xs text-slate-500">{item.label}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button type="button" variant="premium" className="rounded-2xl" onClick={() => void runWorkflow("communication")} disabled={isLoading}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        生成沟通建议
                      </Button>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-full bg-indigo-100" />
                        <div className="max-w-[72%] rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                          老师，今天孩子的状态需要注意什么？我晚上应该怎么配合？
                        </div>
                      </div>
                      <div className="flex items-start justify-end gap-3">
                        <div className="max-w-[78%] rounded-2xl bg-indigo-100 px-4 py-3 text-sm leading-6 text-indigo-900">
                          {currentResult?.summary ??
                            `今天会继续关注 ${activeChildContext?.child.name ?? "重点幼儿"} 的晨检、饮食和情绪表现，离园前会同步今晚观察点。`}
                        </div>
                        <div className="h-9 w-9 shrink-0 rounded-full bg-indigo-600" />
                      </div>
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">快捷回复</p>
                          <Badge variant="info">AI 建议</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {activeChildContext?.todayAbnormalChecks.length
                            ? "建议先说明今日晨检异常、园内处理和今晚复查点。"
                            : "建议同步今日在园表现，并请家长明早反馈睡眠与入园状态。"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap gap-2">
                          {["常用回复", "作息建议", "健康提示", "营养建议"].map((item) => (
                            <Badge key={item} variant="secondary" className="rounded-full px-3 py-1">{item}</Badge>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-indigo-100 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                          输入消息，Enter 发送
                          <Button type="button" size="icon" variant="premium" className="ml-auto h-9 w-9 rounded-xl" onClick={() => void runWorkflow("communication")} disabled={isLoading}>
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">AI 沟通建议</p>
                        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => void runWorkflow("communication")} disabled={isLoading}>换一换</Button>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        先感谢家长反馈，再说明老师已关注的在园证据，最后给出今晚可执行的小任务。
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                      <p className="text-sm font-semibold text-slate-950">快捷沟通</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                          ["通知公告", BellRing],
                          ["成长记录", ClipboardList],
                          ["今日表现", Sparkles],
                          ["健康提示", ShieldAlert],
                        ].map(([label, Icon]) => {
                          const QuickIcon = Icon as typeof BellRing;
                          return (
                            <button key={label as string} type="button" className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-center text-xs font-medium text-slate-600">
                              <QuickIcon className="mx-auto mb-2 h-4 w-4 text-indigo-500" />
                              {label as string}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </aside>
                </div>
              </section>
              </>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f5f3ff_44%,#eff6ff_100%)] p-4 shadow-[0_24px_70px_rgb(99_102_241_/_0.12)] sm:p-5">
                <div className="grid gap-4 2xl:grid-cols-[176px_minmax(0,1fr)_300px]">
                  <aside className="hidden rounded-2xl border border-white/80 bg-white/88 p-3 shadow-sm 2xl:block">
                    <div className="space-y-1 text-sm font-semibold text-[#53617f]">
                      {[
                        ["首页概览", "/teacher"],
                        ["数据与记录", "/teacher"],
                        ["幼儿档案", "/children"],
                        ["晨检与健康", "/health"],
                        ["成长行为", "/growth"],
                        ["饮食记录", "/diet"],
                        ["家长沟通", "/teacher/agent?action=communication"],
                        ["AI 助手", "/teacher/agent"],
                        ["待办任务", "/teacher/agent?action=weekly-summary"],
                        ["设置中心", "/teacher"],
                      ].map(([label, href]) => (
                        <Link
                          key={label}
                          href={href}
                          className={`flex h-10 items-center justify-between rounded-xl px-3 ${label === "AI 助手" ? "bg-violet-100 text-violet-700" : "hover:bg-slate-50"}`}
                        >
                          <span>{label}</span>
                          {label === "待办任务" ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{pendingTaskCount}</span> : null}
                        </Link>
                      ))}
                    </div>
                  </aside>
                  <div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="info" className="rounded-full px-3 py-1">教师 AI 助手</Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1">{classContext.className}</Badge>
                        </div>
                        <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">教师 AI 助手</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                          基于班级数据生成可执行的教师处理建议，辅助把观察、沟通与支持每一位幼儿的成长。
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void runWorkflow("weekly-summary")} disabled={isLoading}>生成本页简报</Button>
                        <Button type="button" variant="premium" className="rounded-2xl" onClick={() => void runWorkflow("follow-up")} disabled={isLoading}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          生成今日建议
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,0.95fr)]">
                      <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-indigo-700">AI 智能总结</p>
                          <span className="text-xs text-slate-400">基于当前班级数据</span>
                        </div>
                        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                          {classContext.className} 今日出勤率稳定，晨检异常 {classContext.todayAbnormalChildren.length} 人，待复查 {classContext.pendingReviews.length} 项。建议先处理异常与补录，再完成家园沟通。
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={classContext.todayAbnormalChildren.length > 0 ? "warning" : "success"} className="rounded-full px-3 py-1">
                            {classContext.todayAbnormalChildren.length > 0 ? `晨检异常 ${classContext.todayAbnormalChildren.length} 人` : "整体平稳"}
                          </Badge>
                          <Badge variant="info" className="rounded-full px-3 py-1">家长沟通 {waitingCommunicationCount} 条</Badge>
                          <Badge variant="secondary" className="rounded-full px-3 py-1">补录待完成 {classContext.pendingReviews.length} 项</Badge>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                        <p className="text-sm font-semibold text-slate-950">识别出的重点问题</p>
                        <p className="mt-1 text-xs text-slate-500">共发现 {focusIssueCards.length} 个问题</p>
                        <div className="mt-4 space-y-3">
                          {focusIssueCards.map((item) => {
                            const Icon = item.icon;
                            return (
                              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${item.tone}`}>
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span className="text-sm text-slate-600">{item.label}</span>
                                </div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{item.value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">班级概览</p>
                          <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => setScope("class")}>详细 <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {[
                            ["出勤人数", `${classContext.presentChildren.length}人`, UsersRound, "bg-indigo-50 text-indigo-700"],
                            ["晨检异常人数", `${classContext.todayAbnormalChildren.length}人`, ShieldAlert, "bg-rose-50 text-rose-700"],
                            ["体温异常人数", `${classContext.todayAbnormalChildren.filter((item) => item.record.temperature >= 37.3).length}人`, CheckCircle2, "bg-amber-50 text-amber-700"],
                            ["饮食待同步", `${classContext.uncheckedMorningChecks.length}人`, ClipboardList, "bg-emerald-50 text-emerald-700"],
                          ].map(([label, value, Icon, tone]) => {
                            const MetricIcon = Icon as typeof UsersRound;
                            return (
                              <div key={label as string} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone as string}`}>
                                  <MetricIcon className="h-4 w-4" />
                                </span>
                                <p className="mt-3 text-xs text-slate-500">{label as string}</p>
                                <p className="mt-1 text-xl font-semibold text-slate-950">{value as string}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                      <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-950">建议动作 / 处理方案</p>
                          <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => void runWorkflow("follow-up")} disabled={isLoading}>查看更多建议</Button>
                        </div>
                        <div className="mt-4 space-y-3">
                          {aiActionCards.map((item) => (
                            <div key={item.title} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
                              </div>
                              <Badge variant={item.tone === "rose" ? "warning" : item.tone === "amber" ? "secondary" : "info"}>{item.priority}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">待派发任务</p>
                          <Badge variant="outline">{pendingTaskCount}</Badge>
                        </div>
                        <div className="mt-4 space-y-3">
                          {[
                            ["晨检异常跟进", `${classContext.todayAbnormalChildren.length}人`, "健康照护", "按优先级"],
                            ["饮食异常观察", `${classContext.uncheckedMorningChecks.length}人`, "营养照护", "按优先级"],
                            ["家长沟通", `${waitingCommunicationCount}条`, "家园沟通", "按优先级"],
                            ["成长记录补录", `${classContext.pendingReviews.length}项`, "成长记录", "按优先级"],
                          ].map(([title, count, tag, time]) => (
                            <div key={title as string} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                              <span className="h-3.5 w-3.5 rounded border border-indigo-200 bg-white" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-800">{title as string}（{count as string}）</p>
                                <p className="mt-0.5 text-xs text-indigo-500">{tag as string}</p>
                              </div>
                              <span className="text-xs text-slate-400">{time as string}</span>
                            </div>
                          ))}
                        </div>
                        <Button type="button" variant="premium" className="mt-4 w-full rounded-2xl" onClick={() => void runWorkflow("follow-up")} disabled={isLoading}>一键派发给辅助</Button>
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                      <p className="text-sm font-semibold text-slate-950">常用快捷操作</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                          ["发送通知", BellRing, "/teacher/agent?action=communication"],
                          ["成长记录", ClipboardList, "/growth"],
                          ["晨检记录", CheckCircle2, "/health"],
                          ["饮食记录", FileText, "/diet"],
                          ["消毒记录", Sparkles, "/teacher"],
                          ["家长沟通", MessageSquareText, "/teacher/agent?action=communication"],
                        ].map(([label, Icon, href]) => {
                          const QuickIcon = Icon as typeof BellRing;
                          return (
                            <a key={label as string} href={href as string} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-center text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50">
                              <QuickIcon className="mx-auto mb-2 h-4 w-4 text-indigo-500" />
                              {label as string}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-indigo-500" />
                        <p className="text-sm font-semibold text-slate-950">与 AI 助手对话</p>
                      </div>
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                        您好，{currentUser.name}，可以询问班级情况或获取处理建议。
                      </div>
                      <div className="mt-3 space-y-2">
                        {["今日体温异常的幼儿有哪些？", "最近 7 天饮食偏少的幼儿是谁？", "本周未补录成长记录的幼儿有哪些？"].map((question) => (
                          <button key={question} type="button" className="w-full rounded-2xl border border-slate-100 bg-white px-3 py-2 text-left text-xs leading-5 text-slate-500" onClick={() => void runWorkflow("follow-up")} disabled={isLoading}>
                            {question}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-400">
                        请输入您的问题...
                        <Button type="button" size="icon" variant="premium" className="ml-auto h-9 w-9 rounded-xl" onClick={() => void runWorkflow("follow-up")} disabled={isLoading}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </aside>
                </div>
              </section>
            )}

            <TeacherContextStrip
              items={[
                { label: "当前班级", value: classContext.className, tone: "indigo" },
                { label: "可见幼儿", value: `${classContext.visibleChildren.length}名`, tone: "sky" },
                { label: "今日异常", value: `${classContext.todayAbnormalChildren.length}名`, tone: classContext.todayAbnormalChildren.length > 0 ? "rose" : "emerald" },
                { label: "待复查", value: `${classContext.pendingReviews.length}项`, tone: classContext.pendingReviews.length > 0 ? "amber" : "emerald" },
              ]}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <TeacherActionTile
                href="/teacher/agent?action=communication"
                icon={<MessageSquareText className="h-5 w-5" />}
                title="家园沟通建议"
                description="把儿童上下文转成可确认的话术。"
                tone="indigo"
                highlight={effectivePreloadAction === "communication"}
              />
              <TeacherActionTile
                href="/teacher/health-file-bridge"
                icon={<FileText className="h-5 w-5" />}
                title="健康材料解析"
                description="先提取事实、风险和后续提醒。"
                tone="sky"
              />
              <TeacherActionTile
                href="/teacher/high-risk-consultation"
                icon={<ShieldAlert className="h-5 w-5" />}
                title="高风险会诊"
                description="按阶段生成园内和家庭跟进卡。"
                tone="rose"
              />
            </div>
            <TeacherMiniPanel
              title="AI 工作台处理顺序"
              badge={scope === "class" ? "班级模式" : "儿童模式"}
              tone={classContext.pendingReviews.length > 0 || classContext.todayAbnormalChildren.length > 0 ? "amber" : "emerald"}
            >
              <div className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
                <p className="rounded-lg bg-white/80 px-3 py-2">先确认当前服务对象，再生成沟通、跟进或周总结。</p>
                <p className="rounded-lg bg-white/80 px-3 py-2">草稿确认流只整理已有本地草稿，不改变原记录写回方式。</p>
                <p className="rounded-lg bg-white/80 px-3 py-2">历史记录保留本页会话内结果，方便老师回看摘要。</p>
              </div>
            </TeacherMiniPanel>
            <SectionCard title="当前服务对象 / 班级上下文" description="先确定这次工作流服务的是整个班级，还是单个儿童。">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={scope === "child" ? "premium" : "outline"}
                    className="rounded-full"
                    onClick={() => setScope("child")}
                  >
                    单个儿童模式
                  </Button>
                  <Button
                    type="button"
                    variant={scope === "class" ? "premium" : "outline"}
                    className="rounded-full"
                    onClick={() => setScope("class")}
                  >
                    班级模式
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-4 ring-1 ring-slate-100">
                    <p className="text-sm font-semibold text-slate-900">当前班级</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{classContext.className}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">当前服务对象</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {scope === "class" ? `${classContext.visibleChildren.length} 名幼儿` : activeChildContext?.child.name ?? "未选择"}
                    </p>
                  </div>
                </div>

                {scope === "child" ? (
                  <div className="max-w-md">
                    <p className="mb-2 text-sm font-semibold text-slate-900">选择目标儿童</p>
                    <Select value={activeChildId} onValueChange={handleSelectChild}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择目标儿童" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleChildren.map((child) => (
                          <SelectItem key={child.id} value={child.id}>
                            {child.name} · {child.className}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    班级模式适合直接生成本周观察总结；若点击“家长沟通建议”或“今日跟进行动”，系统会自动切回单个儿童模式。
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="今日异常摘要" description="展示真实业务数据，不再只显示固定壳。">
              <div className="space-y-3">
                {scope === "child" && activeChildContext ? (
                  <>
                    {activeChildContext.todayAbnormalChecks.length > 0 ? (
                      activeChildContext.todayAbnormalChecks.map((record) => (
                        <div key={record.id} className="rounded-lg border border-rose-100 bg-rose-50/60 p-4 text-sm text-slate-700">
                          {record.date} · {activeChildContext.child.name} · 体温 {record.temperature}℃ · {record.mood} · {record.handMouthEye}
                          {record.remark ? ` · ${record.remark}` : ""}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-slate-100 bg-white p-4 text-sm text-slate-600">
                        {activeChildContext.child.name} 今日暂无晨检异常，适合继续围绕待复查记录和家长反馈生成建议。
                      </div>
                    )}

                    {activeChildContext.pendingReviews.slice(0, 2).map((record) => (
                      <div key={record.id} className="rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-sm text-slate-700">
                        待复查 · {record.category} · {record.followUpAction ?? record.description}
                      </div>
                    ))}
                  </>
                ) : classContext.todayAbnormalChildren.length > 0 ? (
                  classContext.todayAbnormalChildren.map((item) => (
                    <div key={item.record.id} className="rounded-lg border border-rose-100 bg-rose-50/60 p-4 text-sm text-slate-700">
                      {item.child.name} · 体温 {item.record.temperature}℃ · {item.record.mood} · {item.record.handMouthEye}
                      {item.record.remark ? ` · ${item.record.remark}` : ""}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">今天暂未发现晨检异常，适合直接做班级周总结或优先补晨检。</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="移动端协同入口" description="教师可先用语音速记或 OCR 形成本地草稿，工作流完成后再同步。">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={createVoiceDraft}
                    disabled={!activeChildContext}
                    title="演示样例草稿，不代表真实语音识别已完成"
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    演示语音草稿
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={createOcrDraft}
                    disabled={!activeChildContext}
                    title="演示样例草稿，不代表真实 OCR 识别已完成"
                  >
                    <ScanSearch className="mr-2 h-4 w-4" />
                    演示 OCR 草稿
                  </Button>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  语音和 OCR 入口仅生成演示样例草稿，不展示为真实识别成功。
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {sortedTeacherDrafts.length > 0 ? (
                    sortedTeacherDrafts.slice(0, 4).map((draft) => (
                      <div key={draft.draftId} className="rounded-lg border border-slate-100 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{draft.draftType.toUpperCase()} 草稿</p>
                          <span className="text-xs text-slate-500">{getDraftSyncStatusLabel(draft.syncStatus, isLocalOnlyMobileDraft(draft) ? "local" : draft.persistenceScope)}</span>
                        </div>
                        {(() => {
                          const voicePayload = readTeacherVoiceDraftPayload(draft.structuredPayload);
                          if (!voicePayload) {
                            return null;
                          }

                          return (
                            <div className="mt-3 space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                                  已结构化
                                </span>
                                {voicePayload.understanding?.router_result.primary_category ? (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                    {voicePayload.understanding.router_result.primary_category}
                                  </span>
                                ) : null}
                                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                                  草稿项 {voicePayload.t5Seed.draft_items.length}
                                </span>
                              </div>
                              {voicePayload.t5Seed.draft_items[0] ? (
                                <p className="text-xs leading-5 text-slate-500">
                                  {voicePayload.t5Seed.draft_items[0].summary}
                                </p>
                              ) : null}
                              {voicePayload.t5Seed.warnings.length > 0 ? (
                                <p className="text-xs leading-5 text-amber-600">
                                  Warnings: {voicePayload.t5Seed.warnings.join(" / ")}
                                </p>
                              ) : null}
                            </div>
                          );
                        })()}
                        <p className="mt-2 text-sm leading-6 text-slate-600">{draft.content}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      当前还没有教师端本地草稿。
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="草稿确认流"
              description="先把识别出的草稿项整理成逐条确认卡片，再统一写回同一条教师草稿。"
            >
              {teacherVoiceSourceDrafts.length > 0 ? (
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">草稿源 {teacherVoiceSourceDrafts.length} 条</Badge>
                    <Badge variant="warning">
                      待处理{" "}
                      {teacherVoiceSourceDrafts.reduce(
                        (total, item) => total + item.pendingCount,
                        0
                      )}{" "}
                      条
                    </Badge>
                  </div>
                  <div className="grid gap-3">
                    {teacherVoiceSourceDrafts.map((item) => {
                      const isSelected =
                        draftConfirmationSource?.draft.draftId === item.draft.draftId;

                      return (
                        <button
                          key={item.draft.draftId}
                          type="button"
                          onClick={() => handleSelectSourceDraft(item.draft)}
                          className={`rounded-lg border p-4 text-left transition ${
                            isSelected
                              ? "border-indigo-200 bg-indigo-50/70"
                              : "border-slate-100 bg-white hover:border-slate-200"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={isSelected ? "info" : "secondary"}>
                              {isSelected ? "当前草稿源" : "可切换草稿源"}
                            </Badge>
                            <Badge variant="outline">{item.childName}</Badge>
                            <Badge variant="warning">待确认 {item.pendingCount}</Badge>
                            <Badge variant="success">已确认 {item.confirmedCount}</Badge>
                            {item.discardedCount > 0 ? (
                              <Badge variant="secondary">
                                已丢弃 {item.discardedCount}
                              </Badge>
                            ) : null}
                            <Badge variant="outline">
                              {getDraftSyncStatusLabel(item.draft.syncStatus, isLocalOnlyMobileDraft(item.draft) ? "local" : item.draft.persistenceScope)}
                            </Badge>
                          </div>
                          {item.previewSummary ? (
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {item.previewSummary}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <TeacherDraftConfirmationPanel
                childName={draftConfirmationSource?.childName}
                sourceDraftId={draftConfirmationSource?.draft.draftId}
                sourceDraftLabel={draftConfirmationSource?.sourceDraftLabel}
                sourceModeLabel={draftConfirmationSource?.sourceModeLabel}
                sourceSyncStatusLabel={draftConfirmationSource?.sourceSyncStatusLabel}
                sourceTranscript={draftConfirmationSource?.transcript}
                copilotSource={draftConfirmationSource?.copilotSource}
                seed={draftConfirmationSource?.seed ?? null}
                persistAdapter={teacherDraftPersistAdapter}
                initialExpandedRecordId={draftConfirmationSource?.initialExpandedRecordId}
                mockPresets={draftConfirmationSource ? [] : mockDraftPresets}
                onCreateMockDraft={handleCreateMockUnderstandingDraft}
              />
            </SectionCard>

            <AgentWorkspaceCard
              title="快捷操作"
              description="快捷操作现在会真实驱动工作流，返回稳定的结构化结果。"
              promptButtons={
                <>
                  {(Object.keys(ACTION_LABELS) as TeacherAgentWorkflowType[]).map((action) => (
                    <Button
                      key={action}
                      variant="outline"
                      className="rounded-full"
                      onClick={() => void runWorkflow(action)}
                      disabled={isLoading}
                    >
                      {pendingWorkflow === action ? "生成中..." : ACTION_LABELS[action]}
                    </Button>
                  ))}
                </>
              }
            >
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-5">
                {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}
                {intentEntryHint ? (
                  <div className="mb-4 rounded-lg border border-sky-100 bg-white/80 p-4 text-sm leading-6 text-slate-600">
                    {intentEntryHint}
                  </div>
                ) : null}

                {isLoading ? (
                  <div className="mb-4 rounded-lg border border-indigo-100 bg-white/90 p-5">
                    <div className="flex items-center gap-3 text-sm font-semibold text-indigo-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{pendingWorkflowLabel ?? "教师 AI 助手"}正在生成结果</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      请求已发起，状态条会同步显示 provider、transport 和 fallback 信息。
                    </p>
                  </div>
                ) : error ? (
                  <div className="mb-4 rounded-lg border border-rose-100 bg-white p-5">
                    <div className="flex items-center gap-3 text-sm font-semibold text-rose-700">
                      <AlertCircle className="h-4 w-4" />
                      <span>教师 AI 助手请求失败</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{error}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 rounded-full"
                      onClick={() => void runWorkflow(retryWorkflow)}
                      disabled={isLoading}
                    >
                      重试生成
                    </Button>
                  </div>
                ) : !currentResult ? (
                  <div className="mb-4 rounded-lg border border-dashed border-indigo-200 bg-white/80 p-5">
                    <p className="text-sm leading-6 text-slate-600">
                      尚未生成结果。可直接生成班级总结，或选择上方任一工作流。
                    </p>
                    <Button
                      type="button"
                      variant="premium"
                      className="mt-4 rounded-full"
                      onClick={() => void runWorkflow("weekly-summary")}
                      disabled={isLoading}
                    >
                      生成班级总结
                    </Button>
                  </div>
                ) : null}

                {!isLoading && !error && currentResult ? (
                  <div data-testid="teacher-agent-latest-result">
                    <TeacherAgentResultCard result={currentResult} />
                  </div>
                ) : (
                  <p className="hidden text-sm text-slate-500">
                    点击上方任一快捷操作，教师 AI 助手会基于当前班级或儿童上下文生成结构化结果。
                  </p>
                )}

                {isLoading ? <p className="mt-4 text-sm text-slate-500">教师 AI 助手正在整理结果，请稍候…</p> : null}
              </div>
            </AgentWorkspaceCard>

            <WeeklyReportPreviewCard
              title="本周班级周报预览"
              description="先看本周异常、补录项和下周重点观察，再决定是否继续进入教师周报工作流。"
              role="teacher"
              periodLabel={weeklyReportPayload.snapshot.periodLabel}
              report={weeklyReport}
              loading={weeklyReportLoading}
              error={weeklyReportError}
              ctaHref="/teacher/agent?action=weekly-summary"
              ctaLabel="生成完整本周总结"
            />

            <SectionCard title="历史记录" description="保留当前会话内已生成的工作流结果摘要。">
              <TeacherAgentHistoryList items={history} />
            </SectionCard>
          </div>
        }
        aside={
          <div className="space-y-6">
            <SectionCard title="当前服务对象" description="帮助老师确认这次工作流聚焦的对象与上下文。">
              <ul className="space-y-3 text-sm text-slate-600">
                <li>当前班级：{classContext.className}</li>
                <li>班级可见幼儿：{classContext.visibleChildren.length} 名</li>
                <li>今日异常晨检：{classContext.todayAbnormalChildren.length} 名</li>
                <li>待复查记录：{classContext.pendingReviews.length} 项</li>
              </ul>
            </SectionCard>

            <SectionCard title="班级高优先级摘要" description="用于老师快速扫一眼今天最值得先处理的内容。">
              <div className="space-y-3">
                {classContext.focusChildren.length > 0 ? (
                  classContext.focusChildren.map((item) => (
                    <div key={item.childId} className="rounded-lg border border-slate-100 bg-white p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">{item.childName}</p>
                      <p className="mt-2 leading-6">{item.reasons.join("、")}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">当前没有需要重点提级的儿童，适合保持稳定记录节奏。</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="推荐展示顺序" description="录屏时可以直接沿这条顺序展示。">
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  先选一个异常或待复查儿童，生成家长沟通建议
                </li>
                <li className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                  再切到今日跟进行动，展示结构化行动列表
                </li>
                <li className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  最后切到班级模式，总结本周观察
                </li>
              </ol>
            </SectionCard>

            <SectionCard title="当前结果摘要" description="方便演示时在侧边快速回看。">
              {currentResult ? (
                <div className="rounded-lg border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-600">
                  {buildTeacherAgentResultSummary(currentResult)}
                </div>
              ) : (
                <p className="text-sm text-slate-500">还没有结果，先运行一个工作流。</p>
              )}
            </SectionCard>

            <SectionCard title="提醒中心" description="展示今晚任务、48 小时复查和升级关注提醒。">
              <div className="space-y-3">
                {teacherReminders.length > 0 ? (
                  teacherReminders.slice(0, 5).map((item) => (
                    <div
                      key={item.reminderId}
                      className="rounded-lg border border-slate-100 bg-white p-4"
                      data-testid={item.sourceType === "admin_dispatch" ? "teacher-assignment-card" : undefined}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <BellRing className="h-4 w-4 text-indigo-500" />
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        </div>
                        <span className="text-xs text-slate-500">{getReminderStatusLabel(item.status)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                      {item.sourceType === "admin_dispatch" && item.sourceId ? (
                        <div className="mt-3 flex flex-wrap gap-2" data-testid="teacher-assignment-actions">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updatingAssignmentId === item.sourceId || item.status === "acknowledged" || item.status === "done"}
                            onClick={() => void updateAdminDispatchStatus(item.sourceId ?? "", "in_progress")}
                            data-testid="teacher-assignment-in-progress"
                          >
                            标记跟进中
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updatingAssignmentId === item.sourceId || item.status === "done"}
                            onClick={() => void updateAdminDispatchStatus(item.sourceId ?? "", "completed")}
                            data-testid="teacher-assignment-complete"
                          >
                            标记完成
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">当前没有待展示提醒。</p>
                )}
              </div>
            </SectionCard>
          </div>
        }
      />
    </RolePageShell>
    <FeedbackDetailDialog
      feedbackId={feedbackDetailId}
      open={feedbackDetailOpen}
      canUpdateStatus
      onOpenChange={setFeedbackDetailOpen}
      onUpdated={() => void refreshE04CommunicationData()}
    />
    </>
  );
}
