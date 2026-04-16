"use client";

import {
  buildAdminHomeViewModel as buildStructuredAdminHomeViewModel,
} from "@/lib/agent/admin-agent";
import type { AdminDispatchEvent } from "@/lib/agent/admin-types";
import { buildFallbackWeeklyReport } from "@/lib/ai/fallback";
import { getWeeklyTaskForChild } from "@/lib/mock/coparenting";
import type {
  AdminBoardData,
  AttendanceRecord,
  Child,
  GrowthRecord,
  GuardianFeedback,
  HealthCheckRecord,
  MealRecord,
  ParentFeed,
  ParentMediaItem,
  SmartInsight,
  WeeklyDietTrend,
} from "@/lib/store";
import { getAgeBandFromBirthDate } from "@/lib/store";
import { getLocalToday, isDateWithinLastDays } from "@/lib/date";
import { getHydrationDisplayState } from "@/lib/hydration-display";

export type ParentHomeViewModel = {
  child: Child;
  todaySummary: Array<{ label: string; value: string; tone: "info" | "success" | "warning" }>;
  aiReminder: SmartInsight;
  tonightTask: {
    title: string;
    description: string;
    durationText: string;
    tag: string;
  };
  pendingFeedback: {
    title: string;
    description: string;
    status: "pending" | "submitted";
  };
  weeklyTrend: Array<{ label: string; value: string }>;
  interventionPreview: {
    title: string;
    description: string;
  };
  growthTimeline: Array<{
    id: string;
    recordedAt: string;
    category: string;
    description: string;
    tags: string[];
    needsAttention: boolean;
  }>;
  mediaGallery: ParentMediaItem[];
};

export type TeacherHomeViewModel = {
  todayAbnormalChildren: Array<{ child: Child; record: HealthCheckRecord }>;
  uncheckedMorningChecks: Child[];
  pendingReviews: Array<{ child: Child; record: GrowthRecord }>;
  parentsToCommunicate: Array<{ child: Child; reason: string }>;
  heroStats: Array<{ label: string; value: string }>;
  communicationPreview: string;
};

export type AdminHomeViewModel = {
  riskChildrenCount: number;
  weeklySummary: string;
  feedbackCompletionRate: number;
  pendingItems: string[];
  weeklyHighlights: string[];
  heroStats: Array<{ label: string; value: string }>;
  priorityTopItems?: Array<{ targetName: string; priorityLevel: string; reason: string; recommendedDeadline: string }>;
  riskChildren?: Array<{ childName: string; reason: string }>;
  riskClasses?: Array<{ className: string; reason: string }>;
  pendingDispatches?: Array<{ title: string; status: string; recommendedDeadline: string }>;
  actionEntrySummary?: string;
  adminContext?: unknown;
};

export type AdminAgentContext = {
  institutionName: string;
  riskSummary: string[];
  feedbackCompletionRate: number;
  pendingItems: string[];
  weeklyHighlights: string[];
  priorityTopItems?: Array<{ targetName: string; reason: string; recommendedDeadline: string }>;
  actionItems?: Array<{ ownerLabel: string; action: string }>;
  raw?: unknown;
};

export type AgentReply = {
  answer: string;
  keyPoints: string[];
  nextSteps: string[];
};

