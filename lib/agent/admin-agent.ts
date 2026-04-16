import { buildFallbackWeeklyReport } from "@/lib/ai/fallback";
import type {
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionResponse,
  InstitutionSuggestionSnapshot,
  MemoryContextEnvelope,
  MemoryContextMeta,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";
import {
  type AdminAgentActionItem,
  type AdminAgentContext,
  type AdminAgentRequestPayload,
  type AdminAgentResult,
  type AdminDispatchEvent,
  type AdminHomeViewModel,
  type AdminRecommendedOwnerMapEntry,
  type InstitutionPriorityItem,
} from "@/lib/agent/admin-types";
import {
  sanitizeAdminWeeklyReportResponseForAdmin,
  sanitizeAdminWeeklyResult,
  sanitizeAdminWeeklyTexts,
} from "@/lib/agent/admin-weekly-sanitize";
import { buildInstitutionPriorityEngine } from "@/lib/agent/priority-engine";
import { getLocalToday, isDateWithinLastDays } from "@/lib/date";
import {
  buildContinuityNotes,
  createEmptyMemoryMeta,
  mergePromptMemoryContexts,
} from "@/lib/memory/prompt-context";

export const ADMIN_AGENT_QUICK_QUESTIONS = [
  "今天最该优先处理的 3 件事是什么？",
  "哪些儿童是当前重点风险？",
  "哪些班级的闭环最差？",
  "哪些家长反馈长期缺失？",
  "本周最应该整改什么？",
  "如果今天只能推动一件事，应该是什么？",
] as const;

type AdminQuestionFocus =
  | "priority"
  | "children"
  | "classes"
  | "feedback"
  | "weekly"
  | "one"
  | "general";

function takeUnique(items: string[], limit: number) {
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

  return createEmptyMemoryMeta({
    backend: normalized.map((item) => item.meta.backend).find(Boolean) ?? "unknown",
    degraded: normalized.some((item) => item.meta.degraded),
    usedSources: takeUnique(normalized.flatMap((item) => item.meta.usedSources), 8),
    matchedSnapshotIds: takeUnique(normalized.flatMap((item) => item.meta.matchedSnapshotIds), 8),
    matchedTraceIds: takeUnique(normalized.flatMap((item) => item.meta.matchedTraceIds), 8),
    errors: takeUnique(normalized.flatMap((item) => item.meta.errors), 6),
  });
}

function sortNotificationEvents(events: AdminDispatchEvent[]) {
  const statusRank = {
    pending: 0,
    in_progress: 1,
    completed: 2,
  } as const;

  return [...events].sort((left, right) => {
    const statusDiff = statusRank[left.status] - statusRank[right.status];
    if (statusDiff !== 0) return statusDiff;
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function isConsultationScopedNotificationEvent(event: AdminDispatchEvent) {
  return Boolean(
    event.source?.consultationId ||
    (event.source?.relatedConsultationIds?.length ?? 0) > 0
  );
}

function findEventForPriorityItem(item: InstitutionPriorityItem, events: AdminDispatchEvent[]) {
  return events.find(
    (event) =>
      (event.priorityItemId && event.priorityItemId === item.id) ||
      (!isConsultationScopedNotificationEvent(event) &&
        event.targetType === item.targetType &&
        event.targetId === item.targetId)
  );
}

function mapEventStatusToActionStatus(
  event?: AdminDispatchEvent
): AdminAgentActionItem["status"] {
  if (!event) return "suggested";
  if (event.status === "pending") return "created";
  if (event.status === "in_progress") return "in_progress";
  return "completed";
}

function buildActionItemSummary(item: InstitutionPriorityItem) {
  return `${item.recommendedOwner.label}在${item.recommendedDeadline}前执行：${item.recommendedAction}`;
}

function mapPriorityItemToActionItem(item: InstitutionPriorityItem, events: AdminDispatchEvent[]) {
  const event = findEventForPriorityItem(item, events);

  return {
    id: `action-${item.id}`,
    title: `${item.targetName}：${item.reason}`,
    targetType: item.targetType,
    targetId: item.targetId,
    targetName: item.targetName,
    priorityLevel: item.priorityLevel,
    ownerRole: item.recommendedOwner.role,
    ownerLabel: item.recommendedOwner.label,
    action: item.recommendedAction,
    deadline: item.recommendedDeadline,
    summary: buildActionItemSummary(item),
    dispatchPayload: item.dispatchPayload,
    status: mapEventStatusToActionStatus(event),
    relatedEventId: event?.id,
  } satisfies AdminAgentActionItem;
}

function buildRecommendedOwnerMap(actionItems: AdminAgentActionItem[]) {
  const map = actionItems.reduce<Map<string, AdminRecommendedOwnerMapEntry>>((acc, item) => {
    const key = `${item.ownerRole}:${item.ownerLabel}`;
    const current = acc.get(key);
    if (current) {
      current.count += 1;
      return acc;
    }

    acc.set(key, {
      ownerRole: item.ownerRole,
      ownerLabel: item.ownerLabel,
      count: 1,
    });
    return acc;
  }, new Map<string, AdminRecommendedOwnerMapEntry>());

  return Array.from(map.values()).sort((left, right) => right.count - left.count);
}

function inferQuestionFocus(question: string): AdminQuestionFocus {
  const normalized = question.trim();

  if (normalized.includes("只能推动一件") || normalized.includes("一件事")) {
    return "one";
  }
  if (normalized.includes("班级") || normalized.includes("闭环")) {
    return "classes";
  }
  if (normalized.includes("家长反馈") || normalized.includes("反馈长期缺失")) {
    return "feedback";
  }
  if (normalized.includes("儿童") || normalized.includes("孩子")) {
    return "children";
  }
  if (normalized.includes("本周") || normalized.includes("整改")) {
    return "weekly";
  }
  if (normalized.includes("优先") || normalized.includes("3 件") || normalized.includes("三件")) {
    return "priority";
  }

  return "general";
}

function buildFocusSelection(context: AdminAgentContext, focus: AdminQuestionFocus) {
  if (focus === "children") {
    const priorityTopItems = context.priorityTopItems.filter((item) => item.targetType === "child").slice(0, 5);
    const actionItems = context.actionItems.filter((item) => item.targetType === "child").slice(0, 4);

    return {
      title: "重点风险儿童",
      summary:
        priorityTopItems[0]
          ? `当前最值得优先跟进的儿童是 ${priorityTopItems[0].targetName}，原因是${priorityTopItems[0].reason}。`
          : "当前没有进入高优先级列表的重点儿童。",
      priorityTopItems,
      riskChildren: context.riskChildren.slice(0, 5),
      riskClasses: context.riskClasses.slice(0, 2),
      feedbackRiskItems: context.feedbackRiskItems.slice(0, 3),
      actionItems,
    };
  }

  if (focus === "classes") {
    const priorityTopItems = context.priorityTopItems.filter((item) => item.targetType === "class").slice(0, 4);
    const actionItems = context.actionItems
      .filter((item) => item.targetType === "class" || item.targetType === "issue")
      .slice(0, 4);

    return {
      title: "班级闭环风险",
      summary:
        context.riskClasses[0]
          ? `${context.riskClasses[0].className} 当前闭环压力最高，建议先补晨检与待复查闭环。`
          : "当前没有进入高优先级列表的班级问题。",
      priorityTopItems,
      riskChildren: context.riskChildren.slice(0, 3),
      riskClasses: context.riskClasses.slice(0, 4),
      feedbackRiskItems: context.feedbackRiskItems.slice(0, 2),
      actionItems,
    };
  }

  if (focus === "feedback") {
    const priorityTopItems = context.priorityTopItems.filter((item) => item.targetType === "family").slice(0, 5);
    const actionItems = context.actionItems.filter((item) => item.targetType === "family").slice(0, 4);

    return {
      title: "家长协同薄弱点",
      summary:
        context.feedbackRiskItems[0]
          ? `${context.feedbackRiskItems[0].childName} 家庭当前最需要补齐反馈，优先处理可以最快改善闭环完整度。`
          : "当前没有明显的家长反馈缺失风险。",
      priorityTopItems,
      riskChildren: context.riskChildren.slice(0, 3),
      riskClasses: context.riskClasses.slice(0, 2),
      feedbackRiskItems: context.feedbackRiskItems.slice(0, 5),
      actionItems,
    };
  }

  if (focus === "weekly") {
    return {
      title: "本周整改重点",
      summary:
        context.priorityTopItems[0]
          ? `本周最应该整改的是 ${context.priorityTopItems[0].targetName} 相关闭环，它同时影响机构风险与家园协同。`
          : "当前机构没有进入高优先级的整改事项。",
      priorityTopItems: context.priorityTopItems.slice(0, 5),
      riskChildren: context.riskChildren.slice(0, 4),
      riskClasses: context.riskClasses.slice(0, 4),
      feedbackRiskItems: context.feedbackRiskItems.slice(0, 4),
      actionItems: context.actionItems.slice(0, 4),
    };
  }

  if (focus === "one") {
    return {
      title: "今日唯一优先动作",
      summary:
        context.priorityTopItems[0]
          ? `如果今天只能推动一件事，先处理 ${context.priorityTopItems[0].targetName}。这是当前全园综合风险最高的对象。`
          : "当前没有进入高优先级的单项动作。",
      priorityTopItems: context.priorityTopItems.slice(0, 1),
      riskChildren: context.riskChildren.slice(0, 2),
      riskClasses: context.riskClasses.slice(0, 2),
      feedbackRiskItems: context.feedbackRiskItems.slice(0, 2),
      actionItems: context.actionItems.slice(0, 1),
    };
  }

  return {
    title: focus === "priority" ? "今日机构优先级" : "机构运营建议",
    summary:
      context.priorityTopItems[0]
        ? `今天最该优先推动的是 ${context.priorityTopItems[0].targetName}，建议从责任人与时限都最明确的动作开始。`
        : "当前没有进入高优先级列表的事项。",
    priorityTopItems: context.priorityTopItems.slice(0, 3),
    riskChildren: context.riskChildren.slice(0, 4),
    riskClasses: context.riskClasses.slice(0, 3),
    feedbackRiskItems: context.feedbackRiskItems.slice(0, 3),
    actionItems: context.actionItems.slice(0, 4),
  };
}

function buildInstitutionScope(payload: AdminAgentRequestPayload, notificationEvents: AdminDispatchEvent[]) {
  const today = getLocalToday();
  const visibleChildIds = new Set(payload.visibleChildren.map((child) => child.id));
  const parentLinkedChildren = payload.visibleChildren.filter((child) => Boolean(child.parentUserId));
  const todayAttendanceRecords = payload.attendanceRecords.filter(
    (record) => visibleChildIds.has(record.childId) && record.date === today
  );

  const attendanceRecords = payload.attendanceRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const presentCount = attendanceRecords.filter((record) => record.isPresent).length;
  const todayPresentCount = todayAttendanceRecords.filter((record) => record.isPresent).length;
  const healthRecords = payload.healthCheckRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const growthRecords = payload.growthRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.createdAt, 7, today)
  );
  const feedbackRecords = payload.guardianFeedbacks.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const feedbackChildIds = new Set(feedbackRecords.map((record) => record.childId));
  const feedbackCompletionRate =
    parentLinkedChildren.length > 0
      ? Math.min(100, Math.round((feedbackChildIds.size / parentLinkedChildren.length) * 100))
      : 100;

  return {
    institutionName:
      payload.currentUser.institutionName ||
      payload.currentUser.institutionId ||
      payload.currentUser.name ||
      payload.currentUser.role ||
      "当前机构",
    date: today,
    visibleChildren: payload.visibleChildren.length,
    classCount: new Set(payload.visibleChildren.map((child) => child.className)).size,
    todayPresentCount,
    todayAttendanceRate:
      payload.visibleChildren.length > 0
        ? Math.round((todayPresentCount / payload.visibleChildren.length) * 100)
        : 0,
    attendanceRate: attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : 0,
    healthAbnormalCount: healthRecords.filter((record) => record.isAbnormal).length,
    growthAttentionCount: growthRecords.filter((record) => record.needsAttention).length,
    pendingReviewCount: growthRecords.filter((record) => record.reviewStatus === "待复查").length,
    feedbackCount: feedbackRecords.length,
    feedbackCompletionRate,
    riskChildrenCount: 0,
    riskClassCount: 0,
    pendingDispatchCount: notificationEvents.filter((event) => event.status !== "completed").length,
  };
}

function buildSuggestionSnapshot(
  context: Omit<AdminAgentContext, "suggestionSnapshot">
): InstitutionSuggestionSnapshot {
  return {
    institutionName: context.institutionScope.institutionName,
    sevenDayOverview: {
      visibleChildren: context.institutionScope.visibleChildren,
      classCount: context.institutionScope.classCount,
      attendanceRate: context.institutionScope.attendanceRate,
      healthAbnormalCount: context.institutionScope.healthAbnormalCount,
      growthAttentionCount: context.institutionScope.growthAttentionCount,
      pendingReviewCount: context.institutionScope.pendingReviewCount,
      feedbackCount: context.institutionScope.feedbackCount,
      feedbackCompletionRate: context.institutionScope.feedbackCompletionRate,
      pendingDispatchCount: context.institutionScope.pendingDispatchCount,
    },
    priorityTopItems: context.priorityTopItems.map((item) => ({
      targetType: item.targetType,
      targetId: item.targetId,
      targetName: item.targetName,
      priorityLevel: item.priorityLevel,
      priorityScore: item.priorityScore,
      reason: item.reason,
      evidence: item.evidence.map((entry) => `${entry.label}：${entry.value}`),
      recommendedOwnerRole: item.recommendedOwner.role,
      recommendedOwnerName: item.recommendedOwner.label,
      recommendedAction: item.recommendedAction,
      recommendedDeadline: item.recommendedDeadline,
    })),
    riskChildren: context.riskChildren.map((item) => ({
      childId: item.childId,
      childName: item.childName,
      className: item.className,
      priorityLevel: item.priorityLevel,
      priorityScore: item.priorityScore,
      reason: item.reason,
    })),
    riskClasses: context.riskClasses.map((item) => ({
      className: item.className,
      priorityLevel: item.priorityLevel,
      priorityScore: item.priorityScore,
      reason: item.reason,
    })),
    feedbackRiskItems: context.feedbackRiskItems.map((item) => ({
      childId: item.childId,
      childName: item.childName,
      className: item.className,
      priorityLevel: item.priorityLevel,
      reason: item.reason,
      lastFeedbackDate: item.lastFeedbackDate,
    })),
    pendingDispatches: context.notificationEvents
      .filter((event) => event.status !== "completed")
      .slice(0, 6)
      .map((event) => ({
        id: event.id,
        title: event.title,
        status: event.status,
        priorityLevel: event.priorityLevel,
        recommendedOwnerName: event.recommendedOwnerName,
        recommendedDeadline: event.recommendedDeadline,
      })),
    weeklyHighlights: context.weeklyHighlights,
    ruleFallback: context.priorityTopItems.slice(0, 5).map((item) => ({
      title: `${item.targetName} 需要优先关注`,
      description: item.reason,
      level: item.priorityLevel === "P1" ? "warning" : item.priorityLevel === "P2" ? "info" : "success",
      tags: [item.targetType, item.recommendedOwner.role],
    })),
  };
}

function buildWeeklyPreview(
  payload: AdminAgentRequestPayload,
  context: AdminAgentContext
) {
  return buildFallbackWeeklyReport(buildAdminWeeklyReportSnapshot(payload, context), "admin");
}

export function buildAdminAgentContext(payload: AdminAgentRequestPayload): AdminAgentContext {
  const notificationEvents = sortNotificationEvents(payload.notificationEvents ?? []);
  const institutionScope = buildInstitutionScope(payload, notificationEvents);
  const priorityEngine = buildInstitutionPriorityEngine({
    institutionName: institutionScope.institutionName,
    workflow: payload.workflow,
    visibleChildren: payload.visibleChildren,
    attendanceRecords: payload.attendanceRecords,
    healthCheckRecords: payload.healthCheckRecords,
    growthRecords: payload.growthRecords,
    guardianFeedbacks: payload.guardianFeedbacks,
    mealRecords: payload.mealRecords,
    notificationEvents,
    today: institutionScope.date,
  });

  institutionScope.riskChildrenCount = priorityEngine.childItems.length;
  institutionScope.riskClassCount = priorityEngine.classItems.length;

  const priorityTopItems = priorityEngine.priorityItems.slice(0, 6);
  const riskChildren = priorityEngine.childItems.slice(0, 5).map((item) => ({
    childId: item.targetId,
    childName: item.targetName,
    className: item.relatedClassNames[0] ?? "未分班",
    priorityLevel: item.priorityLevel,
    priorityScore: item.priorityScore,
    reason: item.reason,
    ownerLabel: item.recommendedOwner.label,
    deadline: item.recommendedDeadline,
  }));
  const riskClasses = priorityEngine.classItems.slice(0, 4).map((item) => ({
    className: item.targetName,
    priorityLevel: item.priorityLevel,
    priorityScore: item.priorityScore,
    reason: item.reason,
    issueCount: item.relatedChildIds.length,
    ownerLabel: item.recommendedOwner.label,
    deadline: item.recommendedDeadline,
  }));
  const feedbackRiskItems = priorityEngine.familyItems.slice(0, 5).map((item) => ({
    childId: item.targetId,
    childName: item.targetName.replace(/家长$/, ""),
    className: item.relatedClassNames[0] ?? "未分班",
    priorityLevel: item.priorityLevel,
    reason: item.reason,
    lastFeedbackDate:
      payload.guardianFeedbacks
        .filter((record) => record.childId === item.targetId)
        .sort((left, right) => right.date.localeCompare(left.date))[0]?.date,
    recommendedOwner: item.recommendedOwner.label,
  }));
  const weeklyHighlights = takeUnique(
    [
      ...payload.smartInsights.map((item) => item.title),
      ...priorityTopItems.map((item) => `${item.targetName}：${item.reason}`),
    ],
    4
  );
  const pendingItems = takeUnique(
    [
      ...priorityEngine.issueItems.slice(0, 3).map((item) => `${item.targetName}：${item.reason}`),
      notificationEvents.filter((event) => event.status !== "completed").length > 0
        ? `当前还有 ${notificationEvents.filter((event) => event.status !== "completed").length} 条派单待推进`
        : "",
      institutionScope.feedbackCompletionRate < 80
        ? `家长反馈完成率为 ${institutionScope.feedbackCompletionRate}%`
        : "",
    ],
    4
  );
  const highlights = takeUnique(
    [
      priorityTopItems[0] ? `最高优先级是 ${priorityTopItems[0].targetName}，原因是${priorityTopItems[0].reason}` : "",
      priorityTopItems[1] ? `第二优先级是 ${priorityTopItems[1].targetName}` : "",
      institutionScope.feedbackCompletionRate < 80
        ? `家长反馈完成率偏低，仅 ${institutionScope.feedbackCompletionRate}%`
        : `家长反馈完成率达到 ${institutionScope.feedbackCompletionRate}%`,
      notificationEvents.filter((event) => event.status === "in_progress").length > 0
        ? `${notificationEvents.filter((event) => event.status === "in_progress").length} 条动作已进入处理中`
        : "",
      ...payload.smartInsights
        .filter((item) => item.level === "warning")
        .map((item) => item.title),
    ],
    5
  );
  const actionItems = priorityTopItems.slice(0, 4).map((item) => mapPriorityItemToActionItem(item, notificationEvents));
  const recommendedOwnerMap = buildRecommendedOwnerMap(actionItems);
  const generatedAt = new Date().toISOString();

  const contextWithoutSnapshot = {
    institutionScope,
    priorityTopItems,
    riskChildren,
    riskClasses,
    feedbackRiskItems,
    highlights,
    weeklyHighlights,
    actionItems,
    recommendedOwnerMap,
    notificationEvents,
    pendingItems,
    quickQuestions: [...ADMIN_AGENT_QUICK_QUESTIONS],
    source: "rule" as const,
    generatedAt,
  };

  return {
    ...contextWithoutSnapshot,
    suggestionSnapshot: buildSuggestionSnapshot(contextWithoutSnapshot),
  };
}

export function buildAdminWeeklyReportSnapshot(
  payload: AdminAgentRequestPayload,
  context: AdminAgentContext
): WeeklyReportSnapshot {
  const today = getLocalToday();
  const visibleChildIds = new Set(payload.visibleChildren.map((child) => child.id));
  const mealRecordCount = payload.mealRecords.filter(
    (record) => visibleChildIds.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  ).length;
  const hydrationMap = new Map(
    payload.adminBoardData.lowHydrationChildren.map((item) => [item.childId, item.hydrationAvg] as const)
  );
  const vegetableMap = new Map(
    payload.adminBoardData.lowVegTrendChildren.map((item) => [item.childId, item.vegetableDays] as const)
  );

  return {
    institutionName: context.institutionScope.institutionName,
    periodLabel: "近 7 天",
    role: "机构管理员",
    overview: {
      visibleChildren: context.institutionScope.visibleChildren,
      attendanceRate: context.institutionScope.attendanceRate,
      mealRecordCount,
      healthAbnormalCount: context.institutionScope.healthAbnormalCount,
      growthAttentionCount: context.institutionScope.growthAttentionCount,
      pendingReviewCount: context.institutionScope.pendingReviewCount,
      feedbackCount: context.institutionScope.feedbackCount,
    },
    diet: {
      balancedRate: payload.weeklyTrend.balancedRate,
      hydrationAvg: payload.weeklyTrend.hydrationAvg,
      monotonyDays: payload.weeklyTrend.monotonyDays,
      vegetableDays: payload.weeklyTrend.vegetableDays,
      proteinDays: payload.weeklyTrend.proteinDays,
    },
    topAttentionChildren: payload.adminBoardData.highAttentionChildren.slice(0, 5).map((item) => ({
      childName: item.childName,
      attentionCount: item.count,
      hydrationAvg: hydrationMap.get(item.childId) ?? 0,
      vegetableDays: vegetableMap.get(item.childId) ?? 0,
    })),
    highlights: context.highlights,
    risks: takeUnique(
      [
        ...context.priorityTopItems.map((item) => `${item.targetName}：${item.reason}`),
        ...context.feedbackRiskItems.map((item) => `${item.childName} 家长反馈链路偏弱`),
      ],
      4
    ),
  };
}

export function buildAdminQuestionFollowUpPayload(params: {
  context: AdminAgentContext;
  question: string;
  history?: AiFollowUpPayload["history"];
}): AiFollowUpPayload {
  return {
    scope: "institution",
    snapshot: params.context.suggestionSnapshot,
    suggestionTitle:
      params.context.priorityTopItems[0]
        ? `机构优先事项：${params.context.priorityTopItems[0].targetName}`
        : `${params.context.institutionScope.institutionName} 今日优先事项`,
    suggestionDescription: params.context.highlights[0] ?? params.context.pendingItems[0] ?? "请基于机构级数据继续分析。",
    question: params.question,
    history: params.history,
    institutionContext: {
      priorityTopItems: params.context.suggestionSnapshot.priorityTopItems,
      pendingDispatches: params.context.suggestionSnapshot.pendingDispatches,
      weeklyHighlights: params.context.weeklyHighlights,
    },
  };
}

export function buildAdminHomeViewModel(payload: AdminAgentRequestPayload): AdminHomeViewModel {
  const context = buildAdminAgentContext(payload);
  const weeklyPreview = buildWeeklyPreview(payload, context);
  const pendingDispatches = context.notificationEvents.filter((event) => event.status !== "completed").slice(0, 4);

  return {
    riskChildrenCount: context.institutionScope.riskChildrenCount,
    feedbackCompletionRate: context.institutionScope.feedbackCompletionRate,
    pendingItems: context.pendingItems,
    weeklySummary: weeklyPreview.summary,
    weeklyHighlights: takeUnique([...weeklyPreview.highlights, ...context.weeklyHighlights], 4),
    heroStats: [
      {
        label: "今日实到",
        value: `${context.institutionScope.todayPresentCount}/${context.institutionScope.visibleChildren}`,
      },
      { label: "今日高优先级事项", value: `${context.priorityTopItems.slice(0, 3).length}` },
      { label: "重点风险儿童", value: `${context.riskChildren.length}` },
      { label: "待推进派单", value: `${pendingDispatches.length}` },
    ],
    priorityTopItems: context.priorityTopItems.slice(0, 3),
    riskChildren: context.riskChildren.slice(0, 4),
    riskClasses: context.riskClasses.slice(0, 3),
    pendingDispatches,
    actionEntrySummary:
      context.priorityTopItems[0]
        ? `建议园长先推动 ${context.priorityTopItems[0].targetName}，并同步责任人与截止时间。`
        : "当前没有进入高优先级列表的事项。",
    adminContext: context,
  };
}

export function buildAdminDailyPriorityResult(params: {
  context: AdminAgentContext;
  suggestion: AiSuggestionResponse;
}): AdminAgentResult {
  return {
    title: "今日机构优先事项",
    summary: params.suggestion.summary || params.context.highlights[0] || "已完成今日机构优先级判断。",
    assistantAnswer:
      params.suggestion.actions[0]
        ? `${params.suggestion.summary} 当前最值得先推动的动作是：${params.suggestion.actions[0]}`
        : params.suggestion.summary,
    institutionScope: params.context.institutionScope,
    priorityTopItems: params.context.priorityTopItems.slice(0, 3),
    riskChildren: params.context.riskChildren.slice(0, 5),
    riskClasses: params.context.riskClasses.slice(0, 4),
    feedbackRiskItems: params.context.feedbackRiskItems.slice(0, 4),
    highlights: takeUnique(
      [...params.suggestion.highlights, ...params.suggestion.concerns, ...params.context.highlights],
      5
    ),
    actionItems: params.context.actionItems.slice(0, 4),
    recommendedOwnerMap: params.context.recommendedOwnerMap,
    quickQuestions: params.context.quickQuestions,
    notificationEvents: params.context.notificationEvents.slice(0, 6),
    source: params.suggestion.source,
    model: params.suggestion.model,
    generatedAt: new Date().toISOString(),
  };
}

export function buildAdminFollowUpResult(params: {
  context: AdminAgentContext;
  question: string;
  response: AiFollowUpResponse;
}): AdminAgentResult {
  const focus = inferQuestionFocus(params.question);
  const selection = buildFocusSelection(params.context, focus);
  const recommendedOwnerMap = buildRecommendedOwnerMap(selection.actionItems);

  return {
    title: selection.title,
    summary: selection.summary,
    assistantAnswer: params.response.answer,
    institutionScope: params.context.institutionScope,
    priorityTopItems: selection.priorityTopItems,
    riskChildren: selection.riskChildren,
    riskClasses: selection.riskClasses,
    feedbackRiskItems: selection.feedbackRiskItems,
    highlights: takeUnique(
      [...params.response.keyPoints, ...params.response.nextSteps, ...params.context.highlights],
      5
    ),
    actionItems: selection.actionItems,
    recommendedOwnerMap,
    quickQuestions: params.context.quickQuestions,
    notificationEvents: params.context.notificationEvents.slice(0, 6),
    source: params.response.source,
    model: params.response.model,
    generatedAt: new Date().toISOString(),
  };
}

export function buildAdminWeeklyReportResult(params: {
  context: AdminAgentContext;
  report: WeeklyReportResponse;
}): AdminAgentResult {
  const report = sanitizeAdminWeeklyReportResponseForAdmin(params.report);
  const actionItems = params.context.actionItems.slice(0, Math.max(3, report.nextWeekActions.length)).map(
    (item, index) =>
      report.nextWeekActions[index]
        ? {
            ...item,
            action: report.nextWeekActions[index],
            summary: `${item.ownerLabel}在${item.deadline}前推进：${report.nextWeekActions[index]}`,
          }
        : item
  );

  return sanitizeAdminWeeklyResult({
    title: "本周机构运营周报",
    summary: report.summary,
    assistantAnswer:
      report.nextWeekActions[0]
        ? `${report.summary} 下周最值得先推动的动作是：${report.nextWeekActions[0]}`
        : report.summary,
    institutionScope: params.context.institutionScope,
    priorityTopItems: params.context.priorityTopItems.slice(0, 5),
    riskChildren: params.context.riskChildren.slice(0, 5),
    riskClasses: params.context.riskClasses.slice(0, 4),
    feedbackRiskItems: params.context.feedbackRiskItems.slice(0, 4),
    highlights: takeUnique(
      [...report.highlights, ...report.risks, ...params.context.highlights],
      5
    ),
    actionItems,
    recommendedOwnerMap: buildRecommendedOwnerMap(actionItems),
    quickQuestions: params.context.quickQuestions,
    notificationEvents: params.context.notificationEvents.slice(0, 6),
    continuityNotes: report.continuityNotes,
    source: report.source,
    model: report.model,
    generatedAt: new Date().toISOString(),
  });
}

export function buildAdminWeeklyReportSnapshotWithMemory(
  payload: AdminAgentRequestPayload,
  context: AdminAgentContext,
  memoryContexts: Array<MemoryContextEnvelope | null | undefined> = []
): WeeklyReportSnapshot {
  const snapshot = buildAdminWeeklyReportSnapshot(payload, context);
  const promptMemoryContext = mergePromptMemoryContexts(memoryContexts.map((item) => item?.promptContext));
  const sanitizedMemoryContext = {
    ...promptMemoryContext,
    longTermTraits: sanitizeAdminWeeklyTexts(promptMemoryContext.longTermTraits, 4),
    recentContinuitySignals: sanitizeAdminWeeklyTexts(promptMemoryContext.recentContinuitySignals, 4),
    lastConsultationTakeaways: sanitizeAdminWeeklyTexts(promptMemoryContext.lastConsultationTakeaways, 4),
    openLoops: sanitizeAdminWeeklyTexts(promptMemoryContext.openLoops, 4),
  };
  const continuityNotes = sanitizeAdminWeeklyTexts(
    buildContinuityNotes(context.institutionScope.institutionName, sanitizedMemoryContext),
    4
  );

  return {
    ...snapshot,
    highlights: takeUnique([...snapshot.highlights, ...continuityNotes.slice(0, 2)], 5),
    risks: takeUnique([...snapshot.risks, ...sanitizedMemoryContext.openLoops.slice(0, 2)], 4),
    memoryContext: sanitizedMemoryContext,
    continuityNotes,
  };
}

export function buildAdminWeeklyReportResultWithMemory(params: {
  context: AdminAgentContext;
  report: WeeklyReportResponse;
  memoryContexts?: Array<MemoryContextEnvelope | null | undefined>;
}): AdminAgentResult {
  const result = buildAdminWeeklyReportResult({
    context: params.context,
    report: params.report,
  });
  const promptMemoryContext = mergePromptMemoryContexts((params.memoryContexts ?? []).map((item) => item?.promptContext));
  const memoryContinuityNotes = sanitizeAdminWeeklyTexts(
    buildContinuityNotes(params.context.institutionScope.institutionName, {
      ...promptMemoryContext,
      longTermTraits: sanitizeAdminWeeklyTexts(promptMemoryContext.longTermTraits, 4),
      recentContinuitySignals: sanitizeAdminWeeklyTexts(promptMemoryContext.recentContinuitySignals, 4),
      lastConsultationTakeaways: sanitizeAdminWeeklyTexts(promptMemoryContext.lastConsultationTakeaways, 4),
      openLoops: sanitizeAdminWeeklyTexts(promptMemoryContext.openLoops, 4),
    }),
    4
  );
  const continuityNotes = takeUnique([...(result.continuityNotes ?? []), ...memoryContinuityNotes], 4);
  const memoryMeta = mergeMemoryMeta(params.memoryContexts ?? []);

  return sanitizeAdminWeeklyResult({
    ...result,
    continuityNotes,
    memoryMeta,
  });
}

export function attachNotificationEventToResult(
  result: AdminAgentResult,
  event: AdminDispatchEvent
): AdminAgentResult {
  const nextActionItems = result.actionItems.map((item) =>
    item.dispatchPayload.priorityItemId === event.priorityItemId ||
    (!isConsultationScopedNotificationEvent(event) &&
      item.targetType === event.targetType &&
      item.targetId === event.targetId)
      ? {
          ...item,
          status: mapEventStatusToActionStatus(event),
          relatedEventId: event.id,
        }
      : item
  );
  const notificationEvents = sortNotificationEvents(
    [event, ...result.notificationEvents.filter((item) => item.id !== event.id)]
  );

  return {
    ...result,
    actionItems: nextActionItems,
    notificationEvents,
    recommendedOwnerMap: buildRecommendedOwnerMap(nextActionItems),
  };
}

export function attachNotificationEventsToResult(
  result: AdminAgentResult,
  events: AdminDispatchEvent[]
): AdminAgentResult {
  return sortNotificationEvents(events).reduce(
    (nextResult, event) => attachNotificationEventToResult(nextResult, event),
    result
  );
}
