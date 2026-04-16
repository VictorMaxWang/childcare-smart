import assert from "node:assert/strict";
import test from "node:test";

import type { AdminAgentResult } from "./admin-types";
import {
  sanitizeAdminWeeklyReportResponseForAdmin,
  sanitizeAdminWeeklyResult,
  sanitizeAdminWeeklyText,
} from "./admin-weekly-sanitize.ts";

function buildDirtyWeeklyResult(): AdminAgentResult {
  return {
    title: "本周机构运营周报",
    summary:
      'teacher-agent: {"workflow":"communication","objectScope":"child","targetChildId":"child-1","actionItems":[{"id":"a1"}]}',
    assistantAnswer:
      'Recent context: {"workflow":"weekly-ops-report","actionItems":[{"id":"a1"}]}',
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
    highlights: [
      'workflow: {"objectScope":"child","targetChildId":"child-1"}',
      "本周机构级重点已经收敛到复查闭环与家园反馈回流。",
    ],
    actionItems: [
      {
        id: "action-1",
        title: 'objectScope: {"targetChildId":"child-1"}',
        targetType: "child",
        targetId: "child-1",
        targetName: "安安",
        priorityLevel: "P1",
        ownerRole: "teacher",
        ownerLabel: "向日葵班班主任",
        action: 'actionItems: [{"title":"补齐复查"}]',
        deadline: "今日放学前",
        summary: 'teacher-agent: {"workflow":"communication"}',
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
    quickQuestions: ["下周先盯哪件事？"],
    notificationEvents: [],
    continuityNotes: [
      'Recent consultation: {"workflow":"communication","targetChildId":"child-1"}',
    ],
    source: "ai",
    model: "test-model",
    generatedAt: "2026-04-13T08:00:00.000Z",
  };
}

test("sanitizeAdminWeeklyText filters raw payload patterns but keeps clean Chinese copy", () => {
  assert.equal(
    sanitizeAdminWeeklyText('teacher-agent: {"workflow":"communication","targetChildId":"child-1"}'),
    null
  );
  assert.equal(
    sanitizeAdminWeeklyText("本周运营节奏基本稳定，重点继续盯住复查闭环。"),
    "本周运营节奏基本稳定，重点继续盯住复查闭环。"
  );
});

test("sanitizeAdminWeeklyResult rebuilds clean summary, continuity notes, and action copy", () => {
  const result = sanitizeAdminWeeklyResult(buildDirtyWeeklyResult());

  assert.doesNotMatch(result.summary, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  assert.doesNotMatch(result.assistantAnswer, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  assert.ok(result.summary.includes("本周"));
  assert.ok(result.summary.includes("下周最先动作"));
  assert.equal(result.continuityNotes?.length, 3);
  result.continuityNotes?.forEach((item) => {
    assert.match(item, /^(上周延续问题|当前连续风险|本周承接动作)：/);
    assert.doesNotMatch(item, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  });
  assert.equal(result.highlights.length > 0, true);
  result.highlights.forEach((item) => {
    assert.doesNotMatch(item, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
    assert.doesNotMatch(item, /[{[]/);
  });
  assert.doesNotMatch(result.actionItems[0]?.title ?? "", /objectScope|targetChildId/i);
  assert.doesNotMatch(result.actionItems[0]?.summary ?? "", /teacher-agent|workflow|actionItems/i);
  assert.doesNotMatch(result.actionItems[0]?.action ?? "", /teacher-agent|workflow|actionItems/i);
});

test("sanitizeAdminWeeklyReportResponseForAdmin removes dirty weekly-report payload fields", () => {
  const report = sanitizeAdminWeeklyReportResponseForAdmin({
    schemaVersion: "v2-actionized",
    role: "admin",
    summary: 'teacher-agent: {"workflow":"communication"}',
    highlights: ['{"objectScope":"child"}', "本周反馈回流需要继续提效。"],
    risks: ['Recent context: {"targetChildId":"child-1"}', "复查节奏仍需继续跟进。"],
    nextWeekActions: ['actionItems: [{"title":"复查"}]', "先收敛下周治理重点并明确责任人。"],
    trendPrediction: "stable",
    sections: [
      {
        id: "nextWeekGovernanceFocus",
        title: "下周治理重点",
        summary: 'workflow: {"objectScope":"child"}',
        items: [
          {
            label: "动作1",
            detail: 'teacher-agent: {"workflow":"communication"}',
          },
          {
            label: "动作2",
            detail: "先收敛下周治理重点并明确责任人。",
          },
        ],
      },
    ],
    continuityNotes: ['Recent consultation: {"actionItems":[{"id":"a1"}]}'],
    disclaimer: "仅用于运营复盘参考。",
    source: "ai",
    model: "test-model",
    primaryAction: {
      title: "下周第一动作",
      detail: 'workflow: {"objectScope":"child"}',
      ownerRole: "admin",
      dueWindow: "下周优先处理",
    },
  });

  assert.equal(report.summary, "");
  assert.deepEqual(report.continuityNotes, []);
  assert.deepEqual(report.highlights, ["本周反馈回流需要继续提效。"]);
  assert.deepEqual(report.risks, ["复查节奏仍需继续跟进。"]);
  assert.deepEqual(report.nextWeekActions, ["先收敛下周治理重点并明确责任人。"]);
  assert.equal(report.sections[0]?.summary, "下周治理重点");
  assert.deepEqual(report.sections[0]?.items, [
    {
      label: "动作2",
      detail: "先收敛下周治理重点并明确责任人。",
    },
  ]);
  assert.equal(report.primaryAction?.detail, "");
});
