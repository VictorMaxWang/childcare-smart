"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BrainCircuit,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageSquareText,
  Mic,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import InterventionCardPanel from "@/components/agent/InterventionCardPanel";
import ConsultationQaPanel from "@/components/consultation/ConsultationQaPanel";
import ConsultationTracePanel from "../../../components/consultation/ConsultationTracePanel";
import { TeacherContextStrip, TeacherMiniPanel } from "@/components/teacher/TeacherOperationKit";
import { RolePageShell, RoleSplitLayout, SectionCard, InlineLinkButton } from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildConsultationResultBadge,
  buildHighRiskConsultationAutoContext,
  buildHighRiskConsultationDraft,
  type HighRiskConsultationRequestPayload,
} from "@/lib/agent/high-risk-consultation";
import { buildTeacherAgentChildContext, buildTeacherAgentClassContext } from "@/lib/agent/teacher-agent";
import { type AgentStreamEvent, useAgentStream } from "@/lib/bridge/use-agent-stream";
import type { MemoryContextMeta } from "@/lib/ai/types";
import { buildConsultationTraceFixture } from "@/lib/consultation/trace-fixtures";
import { buildConsultationTraceViewModel } from "@/lib/consultation/trace-view-model";
import {
  formatConsultationEvidenceSupportLabel,
  getConsultationEvidenceConfidenceLabel,
  getConsultationEvidenceHumanReviewLabel,
  sortConsultationEvidenceItems,
} from "@/lib/consultation/evidence-display";
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
import { listFeedback as listApiFeedback, type ApiFeedback } from "@/lib/api/communication";
import { normalizeGuardianFeedbackCollection } from "@/lib/feedback/normalize";
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

type ConsultationFilter = "all" | "pending" | "active" | "completed";

const CONSULTATION_CLIENT_FALLBACK_TIMEOUT_MS = 28_000;

