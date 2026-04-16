import assert from "node:assert/strict";
import test from "node:test";

import type { MemoryContextEnvelope, WeeklyReportResponse } from "../ai/types.ts";
import {
  attachNotificationEventToResult,
  buildAdminWeeklyReportResult,
  buildAdminWeeklyReportResultWithMemory,
} from "./admin-agent.ts";
import type { AdminAgentContext, AdminAgentResult, AdminDispatchEvent } from "./admin-types.ts";

function buildResult(): AdminAgentResult {
  return {
    title: "今日机构优先事项",
    summary: "当前最值得先推动的是安安的家园协同。",
    assistantAnswer: "请先推动安安相关闭环。",
    institutionScope: {
      institutionName: "SmartChildcare",
      date: "2026-04-07",
      visibleChildren: 1,
      classCount: 1,
      attendanceRate: 100,
      healthAbnormalCount: 1,
      growthAttentionCount: 1,
      pendingReviewCount: 1,
      feedbackCount: 0,
      feedbackCompletionRate: 0,
      riskChildrenCount: 1,
      riskClassCount: 0,
      pendingDispatchCount: 0,
    },
    priorityTopItems: [],
    riskChildren: [],
    riskClasses: [],
    feedbackRiskItems: [],
    highlights: [],
    actionItems: [
      {
        id: "action-priority-child-1",
        title: "安安：需要今天完成家园协同",
        targetType: "child",
        targetId: "child-1",
        targetName: "安安",
        priorityLevel: "P1",
        ownerRole: "teacher",
        ownerLabel: "向日葵班班主任",
        action: "今天完成家园协同",
        deadline: "今日放学前",
        summary: "向日葵班班主任在今日放学前执行：今天完成家园协同",
        dispatchPayload: {
          eventType: "admin_action",
          priorityItemId: "priority-child-1",
          title: "P1｜安安",
          summary: "需要今天完成家园协同",
          targetType: "child",
          targetId: "child-1",
          targetName: "安安",
          priorityLevel: "P1",
          priorityScore: 90,
          recommendedOwnerRole: "teacher",
          recommendedOwnerName: "向日葵班班主任",
          recommendedAction: "今天完成家园协同",
          recommendedDeadline: "今日放学前",
          reasonText: "需要今天完成家园协同",
          evidence: [],
          source: {
            institutionName: "SmartChildcare",
            workflow: "daily-priority",
            relatedChildIds: ["child-1"],
            relatedClassNames: ["向日葵班"],
          },
        },
        status: "suggested",
      },
    ],
    recommendedOwnerMap: [],
    quickQuestions: [],
    notificationEvents: [],
    source: "rule",
    generatedAt: "2026-04-07T10:00:00.000Z",
  };
}

function buildConsultationScopedEvent(): AdminDispatchEvent {
  return {
    id: "event-consultation-1",
    institutionId: "inst-1",
    eventType: "admin_action",
    status: "in_progress",
    priorityItemId: "consult-1",
    title: "P1｜安安重点会诊",
    summary: "需要尽快跟进幼儿情绪与家园协同。",
    targetType: "child",
    targetId: "child-1",
    targetName: "安安",
    priorityLevel: "P1",
    priorityScore: 90,
    recommendedOwnerRole: "admin",
    recommendedOwnerName: "陈园长",
    recommendedAction: "午休前先做安抚过渡",
    recommendedDeadline: "2026-04-07T12:30:00.000Z",
    reasonText: "需要园长确认家园协同动作",
    evidence: [],
    source: {
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      relatedChildIds: ["child-1"],
      relatedClassNames: ["向日葵班"],
      consultationId: "consult-1",
      relatedConsultationIds: ["consult-1"],
    },
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-04-07T10:30:00.000Z",
    updatedAt: "2026-04-07T10:35:00.000Z",
    completedAt: null,
  };
}

test("attachNotificationEventToResult does not bind consultation-scoped child events to generic child action items", () => {
  const result = buildResult();
  const next = attachNotificationEventToResult(result, buildConsultationScopedEvent());

  assert.equal(next.actionItems.length, 1);
  assert.equal(next.actionItems[0]?.status, "suggested");
  assert.equal(next.actionItems[0]?.relatedEventId, undefined);
  assert.equal(next.notificationEvents.length, 1);
  assert.equal(next.notificationEvents[0]?.id, "event-consultation-1");
});