export function buildParentHomeViewModel(feed?: ParentFeed | null): ParentHomeViewModel | null {
  if (!feed) return null;

  const ageBand = getAgeBandFromBirthDate(feed.child.birthDate);
  const task = getWeeklyTaskForChild(feed.child.id, ageBand);
  const hydrationDisplay = getHydrationDisplayState(feed.weeklyTrend.hydrationAvg);
  const aiReminder =
    feed.suggestions.find((item) => item.level === "warning") ??
    feed.suggestions[0] ?? {
      id: "parent-fallback-insight",
      title: "今日状态整体稳定",
      description: "继续保持规律饮水、睡前安抚和今晚反馈即可。",
      level: "info",
      tags: ["日常提醒"],
    };

  const pendingFeedback =
    !feed.hasFeedbackToday
      ? {
          title: "今晚反馈待提交",
          description: "离园后补充今晚在家状态，帮助老师判断建议是否有效。",
          status: "pending" as const,
        }
      : {
          title: "今日反馈已同步",
          description: `最近一次状态：${feed.feedbacks[0]?.status ?? "已提交"}，仍可继续补充细节。`,
          status: "submitted" as const,
        };

  const attentionCount = feed.suggestions.filter((item) => item.level === "warning").length;
  const interventionPreview =
    feed.suggestions[1] ??
    aiReminder;

  return {
    child: feed.child,
    todaySummary: [
      { label: "今日饮食记录", value: `${feed.todayMeals.length} 条`, tone: "info" },
      { label: "今日成长观察", value: `${feed.todayGrowth.length} 条`, tone: "success" },
      { label: "近 7 天补水状态", value: hydrationDisplay.statusLabel, tone: hydrationDisplay.tone },
      { label: "当前关注项", value: `${attentionCount} 项`, tone: attentionCount > 0 ? "warning" : "success" },
    ],
    aiReminder,
    tonightTask: {
      title: task.title,
      description: task.description,
      durationText: task.durationText,
      tag: task.tag,
    },
    pendingFeedback,
    weeklyTrend: [
      { label: "膳食均衡率", value: `${feed.weeklyTrend.balancedRate}%` },
      { label: "蔬菜摄入天数", value: `${feed.weeklyTrend.vegetableDays} 天` },
      { label: "蛋白摄入天数", value: `${feed.weeklyTrend.proteinDays} 天` },
      { label: "补水主动性", value: hydrationDisplay.initiativeLabel },
    ],
    interventionPreview: {
      title: interventionPreview.title,
      description: interventionPreview.description,
    },
    growthTimeline: feed.weeklyGrowth
      .slice(0, 4)
      .map((record) => ({
        id: record.id,
        recordedAt: record.createdAt,
        category: record.category,
        description: record.description,
        tags: record.tags,
        needsAttention: record.needsAttention,
      })),
    mediaGallery: feed.mediaGallery,
  };
}

export function buildTeacherHomeViewModel(params: {
  visibleChildren: Child[];
  presentChildren: Child[];
  healthCheckRecords: HealthCheckRecord[];
  growthRecords: GrowthRecord[];
  guardianFeedbacks: GuardianFeedback[];
}): TeacherHomeViewModel {
  const today = getLocalToday();
  const childMap = new Map(params.visibleChildren.map((child) => [child.id, child] as const));

  const todayHealthChecks = params.healthCheckRecords.filter(
    (record) => record.date === today && childMap.has(record.childId)
  );

  const abnormalByChild = new Map<string, HealthCheckRecord>();
  todayHealthChecks
    .filter((record) => record.isAbnormal)
    .forEach((record) => {
      if (!abnormalByChild.has(record.childId)) {
        abnormalByChild.set(record.childId, record);
      }
    });

  const todayAbnormalChildren = Array.from(abnormalByChild.values())
    .map((record) => ({
      child: childMap.get(record.childId)!,
      record,
    }))
    .slice(0, 5);

  const uncheckedMorningChecks = params.presentChildren.filter(
    (child) => !todayHealthChecks.some((record) => record.childId === child.id)
  );

  const pendingReviewRecords = params.growthRecords
    .filter(
      (record) =>
        childMap.has(record.childId) &&
        record.reviewStatus === "待复查"
    )
    .sort((left, right) => (left.reviewDate ?? "9999-12-31").localeCompare(right.reviewDate ?? "9999-12-31"));

  const pendingReviewByChild = new Map<string, GrowthRecord>();
  pendingReviewRecords.forEach((record) => {
    if (!pendingReviewByChild.has(record.childId)) {
      pendingReviewByChild.set(record.childId, record);
    }
  });

  const pendingReviews = Array.from(pendingReviewByChild.values())
    .slice(0, 5)
    .map((record) => ({
      child: childMap.get(record.childId)!,
      record,
    }));

  const exposedChildIds = new Set([
    ...todayAbnormalChildren.map((item) => item.child.id),
    ...pendingReviews.map((item) => item.child.id),
  ]);

  const parentsToCommunicate = params.visibleChildren
    .filter((child) => !exposedChildIds.has(child.id))
    .map((child) => {
      const abnormalRecord = todayAbnormalChildren.find((item) => item.child.id === child.id);
      const pendingReview = pendingReviews.find((item) => item.child.id === child.id);
      const hasFeedbackToday = params.guardianFeedbacks.some(
        (item) => item.childId === child.id && item.date === today
      );

      if (abnormalRecord) {
        return { child, reason: `晨检异常：${abnormalRecord.record.mood} / ${abnormalRecord.record.handMouthEye}` };
      }
      if (pendingReview) {
        return { child, reason: "有待复查观察项，建议同步家长后续配合方式" };
      }
      if (!hasFeedbackToday) {
        return { child, reason: "今日尚未收到家长反馈，可提醒晚间补充情况" };
      }
      return null;
    })
    .filter((item): item is { child: Child; reason: string } => Boolean(item))
    .slice(0, 5);

  return {
    todayAbnormalChildren,
    uncheckedMorningChecks,
    pendingReviews,
    parentsToCommunicate,
    heroStats: [
      { label: "今日异常儿童", value: `${todayAbnormalChildren.length}` },
      { label: "未完成晨检", value: `${uncheckedMorningChecks.length}` },
      { label: "待复查名单", value: `${pendingReviews.length}` },
      { label: "待沟通家长", value: `${parentsToCommunicate.length}` },
    ],
    communicationPreview:
      todayAbnormalChildren.length > 0
        ? `优先沟通 ${todayAbnormalChildren[0].child.name} 的晨检情况，并同步园内观察与今晚家庭观察重点。`
        : "优先提醒待复查儿童家长补充今晚反馈，确保明日跟进建议更具体。",
  };
}

