"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrainCircuit, Camera, CheckCircle2, Clock3, Mic, ShieldAlert, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import InterventionCardPanel from "@/components/agent/InterventionCardPanel";
import ConsultationQaPanel from "@/components/consultation/ConsultationQaPanel";
import ConsultationTracePanel from "../../../components/consultation/ConsultationTracePanel";
import { RolePageShell, RoleSplitLayout, SectionCard, InlineLinkButton } from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildConsultationResultBadge, buildHighRiskConsultationAutoContext, buildHighRiskConsultationDraft } from "@/lib/agent/high-risk-consultation";
import { buildTeacherAgentChildContext, buildTeacherAgentClassContext } from "@/lib/agent/teacher-agent";
import { type AgentStreamEvent, useAgentStream } from "@/lib/bridge/use-agent-stream";
import type { MemoryContextMeta } from "@/lib/ai/types";
import { buildConsultationTraceFixture } from "@/lib/consultation/trace-fixtures";
import { buildConsultationTraceViewModel } from "@/lib/consultation/trace-view-model";
import {
  describeConsultationResultIssues,
  getConsultationStageLabel,
  isConsultationTraceCase,
  isConsultationStageKey,
  isRenderableConsultationApiResult,
  type ConsultationApiResult,
  type ConsultationProviderTrace,
  type ConsultationTraceCase,
  type ConsultationStageKey,
  type ConsultationStageStatusEvent,
  type ConsultationStageTextEvent,
  type ConsultationStageUiMap,
  type ConsultationSummaryCardData,
  type ConsultationTraceMode,
  type FollowUp48hCardData,
} from "@/lib/consultation/trace-types";
import { getDraftSyncStatusLabel } from "@/lib/mobile/local-draft-cache";
import { buildReminderItems } from "@/lib/mobile/reminders";
import { formatDisplayDate, getAgeText, useApp } from "@/lib/store";

type StreamStatusEvent = Omit<ConsultationStageStatusEvent, "stage"> & {
  stage: string;
  memory?: MemoryContextMeta | Record<string, unknown>;
};

type StreamTextEvent = Omit<ConsultationStageTextEvent, "stage" | "items"> & {
  stage: string;
  items?: string[];
  append?: false;
};

type StreamSummaryCardEvent = {
  stage: string;
  cardType: "ConsultationSummaryCard";
  data: ConsultationSummaryCardData;
};

type StreamFollowUpCardEvent = {
  stage: string;
  cardType: "FollowUp48hCard";
  data: FollowUp48hCardData;
};

type StreamDoneEvent = {
  traceId: string;
  result: unknown;
  providerTrace?: ConsultationProviderTrace;
  memoryMeta?: MemoryContextMeta | Record<string, unknown>;
  realProvider?: boolean;
  fallback?: boolean;
};

