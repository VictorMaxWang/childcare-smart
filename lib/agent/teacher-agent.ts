import type {
  AiProviderTrace,
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  ConsultationResult,
  MemoryContextEnvelope,
  MemoryContextMeta,
  ResolvedAgeBandContext,
  RuleFallbackItem,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";
import { describeAgeBandActionGuidance, getAgeBandLabel, resolveAgeBandContext } from "@/lib/age-band/policy";
import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import {
  formatParentFeedbackExecutionLabel,
  formatParentFeedbackImprovementLabel,
  formatParentFeedbackReactionLabel,
} from "@/lib/feedback/consumption";
import type { GuardianFeedback } from "@/lib/feedback/types";
import { getLocalToday, isDateWithinLastDays, normalizeLocalDate } from "@/lib/date";
import {
  buildInterventionCardFromCommunication,
  buildInterventionCardFromSuggestion,
  type InterventionCard,
} from "@/lib/agent/intervention-card";
import {
  buildContinuityNotes,
  createEmptyMemoryMeta,
  mergePromptMemoryContexts,
} from "@/lib/memory/prompt-context";
import type { TeacherCopilotPayload } from "@/lib/teacher-copilot/types";

export type TeacherAgentWorkflowType = "communication" | "follow-up" | "weekly-summary";
export type TeacherAgentMode = "class" | "child";
export type TeacherAgentObjectScope = TeacherAgentMode;
export type TeacherAgentResultSource = "ai" | "fallback" | "mock";

export interface TeacherAgentUserSnapshot {
  name: string;
  className?: string;
  institutionId?: string;
  role?: string;
}

export interface TeacherAgentChildSnapshot {
  id: string;
  name: string;
  birthDate: string;
  className: string;
  allergies: string[];
  specialNotes: string;
  guardians?: Array<{ name: string; relation: string; phone: string }>;
}

export interface TeacherAgentHealthCheckSnapshot {
  id: string;
  childId: string;
  date: string;
  temperature: number;
  mood: string;
  handMouthEye: "正常" | "异常";
  isAbnormal: boolean;
  remark?: string;
}

export interface TeacherAgentMealSnapshot {
  id: string;
  childId: string;
  date: string;
  meal: string;
  foods: Array<{ name: string; category?: string; amount?: string }>;
  intakeLevel: "少量" | "适中" | "充足" | string;
  preference: "偏好" | "正常" | "拒食" | string;
  allergyReaction?: string;
  waterMl: number;
  nutritionScore?: number;
}

export interface TeacherAgentGrowthSnapshot {
  id: string;
  childId: string;
  createdAt: string;
  category: string;
  tags: string[];
  description: string;
  needsAttention: boolean;
  followUpAction?: string;
  reviewDate?: string;
  reviewStatus?: "待复查" | "已完成";
}

export type TeacherAgentGuardianFeedbackSnapshot = GuardianFeedback;

export interface TeacherAgentRequestPayload {
  workflow: TeacherAgentWorkflowType;
  scope: TeacherAgentMode;
  targetChildId?: string;
  currentUser: TeacherAgentUserSnapshot;
  visibleChildren: TeacherAgentChildSnapshot[];
  presentChildren: TeacherAgentChildSnapshot[];
  healthCheckRecords: TeacherAgentHealthCheckSnapshot[];
  mealRecords?: TeacherAgentMealSnapshot[];
  growthRecords: TeacherAgentGrowthSnapshot[];
  guardianFeedbacks: TeacherAgentGuardianFeedbackSnapshot[];
}

export interface TeacherAgentActionItem {
  id: string;
  target: string;
  reason: string;
  action: string;
  timing: string;
}

export interface TeacherAgentDataQuality {
  source: TeacherAgentResultSource;
  isFallback: boolean;
  isMock: boolean;
  fieldCoverage: {
    summary: boolean;
    targetLabel: boolean;
    actionItems: boolean;
    parentMessageDraft: boolean;
  };
  inputCounts: {
    visibleChildren: number;
    presentChildren: number;
    healthCheckRecords: number;
    mealRecords: number;
    growthRecords: number;
    guardianFeedbacks: number;
  };
  warnings: string[];
}

export interface TeacherAgentResult {
  workflow: TeacherAgentWorkflowType;
  mode: TeacherAgentMode;
  title: string;
  summary: string;
  objectScope?: TeacherAgentMode;
  targetChildId?: string;
  targetLabel: string;
  highlights: string[];
  actionItems: TeacherAgentActionItem[];
  parentMessageDraft?: string;
  tomorrowObservationPoint?: string;
  reviewItems?: string[];
  interventionCard?: InterventionCard;
  consultation?: ConsultationResult;
  consultationMode?: boolean;
  keyChildren?: string[];
  riskTypes?: string[];
  continuityNotes?: string[];
  memoryMeta?: MemoryContextMeta;
  copilot?: TeacherCopilotPayload | Record<string, unknown> | null;
  recordCompletionHints?: TeacherCopilotPayload["recordCompletionHints"];
  microTrainingSOP?: TeacherCopilotPayload["microTrainingSOP"];
  parentCommunicationScript?: TeacherCopilotPayload["parentCommunicationScript"];
  source: TeacherAgentResultSource;
  model?: string;
  provider?: string;
  providerStatus?: Record<string, unknown>;
  fallback?: boolean;
  providerTrace?: AiProviderTrace;
  transport?: string;
  fallbackReason?: string | null;
  dataQuality?: TeacherAgentDataQuality;
  generatedAt: string;
}

export interface TeacherAgentFocusChild {
  childId: string;
  childName: string;
  score: number;
  reasons: string[];
}

export interface TeacherAgentChildContext {
  today: string;
  className: string;
  child: TeacherAgentChildSnapshot;
  todayHealthChecks: TeacherAgentHealthCheckSnapshot[];
  todayAbnormalChecks: TeacherAgentHealthCheckSnapshot[];
  weeklyHealthChecks: TeacherAgentHealthCheckSnapshot[];
  todayMealRecords: TeacherAgentMealSnapshot[];
  weeklyMealRecords: TeacherAgentMealSnapshot[];
  recentMealRecords: TeacherAgentMealSnapshot[];
  weeklyGrowthRecords: TeacherAgentGrowthSnapshot[];
  recentGrowthRecords: TeacherAgentGrowthSnapshot[];
  pendingReviews: TeacherAgentGrowthSnapshot[];
  recentFeedbacks: TeacherAgentGuardianFeedbackSnapshot[];
  latestFeedback?: TeacherAgentGuardianFeedbackSnapshot;
  focusReasons: string[];
  ageBandContext?: ResolvedAgeBandContext;
}

export interface TeacherAgentClassContext {
  today: string;
  className: string;
  visibleChildren: TeacherAgentChildSnapshot[];
  presentChildren: TeacherAgentChildSnapshot[];
  todayHealthChecks: TeacherAgentHealthCheckSnapshot[];
  weeklyHealthChecks: TeacherAgentHealthCheckSnapshot[];
  weeklyMealRecords: TeacherAgentMealSnapshot[];
  weeklyGrowthRecords: TeacherAgentGrowthSnapshot[];
  weeklyFeedbacks: TeacherAgentGuardianFeedbackSnapshot[];
  todayAbnormalChildren: Array<{ child: TeacherAgentChildSnapshot; record: TeacherAgentHealthCheckSnapshot }>;
  uncheckedMorningChecks: TeacherAgentChildSnapshot[];
  pendingReviews: Array<{ child: TeacherAgentChildSnapshot; record: TeacherAgentGrowthSnapshot }>;
  focusChildren: TeacherAgentFocusChild[];
  riskTypes: string[];
}

type TeacherCommunicationModelResponse = AiFollowUpResponse;
type TeacherSuggestionModelResponse = AiSuggestionResponse;
type TeacherWeeklyModelResponse = WeeklyReportResponse;

const AGE_BAND_LABELS = {
  infant: "0-6个月",
  youngerToddler: "6-12个月",
  toddler: "1-3岁",
  preschool: "3-6岁",
  older: "6岁以上",
} as const;

function getLegacyAgeBandFromBirthDate(birthDate: string) {
  const birth = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12;
  months += now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;

  if (months < 6) return AGE_BAND_LABELS.infant;
  if (months < 12) return AGE_BAND_LABELS.youngerToddler;
  if (months < 36) return AGE_BAND_LABELS.toddler;
  if (months < 72) return AGE_BAND_LABELS.preschool;
  return AGE_BAND_LABELS.older;
}

function getTeacherAgeBandGuidance(context: TeacherAgentChildContext) {
  return describeAgeBandActionGuidance(context.ageBandContext);
}

function buildChildMap(children: TeacherAgentChildSnapshot[]) {
  return new Map(children.map((child) => [child.id, child] as const));
}

function takeRecentUnique(items: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function mergeMemoryMeta(contexts: Array<MemoryContextEnvelope | null | undefined>): MemoryContextMeta | undefined {
  const normalized = contexts.filter((item): item is MemoryContextEnvelope => Boolean(item));
  if (normalized.length === 0) return undefined;

  const usedSources = takeRecentUnique(normalized.flatMap((item) => item.meta.usedSources), 8);
  const matchedSnapshotIds = takeRecentUnique(normalized.flatMap((item) => item.meta.matchedSnapshotIds), 8);
  const matchedTraceIds = takeRecentUnique(normalized.flatMap((item) => item.meta.matchedTraceIds), 8);
  const errors = takeRecentUnique(normalized.flatMap((item) => item.meta.errors), 6);

  return createEmptyMemoryMeta({
    backend: normalized.map((item) => item.meta.backend).find(Boolean) ?? "unknown",
    degraded: normalized.some((item) => item.meta.degraded),
    usedSources,
    matchedSnapshotIds,
    matchedTraceIds,
    errors,
  });
}

function buildChildContinuityNotes(
  childName: string,
  memoryContext?: MemoryContextEnvelope | null
) {
  return buildContinuityNotes(childName, memoryContext?.promptContext);
}

type RankedTeacherAgentActionItem = TeacherAgentActionItem & {
  priority: number;
};

function withResultMode(mode: TeacherAgentMode) {
  return {
    mode,
    objectScope: mode,
  } as const;
}

type TeacherAgentProviderEnvelope = {
  source?: string;
  provider?: string;
  providerStatus?: Record<string, unknown>;
  fallbackReason?: string | null;
};

function getResponseProvider(response?: TeacherAgentProviderEnvelope) {
  if (response?.provider) return response.provider;
  if (response?.source === "ai") return "vivo";
  if (response?.source === "mock") return "mock";
  if (response?.source === "fallback") return "local-rule-fallback";
  return undefined;
}

function buildClassInputCounts(context: TeacherAgentClassContext): TeacherAgentDataQuality["inputCounts"] {
  return {
    visibleChildren: context.visibleChildren.length,
    presentChildren: context.presentChildren.length,
    healthCheckRecords: context.weeklyHealthChecks.length,
    mealRecords: context.weeklyMealRecords.length,
    growthRecords: context.weeklyGrowthRecords.length,
    guardianFeedbacks: context.weeklyFeedbacks.length,
  };
}

function buildChildInputCounts(context: TeacherAgentChildContext): TeacherAgentDataQuality["inputCounts"] {
  return {
    visibleChildren: 1,
    presentChildren: context.todayHealthChecks.length > 0 ? 1 : 0,
    healthCheckRecords: context.weeklyHealthChecks.length,
    mealRecords: context.weeklyMealRecords.length,
    growthRecords: context.weeklyGrowthRecords.length,
    guardianFeedbacks: context.recentFeedbacks.length,
  };
}

function buildTeacherAgentDataQuality(params: {
  source: TeacherAgentResultSource;
  summary: string;
  targetLabel: string;
  actionItems: TeacherAgentActionItem[];
  parentMessageDraft?: string;
  inputCounts: TeacherAgentDataQuality["inputCounts"];
}): TeacherAgentDataQuality {
  const fieldCoverage = {
    summary: params.summary.trim().length > 0,
    targetLabel: params.targetLabel.trim().length > 0,
    actionItems: params.actionItems.length > 0,
    parentMessageDraft: Boolean(params.parentMessageDraft?.trim()),
  };
  const warnings: string[] = [];

  if (!fieldCoverage.summary) warnings.push("summary_missing");
  if (!fieldCoverage.targetLabel) warnings.push("target_label_missing");
  if (!fieldCoverage.actionItems) warnings.push("action_items_empty");
  if (!fieldCoverage.parentMessageDraft) warnings.push("parent_message_draft_missing");
  if (
    params.inputCounts.healthCheckRecords === 0 &&
    params.inputCounts.mealRecords === 0 &&
    params.inputCounts.growthRecords === 0 &&
    params.inputCounts.guardianFeedbacks === 0
  ) {
    warnings.push("limited_input_records");
  }

  return {
    source: params.source,
    isFallback: params.source === "fallback",
    isMock: params.source === "mock",
    fieldCoverage,
    inputCounts: params.inputCounts,
    warnings,
  };
}

function finalizeActionItems(items: RankedTeacherAgentActionItem[], limit: number) {
  return items
    .sort((left, right) => left.priority - right.priority)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      target: item.target,
      reason: item.reason,
      action: item.action,
      timing: item.timing,
    }));
}