function buildWeeklyContext(): AdminAgentContext {
  return {
    institutionScope: {
      institutionName: "SmartChildcare",
      date: "2026-04-13",
      visibleChildren: 26,
      classCount: 4,
      todayPresentCount: 24,
      todayAttendanceRate: 92,
      attendanceRate: 91,
      healthAbnormalCount: 3,
      growthAttentionCount: 2,
      pendingReviewCount: 2,
      feedbackCount: 16,
      feedbackCompletionRate: 62,
      riskChildrenCount: 2,
      riskClassCount: 1,
      pendingDispatchCount: 2,
    },
    priorityTopItems: [
      {
        id: "priority-1",
        targetType: "child",
        targetId: "child-1",
        targetName: "安安",
        priorityScore: 92,
        priorityLevel: "P1",
        reason: "晨检复查与家园回流仍需继续闭环",
        evidence: [],
        recommendedOwner: {
          role: "teacher",
          label: "向日葵班班主任",
        },
        recommendedAction: "今天先完成晨检复查并同步家长反馈",
        recommendedDeadline: "今日放学前",
        relatedChildIds: ["child-1"],
        relatedClassNames: ["向日葵班"],
        dispatchPayload: {
          eventType: "admin_action",
          priorityItemId: "priority-1",
          title: "P1-安安",
          summary: "需要持续跟进",
          targetType: "child",
          targetId: "child-1",
          targetName: "安安",
          priorityLevel: "P1",
          priorityScore: 92,
          recommendedOwnerRole: "teacher",
          recommendedAction: "今天先完成晨检复查并同步家长反馈",
          recommendedDeadline: "今日放学前",
          reasonText: "晨检复查与家园回流仍需继续闭环",
          evidence: [],
          source: {
            institutionName: "SmartChildcare",
            workflow: "weekly-ops-report",
          },
        },
      },
    ],
    riskChildren: [
      {
        childId: "child-1",
        childName: "安安",
        className: "向日葵班",
        priorityLevel: "P1",
        priorityScore: 92,
        reason: "晨检复查与家园回流仍需继续闭环",
        ownerLabel: "向日葵班班主任",
        deadline: "今日放学前",
      },
    ],
    riskClasses: [
      {
        className: "向日葵班",
        priorityLevel: "P2",
        priorityScore: 80,
        reason: "重点事项闭环节奏需要继续盯紧",
        issueCount: 2,
        ownerLabel: "园长",
        deadline: "本周五前",
      },
    ],
    feedbackRiskItems: [
      {
        childId: "child-1",
        childName: "安安",
        className: "向日葵班",
        priorityLevel: "P1",
        reason: "家长反馈回流不足",
        recommendedOwner: "向日葵班班主任",
      },
    ],
    highlights: ["本周机构级重点已经收敛到复查闭环与家园反馈回流。"],
    weeklyHighlights: ["本周机构级重点已经收敛到复查闭环与家园反馈回流。"],
    actionItems: [
      {
        id: "action-1",
        title: "安安：今日完成复查闭环",
        targetType: "child",
        targetId: "child-1",
        targetName: "安安",
        priorityLevel: "P1",
        ownerRole: "teacher",
        ownerLabel: "向日葵班班主任",
        action: "今天先完成晨检复查并同步家长反馈",
        deadline: "今日放学前",
        summary: "向日葵班班主任在今日放学前推进：今天先完成晨检复查并同步家长反馈",
        dispatchPayload: {
          eventType: "admin_action",
          priorityItemId: "priority-1",
          title: "P1-安安",
          summary: "需要持续跟进",
          targetType: "child",
          targetId: "child-1",
          targetName: "安安",
          priorityLevel: "P1",
          priorityScore: 92,
          recommendedOwnerRole: "teacher",
          recommendedAction: "今天先完成晨检复查并同步家长反馈",
          recommendedDeadline: "今日放学前",
          reasonText: "晨检复查与家园回流仍需继续闭环",
          evidence: [],
          source: {
            institutionName: "SmartChildcare",
            workflow: "weekly-ops-report",
          },
        },
        status: "suggested",
      },
    ],
    recommendedOwnerMap: [
      {
        ownerRole: "teacher",
        ownerLabel: "向日葵班班主任",
        count: 1,
      },
    ],
    notificationEvents: [],
    pendingItems: ["待复查事项仍需闭环"],
    quickQuestions: ["下周先盯哪件事？"],
    suggestionSnapshot: {
      institutionName: "SmartChildcare",
      sevenDayOverview: {
        visibleChildren: 26,
        classCount: 4,
        attendanceRate: 91,
        healthAbnormalCount: 3,
        growthAttentionCount: 2,
        pendingReviewCount: 2,
        feedbackCount: 16,
        feedbackCompletionRate: 62,
        pendingDispatchCount: 2,
      },
      priorityTopItems: [],
      riskChildren: [],
      riskClasses: [],
      feedbackRiskItems: [],
      pendingDispatches: [],
      weeklyHighlights: [],
      ruleFallback: [],
    },
    source: "rule",
    generatedAt: "2026-04-13T08:00:00.000Z",
  };
}

