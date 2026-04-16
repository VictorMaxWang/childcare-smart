import type {
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
        recordCount: 0,
        hydrationAvg: 0,
        balancedRate: 0,
        monotonyDays: 0,
        allergyRiskCount: 0,
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
      meals: [],
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

export function buildTeacherCommunicationResult(params: {
  context: TeacherAgentChildContext;
  response: TeacherCommunicationModelResponse;
}): TeacherAgentResult {
  const generatedAt = new Date().toISOString();
  const communicationActionItems = buildCommunicationActionItems(params.context, params.response);
  const interventionCard = buildInterventionCardFromCommunication({
    targetChildId: params.context.child.id,
    childName: params.context.child.name,
    triggerReason: params.context.focusReasons[0] ?? "当前需要家园协同跟进",
    summary: buildCommunicationSummary(params.context, params.response.answer),
    riskLevel: params.context.todayAbnormalChecks.length > 0 ? "high" : params.context.pendingReviews.length > 0 ? "medium" : "low",
    ageBandContext: params.context.ageBandContext,
    schoolActions: communicationActionItems.slice(-1).map((item) => item.action),
    familyActions: communicationActionItems.slice(0, 2).map((item) => item.action),
    observationPoints: buildCommunicationHighlights(params.context, params.response),
    tomorrowObservationPoint: buildTomorrowObservationPoint(params.context, params.response),
    reviewIn48h: params.response.nextSteps[0],
    source: params.response.source as TeacherAgentResultSource,
    model: params.response.model,
    generatedAt,
  });

  return {
    workflow: "communication",
    ...withResultMode("child"),
    title: `${params.context.child.name} 家长沟通建议`,
    summary: buildCommunicationSummary(params.context, params.response.answer),
    targetChildId: params.context.child.id,
    targetLabel: params.context.child.name,
    highlights: buildCommunicationHighlights(params.context, params.response),
    actionItems: communicationActionItems,
    parentMessageDraft: buildParentMessageDraft(params.context, params.response),
    tomorrowObservationPoint: buildTomorrowObservationPoint(params.context, params.response),
    interventionCard,
    source: params.response.source as TeacherAgentResultSource,
    model: params.response.model,
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

export function buildTeacherFollowUpResult(params: {
  classContext: TeacherAgentClassContext;
  childContext: TeacherAgentChildContext | null;
  suggestion?: TeacherSuggestionModelResponse;
}): TeacherAgentResult {
  const targetLabel = params.childContext?.child.name ?? params.classContext.className;
  const actionItems = params.childContext
    ? buildChildFollowUpActions(params.childContext, params.suggestion)
    : buildClassFollowUpActions(params.classContext);
  const generatedAt = new Date().toISOString();
  const interventionCard =
    params.childContext && params.suggestion
      ? buildInterventionCardFromSuggestion({
          targetChildId: params.childContext.child.id,
          childName: params.childContext.child.name,
          triggerReason: params.childContext.focusReasons[0] ?? "当前需要家园协同跟进",
          suggestion: params.suggestion,
          ageBandContext: params.childContext.ageBandContext,
          todayInSchoolAction: actionItems.find((item) => item.target === params.childContext?.child.name)?.action,
          tonightHomeAction: getTeacherAgeBandGuidance(params.childContext)
            ? `今晚请家长配合：${getTeacherAgeBandGuidance(params.childContext)?.defaultInterventionFocus[1] ?? `围绕${getTeacherAgeBandGuidance(params.childContext)?.careFocusText}做一条小动作`}`
            : undefined,
          homeSteps: params.suggestion.actionPlan?.familyActions.slice(0, 4),
          observationPoints: buildFollowUpHighlights(params.classContext, params.childContext, params.suggestion),
          tomorrowObservationPoint:
            buildTomorrowObservationPoint(params.childContext, {
              answer: "",
              keyPoints: params.suggestion.highlights ?? [],
              ...params.suggestion,
              nextSteps: params.suggestion.actionPlan?.reviewActions ?? [],
            }),
          reviewIn48h: params.suggestion.actionPlan?.reviewActions[0],
          generatedAt,
        })
      : undefined;

  return {
    workflow: "follow-up",
    ...withResultMode(params.childContext ? "child" : "class"),
    title: params.childContext ? `${params.childContext.child.name} 今日跟进行动` : "班级今日跟进行动",
    summary: buildFollowUpSummary(params.classContext, params.childContext, params.suggestion),
    targetChildId: params.childContext?.child.id,
    targetLabel,
    highlights: buildFollowUpHighlights(params.classContext, params.childContext, params.suggestion),
    actionItems,
    tomorrowObservationPoint:
      params.childContext
        ? buildTomorrowObservationPoint(params.childContext, {
            answer: "",
            keyPoints: params.suggestion?.highlights ?? [],
            nextSteps: params.suggestion?.actionPlan?.reviewActions ?? [],
            disclaimer: params.suggestion?.disclaimer ?? "",
            source: (params.suggestion?.source ?? "fallback") as TeacherAgentResultSource,
            model: params.suggestion?.model,
          })
        : "明日优先核对今日重点动作是否完成，并确认家长侧是否已形成反馈。",
    interventionCard,
    source: (params.suggestion?.source ?? "fallback") as TeacherAgentResultSource,
    model: params.suggestion?.model,
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
      action: "下周继续把晨检异常儿童列为晨间优先处理对象，先复查再安排家园沟通",
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

export function buildTeacherWeeklySummaryResult(params: {
  classContext: TeacherAgentClassContext;
  report: TeacherWeeklyModelResponse;
}): TeacherAgentResult {
  return {
    workflow: "weekly-summary",
    ...withResultMode("class"),
    title: `${params.classContext.className} 本周观察总结`,
    summary: buildWeeklySummaryText(params.classContext, params.report),
    targetLabel: params.classContext.className,
    highlights: buildWeeklyHighlights(params.classContext, params.report),
    actionItems: buildWeeklyActionItems(params.classContext, params.report),
    tomorrowObservationPoint:
      params.report.nextWeekActions[0] ?? "下周一先核对重点儿童复查节奏和家长反馈覆盖情况。",
    keyChildren: params.classContext.focusChildren.map((item) => item.childName).slice(0, 5),
    riskTypes: params.classContext.riskTypes,
    source: params.report.source as TeacherAgentResultSource,
    model: params.report.model,
    generatedAt: new Date().toISOString(),
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