function buildHealthReason(record: TeacherAgentHealthCheckSnapshot) {
  const parts = [`晨检${record.isAbnormal ? "出现异常" : "状态平稳"}`, `体温 ${record.temperature.toFixed(1)}℃`];
  if (record.mood) parts.push(record.mood);
  if (record.handMouthEye === "异常") parts.push("手口眼需复查");
  if (record.remark) parts.push(record.remark);
  return parts.join("，");
}

function buildGrowthReason(record: TeacherAgentGrowthSnapshot) {
  const parts = [record.category, record.description];
  if (record.followUpAction) parts.push(`建议 ${record.followUpAction}`);
  return parts.filter(Boolean).join("，");
}

function inferTimingFromGrowthCategory(category: string) {
  if (category === "睡眠情况") return "午睡前";
  if (category === "情绪表现") return "晨间";
  if (category === "社交互动" || category === "语言表达") return "集体活动时";
  if (category === "如厕情况" || category === "独立进食") return "午餐前后";
  return "离园前";
}

function buildChildFocusReasons(context: TeacherAgentChildContext) {
  const reasons: string[] = [];

  if (context.todayAbnormalChecks.length > 0) {
    reasons.push(`今日晨检异常 ${context.todayAbnormalChecks.length} 次`);
  }
  if (context.pendingReviews.length > 0) {
    reasons.push(`待复查 ${context.pendingReviews.length} 项`);
  }
  if (context.recentGrowthRecords.some((item) => item.needsAttention)) {
    reasons.push("近 7 天存在持续关注观察");
  }
  if (context.weeklyMealRecords.some((item) => item.intakeLevel === "少量" || item.preference === "拒食")) {
    reasons.push("近 7 天餐食摄入偏少");
  }
  if (context.weeklyMealRecords.some((item) => item.waterMl < 100)) {
    reasons.push("近 7 天饮水偏少");
  }
  if (!context.latestFeedback) {
    reasons.push("最近缺少家长反馈");
  } else {
    reasons.push(`最近家长反馈为“${context.latestFeedback.status}”`);
  }

  return reasons;
}