function ConsultationInputCard({
  draftId,
  selectedChildName,
  className,
  saveMobileDraft,
  onStart,
  draftPayload,
}: {
  draftId: string;
  selectedChildName: string;
  className: string;
  saveMobileDraft: (draft: ReturnType<typeof buildHighRiskConsultationDraft>) => void;
  onStart: (payload: {
    teacherNote: string;
    imageInput?: { attachmentName?: string; content?: string };
    voiceInput?: { attachmentName?: string; content?: string };
  }) => void;
  draftPayload?: {
    teacherNote?: string;
    imageInput?: { attachmentName?: string; content?: string };
    voiceInput?: { attachmentName?: string; content?: string };
  };
}) {
  const [teacherNote, setTeacherNote] = useState(draftPayload?.teacherNote ?? "");
  const [imageAttachmentName, setImageAttachmentName] = useState(draftPayload?.imageInput?.attachmentName ?? "morning-check-photo.jpg");
  const [imageNote, setImageNote] = useState(draftPayload?.imageInput?.content ?? "");
  const [voiceAttachmentName, setVoiceAttachmentName] = useState(draftPayload?.voiceInput?.attachmentName ?? "teacher-voice-note.m4a");
  const [voiceNote, setVoiceNote] = useState(draftPayload?.voiceInput?.content ?? "");

  useEffect(() => {
    saveMobileDraft(
      buildHighRiskConsultationDraft({
        childId: draftId.replace("high-risk-consultation-", ""),
        childName: selectedChildName,
        className,
        teacherNote,
        imageInput: imageNote.trim() ? { attachmentName: imageAttachmentName.trim(), content: imageNote.trim() } : undefined,
        voiceInput: voiceNote.trim() ? { attachmentName: voiceAttachmentName.trim(), content: voiceNote.trim() } : undefined,
      })
    );
  }, [className, draftId, imageAttachmentName, imageNote, saveMobileDraft, selectedChildName, teacherNote, voiceAttachmentName, voiceNote]);

  return (
    <SectionCard title="2. 录入教师补充" description="会诊流程会直接结合这些补充信息与已有儿童资料一起判断。">
      <div className="space-y-4">
        <Textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} placeholder="例如：午睡前反复抓耳，离园前情绪仍不稳定，希望生成园内动作、今夜家庭任务和 48 小时复查点。" className="min-h-28 rounded-3xl bg-white" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-100 bg-white p-5">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-sky-500" />
              <p className="text-sm font-semibold text-slate-900">图片占位</p>
            </div>
            <div className="mt-4 space-y-3">
              <Input value={imageAttachmentName} onChange={(event) => setImageAttachmentName(event.target.value)} placeholder="附件名，例如 morning-check-photo.jpg" />
              <Textarea value={imageNote} onChange={(event) => setImageNote(event.target.value)} placeholder="先写一段图片中的关键信息。" className="min-h-24 bg-white" />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-5">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-indigo-500" />
              <p className="text-sm font-semibold text-slate-900">语音速记占位</p>
            </div>
            <div className="mt-4 space-y-3">
              <Input value={voiceAttachmentName} onChange={(event) => setVoiceAttachmentName(event.target.value)} placeholder="附件名，例如 teacher-voice-note.m4a" />
              <Textarea value={voiceNote} onChange={(event) => setVoiceNote(event.target.value)} placeholder="先写一段语音速记内容。" className="min-h-24 bg-white" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
          <div className="text-sm text-slate-600">点击后会按“长期画像 → 最近会诊 → 当前建议”流式展示，并在结束后保留最终会诊卡。</div>
          <Button
            className="gap-2 rounded-xl"
            variant="premium"
            onClick={() =>
              onStart({
                teacherNote,
                imageInput: imageNote.trim() ? { attachmentName: imageAttachmentName.trim(), content: imageNote.trim() } : undefined,
                voiceInput: voiceNote.trim() ? { attachmentName: voiceAttachmentName.trim(), content: voiceNote.trim() } : undefined,
              })
            }
          >
            <Sparkles className="h-4 w-4" />
            一键生成会诊
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

export default function TeacherHighRiskConsultationPage() {
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    healthCheckRecords,
    growthRecords,
    guardianFeedbacks,
    mobileDrafts,
    saveMobileDraft,
    markMobileDraftSyncStatus,
    upsertConsultation,
    upsertInterventionCard,
    upsertReminder,
  } = useApp();
  const { start, isStreaming, stop } = useAgentStream();
  const searchParams = useSearchParams();
  const traceMode: ConsultationTraceMode = searchParams.get("trace") === "debug" ? "debug" : "demo";
  const traceCaseParam = searchParams.get("traceCase");
  const routeIntent = searchParams.get("intent");
  const queryChildId = searchParams.get("childId");
  const queryPreferredChildId =
    queryChildId && visibleChildren.some((child) => child.id === queryChildId)
      ? queryChildId
      : "";
  const traceCase: ConsultationTraceCase | null =
    traceMode === "debug" && traceCaseParam && isConsultationTraceCase(traceCaseParam) ? traceCaseParam : null;

  const [selectedChildId, setSelectedChildId] = useState("");
  const [result, setResult] = useState<ConsultationApiResult | null>(null);
  const [activeStage, setActiveStage] = useState<ConsultationStageKey | null>(null);
  const [streamMessage, setStreamMessage] = useState<string>(() =>
    routeIntent === "start_consultation"
      ? "已从统一入口定位到高风险会诊，可直接补充说明后开始。"
      : "点击右侧按钮开始会诊"
  );
  const [streamError, setStreamError] = useState<string | null>(null);
  const [stageStatuses, setStageStatuses] = useState<Partial<Record<ConsultationStageKey, ConsultationStageStatusEvent>>>({});
  const [stageUi, setStageUi] = useState<ConsultationStageUiMap>({});
  const [stageNotes, setStageNotes] = useState<ConsultationStageTextEvent[]>([]);
  const [providerTrace, setProviderTrace] = useState<ConsultationProviderTrace | null>(null);
  const [memoryMeta, setMemoryMeta] = useState<MemoryContextMeta | Record<string, unknown> | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [receivedAnyEvent, setReceivedAnyEvent] = useState(false);
  const [receivedDone, setReceivedDone] = useState(false);
  const [streamEndedUnexpectedly, setStreamEndedUnexpectedly] = useState(false);
  const [invalidResultReason, setInvalidResultReason] = useState<string | null>(null);
  const [showSetupSections, setShowSetupSections] = useState(true);

  const receivedAnyEventRef = useRef(false);
  const receivedDoneRef = useRef(false);
  const streamErroredRef = useRef(false);

  const classContext = useMemo(
    () =>
      buildTeacherAgentClassContext({
        currentUser,
        visibleChildren,
        presentChildren,
        healthCheckRecords,
        growthRecords,
        guardianFeedbacks,
      }),
    [currentUser, guardianFeedbacks, growthRecords, healthCheckRecords, presentChildren, visibleChildren]
  );
  const activeChildId = selectedChildId || queryPreferredChildId || visibleChildren[0]?.id || "";
  const childContext = useMemo(() => buildTeacherAgentChildContext(classContext, activeChildId), [classContext, activeChildId]);
  const autoContext = useMemo(() => (childContext ? buildHighRiskConsultationAutoContext({ classContext, childContext }) : null), [childContext, classContext]);
  const selectedChild = childContext?.child;
  const draftId = selectedChild ? `high-risk-consultation-${selectedChild.id}` : "";
  const existingDraft = useMemo(() => mobileDrafts.find((draft) => draft.draftId === draftId), [draftId, mobileDrafts]);
  const existingDraftPayload = useMemo(
    () =>
      existingDraft?.structuredPayload as
        | { teacherNote?: string; imageInput?: { attachmentName?: string; content?: string }; voiceInput?: { attachmentName?: string; content?: string } }
        | undefined,
    [existingDraft]
  );
  const debugFixtureViewModel = useMemo(() => {
    if (
      traceMode !== "debug" ||
      !traceCase ||
      isStreaming ||
      receivedAnyEvent ||
      receivedDone ||
      streamError ||
      result
    ) {
      return null;
    }

    return buildConsultationTraceFixture(traceCase, traceMode);
  }, [isStreaming, receivedAnyEvent, receivedDone, result, streamError, traceCase, traceMode]);

  const traceViewModel = useMemo(() => {
    if (debugFixtureViewModel) {
      return debugFixtureViewModel;
    }

    return buildConsultationTraceViewModel({
      mode: traceMode,
      activeStage,
      isStreaming,
      streamMessage,
      streamError,
      traceId,
      providerTrace,
      memoryMeta,
      stageNotes,
      stageStatuses,
      stageUi,
      result,
      receivedAnyEvent,
      receivedDone,
      streamEndedUnexpectedly,
      invalidResultReason,
    });
  }, [
    activeStage,
    debugFixtureViewModel,
    invalidResultReason,
    isStreaming,
    memoryMeta,
    providerTrace,
    receivedAnyEvent,
    receivedDone,
    result,
    stageNotes,
    stageStatuses,
    stageUi,
    streamEndedUnexpectedly,
    streamError,
    streamMessage,
    traceId,
    traceMode,
  ]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (result) {
      setShowSetupSections(false);
    }
  }, [result]);

  async function runConsultation(form: {
    teacherNote: string;
    imageInput?: { attachmentName?: string; content?: string };
    voiceInput?: { attachmentName?: string; content?: string };
  }) {
    if (!selectedChild) return;
    setStreamError(null);
    setStreamMessage("正在连接会诊流...");
    setResult(null);
    setStageStatuses({});
    setStageUi({});
    setStageNotes([]);
    setProviderTrace(null);
    setMemoryMeta(null);
    setTraceId(null);
    setActiveStage(null);
    setReceivedAnyEvent(false);
    setReceivedDone(false);
    setStreamEndedUnexpectedly(false);
    setInvalidResultReason(null);
    receivedAnyEventRef.current = false;
    receivedDoneRef.current = false;
    streamErroredRef.current = false;

    const payload = {
      currentUser,
      visibleChildren,
      presentChildren,
      healthCheckRecords,
      growthRecords,
      guardianFeedbacks,
      targetChildId: selectedChild.id,
      teacherNote: form.teacherNote,
      imageInput: form.imageInput,
      voiceInput: form.voiceInput,
    };

    try {
      await start({ url: "/api/ai/high-risk-consultation/stream", body: payload }, (event: AgentStreamEvent) => {
        if (!receivedAnyEventRef.current) {
          receivedAnyEventRef.current = true;
          setReceivedAnyEvent(true);
        }

        if (event.event === "status") {
          const data = event.data as StreamStatusEvent;
          if (isConsultationStageKey(data.stage)) {
            setActiveStage(data.stage);
            setStageStatuses((current) => ({
              ...current,
              [data.stage]: {
                stage: data.stage,
                title: data.title,
                message: data.message,
                traceId: data.traceId,
                providerTrace: data.providerTrace,
                memory: data.memory,
              },
            }));
          }
          if (data.traceId) setTraceId(data.traceId);
          if (data.providerTrace) setProviderTrace(data.providerTrace);
          if (data.memory) setMemoryMeta(data.memory);
          setStreamMessage(data.message || data.title);
          return;
        }
        if (event.event === "text") {
          const data = event.data as StreamTextEvent;
          if (!isConsultationStageKey(data.stage)) return;
          setActiveStage(data.stage);
          setStageNotes((current) => [
            ...current,
            {
              stage: data.stage as ConsultationStageKey,
              title: data.title,
              text: data.text,
              items: data.items ?? [],
              source: data.source,
            },
          ]);
          setStreamMessage(data.text);
          return;
        }
        if (event.event === "ui") {
          const data = event.data as StreamSummaryCardEvent | StreamFollowUpCardEvent;
          if (!isConsultationStageKey(data.stage)) return;
          const stageKey = data.stage;
          setActiveStage(stageKey);
          setStageUi((current) => ({
            ...current,
            [stageKey]: {
              ...current[stageKey],
              ...(data.cardType === "ConsultationSummaryCard" ? { summaryCard: data.data } : { followUpCard: data.data }),
            },
          }));
          if (data.cardType === "ConsultationSummaryCard") {
            if (data.data.providerTrace) setProviderTrace(data.data.providerTrace);
            if (data.data.memoryMeta) setMemoryMeta(data.data.memoryMeta);
          }
          if (data.cardType === "FollowUp48hCard" && data.data.providerTrace) {
            setProviderTrace(data.data.providerTrace);
          }
          return;
        }
        if (event.event === "error") {
          const data = event.data as { title?: string; message?: string };
          const nextMessage = data.message ?? data.title ?? "会诊流发生错误";
          streamErroredRef.current = true;
          setStreamError(nextMessage);
          setStreamMessage(nextMessage);
          return;
        }
        if (event.event === "done") {
          const data = event.data as StreamDoneEvent;
          const rawResult: unknown = data.result;
          const resultObject = rawResult && typeof rawResult === "object" ? (rawResult as Record<string, unknown>) : null;
          const nextProviderTrace =
            data.providerTrace ??
            (resultObject?.providerTrace && typeof resultObject.providerTrace === "object"
              ? (resultObject.providerTrace as ConsultationProviderTrace)
              : data.realProvider !== undefined || data.fallback !== undefined
                ? {
                    realProvider: data.realProvider,
                    fallback: data.fallback,
                  }
                : null);
          const nextMemoryMeta = data.memoryMeta ?? (resultObject?.memoryMeta as MemoryContextMeta | Record<string, unknown> | null | undefined) ?? null;

          receivedDoneRef.current = true;
          setReceivedDone(true);
          setTraceId(data.traceId);
          setProviderTrace(nextProviderTrace);
          setMemoryMeta(nextMemoryMeta);

          if (!isRenderableConsultationApiResult(rawResult)) {
            const reason = describeConsultationResultIssues(rawResult);
            setInvalidResultReason(reason);
            setStreamMessage(reason || "会诊已结束，但返回结果还不完整。");
            return;
          }

          setResult(rawResult);
          upsertConsultation(rawResult);
          upsertInterventionCard(rawResult.interventionCard);
          buildReminderItems({
            childId: selectedChild.id,
            targetRole: "teacher",
            targetId: selectedChild.id,
            childName: selectedChild.name,
            interventionCard: rawResult.interventionCard,
            consultation: rawResult,
          }).forEach((item) => upsertReminder(item));
          buildReminderItems({
            childId: selectedChild.id,
            targetRole: "parent",
            targetId: selectedChild.id,
            childName: selectedChild.name,
            interventionCard: rawResult.interventionCard,
            consultation: rawResult,
          }).forEach((item) => upsertReminder(item));
          markMobileDraftSyncStatus(draftId, "synced");
          setStreamMessage("会诊完成，已同步教师端、家长端和园长端。");
        }
      });

      if (!receivedDoneRef.current && !streamErroredRef.current) {
        setStreamEndedUnexpectedly(true);
        setStreamMessage(
          receivedAnyEventRef.current
            ? "会诊过程提前结束，当前阶段内容已保留，方便继续查看。"
            : "会诊已结束，但没有返回可展示内容。"
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message = error instanceof Error ? error.message : "会诊流请求失败";
      if (receivedAnyEventRef.current && !receivedDoneRef.current) {
        setStreamEndedUnexpectedly(true);
        setStreamMessage(`会诊中途结束，已保留当前阶段内容。${message}`);
        return;
      }

      streamErroredRef.current = true;
      setStreamError(message);
      setStreamMessage(message);
    }
  }

  const traceHeaderActions = (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <Button asChild variant={traceMode === "demo" ? "premium" : "outline"} size="sm" className="rounded-full">
        <Link href="/teacher/high-risk-consultation">常规展示</Link>
      </Button>
      <Button asChild variant={traceMode === "debug" ? "premium" : "outline"} size="sm" className="rounded-full">
        <Link href="/teacher/high-risk-consultation?trace=debug">详细查看</Link>
      </Button>
    </div>
  );

  function addFollowUpReminder() {
    if (!selectedChild || !result) return;
    buildReminderItems({
      childId: selectedChild.id,
      targetRole: "teacher",
      targetId: selectedChild.id,
      childName: selectedChild.name,
      interventionCard: result.interventionCard,
      consultation: result,
    }).forEach((item) => upsertReminder(item));
    setStreamMessage("已加入后续提醒。");
  }

  if (visibleChildren.length === 0 || !selectedChild || !childContext || !autoContext) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="当前没有可用于发起会诊的儿童数据" description="请先确认教师账号已关联班级和幼儿。" />
      </div>
    );
  }

  return (
    <RolePageShell
      badge={`高风险儿童会诊 · ${classContext.className}`}
      title="高风险儿童一键会诊"
      description="按长期画像、最近会诊、当前建议分阶段流式展示，适合移动端录屏。"
      actions={
        <>
          <InlineLinkButton href="/teacher" label="返回教师工作台" />
          <InlineLinkButton href="/teacher/agent" label="进入教师 AI 助手" variant="premium" />
        </>
      }
    >
      <RoleSplitLayout
        main={
          <div className="space-y-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {result && !showSetupSections ? (
              <SectionCard
                title="已切换到结果优先视图"
                description="输入与补充说明已收起，方便直接查看三阶段 trace 和最终会诊结论。"
                actions={<Badge variant="success">截图友好</Badge>}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="warning">{selectedChild.name}</Badge>
                    <Badge variant="secondary">{selectedChild.className}</Badge>
                    <Badge variant="outline">{buildConsultationResultBadge(result)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild type="button" variant="outline" className="rounded-full">
                      <a href="#consultation-trace">查看会诊过程</a>
                    </Button>
                    <Button asChild type="button" variant="premium" className="rounded-full">
                      <a href="#consultation-result">查看最终结果</a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setShowSetupSections(true)}
                    >
                      重新展开输入
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            {showSetupSections ? (
              <>
                <SectionCard
                  title="1. 锁定会诊对象"
                  description="先选需要升级关注的儿童，再启动会诊流。"
                  actions={existingDraft ? <Badge variant="secondary">{getDraftSyncStatusLabel(existingDraft.syncStatus)}</Badge> : <Badge variant="outline">自动草稿缓存</Badge>}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-sm font-semibold text-slate-900">选择儿童</p>
                        <Select value={activeChildId} onValueChange={setSelectedChildId}>
                          <SelectTrigger className="h-12 rounded-2xl">
                            <SelectValue placeholder="请选择需要会诊的儿童" />
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
                      <div className="rounded-3xl border border-rose-100 bg-linear-to-br from-rose-50 via-white to-amber-50 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">高风险主路径</Badge>
                          <Badge variant="secondary">{selectedChild.className}</Badge>
                        </div>
                        <p className="mt-3 text-lg font-semibold text-slate-900">{selectedChild.name}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {getAgeText(selectedChild.birthDate)} · 出生于 {formatDisplayDate(selectedChild.birthDate)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {autoContext.focusReasons.map((item) => (
                            <Badge key={item} variant="warning">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-100 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">本次自动带入</p>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                        <li>晨检异常：{autoContext.morningCheckAlerts.length} 条</li>
                        <li>待复查：{autoContext.pendingReviewNotes.length} 条</li>
                        <li>成长观察：{autoContext.growthObservationNotes.length} 条</li>
                        <li>家长反馈：{autoContext.parentFeedbackNotes.length} 条</li>
                        <li>班级信号：{autoContext.classSignals.length} 条</li>
                      </ul>
                    </div>
                  </div>
                </SectionCard>

                <ConsultationInputCard
                  key={draftId}
                  draftId={draftId}
                  selectedChildName={selectedChild.name}
                  className={autoContext.className}
                  draftPayload={existingDraftPayload}
                  saveMobileDraft={saveMobileDraft}
                  onStart={(form) => void runConsultation(form)}
                />
              </>
            ) : null}

            {result && showSetupSections ? (
              <div className="flex justify-end">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowSetupSections(false)}>
                  只看结果视图
                </Button>
              </div>
            ) : null}

            <div id="consultation-trace">
              <SectionCard
                title="3. 流式会诊展示"
                description="这里会按阶段展示会诊过程，适合老师讲解与录屏。"
                actions={activeStage ? <Badge variant="info">{getConsultationStageLabel(activeStage)}</Badge> : <Badge variant="outline">待启动</Badge>}
              >
                <div className="space-y-4">
                  {traceMode === "debug" ? <ConsultationQaPanel viewModel={traceViewModel} activeCase={traceCase} /> : null}
                  <ConsultationTracePanel viewModel={traceViewModel} headerActions={traceHeaderActions} />
                </div>
              </SectionCard>
            </div>

            {result ? (
              <div id="consultation-result" className="space-y-6">
                <SectionCard title="4. 最终会诊结论" description="汇总本次会诊结论，方便老师直接确认并继续跟进。">
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-rose-100 bg-linear-to-br from-rose-50 via-white to-amber-50 p-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="warning">会诊结论</Badge>
                        <Badge variant="secondary">{buildConsultationResultBadge(result)}</Badge>
                      </div>
                      <p className="mt-3 text-lg font-semibold text-slate-900">{result.summary}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{result.coordinatorSummary.finalConclusion}</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl border border-slate-100 bg-white p-5">
                        <p className="text-sm font-semibold text-slate-900">触发原因</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {result.triggerReasons.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-3xl border border-slate-100 bg-white p-5">
                        <p className="text-sm font-semibold text-slate-900">关键发现</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {result.keyFindings.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </SectionCard>
                <SectionCard title="5. 今日园内 / 今晚家庭 / 48 小时复查" description="这组内容会同步进入园长和家长的动作卡。">
                  <div className="space-y-4">
                    <InterventionCardPanel
                      card={result.interventionCard}
                      title="今晚家庭干预卡"
                      footer={
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">家长沟通话术</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{result.parentMessageDraft}</p>
                          </div>
                          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">下一检查点</p>
                            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                              {result.nextCheckpoints.map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      }
                    />
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-700">
                      会诊完成后，结果会同步回教师端结果卡，并将今晚任务写入家长端；如需升级，也会同步生成园长决策卡。
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" className="rounded-xl" onClick={addFollowUpReminder}>
                        <Clock3 className="mr-2 h-4 w-4" />
                        加入后续提醒
                      </Button>
                      <Button asChild variant="premium" className="rounded-xl">
                        <Link href="/parent/agent">去家长端看今晚任务</Link>
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              </div>
            ) : null}
          </div>
        }
        aside={
          <div className="space-y-6">
            <SectionCard title="会诊说明" description="适合移动端竖屏录屏的三步演示。">
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-3"><ShieldAlert className="h-4 w-4 text-amber-500" />先锁定需要升级关注的儿童</li>
                <li className="flex items-center gap-3"><BrainCircuit className="h-4 w-4 text-indigo-500" />再让系统按阶段推送会诊流</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-emerald-500" />最后落到园内、家庭和 48 小时复查卡</li>
              </ol>
            </SectionCard>
            <SectionCard title="本页说明" description="优先展示老师看得懂、讲得清的会诊过程。">
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-100 bg-white p-4">会诊过程会持续展示长期画像、近期情况和当前建议三段内容。</div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4">如当前数据暂不完整，页面会优先保留已经整理出的阶段内容。</div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4">会诊结束后，会自动生成园内动作、家庭任务和 48 小时复查卡。</div>
              </div>
            </SectionCard>
            <SectionCard title="展示视角" description="页面支持常规展示与详细查看两种视角。">
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-100 bg-white p-4">常规展示会优先保留三阶段故事线、同步去向和必要异常提示，适合评委录屏与教师讲解。</div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4">详细查看会额外展开更细的过程信息，便于需要时核对发生在哪个阶段。</div>
              </div>
            </SectionCard>
            {result ? (
              <SectionCard title="园长决策卡预览" description="会诊结果会同步进入园长端优先级区。">
                <div className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">{result.riskLevel === "high" ? "P1" : result.riskLevel === "medium" ? "P2" : "P3"}</Badge>
                    <Badge variant="secondary">
                      {result.directorDecisionCard.status === "completed" ? "已完成" : result.directorDecisionCard.status === "in_progress" ? "跟进中" : "待分派"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-base font-semibold text-slate-900">{result.directorDecisionCard.reason}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">建议负责人：{result.directorDecisionCard.recommendedOwnerName}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">建议处理时间：{result.directorDecisionCard.recommendedAt}</p>
                </div>
              </SectionCard>
            ) : null}
          </div>
        }
      />
    </RolePageShell>
  );
}