type DraftPayload = {
  teacherNote?: string;
  imageInput?: { attachmentName?: string; content?: string };
  voiceInput?: { attachmentName?: string; content?: string };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function isLinXiaoyuCase(child?: { id?: string; name?: string } | null) {
  return child?.id === "c-1" || child?.name === "林小雨";
}

function buildDefaultConsultationDraftPayload(params: {
  childName: string;
  autoContext: ReturnType<typeof buildHighRiskConsultationAutoContext>;
}): DraftPayload {
  if (!isLinXiaoyuCase({ name: params.childName, id: params.autoContext.childId })) {
    return {};
  }

  return {
    teacherNote:
      "走廊活动听到推车声后，林小雨停在门口害怕退缩；周老师蹲下陪她说出“我害怕”，再牵手完成一小步尝试。请生成“勇敢表达与小步尝试”的社会情绪支持会诊方案。",
    imageInput: {
      attachmentName: "lin-xiaoyu-growth-record.jpg",
      content:
        params.autoContext.growthObservationNotes[0] ??
        "成长记录：走廊活动、勇敢表达、小步尝试。孩子在老师陪伴下说出“我害怕”，并愿意牵手走一步。",
    },
    voiceInput: {
      attachmentName: "teacher-zhou-hallway-note.m4a",
      content:
        "周老师语音速记：小雨对走廊推车声明显退缩，但在预告和牵手陪伴后能尝试靠近门口，建议今晚家庭用共读绘本承接。",
    },
  };
}

function mergeDraftPayload(existing: DraftPayload | undefined, fallback: DraftPayload): DraftPayload | undefined {
  if (!existing) return Object.keys(fallback).length > 0 ? fallback : undefined;

  return {
    teacherNote: existing.teacherNote?.trim() ? existing.teacherNote : fallback.teacherNote,
    imageInput: existing.imageInput?.content?.trim() ? existing.imageInput : fallback.imageInput,
    voiceInput: existing.voiceInput?.content?.trim() ? existing.voiceInput : fallback.voiceInput,
  };
}

function getRiskPriorityLabel(result: ConsultationApiResult) {
  if (result.riskLevel === "high") return "P1 高优先级";
  if (result.riskLevel === "medium") return "P2 重点跟进";
  return "P3 持续观察";
}

function getProviderSummary(result: ConsultationApiResult) {
  const trace = asRecord(result.providerTrace);
  const provider = String(trace.provider ?? result.provider ?? trace.source ?? result.source ?? "local");
  const model = String(trace.model ?? result.model ?? "local-rules");
  const transport = String(trace.transport ?? asRecord(result.traceMeta).transport ?? "next-json-fallback");
  const fallback = Boolean(trace.fallback ?? result.fallback);
  return {
    provider,
    model,
    transport,
    fallback,
    label: fallback ? "本地兜底可用" : "外部 provider",
  };
}

function getDataQualitySummary(result: ConsultationApiResult) {
  const dataQuality = asRecord(asRecord(result.traceMeta).dataQuality);
  const coveredSources = asStringArray(dataQuality.coveredSources);
  const warnings = asStringArray(dataQuality.warnings);
  const evidenceCount =
    typeof dataQuality.evidenceCount === "number"
      ? dataQuality.evidenceCount
      : result.evidenceItems.length;

  return {
    status: String(dataQuality.status ?? (warnings.length > 0 ? "review" : "complete")),
    evidenceCount,
    requiredSourceCoverage: String(dataQuality.requiredSourceCoverage ?? `${coveredSources.length}/4`),
    coveredSources,
    warnings,
  };
}

function ResultCorePanel({ result }: { result: ConsultationApiResult }) {
  const provider = getProviderSummary(result);
  const dataQuality = getDataQualitySummary(result);
  const evidenceItems = sortConsultationEvidenceItems(result.evidenceItems);
  const safetyWarnings = Array.isArray(result.warnings) ? result.warnings : dataQuality.warnings;
  const manualReviewSummary = result.manualReviewSummary;
  const adminHandoff = result.shouldEscalateToAdmin
    ? `需要管理端承接 · ${result.directorDecisionCard.recommendedOwnerName} · ${result.directorDecisionCard.recommendedAt}`
    : "教师端继续观察";

  return (
    <SectionCard
      title="会诊总览 · 答辩核心结果"
      description="风险、证据、动作和承接状态集中展示，便于现场讲解。"
      actions={<Badge variant={result.shouldEscalateToAdmin ? "warning" : "outline"}>{adminHandoff}</Badge>}
    >
      <div className="space-y-5 lg:pr-72 2xl:pr-0">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            { label: "风险等级", value: getRiskPriorityLabel(result), tone: "border-rose-100 bg-rose-50 text-rose-800" },
            { label: "管理端承接", value: result.shouldEscalateToAdmin ? "已进入园长优先级板" : "教师端闭环", tone: "border-amber-100 bg-amber-50 text-amber-800" },
            { label: "Provider / fallback", value: `${provider.provider} · ${provider.label}`, tone: "border-indigo-100 bg-indigo-50 text-indigo-800" },
            { label: "DataQuality", value: `证据 ${dataQuality.evidenceCount} 条 · 来源 ${dataQuality.requiredSourceCoverage}`, tone: "border-emerald-100 bg-emerald-50 text-emerald-800" },
            { label: "人工复核", value: manualReviewSummary?.required ? `${manualReviewSummary.reviewRequiredCount} 条需复核` : "常规复核", tone: "border-sky-100 bg-sky-50 text-sky-800" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border p-4 ${item.tone}`}>
              <p className="text-xs font-medium opacity-80">{item.label}</p>
              <p className="mt-2 text-sm font-semibold leading-5">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">触发原因</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {result.triggerReasons.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">关键发现</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {result.keyFindings.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <p className="text-sm font-semibold text-sky-950">今日园内动作</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-sky-800">
              {result.todayInSchoolActions.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <p className="text-sm font-semibold text-violet-950">今晚家庭任务</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-violet-800">
              {result.tonightAtHomeActions.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-amber-950">48 小时复查</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
              {result.followUp48h.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">evidenceItems 证据链</p>
              <p className="mt-1 text-xs text-slate-500">
                已覆盖：{dataQuality.coveredSources.length > 0 ? dataQuality.coveredSources.join("、") : "教师观察、成长记录、家长反馈、记忆快照 / 历史跟进"}
              </p>
            </div>
            <Badge variant={result.humanReviewRequired ? "warning" : dataQuality.status === "complete" ? "success" : "warning"}>
              {result.humanReviewRequired ? "需人工复核" : dataQuality.status === "complete" ? "证据完整" : "需复核"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {evidenceItems.map((displayItem, index) => (
              <div key={`${displayItem.id}-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{displayItem.sourceLabel}</Badge>
                  <Badge variant="secondary">{getConsultationEvidenceConfidenceLabel(displayItem.confidence)}</Badge>
                  <Badge variant={displayItem.requiresHumanReview ? "warning" : "success"}>
                    {getConsultationEvidenceHumanReviewLabel(displayItem.requiresHumanReview)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{displayItem.summary}</p>
                {displayItem.supports.length > 0 ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {displayItem.supports.map((support) => formatConsultationEvidenceSupportLabel(support)).join("；")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {result.knowledgeHints?.length ? (
          <div
            className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"
            data-testid="childcare-knowledge-hints"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-950">专业依据提示</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  来自轻量托育知识库，用于提示照护原则、可执行动作和风险边界；后续可接入向量检索和真实机构案例。
                </p>
              </div>
              <Badge variant="success">knowledgeHints</Badge>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {result.knowledgeHints.map((hint) => (
                <div key={hint.id} className="rounded-xl border border-emerald-100 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{hint.topic}</Badge>
                    <Badge variant="secondary">{hint.ageRange}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-900">{hint.principle}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{hint.suggestedAction}</p>
                  <p className="mt-2 text-xs leading-5 text-amber-700">边界：{hint.riskBoundary}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{hint.sourceNote}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">provider / fallback / dataQuality</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              provider={provider.provider}；model={provider.model}；transport={provider.transport}；fallback={provider.fallback ? "true" : "false"}；dataQuality={dataQuality.status}。
            </p>
            {safetyWarnings.length > 0 ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">{safetyWarnings.join("；")}</p>
            ) : null}
          </div>
          <Button asChild variant="premium" className="h-full min-h-20 rounded-2xl">
            <Link href="/admin">去管理端查看风险承接</Link>
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function ConsultationInputCard({
  draftId,
  selectedChildName,
  className,
  saveMobileDraft,
  onStart,
  draftPayload,
  isStreaming,
  startButtonRef,
  isPrimaryDemoCase,
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
  isStreaming: boolean;
  draftPayload?: DraftPayload;
  startButtonRef?: RefObject<HTMLButtonElement | null>;
  isPrimaryDemoCase?: boolean;
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
        <Textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} placeholder="例如：走廊活动听到推车声后害怕退缩，已能在老师陪伴下说出“我害怕”，希望生成勇敢表达与小步尝试支持方案。" className="min-h-28 rounded-lg bg-white" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-100 bg-white p-5">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-sky-500" />
              <p className="text-sm font-semibold text-slate-900">图片文字补充</p>
            </div>
            <div className="mt-4 space-y-3">
              <Input value={imageAttachmentName} onChange={(event) => setImageAttachmentName(event.target.value)} placeholder="附件名，例如 morning-check-photo.jpg" />
              <Textarea value={imageNote} onChange={(event) => setImageNote(event.target.value)} placeholder="先写一段图片中的关键信息。" className="min-h-24 bg-white" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-white p-5">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-indigo-500" />
              <p className="text-sm font-semibold text-slate-900">语音文字补充</p>
            </div>
            <div className="mt-4 space-y-3">
              <Input value={voiceAttachmentName} onChange={(event) => setVoiceAttachmentName(event.target.value)} placeholder="附件名，例如 teacher-voice-note.m4a" />
              <Textarea value={voiceNote} onChange={(event) => setVoiceNote(event.target.value)} placeholder="先写一段语音速记内容。" className="min-h-24 bg-white" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
          <div className="text-sm text-slate-600">点击后会按“长期画像 → 最近会诊 → 当前建议”流式展示，并在结束后保留最终会诊卡。</div>
          <Button
            ref={startButtonRef}
            className="gap-2 rounded-xl bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white shadow-md shadow-indigo-500/25 disabled:border disabled:border-slate-200 disabled:bg-none disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none"
            variant="premium"
            data-testid="r06-consultation-start-button"
            onClick={() =>
              onStart({
                teacherNote,
                imageInput: imageNote.trim() ? { attachmentName: imageAttachmentName.trim(), content: imageNote.trim() } : undefined,
                voiceInput: voiceNote.trim() ? { attachmentName: voiceAttachmentName.trim(), content: voiceNote.trim() } : undefined,
              })
            }
            disabled={isStreaming}
          >
            <Sparkles className="h-4 w-4" />
            {isStreaming ? "生成中..." : isPrimaryDemoCase ? "一键生成林小雨会诊" : "一键生成会诊"}
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
    consultations,
    mobileDrafts,
    saveMobileDraft,
    markMobileDraftSyncStatus,
    saveConsultationRecord,
    addConsultationRecordNote,
    updateConsultationRecordStatus,
    upsertInterventionCard,
    saveReminderRecord,
  } = useApp();
  const { start, isStreaming, stop } = useAgentStream();
  const searchParams = useSearchParams();
  const traceMode: ConsultationTraceMode = searchParams.get("trace") === "debug" ? "debug" : "demo";
  const traceCaseParam = searchParams.get("traceCase");
  const routeIntent = searchParams.get("intent");
  const queryChildId = searchParams.get("childId");
  const queryConsultationId = searchParams.get("consultationId");
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
  const [consultationFilter, setConsultationFilter] = useState<ConsultationFilter>("all");
  const [discussionInput, setDiscussionInput] = useState("");
  const [discussionNotes, setDiscussionNotes] = useState<string[]>([]);
  const [sideActionMessage, setSideActionMessage] = useState<string | null>(null);
  const [setupFocusMessage, setSetupFocusMessage] = useState<string | null>(null);
  const [apiFeedbacks, setApiFeedbacks] = useState<ApiFeedback[]>([]);

  const receivedAnyEventRef = useRef(false);
  const receivedDoneRef = useRef(false);
  const streamErroredRef = useRef(false);
  const resultMountedRef = useRef(false);
  const consultationStartGuardRef = useRef(false);
  const consultationSetupRef = useRef<HTMLDivElement | null>(null);
  const consultationStartButtonRef = useRef<HTMLButtonElement | null>(null);
  const mergedGuardianFeedbacks = useMemo(
    () => normalizeGuardianFeedbackCollection([...guardianFeedbacks, ...apiFeedbacks]) ?? guardianFeedbacks,
    [apiFeedbacks, guardianFeedbacks]
  );

  const classContext = useMemo(
    () =>
      buildTeacherAgentClassContext({
        currentUser,
        visibleChildren,
        presentChildren,
        healthCheckRecords,
        growthRecords,
        guardianFeedbacks: mergedGuardianFeedbacks,
      }),
    [currentUser, mergedGuardianFeedbacks, growthRecords, healthCheckRecords, presentChildren, visibleChildren]
  );
  const demoChildId = useMemo(
    () => visibleChildren.find((child) => isLinXiaoyuCase(child))?.id ?? "",
    [visibleChildren]
  );
  const activeChildId = selectedChildId || queryPreferredChildId || demoChildId || visibleChildren[0]?.id || "";
  const childContext = useMemo(() => buildTeacherAgentChildContext(classContext, activeChildId), [classContext, activeChildId]);
  const autoContext = useMemo(() => (childContext ? buildHighRiskConsultationAutoContext({ classContext, childContext }) : null), [childContext, classContext]);
  const selectedChild = childContext?.child;
  const storedConsultationsForChild = useMemo(
    () =>
      consultations
        .filter((item) => item.childId === activeChildId)
        .sort((left, right) => {
          const leftUpdatedAt = (left as { updatedAt?: string }).updatedAt ?? left.generatedAt;
          const rightUpdatedAt = (right as { updatedAt?: string }).updatedAt ?? right.generatedAt;
          return rightUpdatedAt.localeCompare(leftUpdatedAt);
        }),
    [activeChildId, consultations]
  );
  const draftId = selectedChild ? `high-risk-consultation-${selectedChild.id}` : "";
  const existingDraft = useMemo(() => mobileDrafts.find((draft) => draft.draftId === draftId), [draftId, mobileDrafts]);
  const existingDraftPayload = useMemo(
    () =>
      existingDraft?.structuredPayload as
        | DraftPayload
        | undefined,
    [existingDraft]
  );
  const consultationDraftPayload = useMemo(() => {
    if (!selectedChild || !autoContext) return existingDraftPayload;
    return mergeDraftPayload(
      existingDraftPayload,
      buildDefaultConsultationDraftPayload({
        childName: selectedChild.name,
        autoContext,
      })
    );
  }, [autoContext, existingDraftPayload, selectedChild]);
  useEffect(() => {
    if (isStreaming) return;
    const preferredStored = queryConsultationId
      ? storedConsultationsForChild.find((item) => item.consultationId === queryConsultationId)
      : undefined;
    const latestStored = preferredStored ?? storedConsultationsForChild[0];
    if (!latestStored || !isRenderableConsultationApiResult(latestStored)) return;
    if (result?.consultationId === latestStored.consultationId) return;
    setResult(latestStored);
    setProviderTrace(
      latestStored.providerTrace && typeof latestStored.providerTrace === "object"
        ? (latestStored.providerTrace as ConsultationProviderTrace)
        : null
    );
    setStreamMessage("已从 D01 演示数据恢复最近一次会诊，刷新后仍可查看。");
  }, [isStreaming, queryConsultationId, result?.consultationId, storedConsultationsForChild]);
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
    let cancelled = false;
    async function loadFeedback() {
      try {
        const data = await listApiFeedback();
        if (!cancelled) setApiFeedbacks(data);
      } catch {
        if (!cancelled) setApiFeedbacks([]);
      }
    }

    void loadFeedback();
    return () => {
      cancelled = true;
    };
  }, []);

  function openConsultationSetup() {
    setShowSetupSections(true);
    setSetupFocusMessage("已定位到会诊输入区，请补充信息后点击一键生成会诊。");
    window.requestAnimationFrame(() => {
      consultationSetupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => consultationStartButtonRef.current?.focus(), 250);
    });
  }

  function applyConsultationResult(rawResult: unknown, successMessagePrefix = "证据链生成完成") {
    if (!selectedChild) return false;

    if (!isRenderableConsultationApiResult(rawResult)) {
      const reason = describeConsultationResultIssues(rawResult);
      setInvalidResultReason(reason);
      setStreamMessage(reason || "会诊已结束，但返回结果还不完整。");
      return false;
    }

    const saveResult = saveConsultationRecord({
      childId: selectedChild.id,
      consultation: rawResult,
      workflowStatus: "pending",
    });
    if (saveResult.status === "failed") {
      const message = saveResult.error ?? saveResult.message ?? "会诊结果保存失败。";
      setStreamError(message);
      setStreamMessage(message);
      return false;
    }

    const completedResult = (saveResult.data as ConsultationApiResult | undefined) ?? rawResult;
    resultMountedRef.current = true;
    setResult(completedResult);
    setShowSetupSections(false);
    upsertInterventionCard(rawResult.interventionCard);
    const reminderResults = [
      ...buildReminderItems({
        childId: selectedChild.id,
        targetRole: "teacher",
        targetId: selectedChild.id,
        childName: selectedChild.name,
        interventionCard: rawResult.interventionCard,
        consultation: rawResult,
      }),
      ...buildReminderItems({
        childId: selectedChild.id,
        targetRole: "parent",
        targetId: selectedChild.id,
        childName: selectedChild.name,
        interventionCard: rawResult.interventionCard,
        consultation: rawResult,
      }),
    ].map((item) => saveReminderRecord(item));
    const failedReminder = reminderResults.find((item) => item.status === "failed");
    if (failedReminder) {
      const message = failedReminder.error ?? failedReminder.message ?? "后续提醒保存失败。";
      setStreamError(message);
      setStreamMessage(`会诊结果已保存，但后续提醒未保存：${message}`);
      return true;
    }
    markMobileDraftSyncStatus(draftId, "synced");
    const reminderPersistenceText =
      reminderResults.length === 0
        ? "本次复查计划已保留在会诊结果中。"
        : reminderResults.some((item) => item.status === "local_only")
          ? "后续提醒已写入共享演示数据，刷新后保留。"
          : "后续提醒已写入当前数据层，刷新后保留。";
    setStreamMessage(
      `${successMessagePrefix}：会诊结果已保存到 D01 演示数据，教师端、家长端和园长端可从同一记录读取。${reminderPersistenceText}`
    );
    return true;
  }

  async function runForcedLocalFallback(
    payload: HighRiskConsultationRequestPayload,
    fallbackReason: string
  ) {
    setStreamMessage("已切换本地会诊兜底：远端 AI 会诊暂不可用，正在生成可解释结果。");
    const response = await fetch("/api/ai/high-risk-consultation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-force-fallback": "1",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`local fallback failed with status ${response.status}`);
    }

    const rawResult = await response.json();
    const resultObject = rawResult && typeof rawResult === "object" ? (rawResult as Record<string, unknown>) : null;
    const nextProviderTrace =
      resultObject?.providerTrace && typeof resultObject.providerTrace === "object"
        ? (resultObject.providerTrace as ConsultationProviderTrace)
        : {
            realProvider: false,
            fallback: true,
            fallbackReason,
          };
    const nextMemoryMeta =
      (resultObject?.memoryMeta as MemoryContextMeta | Record<string, unknown> | null | undefined) ?? null;

    receivedDoneRef.current = true;
    setReceivedDone(true);
    setTraceId(String(resultObject?.consultationId ?? `local-fallback-${Date.now()}`));
    setProviderTrace(nextProviderTrace);
    setMemoryMeta(nextMemoryMeta);
    setStreamError(null);
    applyConsultationResult(rawResult, "证据链生成完成");
  }

  async function runConsultation(form: {
    teacherNote: string;
    imageInput?: { attachmentName?: string; content?: string };
    voiceInput?: { attachmentName?: string; content?: string };
  }) {
    if (!selectedChild || isStreaming || consultationStartGuardRef.current) return;
    consultationStartGuardRef.current = true;
    setSetupFocusMessage(null);
    setStreamError(null);
    setStreamMessage("AI 辅助会诊进行中：正在连接会诊流。");
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
    resultMountedRef.current = false;
    streamErroredRef.current = false;

    let workflowFeedbacks = mergedGuardianFeedbacks;
    try {
      const latestApiFeedbacks = await listApiFeedback();
      setApiFeedbacks(latestApiFeedbacks);
      workflowFeedbacks = normalizeGuardianFeedbackCollection([...guardianFeedbacks, ...latestApiFeedbacks]) ?? workflowFeedbacks;
    } catch {
      // Keep local feedback available if the communication API is unavailable.
    }

    const payload: HighRiskConsultationRequestPayload = {
      currentUser,
      visibleChildren,
      presentChildren,
      healthCheckRecords,
      growthRecords,
      guardianFeedbacks: workflowFeedbacks,
      targetChildId: selectedChild.id,
      teacherNote: form.teacherNote,
      imageInput: form.imageInput,
      voiceInput: form.voiceInput,
    };

    let streamTimedOut = false;
    let streamFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      streamFallbackTimer = setTimeout(() => {
        if (resultMountedRef.current || receivedDoneRef.current) return;
        streamTimedOut = true;
        setStreamEndedUnexpectedly(true);
        setStreamMessage("已切换本地会诊兜底：远端 AI 会诊超过 28 秒仍未返回完整结果。");
        stop();
      }, CONSULTATION_CLIENT_FALLBACK_TIMEOUT_MS);

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
          applyConsultationResult(rawResult);
          return;
        }
      });

      if (!resultMountedRef.current) {
        setStreamEndedUnexpectedly(true);
        await runForcedLocalFallback(
          payload,
          receivedDoneRef.current ? "client-stream-invalid-result" : "client-stream-ended-without-result"
        );
        return;
      }

      if (!receivedDoneRef.current && !streamErroredRef.current) {
        setStreamEndedUnexpectedly(true);
        setStreamMessage(
          receivedAnyEventRef.current
            ? "会诊过程提前结束，当前阶段内容已保留，方便继续查看。"
            : "会诊已结束，正在保留本地完整方案用于展示。"
        );
      }
    } catch (error) {
      if (!resultMountedRef.current) {
        try {
          await runForcedLocalFallback(
            payload,
            streamTimedOut ? "client-stream-timeout" : "client-stream-error"
          );
          return;
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : "本地会诊兜底请求失败";
          setStreamError(fallbackMessage);
          setStreamMessage(fallbackMessage);
        }
      }
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
    } finally {
      if (streamFallbackTimer) clearTimeout(streamFallbackTimer);
      consultationStartGuardRef.current = false;
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
    const reminderResults = buildReminderItems({
      childId: selectedChild.id,
      targetRole: "teacher",
      targetId: selectedChild.id,
      childName: selectedChild.name,
      interventionCard: result.interventionCard,
      consultation: result,
    }).map((item) =>
      saveReminderRecord({
        ...item,
        reminderId: `${item.reminderId}-manual-follow-up`,
        title: `${item.title}（后续提醒）`,
        status: "pending",
      })
    );
    if (reminderResults.length === 0) {
      setStreamMessage("当前会诊已包含 48 小时复查计划，可继续在结果卡和管理端查看。");
      return;
    }

    const failedReminder = reminderResults.find((item) => item.status === "failed");
    if (failedReminder) {
      const message = failedReminder.error ?? failedReminder.message ?? "后续提醒保存失败。";
      setStreamError(message);
      setStreamMessage(`后续提醒未保存：${message}`);
      return;
    }

    const persistenceText = reminderResults.some((item) => item.status === "local_only")
      ? "已加入后续提醒，并写入共享演示数据，刷新后保留。"
      : "已加入后续提醒，并写入当前数据层，刷新后保留。";
    setStreamMessage(persistenceText);
  }

  if (visibleChildren.length === 0 || !selectedChild || !childContext || !autoContext) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="请进入周老师演示账号" description="高风险会诊主案例需要教师账号可见林小雨所在班级。" />
      </div>
    );
  }

  const consultationStatus: ConsultationFilter = isStreaming ? "active" : result ? "completed" : "pending";
  const showConsultationCard = consultationFilter === "all" || consultationFilter === consultationStatus;
  const participants = [
    { name: currentUser.name, role: "发起人" },
    ...(selectedChild.guardians ?? []).slice(0, 2).map((guardian) => ({
      name: guardian.name,
      role: guardian.relation,
    })),
  ];
  const persistedDiscussionNotes =
    ((result as { notes?: Array<{ note?: string; createdBy?: string; createdAt?: string }> } | null)?.notes ?? [])
      .map((item) => `${item.createdBy === currentUser.id ? currentUser.name : "会诊记录"}：${item.note ?? ""}`)
      .filter((item) => item.trim().length > 0);
  const discussionMessages = [
    `${currentUser.name}：发起会诊，近期出现持续关注信号。`,
    ...persistedDiscussionNotes,
    ...discussionNotes,
  ];
  const sendDiscussionNote = () => {
    const note = discussionInput.trim();
    if (!note) return;
    if (result) {
      const saved = addConsultationRecordNote({
        consultationId: result.consultationId,
        note,
      });
      if (saved.status === "failed") {
        setStreamError(saved.error ?? saved.message ?? "会诊备注保存失败。");
        return;
      }
      if (saved.data && isRenderableConsultationApiResult(saved.data)) {
        setResult(saved.data);
      }
      setStreamMessage(
        saved.status === "local_only"
          ? "会诊备注已写入共享演示数据，刷新后仍可查看。"
          : "会诊备注已保存到当前数据层，刷新后仍可查看。"
      );
      setDiscussionInput("");
      return;
    }
    setDiscussionNotes((prev) => [`${currentUser.name}：${note}`, ...prev]);
    setDiscussionInput("");
  };

  const updateWorkflowStatus = (status: "pending" | "in-progress" | "resolved") => {
    if (!result) return;
    const saved = updateConsultationRecordStatus({
      consultationId: result.consultationId,
      status,
    });
    if (saved.status === "failed") {
      setStreamError(saved.error ?? saved.message ?? "会诊状态更新失败。");
      return;
    }
    if (saved.data && isRenderableConsultationApiResult(saved.data)) {
      setResult(saved.data);
    }
    setStreamMessage(
      `会诊状态已更新为 ${status === "pending" ? "待处理" : status === "in-progress" ? "处理中" : "已解决"}。${
        saved.status === "local_only" ? "已写入共享演示数据，刷新后保留。" : "已写入当前数据层，刷新后保留。"
      }`
    );
  };

  return (
    <RolePageShell
      badge={`重点会诊 · ${classContext.className}`}
      title="重点儿童支持会诊"
      description="按长期画像、最近会诊、当前建议分阶段流式展示，适合移动端录屏。"
      testId="r06-high-risk-consultation-page"
      actions={
        <>
          <InlineLinkButton href="/teacher" label="返回教师工作台" />
          <InlineLinkButton href="/teacher/agent" label="进入教师 AI 助手" variant="premium" />
        </>
      }
      headerVariant="hidden"
      className="max-w-[86rem]"
    >
      <RoleSplitLayout
        stacked
        main={
          <div className="space-y-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_48%,#fff1f2_100%)] p-4 shadow-[0_24px_70px_rgb(99_102_241_/_0.13)] sm:p-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="info" className="rounded-full px-3 py-1">教师工作台</Badge>
                        <Badge variant="warning" className="rounded-full px-3 py-1">高风险</Badge>
                      </div>
                      <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">重点儿童支持会诊</h1>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        按长期画像、最近会诊、当前建议分阶段流式展示，适合移动端录屏。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild type="button" variant="outline" className="rounded-2xl">
                        <Link href="/teacher">返回教师工作台</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="premium"
                        className="rounded-2xl bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white shadow-md shadow-indigo-500/25"
                        onClick={openConsultationSetup}
                        aria-controls="consultation-setup"
                      >
                        发起会诊 / 邀请专家
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">会诊流程</p>
                      <Badge variant={isStreaming ? "info" : result ? "success" : "outline"}>
                        {isStreaming ? "进行中" : result ? "已完成" : "待启动"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      {[
                        ["1", "发起会诊"],
                        ["2", "专家响应"],
                        ["3", "方案讨论"],
                        ["4", "生成建议"],
                      ].map(([step, label], index) => (
                        <div key={step} className="relative rounded-2xl bg-slate-50 px-4 py-3">
                          <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${index === 0 || result ? "bg-indigo-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>
                            {step}
                          </span>
                          <p className="mt-3 text-sm font-semibold text-slate-900">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {[
                        { label: "待处理会诊", value: `${autoContext.pendingReviewNotes.length + autoContext.morningCheckAlerts.length}`, tone: "bg-sky-50 text-sky-700", icon: ClipboardList },
                        { label: "在会诊中", value: isStreaming ? "1" : result ? "0" : "0", tone: "bg-indigo-50 text-indigo-700", icon: UsersRound },
                      { label: "本周完成会诊", value: result ? "1" : "0", tone: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
                      { label: "重点跟进记录", value: `${classContext.focusChildren.length}`, tone: "bg-rose-50 text-rose-700", icon: ShieldAlert },
                      { label: "未回复家长消息", value: `${autoContext.parentFeedbackNotes.length}`, tone: "bg-emerald-50 text-emerald-700", icon: MessageSquareText },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="rounded-2xl border border-white/80 bg-white/88 p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs text-slate-500">{item.label}</p>
                              <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                              <p className="mt-1 text-xs text-slate-500">来自当前班级数据</p>
                            </div>
                            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                              <Icon className="h-5 w-5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: "all" as const, label: "全部" },
                          { key: "pending" as const, label: "待处理" },
                          { key: "active" as const, label: "进行中" },
                          { key: "completed" as const, label: "已完成" },
                        ].map((item) => (
                          <Button
                            key={item.key}
                            type="button"
                            variant={consultationFilter === item.key ? "premium" : "outline"}
                            size="sm"
                            className="rounded-full"
                            onClick={() => setConsultationFilter(item.key)}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                      {traceHeaderActions}
                    </div>
                    {showConsultationCard ? (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="destructive">高风险</Badge>
                          <h2 className="text-lg font-semibold text-slate-950">{classContext.className} · {selectedChild.name}</h2>
                          <Badge variant="outline">{selectedChild.className}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{getAgeText(selectedChild.birthDate)} · 出生于 {formatDisplayDate(selectedChild.birthDate)}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {autoContext.focusReasons.slice(0, 4).map((item) => (
                            <Badge key={item} variant="warning" className="rounded-full px-3 py-1">{item}</Badge>
                          ))}
                        </div>
                        <div className="mt-4 rounded-2xl border border-rose-100 bg-white/75 p-4">
                          <p className="text-sm font-semibold text-slate-950">风险概览</p>
                          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                              ["成长观察", autoContext.growthObservationNotes.length],
                              ["行为发展", autoContext.classSignals.length],
                              ["健康状况", autoContext.morningCheckAlerts.length],
                              ["家庭反馈", autoContext.parentFeedbackNotes.length],
                            ].map(([label, value]) => (
                              <div key={label as string} className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                                <p className="text-lg font-semibold text-slate-950">{value as number}</p>
                                <p className="text-xs text-slate-500">{label as string}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <Button asChild type="button" variant="outline" className="rounded-2xl">
                            <Link href="/children">查看完整档案</Link>
                          </Button>
                          <Button type="button" variant="premium" className="rounded-2xl" onClick={openConsultationSetup}>
                            编辑风险信息
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-950">会议参与人员</p>
                            <Badge variant="info">{participants.length}/6</Badge>
                          </div>
                          <div className="mt-4 space-y-3">
                            {participants.map((participant) => (
                              <div key={`${participant.name}-${participant.role}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                <span className="text-sm font-medium text-slate-800">{participant.name}</span>
                                <Badge variant="secondary">{participant.role}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                          <p className="text-sm font-semibold text-indigo-900">AI 助诊建议</p>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-indigo-800">
                            <li>先确认走廊声响、门口过渡和退缩反应的触发关系；</li>
                            <li>今日园内用“预告声音 + 可选择小步目标”降低压力；</li>
                            <li>今晚家庭用共读绘本承接“我害怕”的勇敢表达。</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    ) : (
                      <EmptyState
                        icon={<ClipboardList className="h-6 w-6" />}
                        title="当前筛选未命中会诊"
                        description="切回全部即可查看林小雨主案例，也可以直接发起一次新的会诊。"
                      />
                    )}
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">下一步行动</p>
                    <div className="mt-4 space-y-3">
                      {[
                        ["家长沟通与知情同意", "进行中", "去沟通"],
                        ["走廊小步尝试", "待执行", "去执行"],
                        ["今晚家庭共读", "待安排", "去安排"],
                        ["48 小时复查承接", "待安排", "去跟踪"],
                      ].map(([title, status, action], index) => (
                        <div key={title} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{title}</p>
                            <p className="mt-1 text-xs text-slate-500">{status}</p>
                          </div>
                          {index === 0 ? (
                            <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
                              <Link href={`/teacher/agent?action=communication&childId=${selectedChild.id}`}>{action}</Link>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => {
                                openConsultationSetup();
                                setSideActionMessage(`${title}已定位到会诊输入区，请补充信息后生成方案。`);
                              }}
                            >
                              {action}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {sideActionMessage ? <p className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{sideActionMessage}</p> : null}
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">会议讨论与记录</p>
                    <div data-testid="d05-consultation-discussion" className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                      {discussionMessages.map((message, index) => (
                        <div key={`${index}-${message}`} className="rounded-2xl bg-slate-50 p-3">{message}</div>
                      ))}
                      <div className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-white px-3 py-2">
                        <input
                          data-testid="d05-consultation-note-input"
                          value={discussionInput}
                          onChange={(event) => setDiscussionInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              sendDiscussionNote();
                            }
                          }}
                          className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                          placeholder="输入讨论内容，按 Enter 发送"
                        />
                        <Button
                          data-testid="d05-consultation-note-send"
                          type="button"
                          size="sm"
                          variant="premium"
                          className="ml-auto rounded-xl"
                          onClick={sendDiscussionNote}
                          disabled={!discussionInput.trim()}
                        >
                          发送
                        </Button>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <TeacherContextStrip
              items={[
                { label: "会诊对象", value: selectedChild.name, tone: "rose" },
                { label: "当前班级", value: classContext.className, tone: "indigo" },
                { label: "晨检异常", value: `${autoContext.morningCheckAlerts.length}条`, tone: autoContext.morningCheckAlerts.length > 0 ? "rose" : "emerald" },
                { label: "待复查", value: `${autoContext.pendingReviewNotes.length}条`, tone: autoContext.pendingReviewNotes.length > 0 ? "amber" : "emerald" },
              ]}
            />
            <TeacherMiniPanel
              title="会诊处理节奏"
              badge={isStreaming ? "流式生成中" : result ? "已有结果" : "待启动"}
              tone={result ? "emerald" : autoContext.morningCheckAlerts.length > 0 ? "rose" : "amber"}
            >
              <div className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
                <p className="rounded-lg bg-white/80 px-3 py-2">先锁定儿童和自动带入的异常、复查、家长反馈。</p>
                <p className="rounded-lg bg-white/80 px-3 py-2">再补充教师观察、图片文字或语音速记内容。</p>
                <p className="rounded-lg bg-white/80 px-3 py-2">最终结果会同步为园内动作、家庭任务和复查提醒。</p>
              </div>
            </TeacherMiniPanel>
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
                      onClick={openConsultationSetup}
                    >
                      重新展开输入
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            {showSetupSections ? (
              <div
                ref={consultationSetupRef}
                id="consultation-setup"
                data-testid="r06-consultation-setup"
                className="scroll-mt-24 space-y-6"
              >
                {setupFocusMessage ? (
                  <div
                    className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm font-medium text-indigo-800 shadow-sm"
                    data-testid="r06-consultation-setup-focus-message"
                  >
                    {setupFocusMessage}
                  </div>
                ) : null}
                <SectionCard
                  title="1. 锁定会诊对象"
                  description="先选需要升级关注的儿童，再启动会诊流。"
              actions={existingDraft ? <Badge variant="secondary">{getDraftSyncStatusLabel(existingDraft.syncStatus, existingDraft.persistenceScope)}</Badge> : <Badge variant="outline">自动草稿缓存</Badge>}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-sm font-semibold text-slate-900">选择儿童</p>
                        <Select value={activeChildId} onValueChange={setSelectedChildId}>
                          <SelectTrigger className="h-12 rounded-lg">
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
                      <div className="rounded-lg border border-rose-100 bg-linear-to-br from-rose-50 via-white to-amber-50 p-5">
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
                    <div className="rounded-lg border border-slate-100 bg-white p-5">
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
                  draftPayload={consultationDraftPayload}
                  saveMobileDraft={saveMobileDraft}
                  isStreaming={isStreaming}
                  onStart={(form) => void runConsultation(form)}
                  startButtonRef={consultationStartButtonRef}
                  isPrimaryDemoCase={isLinXiaoyuCase(selectedChild)}
                />
              </div>
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
                <ResultCorePanel result={result} />
                <SectionCard title="4. 最终会诊结论" description="汇总本次会诊结论，方便老师直接确认并继续跟进。">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-rose-100 bg-linear-to-br from-rose-50 via-white to-amber-50 p-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="warning">会诊结论</Badge>
                        <Badge variant="secondary">{buildConsultationResultBadge(result)}</Badge>
                        <Badge variant="info">
                          {((result as { workflowStatus?: string }).workflowStatus ?? "pending") === "resolved"
                            ? "已解决"
                            : ((result as { workflowStatus?: string }).workflowStatus ?? "pending") === "in-progress"
                              ? "处理中"
                              : "待处理"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-lg font-semibold text-slate-900">{result.summary}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{result.coordinatorSummary.finalConclusion}</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">处理状态</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          ["pending", "待处理"],
                          ["in-progress", "处理中"],
                          ["resolved", "已解决"],
                        ].map(([status, label]) => (
                          <Button
                            key={status}
                            data-testid={`d05-consultation-status-${status}`}
                            type="button"
                            size="sm"
                            variant={((result as { workflowStatus?: string }).workflowStatus ?? "pending") === status ? "premium" : "outline"}
                            className="rounded-xl"
                            onClick={() => updateWorkflowStatus(status as "pending" | "in-progress" | "resolved")}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-lg border border-slate-100 bg-white p-5">
                        <p className="text-sm font-semibold text-slate-900">触发原因</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {result.triggerReasons.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-white p-5">
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
                          <div className="rounded-lg border border-white/70 bg-white/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">家长沟通话术</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{result.parentMessageDraft}</p>
                          </div>
                          <div className="rounded-lg border border-white/70 bg-white/80 p-4">
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
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-700">
                      会诊完成后，结果会同步回教师端结果卡，并将今晚任务写入家长端；如需升级，也会同步生成园长决策卡。
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={addFollowUpReminder}
                        data-testid="d07-follow-up-reminder"
                      >
                        <Clock3 className="mr-2 h-4 w-4" />
                        加入后续提醒
                      </Button>
                      <Button asChild variant="premium" className="rounded-xl">
                        <Link href={`/teacher/agent?action=communication&childId=${selectedChild.id}`}>
                          去家园沟通同步家长
                        </Link>
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
                <div className="rounded-lg border border-slate-100 bg-white p-4">会诊过程会持续展示长期画像、近期情况和当前建议三段内容。</div>
                <div className="rounded-lg border border-slate-100 bg-white p-4">如当前数据暂不完整，页面会优先保留已经整理出的阶段内容。</div>
                <div className="rounded-lg border border-slate-100 bg-white p-4">会诊结束后，会自动生成园内动作、家庭任务和 48 小时复查卡。</div>
              </div>
            </SectionCard>
            <SectionCard title="展示视角" description="页面支持常规展示与详细查看两种视角。">
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-lg border border-slate-100 bg-white p-4">常规展示会优先保留三阶段故事线、同步去向和必要异常提示，适合评委录屏与教师讲解。</div>
                <div className="rounded-lg border border-slate-100 bg-white p-4">详细查看会额外展开更细的过程信息，便于需要时核对发生在哪个阶段。</div>
              </div>
            </SectionCard>
            {result ? (
              <SectionCard title="园长决策卡预览" description="会诊结果会同步进入园长端优先级区。">
                <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-5">
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