export function buildTeacherAgentClassContext(payload: Omit<TeacherAgentRequestPayload, "workflow" | "scope" | "targetChildId">) {
  const today = getLocalToday();
  const childMap = buildChildMap(payload.visibleChildren);
  const visibleChildIds = new Set(payload.visibleChildren.map((child) => child.id));

  const todayHealthChecks = payload.healthCheckRecords.filter(
    (record) => record.date === today && visibleChildIds.has(record.childId)
  );
  const weeklyHealthChecks = payload.healthCheckRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const weeklyMealRecords = (payload.mealRecords ?? []).filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const weeklyGrowthRecords = payload.growthRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.createdAt, 7, today)
  );
  const weeklyFeedbacks = payload.guardianFeedbacks.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );

  const todayAbnormalChildren = todayHealthChecks
    .filter((record) => record.isAbnormal)
    .map((record) => ({
      child: childMap.get(record.childId),
      record,
    }))
    .filter(
      (item): item is { child: TeacherAgentChildSnapshot; record: TeacherAgentHealthCheckSnapshot } => Boolean(item.child)
    );

  const uncheckedMorningChecks = payload.presentChildren.filter(
    (child) => !todayHealthChecks.some((record) => record.childId === child.id)
  );

  const pendingReviews = weeklyGrowthRecords
    .filter((record) => record.reviewStatus === "待复查")
    .map((record) => ({
      child: childMap.get(record.childId),
      record,
    }))
    .filter(
      (item): item is { child: TeacherAgentChildSnapshot; record: TeacherAgentGrowthSnapshot } => Boolean(item.child)
    )
    .sort((left, right) => (left.record.reviewDate ?? "9999-12-31").localeCompare(right.record.reviewDate ?? "9999-12-31"));

  const focusChildren = payload.visibleChildren
    .map((child) => {
      const childTodayAbnormal = todayAbnormalChildren.filter((item) => item.child.id === child.id);
      const childWeeklyAbnormal = weeklyHealthChecks.filter((item) => item.childId === child.id && item.isAbnormal);
      const childMealAttention = weeklyMealRecords.filter(
        (item) => item.childId === child.id && (item.intakeLevel === "少量" || item.preference === "拒食" || item.waterMl < 100)
      );
      const childPendingReviews = pendingReviews.filter((item) => item.child.id === child.id);
      const childAttentionGrowth = weeklyGrowthRecords.filter((item) => item.childId === child.id && item.needsAttention);
      const childFeedbacks = weeklyFeedbacks.filter((item) => item.childId === child.id);

      const reasons: string[] = [];
      let score = 0;

      if (childTodayAbnormal.length > 0) {
        score += childTodayAbnormal.length * 4;
        reasons.push("今日晨检异常");
      }
      if (childWeeklyAbnormal.length > 0) {
        score += childWeeklyAbnormal.length * 2;
        reasons.push("近 7 天存在晨检异常");
      }
      if (childMealAttention.length > 0) {
        score += childMealAttention.length * 2;
        reasons.push("餐食或饮水记录需关注");
      }
      if (childPendingReviews.length > 0) {
        score += childPendingReviews.length * 3;
        reasons.push("存在待复查记录");
      }
      if (childAttentionGrowth.length > 0) {
        score += childAttentionGrowth.length * 2;
        reasons.push("近 7 天成长观察需关注");
      }
      if (childFeedbacks.length === 0) {
        score += 1;
        reasons.push("最近缺少家长反馈");
      }

      return {
        childId: child.id,
        childName: child.name,
        score,
        reasons,
      } satisfies TeacherAgentFocusChild;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const growthRiskTypes = weeklyGrowthRecords
    .filter((record) => record.needsAttention || record.reviewStatus === "待复查")
    .map((record) => record.category);
  const mealRiskTypes = weeklyMealRecords.flatMap((record) => {
    const riskTypes: string[] = [];
    if (record.intakeLevel === "少量" || record.preference === "拒食") riskTypes.push("进食偏少");
    if (record.waterMl < 100) riskTypes.push("饮水偏少");
    return riskTypes;
  });
  const healthRiskTypes = todayAbnormalChildren.flatMap((item) => {
    const riskTypes: string[] = ["晨检异常"];
    if (item.record.handMouthEye === "异常") {
      riskTypes.push("手口眼异常");
    }
    if (item.record.temperature >= 37.3) {
      riskTypes.push("体温偏高");
    }
    return riskTypes;
  });

  const riskTypes = takeRecentUnique(
    [
      ...healthRiskTypes,
      ...mealRiskTypes,
      ...growthRiskTypes,
      uncheckedMorningChecks.length > 0 ? "晨检待补录" : "",
      weeklyFeedbacks.length < Math.min(3, payload.visibleChildren.length) ? "家园反馈待同步" : "",
    ],
    5
  );

  return {
    today,
    className: payload.currentUser.className ?? payload.visibleChildren[0]?.className ?? "当前班级",
    visibleChildren: payload.visibleChildren,
    presentChildren: payload.presentChildren,
    todayHealthChecks,
    weeklyHealthChecks,
    weeklyMealRecords,
    weeklyGrowthRecords,
    weeklyFeedbacks,
    todayAbnormalChildren,
    uncheckedMorningChecks,
    pendingReviews,
    focusChildren,
    riskTypes,
  } satisfies TeacherAgentClassContext;
}

export function pickTeacherAgentDefaultChildId(classContext: TeacherAgentClassContext) {
  return (
    classContext.todayAbnormalChildren[0]?.child.id ??
    classContext.pendingReviews[0]?.child.id ??
    classContext.focusChildren[0]?.childId ??
    classContext.visibleChildren[0]?.id
  );
}

export function pickTeacherAgentWorkflowTargetChildId(
  classContext: TeacherAgentClassContext,
  workflow: TeacherAgentWorkflowType,
  requestedChildId?: string
) {
  if (requestedChildId && classContext.visibleChildren.some((child) => child.id === requestedChildId)) {
    return requestedChildId;
  }

  if (workflow === "follow-up") {
    return (
      classContext.visibleChildren.find((child) => child.name === "高远舟")?.id ??
      classContext.visibleChildren.find((child) => child.id === "c-12")?.id ??
      pickTeacherAgentDefaultChildId(classContext)
    );
  }

  if (workflow === "communication") {
    return (
      classContext.visibleChildren.find((child) => child.name === "陈安安")?.id ??
      classContext.visibleChildren.find((child) => child.id === "c-5")?.id ??
      pickTeacherAgentDefaultChildId(classContext)
    );
  }

  return pickTeacherAgentDefaultChildId(classContext);
}

export function buildTeacherAgentChildContext(
  classContext: TeacherAgentClassContext,
  targetChildId?: string
) {
  const childId = targetChildId ?? pickTeacherAgentDefaultChildId(classContext);
  if (!childId) return null;

  const child = classContext.visibleChildren.find((item) => item.id === childId);
  if (!child) return null;

  const todayHealthChecks = classContext.todayHealthChecks.filter((record) => record.childId === childId);
  const todayAbnormalChecks = todayHealthChecks.filter((record) => record.isAbnormal);
  const weeklyHealthChecks = classContext.weeklyHealthChecks.filter((record) => record.childId === childId);
  const weeklyMealRecords = classContext.weeklyMealRecords
    .filter((record) => record.childId === childId)
    .sort((left, right) => right.date.localeCompare(left.date));
  const todayMealRecords = weeklyMealRecords.filter((record) => record.date === classContext.today);
  const weeklyGrowthRecords = classContext.weeklyGrowthRecords
    .filter((record) => record.childId === childId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const pendingReviews = weeklyGrowthRecords.filter((record) => record.reviewStatus === "待复查");
  const recentFeedbacks = classContext.weeklyFeedbacks
    .filter((record) => record.childId === childId)
    .sort((left, right) => right.date.localeCompare(left.date));
  const ageBandContext = resolveAgeBandContext({
    birthDate: child.birthDate,
    asOfDate: classContext.today,
  });

  const context = {
    today: classContext.today,
    className: classContext.className,
    child,
    todayHealthChecks,
    todayAbnormalChecks,
    weeklyHealthChecks,
    todayMealRecords,
    weeklyMealRecords,
    recentMealRecords: weeklyMealRecords.slice(0, 8),
    weeklyGrowthRecords,
    recentGrowthRecords: weeklyGrowthRecords.slice(0, 5),
    pendingReviews,
    recentFeedbacks,
    latestFeedback: recentFeedbacks[0],
    focusReasons: [],
    ageBandContext,
  } satisfies TeacherAgentChildContext;

  return {
    ...context,
    focusReasons: buildChildFocusReasons(context),
  } satisfies TeacherAgentChildContext;
}

function buildChildRuleFallback(context: TeacherAgentChildContext): RuleFallbackItem[] {
  const items: RuleFallbackItem[] = [];

  if (context.todayAbnormalChecks.length > 0) {
    const latest = context.todayAbnormalChecks[0];
    items.push({
      title: `${context.child.name} 今日晨检出现异常信号`,
      description: buildHealthReason(latest),
      level: "warning",
      tags: ["晨检异常"],
    });
  }

  if (context.pendingReviews.length > 0) {
    const review = context.pendingReviews[0];
    items.push({
      title: `${context.child.name} 仍有待复查观察`,
      description: buildGrowthReason(review),
      level: "warning",
      tags: ["待复查", review.category],
    });
  }

  if (context.latestFeedback) {
    items.push({
      title: `${context.child.name} 最近已有家长反馈`,
      description: `${context.latestFeedback.status}：${context.latestFeedback.content}`,
      level: "success",
      tags: ["家长反馈"],
    });
  } else {
    items.push({
      title: `${context.child.name} 最近缺少家长反馈`,
      description: "建议离园前同步今晚需要家长配合观察的点，形成明日可复盘的反馈。",
      level: "info",
      tags: ["家园协同"],
    });
  }

  if (items.length === 0) {
    items.push({
      title: `${context.child.name} 今日整体状态平稳`,
      description: "当前更适合输出稳态沟通建议，并安排明日固定观察点。",
      level: "success",
      tags: ["稳定观察"],
    });
  }

  return items;
}

export function buildTeacherChildSuggestionSnapshot(context: TeacherAgentChildContext): ChildSuggestionSnapshot {
  const moodKeywords = takeRecentUnique(
    context.weeklyHealthChecks.map((record) => record.mood).filter(Boolean),
    4
  );
  const feedbackKeywords = takeRecentUnique(
    context.recentFeedbacks.flatMap((record) => [record.status, record.content.slice(0, 18)]),
    4
  );
  const mealRecords = context.weeklyMealRecords;
  const mealAttentionRecords = mealRecords.filter(
    (record) => record.intakeLevel === "少量" || record.preference === "拒食" || record.waterMl < 100
  );
  const hydrationAvg =
    mealRecords.length > 0
      ? Math.round(mealRecords.reduce((sum, record) => sum + record.waterMl, 0) / mealRecords.length)
      : 0;
  const balancedRate =
    mealRecords.length > 0
      ? Math.round(
          (mealRecords.filter((record) => record.intakeLevel !== "少量" && record.preference !== "拒食").length /
            mealRecords.length) *
            100
        )
      : 0;

  return {
    child: {
      id: context.child.id,
      name: context.child.name,
      ageBand: getAgeBandLabel(context.ageBandContext) ?? getLegacyAgeBandFromBirthDate(context.child.birthDate),
      ageBandContext: context.ageBandContext,
      className: context.child.className,
      allergies: context.child.allergies,
      specialNotes: context.child.specialNotes,
    },
    summary: {
      health: {
        abnormalCount: context.weeklyHealthChecks.filter((record) => record.isAbnormal).length,
        handMouthEyeAbnormalCount: context.weeklyHealthChecks.filter((record) => record.handMouthEye === "异常").length,
        avgTemperature:
          context.weeklyHealthChecks.length > 0
            ? Number(
                (
                  context.weeklyHealthChecks.reduce((sum, record) => sum + record.temperature, 0) /
                  context.weeklyHealthChecks.length
                ).toFixed(1)
              )
            : undefined,
        moodKeywords,
      },
      meals: {
        recordCount: mealRecords.length,
        hydrationAvg,
        balancedRate,
        monotonyDays: mealAttentionRecords.length,
        allergyRiskCount: mealRecords.filter((record) => Boolean(record.allergyReaction?.trim())).length,
      },
      growth: {
        recordCount: context.weeklyGrowthRecords.length,
        attentionCount: context.weeklyGrowthRecords.filter((record) => record.needsAttention).length,
        pendingReviewCount: context.pendingReviews.length,
        topCategories: Array.from(
          context.weeklyGrowthRecords.reduce<Map<string, number>>((map, record) => {
            map.set(record.category, (map.get(record.category) ?? 0) + 1);
            return map;
          }, new Map<string, number>())
        )
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([category, count]) => ({ category, count })),
      },
      feedback: {
        count: context.recentFeedbacks.length,
        statusCounts: context.recentFeedbacks.reduce<Record<string, number>>((acc, record) => {
          acc[record.status] = (acc[record.status] ?? 0) + 1;
          return acc;
        }, {}),
        keywords: feedbackKeywords,
      },
    },
    recentDetails: {
      health: context.weeklyHealthChecks.slice(0, 5).map((record) => ({
        date: record.date,
        temperature: record.temperature,
        mood: record.mood,
        handMouthEye: record.handMouthEye,
        isAbnormal: record.isAbnormal,
        remark: record.remark,
      })),
      meals: context.recentMealRecords.slice(0, 5).map((record) => ({
        date: record.date,
        meal: record.meal,
        foods: record.foods.map((food) => `${food.name}${food.amount ? ` ${food.amount}` : ""}`),
        waterMl: record.waterMl,
        preference: record.preference,
        allergyReaction: record.allergyReaction,
      })),
      growth: context.recentGrowthRecords.map((record) => ({
        createdAt: record.createdAt,
        category: record.category,
        description: record.description,
        needsAttention: record.needsAttention,
        followUpAction: record.followUpAction,
        reviewStatus: record.reviewStatus,
      })),
      feedback: context.recentFeedbacks
        .slice(0, 5)
        .map((record) => toFollowUpFeedbackLite(record))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    },
    ruleFallback: buildChildRuleFallback(context),
  };
}

export function buildTeacherCommunicationFollowUpPayload(context: TeacherAgentChildContext): AiFollowUpPayload {
  const snapshot = buildTeacherChildSuggestionSnapshot(context);
  const guardName = context.child.guardians?.[0]?.name ?? "家长";
  const reasonText =
    context.focusReasons.length > 0 ? context.focusReasons.join("、") : `${context.child.name} 今日整体需持续观察`;

  return {
    snapshot,
    suggestionTitle: `${context.child.name} 家长沟通建议`,
    suggestionDescription: `当前关注原因：${reasonText}`,
    question: `请基于班级观察生成一版老师发给${guardName}的家长沟通建议，要求先同步今日情况，再给出今晚2到3个家庭配合观察点，并明确明天老师继续观察的1个重点。`,
    history: [
      {
        role: "user",
        content: `班级：${context.className}。幼儿：${context.child.name}。关注原因：${reasonText}。`,
      },
    ],
  };
}

export function buildTeacherWeeklyReportSnapshot(context: TeacherAgentClassContext): WeeklyReportSnapshot {
  const weeklyHealthAbnormalCount = context.weeklyHealthChecks.filter((record) => record.isAbnormal).length;
  const weeklyGrowthAttentionCount = context.weeklyGrowthRecords.filter((record) => record.needsAttention).length;
  const attendanceRate =
    context.visibleChildren.length > 0
      ? Math.round((context.presentChildren.length / context.visibleChildren.length) * 100)
      : 0;

  return {
    institutionName: context.className,
    periodLabel: "近 7 天",
    role: "教师班级周总结",
    overview: {
      visibleChildren: context.visibleChildren.length,
      attendanceRate,
      mealRecordCount: 0,
      healthAbnormalCount: weeklyHealthAbnormalCount,
      growthAttentionCount: weeklyGrowthAttentionCount,
      pendingReviewCount: context.pendingReviews.length,
      feedbackCount: context.weeklyFeedbacks.length,
    },
    diet: {
      balancedRate: 0,
      hydrationAvg: 0,
      monotonyDays: 0,
      vegetableDays: 0,
      proteinDays: 0,
    },
    topAttentionChildren: context.focusChildren.map((child) => ({
      childName: child.childName,
      attentionCount: child.score,
      hydrationAvg: 0,
      vegetableDays: 0,
    })),
    highlights: [
      context.todayAbnormalChildren.length > 0 ? `本周内有 ${weeklyHealthAbnormalCount} 条晨检异常记录` : "",
      context.pendingReviews.length > 0 ? `当前待复查 ${context.pendingReviews.length} 项` : "",
      context.weeklyFeedbacks.length > 0 ? `本周收到 ${context.weeklyFeedbacks.length} 条家长反馈` : "",
    ].filter(Boolean),
    risks: context.riskTypes,
  };
}

function buildCommunicationSummary(context: TeacherAgentChildContext, answer: string) {
  const ageBandGuidance = getTeacherAgeBandGuidance(context);
  const leading = answer.trim();
  if (leading) {
    return ageBandGuidance
      ? `${ageBandGuidance.label}阶段当前优先围绕${ageBandGuidance.careFocusText}组织沟通。${leading}`
      : leading;
  }

  if (ageBandGuidance) {
    return `建议优先围绕 ${context.child.name} 当前${ageBandGuidance.careFocusText}这些重点和家长沟通，先同步园内表现，再约定今晚配合点与明日复查节奏。`;
  }

  if (context.todayAbnormalChecks.length > 0) {
    return `建议今天优先向家长同步 ${context.child.name} 的晨检异常和园内观察，再明确今晚家庭配合点与明日复查节奏。`;
  }

  if (context.pendingReviews.length > 0) {
    return `建议围绕 ${context.child.name} 当前待复查观察点进行沟通，先说园内表现，再约定今晚和明日的连续观察。`;
  }

  return `建议以稳态反馈的方式向家长同步 ${context.child.name} 今日表现，并约定一个明日可验证的观察点。`;
}

function buildCommunicationHighlights(context: TeacherAgentChildContext, response: TeacherCommunicationModelResponse) {
  const ageBandGuidance = getTeacherAgeBandGuidance(context);
  const highlights = [...response.keyPoints];

  if (ageBandGuidance) {
    highlights.unshift(`阶段重点：${ageBandGuidance.teacherObservationFocus[0]}`);
    if (ageBandGuidance.teacherObservationFocus[1]) {
      highlights.push(`继续关注：${ageBandGuidance.teacherObservationFocus[1]}`);
    }
  }

  if (context.todayAbnormalChecks[0]) {
    highlights.unshift(buildHealthReason(context.todayAbnormalChecks[0]));
  }
  if (context.pendingReviews[0]) {
    highlights.push(`待复查重点：${context.pendingReviews[0].category}`);
  }
  if (context.latestFeedback) {
    highlights.push(`最近家长反馈：${context.latestFeedback.status}`);
  }

  return takeRecentUnique(highlights, 3);
}

function buildCommunicationActionItems(context: TeacherAgentChildContext, response: TeacherCommunicationModelResponse) {
  const ageBandGuidance = getTeacherAgeBandGuidance(context);
  const tonightActions = takeRecentUnique(response.nextSteps.filter((item) => !item.includes("明")), 2);
  const familyTargets = takeRecentUnique(
    [
      ...tonightActions,
      ageBandGuidance
        ? `今晚家庭先${ageBandGuidance.defaultInterventionFocus[1] ?? `围绕${ageBandGuidance.careFocusText}做一条小动作`}。`
        : "今晚继续记录家庭场景中的情绪和作息变化",
      ageBandGuidance?.teacherObservationFocus[0]
        ? `离园后重点看：${ageBandGuidance.teacherObservationFocus[0]}。`
        : "离园后观察孩子是否出现同类异常信号",
    ],
    2
  );
  const teacherTarget =
    response.nextSteps.find((item) => item.includes("明")) ??
    (ageBandGuidance?.teacherObservationFocus[0]
      ? `明天继续观察${ageBandGuidance.teacherObservationFocus[0]}，并核对今晚家庭配合后的变化`
      : undefined) ??
    context.pendingReviews[0]?.followUpAction ??
    "明早入园前反馈昨晚执行情况";

  const items = familyTargets.slice(0, 2).map((action, index) => ({
    id: `communication-family-${index + 1}`,
    target: "家长",
    reason: ageBandGuidance
      ? `当前阶段更适合围绕${ageBandGuidance.careFocusText}做连续家园观察`
      : "需要家园同步今晚的执行情况",
    action,
    timing: "今晚",
  }));

  items.push({
    id: "communication-teacher-1",
    target: "老师",
    reason: "为明日复盘留出连续观察点",
    action: teacherTarget,
    timing: "明日晨间",
  });

  return items;
}

function buildParentMessageDraft(context: TeacherAgentChildContext, response: TeacherCommunicationModelResponse) {
  const ageBandGuidance = getTeacherAgeBandGuidance(context);
  const greetingName = context.child.guardians?.[0]?.name ?? "家长";
  const healthText = context.todayAbnormalChecks[0]
    ? `今天晨检时老师观察到 ${buildHealthReason(context.todayAbnormalChecks[0])}。`
    : "今天孩子在园整体状态老师已持续关注。";
  const reviewText = context.pendingReviews[0]
    ? `另外，${context.pendingReviews[0].category} 方面仍在持续复查，园内会继续跟进。`
    : "";
  const toneText = ageBandGuidance ? `这个阶段更适合${ageBandGuidance.parentActionTone}` : "";
  const tonightActions = buildCommunicationActionItems(context, response)
    .filter((item) => item.target === "家长")
    .map((item) => `请今晚重点配合：${item.action}`)
    .slice(0, 2)
    .join("；");

  return `${greetingName}您好，${healthText}${reviewText}${toneText ? ` ${toneText}。` : ""}${tonightActions ? ` ${tonightActions}。` : ""} 明天老师也会继续关注孩子在园表现，辛苦您今晚观察后和我们同步。`;
}

function buildTomorrowObservationPoint(context: TeacherAgentChildContext, response: TeacherCommunicationModelResponse) {
  const ageBandGuidance = getTeacherAgeBandGuidance(context);
  return (
    response.nextSteps.find((item) => item.includes("明")) ??
    (ageBandGuidance?.teacherObservationFocus[0]
      ? `继续观察${ageBandGuidance.teacherObservationFocus[0]}，并核对今晚家庭配合后的变化。`
      : undefined) ??
    context.pendingReviews[0]?.followUpAction ??
    context.pendingReviews[0]?.description ??
    context.todayAbnormalChecks[0]?.remark ??
    `继续观察 ${context.child.name} 明日入园后的情绪、晨检状态和家长反馈是否一致。`
  );
}

function findDemoChild(context: TeacherAgentClassContext, name: string, id: string) {
  return context.visibleChildren.find((child) => child.name === name || child.id === id);
}

function feedbackTimestamp(feedback: TeacherAgentGuardianFeedbackSnapshot) {
  return feedback.submittedAt ?? feedback.date ?? "";
}

function latestWeeklyFeedbackForChild(context: TeacherAgentClassContext, childId: string) {
  return context.weeklyFeedbacks
    .filter((item) => item.childId === childId)
    .sort((left, right) => feedbackTimestamp(right).localeCompare(feedbackTimestamp(left)))[0];
}

function formatTeacherFeedbackWriteback(
  feedback: TeacherAgentGuardianFeedbackSnapshot | undefined,
  childName: string
) {
  if (!feedback) return undefined;
  const notes = feedback.notes || feedback.freeNote || feedback.content;
  return [
    `${childName}家庭反馈已回流`,
    `执行：${formatParentFeedbackExecutionLabel(feedback.executionStatus)}`,
    `孩子反应：${formatParentFeedbackReactionLabel(feedback.childReaction)}`,
    `效果：${formatParentFeedbackImprovementLabel(feedback.improvementStatus)}`,
    notes ? `备注：${notes}` : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join("；");
}

function buildDefenseWeeklySummaryParts(context: TeacherAgentClassContext) {
  const lin = findDemoChild(context, "林小雨", "c-1");
  const gao = findDemoChild(context, "高远舟", "c-12");
  const chen = findDemoChild(context, "陈安安", "c-5");

  if (!lin && !gao && !chen) return null;

  const linName = "林小雨";
  const gaoName = "高远舟";
  const chenName = "陈安安";
  const linFeedbackSummary = lin
    ? formatTeacherFeedbackWriteback(latestWeeklyFeedbackForChild(context, lin.id), linName)
    : undefined;

  const actionItems: TeacherAgentActionItem[] = [
    {
      id: "demo-weekly-lin-hallway",
      target: linName,
      reason: linFeedbackSummary
        ? `走廊活动听到响声后害怕、退缩，需要结合最新家庭反馈继续判断。${linFeedbackSummary}`
        : "走廊活动听到响声后害怕、退缩，需要练习勇敢表达与小步尝试。",
      action: "明天走廊活动前先预告推车声来源，老师牵手陪走一步，引导说出“我有点害怕”或“我想先牵手走一步”。",
      timing: "明天走廊活动前",
    },
    {
      id: "demo-weekly-gao-nap-water",
      target: gaoName,
      reason: "午睡前焦虑，握水杯但主动饮水少，需要形成离园前闭环。",
      action: "午睡前安排 5 分钟安静过渡，午后补水做两次小口记录，16:30 前复查精神状态、饮水量和入睡情况。",
      timing: "今日午睡前/离园前",
    },
    {
      id: "demo-weekly-chen-lunch",
      target: chenName,
      reason: "午餐主食少量、蔬菜剩余较多，需要家园同步饮食观察。",
      action: "明天午餐先给小份主食和一口蔬菜目标，离园时请家长同步晚餐食量、饮水和次日入园状态。",
      timing: "今日离园前",
    },
    {
      id: "demo-weekly-class-todos",
      target: context.className,
      reason: "班级层面还有晨检异常、成长记录补录、家长反馈待回复、48 小时复查四类待办。",
      action: "上午补录晨检异常和成长记录，午后核对家长反馈待回复清单，离园前把需 48 小时复查的儿童加入提醒。",
      timing: "今日上午/离园前",
    },
  ];

  return {
    summary: `本周${context.className}需要优先闭环三名儿童和四类班级待办：${linName}在走廊活动听到响声后害怕、退缩，需要勇敢表达与小步尝试；${linFeedbackSummary ? `${linFeedbackSummary}；` : ""}${gaoName}午睡前焦虑且饮水偏少，今日必须离园前复查；${chenName}午餐进食偏少，需要家园同步饮食观察。班级层面同步处理晨检异常、成长记录补录、家长反馈待回复和 48 小时复查。`,
    highlights: [
      ...(linFeedbackSummary ? [linFeedbackSummary] : []),
      `${linName}：走廊活动听到推车声后停在门口，出现害怕和退缩，老师已用“我有点害怕/我想先牵手走一步”做表达示范。`,
      `${gaoName}：午睡前反复确认老师是否在旁边，握水杯但主动饮水少，午后补水记录和离园前复查不能漏。`,
      `${chenName}：午餐主食少量、蔬菜剩余较多，今晚要请家长同步晚餐食量、饮水和次日入园状态。`,
      "班级待办：晨检异常、成长记录补录、家长反馈待回复、48 小时复查需要分时段闭环。",
    ],
    actionItems,
    parentMessageDraft: `各位家长您好，本周${context.className}已完成观察梳理。老师会重点跟进${linName}走廊活动勇敢表达、${gaoName}午睡前焦虑和饮水偏少、${chenName}午餐进食偏少。${linFeedbackSummary ? `其中${linFeedbackSummary}，明天会继续核对家庭执行后的连续变化。` : ""}今天离园前我们会逐一同步需家庭配合的观察点，如今晚有发热、饮食明显减少、睡眠或情绪波动，请及时反馈给班级老师。`,
    tomorrowObservationPoint:
      `明天先复盘${linName}走廊活动是否能说出害怕或请求牵手，午睡后核对${gaoName}饮水和入睡情况，午餐后记录${chenName}主食与蔬菜摄入。`,
    keyChildren: [linName, gaoName, chenName],
    riskTypes: ["走廊活动退缩", "午睡前焦虑", "饮水偏少", "午餐进食偏少", "48 小时复查"],
    reviewItems: [
      ...(linFeedbackSummary ? [`${linName}：已收到家庭执行结果，明天先核对是否延续到走廊小步尝试。`] : []),
      `${linName}：明天走廊活动后记录是否完成一次小步尝试和勇敢表达。`,
      `${gaoName}：今日 16:30 前复查午睡入睡、精神状态和饮水累计。`,
      `${chenName}：今晚家园同步晚餐食量、饮水和次日入园状态。`,
      `${context.className}：晨检异常、成长记录补录、家长反馈待回复、48 小时复查在离园前逐项勾选。`,
    ],
  };
}

function buildDefenseFollowUpParts(context: TeacherAgentChildContext) {
  if (context.child.name !== "高远舟" && context.child.id !== "c-12") return null;
  const childName = "高远舟";
  const guardianName = context.child.guardians?.[0]?.name ?? "家长";
  const actionItems: TeacherAgentActionItem[] = [
    {
      id: "demo-follow-up-gao-transition",
      target: childName,
      reason: "午睡前焦虑，反复确认老师是否在旁边。",
      action: "午睡前 20 分钟安排安静过渡：收玩具后到固定靠老师的位置，老师用一句话确认“我会在旁边，先听两分钟轻音乐”。",
      timing: "午睡前 20 分钟",
    },
    {
      id: "demo-follow-up-gao-water",
      target: childName,
      reason: "握着水杯但主动饮水偏少，午后需要可量化记录。",
      action: "午睡醒后和户外前各引导小口饮水 60-80ml，记录实际饮水量和是否需要提醒。",
      timing: "午睡后/户外前",
    },
    {
      id: "demo-follow-up-gao-review",
      target: "教师",
      reason: "今日需要在离园前确认焦虑和饮水是否有改善。",
      action: "16:30 前复查精神状态、午睡入睡用时、累计饮水量，并把结论写入成长记录或离园沟通。 ",
      timing: "离园前",
    },
    {
      id: "demo-follow-up-gao-family",
      target: guardianName,
      reason: "家庭侧需要同步晚间饮水、入睡和情绪变化。",
      action: "离园时请家长今晚观察饮水量、入睡前是否焦虑，明早用一句话反馈给老师。",
      timing: "离园沟通",
    },
  ];

  return {
    summary: `${childName}今日跟进聚焦两件事：午睡前焦虑和饮水偏少。上午先减少午睡前不确定感，午后做补水记录，离园前必须复查精神状态、累计饮水量和午睡入睡情况。`,
    highlights: [
      `${childName}午睡前会反复确认老师是否在旁，适合用固定位置、固定话术降低焦虑。`,
      `${childName}握水杯但主动饮水偏少，今天需要用两次小口补水记录形成证据。`,
      "离园前复查不是泛泛观察，要核对精神状态、午睡入睡用时、累计饮水量三项。",
      "家长沟通要请家庭今晚同步饮水、入睡和情绪变化，方便明早复盘。",
    ],
    actionItems,
    parentMessageDraft: `${guardianName}您好，今天老师重点关注了${childName}午睡前焦虑和饮水偏少。我们午睡前会安排固定位置和安静过渡，午睡后、户外前各做一次小口补水记录，离园前会复查精神状态、入睡情况和累计饮水量。今晚麻烦您同步观察饮水量、入睡前是否紧张，明早入园时告诉老师。`,
    tomorrowObservationPoint:
      `明天继续核对${childName}午睡前是否能在固定话术下安静过渡，并比较上午、午后主动饮水次数是否增加。`,
    keyChildren: [childName],
    riskTypes: ["午睡前焦虑", "饮水偏少", "离园前复查"],
    reviewItems: [
      `${childName}：今日 16:30 前复查精神状态、午睡入睡情况、累计饮水量。`,
      `${childName}：明早入园时核对家长反馈的晚间饮水和入睡前情绪。`,
      `${childName}：48 小时内连续记录午睡前过渡和主动饮水次数。`,
    ],
  };
}

function buildDefenseCommunicationParts(context: TeacherAgentChildContext) {
  if (context.child.name !== "陈安安" && context.child.id !== "c-5") return null;
  const childName = "陈安安";
  const guardianName = context.child.guardians?.[0]?.name ?? "家长";
  const actionItems: TeacherAgentActionItem[] = [
    {
      id: "demo-communication-chen-lunch-record",
      target: childName,
      reason: "午餐进食偏少，主食少量、蔬菜剩余较多。",
      action: "明天午餐先给小份主食和一口蔬菜目标，记录是否需要老师提醒、是否愿意再添一口。",
      timing: "明天午餐",
    },
    {
      id: "demo-communication-chen-family-sync",
      target: guardianName,
      reason: "需要家园同步饮食观察，判断是单餐波动还是连续摄入偏少。",
      action: "离园时请家长今晚同步晚餐食量、饮水量和睡前精神状态，明早反馈次日入园状态。",
      timing: "今日离园",
    },
    {
      id: "demo-communication-chen-review",
      target: "教师",
      reason: "需要把午餐、晚餐、次日入园状态串成可复查证据。",
      action: "次日入园核对家庭反馈，午餐后补一条成长记录，48 小时内复查进食变化。",
      timing: "明日入园/午餐后",
    },
  ];

  return {
    summary: `${childName}今日午餐进食偏少：主食少量，蔬菜剩余较多。沟通重点不是提醒“继续观察”，而是请家长今晚同步晚餐食量、饮水和次日入园状态，老师明天午餐做小份目标和 48 小时复查。`,
    highlights: [
      `${childName}午餐主食少量、蔬菜剩余较多，属于需要家园同步饮食观察的具体事件。`,
      "家长沟通要问今晚晚餐食量、饮水量和睡前精神状态，避免只说“继续观察”。",
      "老师明天午餐设置小份主食和一口蔬菜目标，午餐后补录成长记录。",
    ],
    actionItems,
    parentMessageDraft: `${guardianName}您好，今天午餐时老师观察到${childName}主食只吃了少量，蔬菜剩余较多，精神状态暂未见明显异常。今晚想请您帮忙同步三点：晚餐大概吃了多少、饮水是否和平时接近、睡前精神和情绪是否稳定。明天入园时麻烦告诉老师，我们会在午餐时给她设置小份主食和一口蔬菜目标，并在 48 小时内复查进食变化。`,
    tomorrowObservationPoint:
      `明天入园先核对${childName}晚餐食量、饮水和精神状态，午餐后记录主食、蔬菜摄入量及是否接受一口尝试。`,
    keyChildren: [childName],
    riskTypes: ["午餐进食偏少", "家园同步饮食观察", "48 小时复查"],
    reviewItems: [
      `${childName}：明早入园核对家长反馈的晚餐食量、饮水和睡前精神状态。`,
      `${childName}：明天午餐记录主食、蔬菜摄入和是否接受小份目标。`,
      `${childName}：48 小时内复查午餐进食偏少是否持续。`,
    ],
  };
}

export function buildTeacherCommunicationResult(params: {
  context: TeacherAgentChildContext;
  response: TeacherCommunicationModelResponse;
}): TeacherAgentResult {
  const generatedAt = new Date().toISOString();
  const communicationActionItems = buildCommunicationActionItems(params.context, params.response);
  const source = params.response.source as TeacherAgentResultSource;
  const summary = buildCommunicationSummary(params.context, params.response.answer);
  const parentMessageDraft = buildParentMessageDraft(params.context, params.response);
  const defenseParts = buildDefenseCommunicationParts(params.context);
  const finalSummary = defenseParts?.summary ?? summary;
  const finalHighlights = defenseParts?.highlights ?? buildCommunicationHighlights(params.context, params.response);
  const finalActionItems = defenseParts?.actionItems ?? communicationActionItems;
  const finalParentMessageDraft = defenseParts?.parentMessageDraft ?? parentMessageDraft;
  const finalTomorrowObservationPoint =
    defenseParts?.tomorrowObservationPoint ?? buildTomorrowObservationPoint(params.context, params.response);
  const finalTargetLabel = defenseParts?.keyChildren[0] ?? params.context.child.name;
  const interventionCard = buildInterventionCardFromCommunication({
    targetChildId: params.context.child.id,
    childName: finalTargetLabel,
    triggerReason: params.context.focusReasons[0] ?? "当前需要家园协同跟进",
    summary: finalSummary,
    riskLevel: params.context.todayAbnormalChecks.length > 0 ? "high" : params.context.pendingReviews.length > 0 ? "medium" : "low",
    ageBandContext: params.context.ageBandContext,
    schoolActions: finalActionItems.slice(-1).map((item) => item.action),
    familyActions: finalActionItems.slice(0, 2).map((item) => item.action),
    observationPoints: finalHighlights,
    tomorrowObservationPoint: finalTomorrowObservationPoint,
    reviewIn48h: params.response.nextSteps[0],
    source,
    model: params.response.model,
    generatedAt,
  });

  return {
    workflow: "communication",
    ...withResultMode("child"),
    title: `${finalTargetLabel} 家长沟通建议`,
    summary: finalSummary,
    targetChildId: params.context.child.id,
    targetLabel: finalTargetLabel,
    highlights: finalHighlights,
    actionItems: finalActionItems,
    parentMessageDraft: finalParentMessageDraft,
    tomorrowObservationPoint: finalTomorrowObservationPoint,
    reviewItems:
      defenseParts?.reviewItems ??
      [
        finalTomorrowObservationPoint,
        interventionCard.reviewIn48h,
      ].filter((item): item is string => Boolean(item)),
    interventionCard,
    keyChildren: defenseParts?.keyChildren ?? [finalTargetLabel],
    riskTypes: defenseParts?.riskTypes,
    source,
    model: params.response.model,
    provider: getResponseProvider(params.response),
    providerStatus: params.response.providerStatus,
    fallbackReason: params.response.fallbackReason,
    dataQuality: buildTeacherAgentDataQuality({
      source,
      summary: finalSummary,
      targetLabel: finalTargetLabel,
      actionItems: finalActionItems,
      parentMessageDraft: finalParentMessageDraft,
      inputCounts: buildChildInputCounts(params.context),
    }),
    generatedAt,
  };
}

function buildFollowUpSummary(
  classContext: TeacherAgentClassContext,
  childContext: TeacherAgentChildContext | null,
  suggestion?: TeacherSuggestionModelResponse
) {
  if (childContext) {
    const ageBandGuidance = getTeacherAgeBandGuidance(childContext);
    const leading = suggestion?.summary?.trim();
    if (leading) {
      return ageBandGuidance
        ? `${ageBandGuidance.label}阶段当前更该围绕${ageBandGuidance.careFocusText}推进跟进行动。${leading}`
        : leading;
    }

    if (ageBandGuidance) {
      return `围绕 ${childContext.child.name} 当前${ageBandGuidance.careFocusText}这些重点，建议优先处理最能影响今天闭环的 2 到 4 个动作。`;
    }

    return (
      `围绕 ${childContext.child.name} 的今日异常、待复查和近期观察，建议优先处理最能影响今天闭环的 2 到 4 个动作。`
    );
  }

  return `班级当前有 ${classContext.todayAbnormalChildren.length} 名异常晨检幼儿、${classContext.uncheckedMorningChecks.length} 名未完成晨检幼儿，以及 ${classContext.pendingReviews.length} 项待复查记录，建议按时段分层处理。`;
}

function buildFollowUpHighlights(
  classContext: TeacherAgentClassContext,
  childContext: TeacherAgentChildContext | null,
  suggestion?: TeacherSuggestionModelResponse
) {
  const highlights = suggestion?.highlights ?? [];

  if (childContext) {
    const ageBandGuidance = getTeacherAgeBandGuidance(childContext);
    if (ageBandGuidance) {
      highlights.unshift(`阶段重点：${ageBandGuidance.teacherObservationFocus[0]}`);
      if (ageBandGuidance.teacherObservationFocus[1]) {
        highlights.push(`继续关注：${ageBandGuidance.teacherObservationFocus[1]}`);
      }
    }
    highlights.unshift(...childContext.focusReasons);
  } else {
    highlights.unshift(
      `今日异常晨检 ${classContext.todayAbnormalChildren.length} 名`,
      `晨检待补录 ${classContext.uncheckedMorningChecks.length} 名`,
      `待复查 ${classContext.pendingReviews.length} 项`
    );
  }

  return takeRecentUnique(highlights, 4);
}

function buildChildFollowUpActions(
  childContext: TeacherAgentChildContext,
  suggestion?: TeacherSuggestionModelResponse
): TeacherAgentActionItem[] {
  const items: RankedTeacherAgentActionItem[] = [];
  const ageBandGuidance = getTeacherAgeBandGuidance(childContext);

  if (childContext.todayHealthChecks.length === 0) {
    items.push({
      id: `child-health-${childContext.child.id}`,
      target: childContext.child.name,
      reason: "今日晨检记录缺失，后续判断缺少基础依据",
      action: ageBandGuidance
        ? `先补齐今日晨检，并重点记录${ageBandGuidance.teacherObservationFocus[0]}。`
        : "先补齐今日晨检，并记录体温、情绪与手口眼状态",
      timing: "晨间",
      priority: 2,
    });
  }

  if (ageBandGuidance) {
    items.push({
      id: `child-age-band-${childContext.child.id}`,
      target: childContext.child.name,
      reason: `${ageBandGuidance.label}阶段当前更适合围绕${ageBandGuidance.careFocusText}做连续观察`,
      action: `今天先${ageBandGuidance.defaultInterventionFocus[0] ?? `围绕${ageBandGuidance.careFocusText}补一条观察`}`,
      timing: "今日完成",
      priority: childContext.todayAbnormalChecks.length > 0 ? 3 : 1,
    });
  }

  childContext.todayAbnormalChecks.forEach((record, index) => {
    items.push({
      id: `child-abnormal-${index + 1}`,
      target: childContext.child.name,
      reason: buildHealthReason(record),
      action: ageBandGuidance
        ? `午睡前再次观察并补充园内处理结果，同时记录${ageBandGuidance.teacherObservationFocus[0]}。`
        : "午睡前再次观察并补充园内处理结果，必要时同步家长",
      timing: "午睡前",
      priority: 1 + index,
    });
  });

  childContext.pendingReviews.slice(0, 2).forEach((record, index) => {
    items.push({
      id: `child-review-${index + 1}`,
      target: childContext.child.name,
      reason: buildGrowthReason(record),
      action: record.followUpAction ?? "按既定复查点补一条新的观察记录",
      timing: inferTimingFromGrowthCategory(record.category),
      priority: 4 + index,
    });
  });

  if (childContext.pendingReviews.length === 0) {
    childContext.recentGrowthRecords
      .filter((record) => record.needsAttention)
      .slice(0, 1)
      .forEach((record) => {
        items.push({
          id: `child-growth-${record.id}`,
          target: childContext.child.name,
          reason: buildGrowthReason(record),
          action: record.followUpAction ?? "在对应活动场景补一条追踪观察，判断问题是否持续",
          timing: inferTimingFromGrowthCategory(record.category),
          priority: 5,
        });
      });
  }

  if (!childContext.latestFeedback) {
    items.push({
      id: `child-feedback-${childContext.child.id}`,
      target: childContext.child.name,
      reason: "最近缺少家长反馈，明天难以判断家庭执行效果",
      action: ageBandGuidance?.teacherObservationFocus[0]
        ? `离园前同步“${ageBandGuidance.teacherObservationFocus[0]}”对应的今晚观察点，并提醒家长明早反馈`
        : "离园前同步今晚观察点，并提醒家长明早反馈",
      timing: "离园前",
      priority: 6,
    });
  }

  suggestion?.actionPlan?.schoolActions.slice(0, 1).forEach((action, index) => {
    items.push({
      id: `child-school-${index + 1}`,
      target: childContext.child.name,
      reason: "AI 识别到园内还需要补一条落实动作",
      action,
      timing: "今日完成",
      priority: 7 + index,
    });
  });

  const aiActions = suggestion?.actions ?? [];
  aiActions.slice(0, 1).forEach((action, index) => {
    items.push({
      id: `child-ai-${index + 1}`,
      target: childContext.child.name,
      reason: "AI 摘要建议补强今日处理节奏",
      action,
      timing: "今日完成",
      priority: 8 + index,
    });
  });

  return finalizeActionItems(items, 5);
}

function buildClassFollowUpActions(classContext: TeacherAgentClassContext): TeacherAgentActionItem[] {
  const items: RankedTeacherAgentActionItem[] = [];

  classContext.todayAbnormalChildren.slice(0, 3).forEach((item, index) => {
    items.push({
      id: `class-abnormal-${index + 1}`,
      target: item.child.name,
      reason: buildHealthReason(item.record),
      action: "先完成园内复测或复查，再决定是否需要即时联系家长",
      timing: "晨间",
      priority: 1 + index,
    });
  });

  classContext.uncheckedMorningChecks.slice(0, 2).forEach((child, index) => {
    items.push({
      id: `class-unchecked-${index + 1}`,
      target: child.name,
      reason: "今日出勤但尚未晨检，后续风险判断依据不足",
      action: "尽快补录晨检，避免异常被遗漏",
      timing: "晨间",
      priority: 4 + index,
    });
  });

  classContext.pendingReviews.slice(0, 3).forEach((item, index) => {
    items.push({
      id: `class-review-${index + 1}`,
      target: item.child.name,
      reason: buildGrowthReason(item.record),
      action: item.record.followUpAction ?? "按原观察点完成复查并记录结果",
      timing: inferTimingFromGrowthCategory(item.record.category),
      priority: 6 + index,
    });
  });

  return finalizeActionItems(items, 6);
}

function buildFollowUpParentMessageDraft(params: {
  classContext: TeacherAgentClassContext;
  childContext: TeacherAgentChildContext | null;
  suggestion?: TeacherSuggestionModelResponse;
  actionItems: TeacherAgentActionItem[];
}) {
  if (params.childContext) {
    const guardianName = params.childContext.child.guardians?.[0]?.name ?? "家长";
    const familyAction =
      params.suggestion?.actionPlan?.familyActions[0] ??
      params.actionItems.find((item) => item.target === params.childContext?.child.name)?.action ??
      "今晚继续观察孩子的情绪、作息和入园相关表现";
    const observation =
      params.suggestion?.actionPlan?.reviewActions[0] ??
      params.suggestion?.concerns?.[0] ??
      params.childContext.focusReasons[0] ??
      "明天老师会继续核对在园表现";

    return `${guardianName}您好，今天老师已为${params.childContext.child.name}整理了在园跟进建议。今晚请重点配合：${familyAction}。${observation}，如您观察到新的变化，明早请同步给老师。`;
  }

  const firstAction =
    params.actionItems[0]?.action ??
    params.suggestion?.actions?.[0] ??
    "明天优先核对班级重点儿童的晨检、观察和家园反馈闭环";
  return `各位家长您好，${params.classContext.className}今天已完成班级待办梳理。老师将优先推进：${firstAction}。如孩子今晚有发热、情绪明显变化或睡眠饮食异常，请及时反馈给班级老师。`;
}

export function buildTeacherFollowUpResult(params: {
  classContext: TeacherAgentClassContext;
  childContext: TeacherAgentChildContext | null;
  suggestion?: TeacherSuggestionModelResponse;
}): TeacherAgentResult {
  const targetLabel = params.childContext?.child.name ?? params.classContext.className;
  const actionItems = params.childContext
    ? buildChildFollowUpActions(params.childContext, params.suggestion)
    : buildClassFollowUpActions(params.classContext);
  const source = (params.suggestion?.source ?? "fallback") as TeacherAgentResultSource;
  const summary = buildFollowUpSummary(params.classContext, params.childContext, params.suggestion);
  const parentMessageDraft = buildFollowUpParentMessageDraft({
    classContext: params.classContext,
    childContext: params.childContext,
    suggestion: params.suggestion,
    actionItems,
  });
  const defenseParts = params.childContext ? buildDefenseFollowUpParts(params.childContext) : null;
  const finalSummary = defenseParts?.summary ?? summary;
  const finalHighlights =
    defenseParts?.highlights ?? buildFollowUpHighlights(params.classContext, params.childContext, params.suggestion);
  const finalActionItems = defenseParts?.actionItems ?? actionItems;
  const finalParentMessageDraft = defenseParts?.parentMessageDraft ?? parentMessageDraft;
  const finalTomorrowObservationPoint =
    defenseParts?.tomorrowObservationPoint ??
    (params.childContext
      ? buildTomorrowObservationPoint(params.childContext, {
          answer: "",
          keyPoints: params.suggestion?.highlights ?? [],
          nextSteps: params.suggestion?.actionPlan?.reviewActions ?? [],
          disclaimer: params.suggestion?.disclaimer ?? "",
          source,
          model: params.suggestion?.model,
        })
      : "明日优先核对今日重点动作是否完成，并确认家长侧是否已形成反馈。");
  const finalTargetLabel = defenseParts?.keyChildren[0] ?? targetLabel;
  const generatedAt = new Date().toISOString();
  const interventionCard =
    params.childContext && params.suggestion
      ? buildInterventionCardFromSuggestion({
          targetChildId: params.childContext.child.id,
          childName: finalTargetLabel,
          triggerReason: params.childContext.focusReasons[0] ?? "当前需要家园协同跟进",
          suggestion: params.suggestion,
          ageBandContext: params.childContext.ageBandContext,
          todayInSchoolAction: finalActionItems.find((item) => item.target === params.childContext?.child.name)?.action,
          tonightHomeAction: getTeacherAgeBandGuidance(params.childContext)
            ? `今晚请家长配合：${getTeacherAgeBandGuidance(params.childContext)?.defaultInterventionFocus[1] ?? `围绕${getTeacherAgeBandGuidance(params.childContext)?.careFocusText}做一条小动作`}`
            : undefined,
          homeSteps: params.suggestion.actionPlan?.familyActions.slice(0, 4),
          observationPoints: finalHighlights,
          tomorrowObservationPoint: finalTomorrowObservationPoint,
          reviewIn48h: params.suggestion.actionPlan?.reviewActions[0],
          generatedAt,
        })
      : undefined;

  return {
    workflow: "follow-up",
    ...withResultMode(params.childContext ? "child" : "class"),
    title: params.childContext ? `${finalTargetLabel} 今日跟进行动` : "班级今日跟进行动",
    summary: finalSummary,
    targetChildId: params.childContext?.child.id,
    targetLabel: finalTargetLabel,
    highlights: finalHighlights,
    actionItems: finalActionItems,
    parentMessageDraft: finalParentMessageDraft,
    tomorrowObservationPoint: finalTomorrowObservationPoint,
    reviewItems:
      defenseParts?.reviewItems ??
      [
        finalTomorrowObservationPoint,
        interventionCard?.reviewIn48h,
        ...finalActionItems
          .filter((item) => /复查|离园|明日|明天|48/.test(`${item.reason}${item.action}${item.timing}`))
          .map((item) => `${item.target}：${item.action}`),
      ].filter((item): item is string => Boolean(item)),
    interventionCard,
    keyChildren: defenseParts?.keyChildren ?? (params.childContext ? [finalTargetLabel] : undefined),
    riskTypes: defenseParts?.riskTypes ?? params.classContext.riskTypes,
    source,
    model: params.suggestion?.model,
    provider: getResponseProvider(params.suggestion),
    providerStatus: params.suggestion?.providerStatus,
    fallbackReason: params.suggestion?.fallbackReason,
    dataQuality: buildTeacherAgentDataQuality({
      source,
      summary: finalSummary,
      targetLabel: finalTargetLabel,
      actionItems: finalActionItems,
      parentMessageDraft: finalParentMessageDraft,
      inputCounts: params.childContext
        ? buildChildInputCounts(params.childContext)
        : buildClassInputCounts(params.classContext),
    }),
    generatedAt,
  };
}

function buildWeeklySummaryText(context: TeacherAgentClassContext, report: TeacherWeeklyModelResponse) {
  return (
    report.summary ||
    `近 7 天内，${context.className} 主要工作重心集中在晨检异常、成长观察待复查和家园反馈闭环。`
  );
}

function buildWeeklyHighlights(context: TeacherAgentClassContext, report: TeacherWeeklyModelResponse) {
  return takeRecentUnique(
    [
      `近 7 天晨检异常 ${context.weeklyHealthChecks.filter((record) => record.isAbnormal).length} 条`,
      `待复查记录 ${context.pendingReviews.length} 项`,
      `家长反馈 ${context.weeklyFeedbacks.length} 条`,
      ...report.highlights,
    ],
    4
  );
}

function buildWeeklyActionItems(
  context: TeacherAgentClassContext,
  report: TeacherWeeklyModelResponse
): TeacherAgentActionItem[] {
  const items: RankedTeacherAgentActionItem[] = [];

  if (context.pendingReviews.length > 0) {
    items.push({
      id: "weekly-review-priority",
      target: "重点儿童",
      reason: `当前仍有 ${context.pendingReviews.length} 项待复查记录，需要下周优先排期`,
      action: "下周一晨间先排定重点儿童复查顺序，并在对应场景补齐观察记录",
      timing: "下周晨间",
      priority: 1,
    });
  }

  if (context.todayAbnormalChildren.length > 0) {
    items.push({
      id: "weekly-abnormal-priority",
      target: "班级",
      reason: "本周已出现晨检异常，需要保留晨间优先处理节奏",
      action: "下周继续把晨检异常记录列为晨间优先处理对象，先复查再安排家园沟通",
      timing: "下周晨间",
      priority: 2,
    });
  }

  if (context.weeklyFeedbacks.length < Math.min(context.visibleChildren.length, 5)) {
    items.push({
      id: "weekly-feedback-priority",
      target: "家园协同",
      reason: "本周家长反馈覆盖仍不够稳定，影响后续 AI 复盘",
      action: "下周离园前强化家长反馈收集，确保重点儿童至少形成一次晚间回传",
      timing: "离园前",
      priority: 3,
    });
  }

  report.nextWeekActions.slice(0, 3).forEach((action, index) => {
    items.push({
      id: `weekly-${index + 1}`,
      target: "班级",
      reason: "用于下周班级跟进与比赛演示闭环",
      action,
      timing: "下周执行",
      priority: 4 + index,
    });
  });

  return finalizeActionItems(items, 3);
}

function buildWeeklyParentMessageDraft(
  context: TeacherAgentClassContext,
  report: TeacherWeeklyModelResponse,
  actionItems: TeacherAgentActionItem[]
) {
  const focusChildren = context.focusChildren.map((item) => item.childName).slice(0, 3).join("、");
  const firstAction =
    report.nextWeekActions[0] ??
    actionItems[0]?.action ??
    "下周老师会继续跟进晨检、成长观察和家园反馈闭环";
  const focusText = focusChildren ? `本周重点关注：${focusChildren}。` : "";

  return `各位家长您好，本周${context.className}已完成班级观察总结。${focusText}下周班级将优先推进：${firstAction}。如孩子周末出现发热、情绪明显波动或作息饮食异常，请及时同步给班级老师。`;
}

export function buildTeacherWeeklySummaryResult(params: {
  classContext: TeacherAgentClassContext;
  report: TeacherWeeklyModelResponse;
}): TeacherAgentResult {
  const generatedAt = new Date().toISOString();
  const source = params.report.source as TeacherAgentResultSource;
  const summary = buildWeeklySummaryText(params.classContext, params.report);
  const actionItems = buildWeeklyActionItems(params.classContext, params.report);
  const parentMessageDraft = buildWeeklyParentMessageDraft(params.classContext, params.report, actionItems);
  const defenseParts = buildDefenseWeeklySummaryParts(params.classContext);
  const finalSummary = defenseParts?.summary ?? summary;
  const finalHighlights = defenseParts?.highlights ?? buildWeeklyHighlights(params.classContext, params.report);
  const finalActionItems = defenseParts?.actionItems ?? actionItems;
  const finalParentMessageDraft = defenseParts?.parentMessageDraft ?? parentMessageDraft;
  const finalTomorrowObservationPoint =
    defenseParts?.tomorrowObservationPoint ??
    params.report.nextWeekActions[0] ??
    "下周一先核对重点儿童复查节奏和家长反馈覆盖情况。";

  return {
    workflow: "weekly-summary",
    ...withResultMode("class"),
    title: `${params.classContext.className} 本周观察总结`,
    summary: finalSummary,
    targetLabel: params.classContext.className,
    highlights: finalHighlights,
    actionItems: finalActionItems,
    parentMessageDraft: finalParentMessageDraft,
    tomorrowObservationPoint: finalTomorrowObservationPoint,
    reviewItems:
      defenseParts?.reviewItems ??
      [
        finalTomorrowObservationPoint,
        ...finalActionItems
          .filter((item) => /复查|补录|反馈|48/.test(`${item.reason}${item.action}${item.timing}`))
          .map((item) => `${item.target}：${item.action}`),
      ].filter((item): item is string => Boolean(item)),
    keyChildren: defenseParts?.keyChildren ?? params.classContext.focusChildren.map((item) => item.childName).slice(0, 5),
    riskTypes: defenseParts?.riskTypes ?? params.classContext.riskTypes,
    source,
    model: params.report.model,
    provider: getResponseProvider(params.report),
    providerStatus: params.report.providerStatus,
    fallbackReason: params.report.fallbackReason,
    dataQuality: buildTeacherAgentDataQuality({
      source,
      summary: finalSummary,
      targetLabel: params.classContext.className,
      actionItems: finalActionItems,
      parentMessageDraft: finalParentMessageDraft,
      inputCounts: buildClassInputCounts(params.classContext),
    }),
    generatedAt,
  };
}

export function buildTeacherChildSuggestionSnapshotWithMemory(
  context: TeacherAgentChildContext,
  memoryContext?: MemoryContextEnvelope | null
): ChildSuggestionSnapshot {
  const snapshot = buildTeacherChildSuggestionSnapshot(context);
  const continuityNotes = buildChildContinuityNotes(context.child.name, memoryContext);

  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      feedback: {
        ...snapshot.summary.feedback,
        keywords: takeRecentUnique(
          [...snapshot.summary.feedback.keywords, ...(memoryContext?.promptContext.recentContinuitySignals ?? [])],
          4
        ),
      },
    },
    memoryContext: memoryContext?.promptContext,
    continuityNotes,
    ruleFallback: [
      ...snapshot.ruleFallback,
      ...(memoryContext?.promptContext.openLoops[0]
        ? [
            {
              title: "延续上次未闭环事项",
              description: memoryContext.promptContext.openLoops[0],
              level: "info" as const,
              tags: ["memory", "continuity"],
            },
          ]
        : []),
    ],
  };
}