function buildDirtyWeeklyReport(): WeeklyReportResponse {
  return {
    schemaVersion: "v2-actionized",
    role: "admin",
    summary:
      'teacher-agent: {"workflow":"communication","objectScope":"child","targetChildId":"child-1","actionItems":[{"id":"a1"}]}',
    highlights: [
      '{"objectScope":"child"}',
      "本周反馈回流与复查闭环已成为机构级重点。",
    ],
    risks: ['Recent context: {"targetChildId":"child-1"}'],
    nextWeekActions: [
      'actionItems: [{"title":"补齐复查"}]',
      "先收敛下周治理重点并明确责任人。",
    ],
    trendPrediction: "stable",
    sections: [],
    continuityNotes: ['workflow: {"targetChildId":"child-1"}'],
    disclaimer: "仅用于运营复盘参考。",
    source: "ai",
    model: "test-model",
  };
}

test("buildAdminWeeklyReportResult keeps clean weekly copy and rebuilds dirty summary", () => {
  const result = buildAdminWeeklyReportResult({
    context: buildWeeklyContext(),
    report: buildDirtyWeeklyReport(),
  });

  assert.doesNotMatch(result.summary, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  assert.ok(result.summary.includes("本周"));
  assert.equal(result.continuityNotes?.length, 3);
  assert.equal(result.highlights.length > 0, true);
  result.highlights.forEach((item) => {
    assert.doesNotMatch(item, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  });
});

test("buildAdminWeeklyReportResultWithMemory keeps clean report continuity and drops dirty memory payloads", () => {
  const memoryContext: MemoryContextEnvelope = {
    childId: "child-1",
    workflowType: "admin-weekly-ops-report",
    recentSnapshots: [],
    recentConsultations: [],
    relevantTraces: [],
    promptContext: {
      longTermTraits: [],
      recentContinuitySignals: [
        'teacher-agent: {"workflow":"communication","objectScope":"child"}',
      ],
      lastConsultationTakeaways: [
        'Recent consultation: {"targetChildId":"child-1","actionItems":[{"id":"a1"}]}',
      ],
      openLoops: ['{"actionItems":[{"id":"a1"}],"workflow":"communication"}'],
    },
    meta: {
      backend: "test",
      degraded: false,
      usedSources: [],
      errors: [],
      matchedSnapshotIds: [],
      matchedTraceIds: [],
    },
  };

  const result = buildAdminWeeklyReportResultWithMemory({
    context: buildWeeklyContext(),
    memoryContexts: [memoryContext],
    report: {
      ...buildDirtyWeeklyReport(),
      continuityNotes: ["上周延续问题：向阳班需继续跟进待复查积压。"],
    },
  });

  assert.equal(result.continuityNotes?.some((item) => item.includes("上周延续问题：向阳班需继续跟进待复查积压。")), true);
  result.continuityNotes?.forEach((item) => {
    assert.match(item, /^(上周延续问题|当前连续风险|本周承接动作)：/);
    assert.doesNotMatch(item, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  });
  assert.doesNotMatch(result.summary, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
});
