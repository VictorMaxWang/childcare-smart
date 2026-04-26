"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { BellRing, BrainCircuit, Mic, ScanSearch, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import TeacherDraftConfirmationPanel from "@/components/teacher/TeacherDraftConfirmationPanel";
import TeacherAgentHistoryList, { type TeacherAgentHistoryListItem } from "@/components/teacher/TeacherAgentHistoryList";
import TeacherAgentResultCard from "@/components/teacher/TeacherAgentResultCard";
import WeeklyReportPreviewCard from "@/components/weekly-report/WeeklyReportPreviewCard";
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
import { useApp } from "@/lib/store";

const ACTION_LABELS: Record<TeacherAgentWorkflowType, string> = {
  communication: "生成家长沟通建议",
  "follow-up": "生成今日跟进行动",
  "weekly-summary": "总结本周观察",
};

type HistoryItem = TeacherAgentHistoryListItem & {
  workflow: TeacherAgentWorkflowType;
};

type TeacherVoiceSourceDraftItem = {
  draft: MobileDraft;
  payload: NonNullable<ReturnType<typeof readTeacherVoiceDraftPayload>>;
  pendingCount: number;
  confirmedCount: number;
  discardedCount: number;
  childName: string;
  previewSummary?: string;
};

function isWorkflow(value: string | null): value is TeacherAgentWorkflowType {
  return value === "communication" || value === "follow-up" || value === "weekly-summary";
}

export default function TeacherAgentPage() {
  const searchParams = useSearchParams();
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
    mobileDrafts,
    reminders,
    saveMobileDraft,
    markMobileDraftSyncStatus,
    persistAppSnapshotNow,
    upsertReminder,
  } = useApp();
  const [scope, setScope] = useState<TeacherAgentMode>("child");
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();
  const preloadHandledRef = useRef<string | null>(null);
  const queryChildHandledRef = useRef<string | null>(null);
  const queryDraftHandledRef = useRef<string | null>(null);
  const sourceDraftChildHandledRef = useRef<string | null>(null);
  const weeklyReportCacheRef = useRef<Map<string, WeeklyReportResponse>>(new Map());
  const [selectedSourceDraftId, setSelectedSourceDraftId] = useState<string | null>(
    null
  );
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
        growthRecords,
        guardianFeedbacks,
      }),
    [currentUser.className, currentUser.institutionId, currentUser.name, currentUser.role, guardianFeedbacks, growthRecords, healthCheckRecords, presentChildren, visibleChildren]
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
          selectedStructuredDraftSource.draft.syncStatus
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
          fallbackTeacherSourceDraft.syncStatus
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
        setSelectedChildId(draft.childId);
      }
    },
    [availableChildIds]
  );

  const runWorkflow = useCallback(async (workflow: TeacherAgentWorkflowType) => {
    const nextScope: TeacherAgentMode = workflow === "weekly-summary" ? "class" : "child";
    const targetChildId =
      nextScope === "child"
        ? activeChildId
        : undefined;

    if (nextScope === "child" && !targetChildId) {
      setError("当前没有可用于教师 AI 助手的幼儿数据。");
      return;
    }

    setError(null);
    setScope(nextScope);
    setIsLoading(true);

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
      growthRecords,
      guardianFeedbacks,
    };

    try {
      const response = await fetch("/api/ai/teacher-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "教师 AI 助手生成结果失败。");
      }

      const result = (await response.json()) as TeacherAgentResult;
      const resultChildId = result.targetChildId ?? targetChildId;

      if (resultChildId && availableChildIds.has(resultChildId)) {
        setSelectedChildId(resultChildId);
      }

      if (resultChildId) {
        teacherRoleDrafts
          .filter((draft) => draft.childId === resultChildId && draft.syncStatus === "local_pending")
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
      setError(requestError instanceof Error ? requestError.message : "教师 AI 助手生成结果失败。");
    } finally {
      setIsLoading(false);
    }
  }, [
    currentUser.className,
    currentUser.institutionId,
    currentUser.name,
    currentUser.role,
    activeChildId,
    availableChildIds,
    guardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    presentChildren,
    teacherRoleDrafts,
    visibleChildren,
    markMobileDraftSyncStatus,
    upsertReminder,
  ]);

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

  return (
    <RolePageShell
      badge={`教师 AI 助手 · ${currentUser.className ?? "当前班级"}`}
      title="把班级数据转成可执行的教师处理建议"
      description="这一页会围绕班级上下文、单个儿童上下文和三个核心任务展开：家长沟通建议、今日跟进行动、本周观察总结。"
      actions={
        <>
          <InlineLinkButton href="/teacher" label="返回教师工作台" />
          <InlineLinkButton href="/teacher/agent" label="刷新教师 AI 助手" variant="premium" />
        </>
      }
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6">
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
                  <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
                    <p className="text-sm font-semibold text-slate-900">当前班级</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{classContext.className}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
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
                        <div key={record.id} className="rounded-3xl border border-rose-100 bg-rose-50/60 p-4 text-sm text-slate-700">
                          {record.date} · {activeChildContext.child.name} · 体温 {record.temperature}℃ · {record.mood} · {record.handMouthEye}
                          {record.remark ? ` · ${record.remark}` : ""}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-3xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
                        {activeChildContext.child.name} 今日暂无晨检异常，适合继续围绕待复查记录和家长反馈生成建议。
                      </div>
                    )}

                    {activeChildContext.pendingReviews.slice(0, 2).map((record) => (
                      <div key={record.id} className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-slate-700">
                        待复查 · {record.category} · {record.followUpAction ?? record.description}
                      </div>
                    ))}
                  </>
                ) : classContext.todayAbnormalChildren.length > 0 ? (
                  classContext.todayAbnormalChildren.map((item) => (
                    <div key={item.record.id} className="rounded-3xl border border-rose-100 bg-rose-50/60 p-4 text-sm text-slate-700">
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
                  <Button type="button" variant="outline" className="rounded-full" onClick={createVoiceDraft} disabled={!activeChildContext}>
                    <Mic className="mr-2 h-4 w-4" />
                    语音速记
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full" onClick={createOcrDraft} disabled={!activeChildContext}>
                    <ScanSearch className="mr-2 h-4 w-4" />
                    OCR 草稿
                  </Button>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {sortedTeacherDrafts.length > 0 ? (
                    sortedTeacherDrafts.slice(0, 4).map((draft) => (
                      <div key={draft.draftId} className="rounded-3xl border border-slate-100 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{draft.draftType.toUpperCase()} 草稿</p>
                          <span className="text-xs text-slate-500">{getDraftSyncStatusLabel(draft.syncStatus)}</span>
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
                    <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
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
                          className={`rounded-3xl border p-4 text-left transition ${
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
                              {getDraftSyncStatusLabel(item.draft.syncStatus)}
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
                      {ACTION_LABELS[action]}
                    </Button>
                  ))}
                </>
              }
            >
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5">
                {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}
                {intentEntryHint ? (
                  <div className="mb-4 rounded-2xl border border-sky-100 bg-white/80 p-4 text-sm leading-6 text-slate-600">
                    {intentEntryHint}
                  </div>
                ) : null}

                {currentResult ? (
                  <TeacherAgentResultCard result={currentResult} />
                ) : (
                  <p className="text-sm text-slate-500">
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
                    <div key={item.childId} className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
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
                <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-600">
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
                    <div key={item.reminderId} className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <BellRing className="h-4 w-4 text-indigo-500" />
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        </div>
                        <span className="text-xs text-slate-500">{getReminderStatusLabel(item.status)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
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
  );
}