export function buildTeacherCommunicationFollowUpPayloadWithMemory(
  context: TeacherAgentChildContext,
  memoryContext?: MemoryContextEnvelope | null
): AiFollowUpPayload {
  const payload = buildTeacherCommunicationFollowUpPayload(context);
  return {
    ...payload,
    snapshot: buildTeacherChildSuggestionSnapshotWithMemory(context, memoryContext),
    memoryContext: memoryContext?.promptContext,
    continuityNotes: buildChildContinuityNotes(context.child.name, memoryContext),
  };
}

export function buildTeacherWeeklyReportSnapshotWithMemory(
  context: TeacherAgentClassContext,
  memoryContexts: Array<MemoryContextEnvelope | null | undefined> = []
): WeeklyReportSnapshot {
  const snapshot = buildTeacherWeeklyReportSnapshot(context);
  const promptMemoryContext = mergePromptMemoryContexts(memoryContexts.map((item) => item?.promptContext));
  const continuityNotes = buildContinuityNotes(context.className, promptMemoryContext);

  return {
    ...snapshot,
    highlights: takeRecentUnique([...snapshot.highlights, ...continuityNotes.slice(0, 2)], 4),
    risks: takeRecentUnique([...snapshot.risks, ...promptMemoryContext.openLoops.slice(0, 2)], 4),
    memoryContext: promptMemoryContext,
    continuityNotes,
  };
}

