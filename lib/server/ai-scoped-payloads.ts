import "server-only";

import type {
  AiFollowUpPayload,
  AiSuggestionPayload,
  ChildSuggestionSnapshot,
  ParentMessageReflexionRequest,
  WeeklyReportPayload,
  WeeklyReportRole,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";
import type { HighRiskConsultationRequestPayload } from "@/lib/agent/high-risk-consultation";
import type { AdminAgentRequestPayload } from "@/lib/agent/admin-types";
import type { TeacherAgentRequestPayload } from "@/lib/agent/teacher-agent";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { SessionScope } from "@/lib/server/session-scope";

type AnyRecord = Partial<{
  ageBand: unknown;
  allergyReaction: unknown;
  allergies: unknown;
  birthDate: unknown;
  category: unknown;
  createdAt: unknown;
  date: unknown;
  description: unknown;
  followUpAction: unknown;
  foods: unknown;
  handMouthEye: unknown;
  isAbnormal: unknown;
  isPresent: unknown;
  meal: unknown;
  mood: unknown;
  name: unknown;
  needsAttention: unknown;
  parentUserId: unknown;
  periodLabel: unknown;
  preference: unknown;
  remark: unknown;
  reviewStatus: unknown;
  specialNotes: unknown;
  status: unknown;
  submittedAt: unknown;
  tags: unknown;
  temperature: unknown;
  updatedAt: unknown;
  waterMl: unknown;
}>;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function childRecord(child: AppStateSnapshot["children"][number]) {
  const record = child as unknown as AnyRecord;
  return {
    id: child.id,
    name: child.name,
    birthDate: asString(record.birthDate),
    className: asString(child.className),
    allergies: asStringArray(record.allergies),
    specialNotes: asString(record.specialNotes),
    parentUserId: asString(record.parentUserId) || undefined,
  };
}

function foodNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (item && typeof item === "object") return asString((item as AnyRecord).name);
      return asString(item);
    })
    .filter(Boolean);
}

