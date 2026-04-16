import type { ConsultationResult, MobileDraft } from "@/lib/ai/types";
import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  type TeacherAgentChildContext,
  type TeacherAgentClassContext,
  type TeacherAgentRequestPayload,
} from "@/lib/agent/teacher-agent";
import { createMobileDraft } from "@/lib/mobile/local-draft-cache";

export interface HighRiskConsultationImageInput {
  attachmentName?: string;
  content?: string;
}

export interface HighRiskConsultationVoiceInput {
  attachmentName?: string;
  content?: string;
}

export interface HighRiskConsultationRequestPayload
  extends Omit<TeacherAgentRequestPayload, "workflow" | "scope"> {
  targetChildId: string;
  teacherNote?: string;
  imageInput?: HighRiskConsultationImageInput;
  voiceInput?: HighRiskConsultationVoiceInput;
}

export interface HighRiskConsultationAutoContext {
  childId: string;
  childName: string;
  className: string;
  morningCheckAlerts: string[];
  pendingReviewNotes: string[];
  growthObservationNotes: string[];
  parentFeedbackNotes: string[];
  classSignals: string[];
  focusReasons: string[];
}

export interface HighRiskConsultationDraftPayload {
  childId: string;
  childName: string;
  className: string;
  teacherNote: string;
  imageInput?: HighRiskConsultationImageInput;
  voiceInput?: HighRiskConsultationVoiceInput;
}

export function resolveHighRiskConsultationContexts(
  payload: Omit<HighRiskConsultationRequestPayload, "teacherNote" | "imageInput" | "voiceInput">
) {
  const classContext = buildTeacherAgentClassContext(payload);
  const childContext = buildTeacherAgentChildContext(classContext, payload.targetChildId);

  return {
    classContext,
    childContext,
  };
}

function takeUnique(items: Array<string | undefined>, limit = 4) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function buildHighRiskConsultationAutoContext(params: {
  classContext: TeacherAgentClassContext;
  childContext: TeacherAgentChildContext;
}): HighRiskConsultationAutoContext {
  const { classContext, childContext } = params;

  return {
    childId: childContext.child.id,
    childName: childContext.child.name,
    className: classContext.className,
    morningCheckAlerts: takeUnique(
      childContext.todayAbnormalChecks.map(
        (item) =>
          `${item.date} 晨检异常：体温 ${item.temperature}℃、${item.mood}、${item.handMouthEye}${item.remark ? `，${item.remark}` : ""}`
      ),
      3
    ),
    pendingReviewNotes: takeUnique(
      childContext.pendingReviews.map(
        (item) => `${item.category}：${item.followUpAction ?? item.description}`
      ),
      3
    ),
    growthObservationNotes: takeUnique(
      childContext.recentGrowthRecords.map((item) => `${item.category}：${item.description}`),
      4
    ),
    parentFeedbackNotes: takeUnique(
      childContext.recentFeedbacks.map((item) => `${item.date} ${item.status}：${item.content}`),
      3
    ),
    classSignals: takeUnique(
      [
        `当前班级：${classContext.className}`,
        `今日晨检异常 ${classContext.todayAbnormalChildren.length} 人`,
        `待复查记录 ${classContext.pendingReviews.length} 条`,
        `今日未完成晨检 ${classContext.uncheckedMorningChecks.length} 人`,
      ],
      4
    ),
    focusReasons: childContext.focusReasons,
  };
}

export function buildHighRiskConsultationDraft(
  params: HighRiskConsultationDraftPayload
): MobileDraft {
  const summary = [
    params.teacherNote.trim() ? `教师补充：${params.teacherNote.trim()}` : "",
    params.imageInput?.content ? `图片占位：${params.imageInput.content}` : "",
    params.voiceInput?.content ? `语音速记：${params.voiceInput.content}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return createMobileDraft({
    draftId: `high-risk-consultation-${params.childId}`,
    childId: params.childId,
    draftType: "observation",
    targetRole: "teacher",
    content: summary || `${params.childName} 高风险会诊草稿`,
    attachmentName: params.imageInput?.attachmentName ?? params.voiceInput?.attachmentName,
    structuredPayload: {
      kind: "high-risk-consultation",
      childId: params.childId,
      childName: params.childName,
      className: params.className,
      teacherNote: params.teacherNote,
      imageInput: params.imageInput,
      voiceInput: params.voiceInput,
    },
  });
}

export function buildConsultationResultBadge(result: ConsultationResult) {
  if (result.riskLevel === "high") return "高风险会诊";
  if (result.riskLevel === "medium") return "重点跟进";
  return "持续观察";
}