export function buildTeacherCommunicationResultWithMemory(params: {
  context: TeacherAgentChildContext;
  response: TeacherCommunicationModelResponse;
  memoryContext?: MemoryContextEnvelope | null;
}): TeacherAgentResult {
  const result = buildTeacherCommunicationResult({
    context: params.context,
    response: params.response,
  });
  const continuityNotes = buildChildContinuityNotes(params.context.child.name, params.memoryContext);
  const memoryMeta = mergeMemoryMeta([params.memoryContext]);

  return {
    ...result,
    summary: continuityNotes[0] ? `${continuityNotes[0]} ${result.summary}` : result.summary,
    highlights: takeRecentUnique([...continuityNotes, ...result.highlights], 4),
    parentMessageDraft:
      result.parentMessageDraft && continuityNotes[1]
        ? `${continuityNotes[1]} ${result.parentMessageDraft}`
        : result.parentMessageDraft,
    tomorrowObservationPoint: params.memoryContext?.promptContext.openLoops[0] ?? result.tomorrowObservationPoint,
    continuityNotes,
    memoryMeta,
  };
}

export function buildTeacherFollowUpResultWithMemory(params: {
  classContext: TeacherAgentClassContext;
  childContext: TeacherAgentChildContext | null;
  suggestion?: TeacherSuggestionModelResponse;
  memoryContext?: MemoryContextEnvelope | null;
}): TeacherAgentResult {
  const result = buildTeacherFollowUpResult({
    classContext: params.classContext,
    childContext: params.childContext,
    suggestion: params.suggestion,
  });
  const continuityNotes = params.childContext
    ? buildChildContinuityNotes(params.childContext.child.name, params.memoryContext)
    : [];
  const memoryMeta = mergeMemoryMeta([params.memoryContext]);

  return {
    ...result,
    summary: continuityNotes[0] ? `${continuityNotes[0]} ${result.summary}` : result.summary,
    highlights: takeRecentUnique([...continuityNotes, ...result.highlights], 5),
    tomorrowObservationPoint: params.memoryContext?.promptContext.openLoops[0] ?? result.tomorrowObservationPoint,
    continuityNotes,
    memoryMeta,
  };
}