function statusCounts(items: Array<{ status?: unknown }>) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const status = asString(item.status, "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function topCategories(items: Array<{ category?: unknown }>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const category = asString(item.category, "未分类");
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function byChildId<T extends { childId?: string }>(items: T[], childId: string) {
  return items.filter((item) => item.childId === childId);
}

function latestByDate<T>(items: T[], readDate: (item: T) => string) {
  return [...items].sort((left, right) => Date.parse(readDate(right)) - Date.parse(readDate(left)));
}

export function buildChildSuggestionSnapshotFromScope(
  scope: SessionScope,
  childId: string
): ChildSuggestionSnapshot | null {
  const child = scope.visibleChildren.find((item) => item.id === childId);
  if (!child) return null;

  const health = byChildId(scope.scopedSnapshot.health, childId);
  const meals = byChildId(scope.scopedSnapshot.meals, childId);
  const growth = byChildId(scope.scopedSnapshot.growth, childId);
  const feedback = byChildId(scope.scopedSnapshot.feedback, childId);
  const hydrationValues = meals.map((item) => asNumber((item as AnyRecord).waterMl)).filter((value) => value > 0);
  const mealCount = Math.max(meals.length, 1);
  const balancedMeals = meals.filter((item) => {
    const text = JSON.stringify((item as AnyRecord).foods ?? "");
    return /蔬|菜|肉|蛋|奶|protein|vegetable/iu.test(text);
  }).length;

  return {
    child: {
      id: child.id,
      name: child.name,
      ageBand: asString((child as unknown as AnyRecord).ageBand),
      className: asString(child.className),
      allergies: asStringArray((child as unknown as AnyRecord).allergies),
      specialNotes: asString((child as unknown as AnyRecord).specialNotes),
    },
    summary: {
      health: {
        abnormalCount: health.filter((item) => Boolean((item as AnyRecord).isAbnormal)).length,
        handMouthEyeAbnormalCount: health.filter((item) => asString((item as AnyRecord).handMouthEye).includes("异常")).length,
        avgTemperature: average(health.map((item) => asNumber((item as AnyRecord).temperature)).filter((value) => value > 0)),
        moodKeywords: health.map((item) => asString((item as AnyRecord).mood)).filter(Boolean).slice(-5),
      },
      meals: {
        recordCount: meals.length,
        hydrationAvg: average(hydrationValues),
        balancedRate: balancedMeals / mealCount,
        monotonyDays: 0,
        allergyRiskCount: meals.filter((item) => Boolean(asString((item as AnyRecord).allergyReaction))).length,
      },
      growth: {
        recordCount: growth.length,
        attentionCount: growth.filter((item) => Boolean((item as AnyRecord).needsAttention)).length,
        pendingReviewCount: growth.filter((item) => asString((item as AnyRecord).reviewStatus).includes("待")).length,
        topCategories: topCategories(growth as Array<{ category?: unknown }>),
      },
      feedback: {
        count: feedback.length,
        statusCounts: statusCounts(feedback as Array<{ status?: unknown }>),
        keywords: feedback.flatMap((item) => asStringArray((item as AnyRecord).tags)).slice(0, 8),
      },
    },
    recentDetails: {
      health: latestByDate(health, (item) => asString((item as AnyRecord).date)).slice(0, 10).map((item) => ({
        date: asString((item as AnyRecord).date),
        temperature: asNumber((item as AnyRecord).temperature),
        mood: asString((item as AnyRecord).mood),
        handMouthEye: asString((item as AnyRecord).handMouthEye, "正常") as "正常" | "异常",
        isAbnormal: Boolean((item as AnyRecord).isAbnormal),
        remark: asString((item as AnyRecord).remark) || undefined,
      })),
      meals: latestByDate(meals, (item) => asString((item as AnyRecord).date)).slice(0, 10).map((item) => ({
        date: asString((item as AnyRecord).date),
        meal: asString((item as AnyRecord).meal),
        foods: foodNames((item as AnyRecord).foods),
        waterMl: asNumber((item as AnyRecord).waterMl),
        preference: asString((item as AnyRecord).preference),
        allergyReaction: asString((item as AnyRecord).allergyReaction) || undefined,
      })),
      growth: latestByDate(growth, (item) => asString((item as AnyRecord).createdAt)).slice(0, 10).map((item) => ({
        createdAt: asString((item as AnyRecord).createdAt),
        category: asString((item as AnyRecord).category),
        description: asString((item as AnyRecord).description),
        needsAttention: Boolean((item as AnyRecord).needsAttention),
        followUpAction: asString((item as AnyRecord).followUpAction) || undefined,
        reviewStatus: asString((item as AnyRecord).reviewStatus) || undefined,
      })),
      feedback,
    },
    ruleFallback: [
      {
        title: "Session scoped data",
        description: "Context rebuilt from the current signed session scope.",
        level: "info",
        tags: ["tenant-isolation"],
      },
    ],
  };
}

export function buildParentSuggestionPayloadFromScope(
  source: AiSuggestionPayload,
  childSnapshot: ChildSuggestionSnapshot
): AiSuggestionPayload {
  void source;
  return {
    scope: "child",
    snapshot: childSnapshot,
  };
}

export function buildParentFollowUpPayloadFromScope(
  source: AiFollowUpPayload,
  scope: SessionScope,
  childSnapshot: ChildSuggestionSnapshot
): AiFollowUpPayload {
  const childId = childSnapshot.child.id;
  const feedback = latestByDate(
    byChildId(scope.scopedSnapshot.feedback, childId),
    (item) => asString((item as AnyRecord).submittedAt) || asString((item as AnyRecord).date) || asString((item as AnyRecord).createdAt)
  )[0];
  const tasks = byChildId(scope.scopedSnapshot.tasks, childId);
  const currentInterventionCard = latestByDate(
    scope.scopedSnapshot.interventionCards.filter((item) => item.targetChildId === childId),
    (item) => asString((item as AnyRecord).updatedAt) || asString((item as AnyRecord).createdAt)
  )[0];

  return {
    ...source,
    scope: "child",
    snapshot: childSnapshot,
    latestFeedback: feedback,
    tasks,
    activeTask: source.activeTask && (source.activeTask as { childId?: string }).childId === childId
      ? source.activeTask
      : tasks[0],
    currentInterventionCard,
  };
}

export function buildParentMessageRequestFromScope(
  source: ParentMessageReflexionRequest,
  scope: SessionScope,
  childId: string
): ParentMessageReflexionRequest {
  const child = scope.visibleChildren.find((item) => item.id === childId);
  return {
    targetChildId: childId,
    childId,
    teacherNote: source.teacherNote,
    issueSummary: source.issueSummary,
    todayInSchoolActions: source.todayInSchoolActions,
    tonightHomeActions: source.tonightHomeActions,
    currentInterventionCard: source.currentInterventionCard,
    latestGuardianFeedback: latestByDate(
      byChildId(scope.scopedSnapshot.feedback, childId),
      (item) => asString((item as AnyRecord).submittedAt) || asString((item as AnyRecord).date) || asString((item as AnyRecord).createdAt)
    )[0] as unknown as Record<string, unknown> | undefined,
    snapshot: buildChildSuggestionSnapshotFromScope(scope, childId) as unknown as Record<string, unknown>,
    visibleChildren: child ? [child as unknown as Record<string, unknown>] : [],
    sessionId: source.sessionId,
    institutionId: scope.institutionId,
    traceId: source.traceId,
    debugMemory: source.debugMemory,
    debugLoop: source.debugLoop,
  };
}

export function buildTeacherAgentPayloadFromScope(
  source: Pick<TeacherAgentRequestPayload, "workflow" | "scope" | "targetChildId">,
  scope: SessionScope
): TeacherAgentRequestPayload {
  const visibleChildren = scope.visibleChildren.map(childRecord);
  const presentChildIds = new Set(
    scope.scopedSnapshot.attendance
      .filter((item) => Boolean((item as AnyRecord).isPresent))
      .map((item) => item.childId)
  );
  return {
    workflow: source.workflow,
    scope: source.scope,
    targetChildId: source.targetChildId,
    currentUser: {
      name: scope.user.name,
      institutionId: scope.institutionId,
      className: scope.user.className,
      role: scope.user.role,
    },
    visibleChildren,
    presentChildren:
      presentChildIds.size > 0
        ? visibleChildren.filter((child) => presentChildIds.has(child.id))
        : visibleChildren,
    healthCheckRecords: scope.scopedSnapshot.health as TeacherAgentRequestPayload["healthCheckRecords"],
    mealRecords: scope.scopedSnapshot.meals as TeacherAgentRequestPayload["mealRecords"],
    growthRecords: scope.scopedSnapshot.growth as TeacherAgentRequestPayload["growthRecords"],
    guardianFeedbacks: scope.scopedSnapshot.feedback,
  };
}

export function buildHighRiskConsultationPayloadFromScope(
  source: HighRiskConsultationRequestPayload,
  scope: SessionScope
): HighRiskConsultationRequestPayload {
  return {
    ...buildTeacherAgentPayloadFromScope(
      {
        workflow: "communication",
        scope: "child",
        targetChildId: source.targetChildId,
      },
      scope
    ),
    targetChildId: source.targetChildId,
    teacherNote: source.teacherNote,
    imageInput: source.imageInput,
    voiceInput: source.voiceInput,
  };
}

export function buildAdminAgentPayloadFromScope(
  source: Pick<AdminAgentRequestPayload, "workflow" | "question" | "history">,
  scope: SessionScope
): AdminAgentRequestPayload {
  const visibleChildren = scope.visibleChildren.map(childRecord);
  const attentionByChild = new Map<string, number>();
  for (const item of scope.scopedSnapshot.growth) {
    if (Boolean((item as AnyRecord).needsAttention)) {
      attentionByChild.set(item.childId, (attentionByChild.get(item.childId) ?? 0) + 1);
    }
  }
  const hydrationByChild = new Map<string, number[]>();
  for (const item of scope.scopedSnapshot.meals) {
    const values = hydrationByChild.get(item.childId) ?? [];
    values.push(asNumber((item as AnyRecord).waterMl));
    hydrationByChild.set(item.childId, values);
  }

  return {
    workflow: source.workflow,
    question: source.question,
    history: source.history,
    currentUser: {
      name: scope.user.name,
      institutionName: scope.institutionId,
      institutionId: scope.institutionId,
      role: scope.user.role,
    },
    visibleChildren,
    attendanceRecords: scope.scopedSnapshot.attendance,
    healthCheckRecords: scope.scopedSnapshot.health,
    growthRecords: scope.scopedSnapshot.growth,
    guardianFeedbacks: scope.scopedSnapshot.feedback as AdminAgentRequestPayload["guardianFeedbacks"],
    mealRecords: scope.scopedSnapshot.meals as AdminAgentRequestPayload["mealRecords"],
    adminBoardData: {
      highAttentionChildren: visibleChildren
        .map((child) => ({ childId: child.id, childName: child.name, count: attentionByChild.get(child.id) ?? 0 }))
        .filter((item) => item.count > 0)
        .slice(0, 8),
      lowHydrationChildren: visibleChildren
        .map((child) => ({
          childId: child.id,
          childName: child.name,
          hydrationAvg: average(hydrationByChild.get(child.id) ?? []),
        }))
        .filter((item) => item.hydrationAvg > 0 && item.hydrationAvg < 300)
        .slice(0, 8),
      lowVegTrendChildren: [],
    },
    weeklyTrend: {
      balancedRate: 0,
      vegetableDays: 0,
      proteinDays: 0,
      stapleDays: 0,
      hydrationAvg: average(scope.scopedSnapshot.meals.map((item) => asNumber((item as AnyRecord).waterMl))),
      monotonyDays: 0,
    },
    smartInsights: [],
    notificationEvents: scope.scopedSnapshot.tasks as unknown as AdminAgentRequestPayload["notificationEvents"],
  };
}

export function buildWeeklyReportPayloadFromScope(
  source: WeeklyReportPayload,
  scope: SessionScope
): WeeklyReportPayload {
  const role = (source.role ?? (source.scopeType === "institution" ? "admin" : scope.user.role.includes("师") ? "teacher" : "parent")) as WeeklyReportRole;
  const periodLabel = asString((source.snapshot as unknown as AnyRecord).periodLabel, "Current period");
  const healthAbnormalCount = scope.scopedSnapshot.health.filter((item) => Boolean((item as AnyRecord).isAbnormal)).length;
  const growthAttention = scope.scopedSnapshot.growth.filter((item) => Boolean((item as AnyRecord).needsAttention));
  const snapshot: WeeklyReportSnapshot = {
    institutionName: scope.institutionId,
    periodLabel,
    role,
    overview: {
      visibleChildren: scope.visibleChildren.length,
      attendanceRate:
        scope.scopedSnapshot.attendance.length > 0
          ? scope.scopedSnapshot.attendance.filter((item) => Boolean((item as AnyRecord).isPresent)).length /
            scope.scopedSnapshot.attendance.length
          : 0,
      mealRecordCount: scope.scopedSnapshot.meals.length,
      healthAbnormalCount,
      growthAttentionCount: growthAttention.length,
      pendingReviewCount: growthAttention.filter((item) => asString((item as AnyRecord).reviewStatus).includes("待")).length,
      feedbackCount: scope.scopedSnapshot.feedback.length,
    },
    diet: {
      balancedRate: 0,
      hydrationAvg: average(scope.scopedSnapshot.meals.map((item) => asNumber((item as AnyRecord).waterMl))),
      monotonyDays: 0,
      vegetableDays: 0,
      proteinDays: 0,
    },
    topAttentionChildren: scope.visibleChildren.slice(0, 5).map((child) => ({
      childName: child.name,
      attentionCount: growthAttention.filter((item) => item.childId === child.id).length,
      hydrationAvg: average(byChildId(scope.scopedSnapshot.meals, child.id).map((item) => asNumber((item as AnyRecord).waterMl))),
      vegetableDays: 0,
    })),
    highlights: [
      `${scope.visibleChildren.length} visible children in current session scope.`,
      `${healthAbnormalCount} abnormal health records in current session scope.`,
    ],
    risks: growthAttention.slice(0, 5).map((item) => asString((item as AnyRecord).description)).filter(Boolean),
  };
  return {
    role,
    scopeType: source.scopeType,
    scopeId: source.scopeId,
    snapshot,
  };
}