export function buildAdminHomeViewModel(params: {
  institutionName: string;
  visibleChildren: Child[];
  attendanceRecords: AttendanceRecord[];
  healthCheckRecords: HealthCheckRecord[];
  growthRecords: GrowthRecord[];
  guardianFeedbacks: GuardianFeedback[];
  mealRecords?: MealRecord[];
  adminBoardData: AdminBoardData;
  weeklyTrend: WeeklyDietTrend;
  smartInsights: SmartInsight[];
  notificationEvents?: AdminDispatchEvent[];
}): AdminHomeViewModel {
  const nextHome = buildStructuredAdminHomeViewModel({
    workflow: "daily-priority",
    currentUser: {
      name: params.institutionName,
      institutionName: params.institutionName,
      role: "机构管理员",
    },
    visibleChildren: params.visibleChildren,
    attendanceRecords: params.attendanceRecords,
    healthCheckRecords: params.healthCheckRecords,
    growthRecords: params.growthRecords,
    guardianFeedbacks: params.guardianFeedbacks,
    mealRecords: params.mealRecords ?? [],
    adminBoardData: params.adminBoardData,
    weeklyTrend: params.weeklyTrend,
    smartInsights: params.smartInsights,
    notificationEvents: params.notificationEvents ?? [],
  });

  return {
    riskChildrenCount: nextHome.riskChildrenCount,
    weeklySummary: nextHome.weeklySummary,
    feedbackCompletionRate: nextHome.feedbackCompletionRate,
    pendingItems: nextHome.pendingItems,
    weeklyHighlights: nextHome.weeklyHighlights,
    heroStats: nextHome.heroStats,
    priorityTopItems: nextHome.priorityTopItems.map((item) => ({
      targetName: item.targetName,
      priorityLevel: item.priorityLevel,
      reason: item.reason,
      recommendedDeadline: item.recommendedDeadline,
    })),
    riskChildren: nextHome.riskChildren.map((item) => ({
      childName: item.childName,
      reason: item.reason,
    })),
    riskClasses: nextHome.riskClasses.map((item) => ({
      className: item.className,
      reason: item.reason,
    })),
    pendingDispatches: nextHome.pendingDispatches.map((item) => ({
      title: item.title,
      status: item.status,
      recommendedDeadline: item.recommendedDeadline,
    })),
    actionEntrySummary: nextHome.actionEntrySummary,
    adminContext: nextHome.adminContext,
  };

  const today = getLocalToday();
  const childMap = new Map(params.visibleChildren.map((child) => [child.id, child] as const));

  const parentLinkedChildren = params.visibleChildren.filter((child) => Boolean(child.parentUserId));
  const parentLinkedChildIds = new Set(parentLinkedChildren.map((child) => child.id));
  const feedbackChildren = new Set(
    params.guardianFeedbacks
      .filter(
        (record) =>
          record.date === today && childMap.has(record.childId) && parentLinkedChildIds.has(record.childId)
      )
      .map((record) => record.childId)
  );

  const feedbackCompletionRate =
    parentLinkedChildren.length > 0
      ? Math.min(100, Math.round((feedbackChildren.size / parentLinkedChildren.length) * 100))
      : 0;

  const riskChildIds = new Set<string>();
  params.adminBoardData.highAttentionChildren.forEach((item) => riskChildIds.add(item.childId));
  params.adminBoardData.lowHydrationChildren
    .filter((item) => item.hydrationAvg < 140)
    .forEach((item) => riskChildIds.add(item.childId));
  params.adminBoardData.lowVegTrendChildren
    .filter((item) => item.vegetableDays < 3)
    .forEach((item) => riskChildIds.add(item.childId));

  const weekAttendance = params.attendanceRecords.filter(
    (record) => childMap.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const weekPresent = weekAttendance.filter((record) => record.isPresent).length;
  const weekHealth = params.healthCheckRecords.filter(
    (record) => childMap.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );
  const weekGrowth = params.growthRecords.filter(
    (record) =>
      childMap.has(record.childId) &&
      isDateWithinLastDays(record.createdAt.split(" ")[0], 7, today)
  );
  const weekFeedback = params.guardianFeedbacks.filter(
    (record) => childMap.has(record.childId) && isDateWithinLastDays(record.date, 7, today)
  );

  const weeklyReport = buildFallbackWeeklyReport({
    institutionName: params.institutionName,
    periodLabel: "最近 7 天",
    role: "机构管理员",
    overview: {
      visibleChildren: params.visibleChildren.length,
      attendanceRate: weekAttendance.length > 0 ? Math.round((weekPresent / weekAttendance.length) * 100) : 0,
      mealRecordCount: 0,
      healthAbnormalCount: weekHealth.filter((item) => item.isAbnormal).length,
      growthAttentionCount: weekGrowth.filter((item) => item.needsAttention).length,
      pendingReviewCount: weekGrowth.filter((item) => item.reviewStatus === "待复查").length,
      feedbackCount: weekFeedback.length,
    },
    diet: {
      balancedRate: params.weeklyTrend.balancedRate,
      hydrationAvg: params.weeklyTrend.hydrationAvg,
      monotonyDays: params.weeklyTrend.monotonyDays,
      vegetableDays: params.weeklyTrend.vegetableDays,
      proteinDays: params.weeklyTrend.proteinDays,
    },
    topAttentionChildren: params.adminBoardData.highAttentionChildren.map((item) => ({
      childName: item.childName,
      attentionCount: item.count,
      hydrationAvg:
        params.adminBoardData.lowHydrationChildren.find((entry) => entry.childId === item.childId)?.hydrationAvg ?? 0,
      vegetableDays:
        params.adminBoardData.lowVegTrendChildren.find((entry) => entry.childId === item.childId)?.vegetableDays ?? 0,
    })),
    highlights: params.smartInsights.filter((item) => item.level !== "warning").map((item) => item.title).slice(0, 4),
    risks: params.smartInsights.filter((item) => item.level === "warning").map((item) => item.title).slice(0, 4),
  }, "admin");

  const pendingItems = [
    weekHealth.filter((item) => item.isAbnormal).length > 0
      ? `今日及近 7 天共有 ${weekHealth.filter((item) => item.isAbnormal).length} 条健康异常记录待追踪`
      : null,
    weekGrowth.filter((item) => item.reviewStatus === "待复查").length > 0
      ? `${weekGrowth.filter((item) => item.reviewStatus === "待复查").length} 条成长观察仍待复查`
      : null,
    feedbackCompletionRate < 80 ? `家长反馈完成率仅 ${feedbackCompletionRate}%，建议重点催办` : null,
  ].filter((item): item is string => Boolean(item));

  return {
    riskChildrenCount: riskChildIds.size,
    weeklySummary: weeklyReport.summary,
    feedbackCompletionRate,
    pendingItems,
    weeklyHighlights: weeklyReport.highlights,
    heroStats: [
      { label: "重点风险儿童", value: `${riskChildIds.size}` },
      { label: "家长反馈完成率", value: `${feedbackCompletionRate}%` },
      { label: "待处理事项", value: `${pendingItems.length}` },
      { label: "周重点亮点", value: `${weeklyReport.highlights.length}` },
    ],
  };
}

export function buildAdminAgentContext(params: {
  institutionName: string;
  home: AdminHomeViewModel;
}): AdminAgentContext {
  return {
    institutionName: params.institutionName,
    riskSummary:
      (
        params.home.adminContext as {
          highlights?: string[];
        } | undefined
      )?.highlights?.slice(0, 3) ?? [`当前重点风险儿童 ${params.home.riskChildrenCount} 人`, ...params.home.weeklyHighlights.slice(0, 2)],
    feedbackCompletionRate: params.home.feedbackCompletionRate,
    pendingItems: params.home.pendingItems,
    weeklyHighlights: params.home.weeklyHighlights,
    priorityTopItems: params.home.priorityTopItems?.map((item) => ({
      targetName: item.targetName,
      reason: item.reason,
      recommendedDeadline: item.recommendedDeadline,
    })),
    actionItems:
      (
        params.home.adminContext as {
          actionItems?: Array<{ ownerLabel: string; action: string }>;
        } | undefined
      )?.actionItems?.slice(0, 3),
    raw: params.home.adminContext,
  };
}

export function buildAdminAgentReply(
  context: AdminAgentContext,
  action: "weekly-report" | "risk-list" | "rectification"
): AgentReply {
  if (action === "weekly-report") {
    return {
      answer:
        context.riskSummary[0] ??
        "本周机构运营建议优先围绕高优先级对象、家长协同链路和待复查闭环展开。",
      keyPoints: context.weeklyHighlights.slice(0, 3),
      nextSteps:
        context.actionItems?.slice(0, 3).map((item) => `${item.ownerLabel}：${item.action}`) ?? [],
    };
  }

  if (action === "risk-list") {
    return {
      answer:
        context.priorityTopItems?.[0]
          ? `当前最值得优先查看的是 ${context.priorityTopItems[0].targetName}，原因是${context.priorityTopItems[0].reason}。`
          : "当前没有进入高优先级列表的重点对象。",
      keyPoints:
        context.priorityTopItems?.slice(0, 3).map((item) => `${item.targetName}：${item.reason}`) ??
        context.riskSummary.slice(0, 3),
      nextSteps:
        context.actionItems?.slice(0, 3).map((item) => `${item.ownerLabel}：${item.action}`) ?? [],
    };
  }

  if (action === "rectification" && context.actionItems?.length) {
    return {
      answer:
        context.pendingItems[0] ??
        "当前最需要整改的是把识别出的高风险事项进一步指定责任人和处理时限。",
      keyPoints: context.pendingItems.slice(0, 3),
      nextSteps: context.actionItems.slice(0, 3).map((item) => `${item.ownerLabel}：${item.action}`),
    };
  }

  const legacyAction = action as string;

  if (legacyAction === "weekly-report") {
    return {
      answer: `本周园所运营风险主要集中在重点儿童持续跟踪和家长反馈完成率两处。建议周报先讲风险数量与趋势，再讲闭环率和下周整改动作，保持展示逻辑简洁。`,
      keyPoints: [
        `当前家长反馈完成率 ${context.feedbackCompletionRate}%`,
        ...context.weeklyHighlights.slice(0, 2),
      ],
      nextSteps: [
        "把周报拆成风险、协同、整改三部分",
        "点名重点儿童名单但不展开过多细节",
        "列出下周一到两个最关键整改动作",
      ],
    };
  }

  if (legacyAction === "risk-list") {
    return {
      answer: `建议优先汇总“高关注频次、补水需关注、低蔬菜摄入”三类儿童，形成园长每日过目名单。当前可先从 ${context.riskSummary[0]} 开始。`,
      keyPoints: [
        "名单按风险来源归类，方便后续派单",
        "同一儿童命中多项风险时优先级最高",
        "名单只保留需要今日处理的对象",
      ],
      nextSteps: [
        "生成今日重点儿童名单",
        "交由班级老师补充跟进状态",
        "晚间汇总反馈结果形成闭环",
      ],
    };
  }

  return {
    answer: `待整改事项建议围绕“反馈完成率偏低、复查项未闭环、健康异常追踪不足”三条展开。当前先把这些事项变成明确责任和时间节点，比继续堆砌指标更适合演示。`,
    keyPoints: [
      ...context.pendingItems.slice(0, 3),
    ],
    nextSteps: [
      "逐项指定负责人",
      "把整改时限压到下一个工作日",
      "下一轮 Agent 工作流直接挂在这些整改项上",
    ],
  };
}