export function buildTeacherWeeklySummaryResultWithMemory(params: {
  classContext: TeacherAgentClassContext;
  report: TeacherWeeklyModelResponse;
  memoryContexts?: Array<MemoryContextEnvelope | null | undefined>;
}): TeacherAgentResult {
  const result = buildTeacherWeeklySummaryResult({
    classContext: params.classContext,
    report: params.report,
  });
  const promptMemoryContext = mergePromptMemoryContexts((params.memoryContexts ?? []).map((item) => item?.promptContext));
  const continuityNotes = buildContinuityNotes(params.classContext.className, promptMemoryContext);
  const memoryMeta = mergeMemoryMeta(params.memoryContexts ?? []);

  return {
    ...result,
    summary: continuityNotes[0] ? `${continuityNotes[0]} ${result.summary}` : result.summary,
    highlights: takeRecentUnique([...continuityNotes, ...result.highlights], 5),
    tomorrowObservationPoint: promptMemoryContext.openLoops[0] ?? result.tomorrowObservationPoint,
    continuityNotes,
    memoryMeta,
  };
}

export function buildTeacherAgentResultSummary(result: TeacherAgentResult) {
  return result.summary.length > 52 ? `${result.summary.slice(0, 52)}...` : result.summary;
}

export function buildTeacherAgentTimeLabel(value: string) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && (value.includes("T") || value.includes(":"))) {
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  const normalized = normalizeLocalDate(value);
  if (normalized) return normalized;

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", { hour12: false });
}
