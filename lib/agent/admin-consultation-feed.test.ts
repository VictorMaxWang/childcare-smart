import assert from "node:assert/strict";
import test from "node:test";

import type { ConsultationResult } from "@/lib/ai/types";
import type { AdminDispatchEvent } from "@/lib/agent/admin-types";
import {
  buildAdminConsultationPriorityItems,
  normalizeAdminConsultationFeedItem,
} from "./admin-consultation";

function buildLocalConsultation(
  overrides: Partial<ConsultationResult> = {}
): ConsultationResult {
  return {
    consultationId: "consult-1",
    triggerReason: "连续两天情绪波动",
    triggerType: ["continuous-abnormality"],
    triggerReasons: ["连续两天情绪波动", "晨检备注出现异常"],
    participants: [
      { id: "health-agent", label: "Health Agent" },
      { id: "coparenting-agent", label: "Parent Agent" },
    ],
    childId: "child-1",
    riskLevel: "high",
    agentFindings: [
      {
        agentId: "health-agent",
        title: "晨检情绪偏低",
        riskExplanation: "连续两次晨检异常，需要尽快复核。",
        signals: ["连续两次晨检异常"],
        actions: ["加强晨检记录"],
        observationPoints: ["晨检情绪"],
        evidence: ["连续两次晨检异常"],
      },
    ],
    summary: "需尽快跟进幼儿情绪与家园协同。",
    keyFindings: ["情绪波动持续", "需要家园同步观察"],
    healthAgentView: {
      role: "HealthObservationAgent",
      title: "Health Agent",
      summary: "晨检异常",
      signals: ["连续两次晨检异常"],
      actions: ["加强晨检记录"],
      observationPoints: ["晨检情绪"],
      evidence: ["连续两次晨检异常"],
    },
    dietBehaviorAgentView: {
      role: "DietBehaviorAgent",
      title: "Diet Agent",
      summary: "午餐进食一般",
      signals: ["饮水偏少"],
      actions: ["补充观察饮水"],
      observationPoints: ["饮水量"],
      evidence: ["饮水偏少"],
    },
    parentCommunicationAgentView: {
      role: "ParentCommunicationAgent",
      title: "Parent Agent",
      summary: "家长反馈延迟",
      signals: ["连续两天未反馈"],
      actions: ["发送简短回访"],
      observationPoints: ["今晚反馈"],
      evidence: ["连续两天未反馈"],
    },
    inSchoolActionAgentView: {
      role: "InSchoolActionAgent",
      title: "Execution Agent",
      summary: "园内情绪安抚",
      signals: ["午休前哭闹"],
      actions: ["安排固定安抚动作"],
      observationPoints: ["午休过渡"],
      evidence: ["午休前哭闹"],
    },
    todayInSchoolActions: ["午休前先做安抚过渡"],
    tonightAtHomeActions: ["晚间记录入睡前情绪变化"],
    followUp48h: ["48 小时内复盘情绪和家长反馈"],
    parentMessageDraft: "今晚请先关注孩子入睡前情绪。",
    directorDecisionCard: {
      title: "重点会诊",
      status: "pending",
      reason: "需要园长确认家园协同动作",
      recommendedOwnerRole: "admin",
      recommendedOwnerName: "陈园长",
      recommendedAt: "2026-04-07T12:30:00.000Z",
    },
    explainability: [
      { label: "关键发现", detail: "连续两次晨检异常" },
      { label: "协调结论", detail: "需要园长牵头同步老师和家长" },
    ],
    nextCheckpoints: ["明早回看情绪状态"],
    evidenceItems: [
      {
        id: "ce:consult-1:teacher_note:multimodal:0",
        sourceType: "teacher_note",
        sourceLabel: "教师补充",
        sourceId: "multimodalNotes.teacherNote",
        summary: "老师补充孩子今天午休前情绪波动明显。",
        confidence: "high",
        requiresHumanReview: false,
        evidenceCategory: "risk_control",
        supports: [
          {
            type: "finding",
            targetId: "finding:key:0",
            targetLabel: "鎯呯华娉㈠姩鎸佺画",
          },
        ],
      },
    ],
    coordinatorSummary: {
      finalConclusion: "建议园长在今日午间前确认跟进人。",
      riskLevel: "high",
      problemDefinition: "情绪波动需尽快协调",
      schoolAction: "加强园内观察",
      homeAction: "家长晚间反馈",
      observationPoints: ["入园情绪", "午休情况"],
      reviewIn48h: "48 小时后复查",
      shouldEscalateToAdmin: true,
    },
    schoolAction: "加强园内观察",
    homeAction: "家长晚间反馈",
    observationPoints: ["入园情绪", "午休情况"],
    reviewIn48h: "48 小时后复查",
    shouldEscalateToAdmin: true,
    continuityNotes: ["过去一周有类似波动"],
    memoryMeta: {
      backend: "memory",
      degraded: false,
      usedSources: ["snapshot"],
      errors: [],
      matchedSnapshotIds: ["snap-1"],
      matchedTraceIds: ["trace-1"],
    },
    source: "vivo",
    provider: "vivo",
    model: "BlueLM",
    providerTrace: {
      provider: "vivo",
      model: "BlueLM",
      realProvider: true,
      transport: "fastapi-brain",
    },
    traceMeta: {
      agentParticipants: ["Health Agent", "Parent Agent"],
      keyFindings: ["情绪波动持续"],
      coordinationConclusion: "需要园长牵头同步老师和家长",
    },
    realProvider: true,
    fallback: false,
    generatedAt: "2026-04-07T10:00:00.000Z",
    ...overrides,
  };
}

function buildNotificationEvent(
  overrides: Partial<AdminDispatchEvent> = {}
): AdminDispatchEvent {
  return {
    id: "event-1",
    institutionId: "inst-1",
    eventType: "admin-focus",
    status: "in_progress",
    priorityItemId: "consult-1",
    title: "跟进高风险会诊",
    summary: "请园长协调老师与家长。",
    targetType: "child",
    targetId: "child-1",
    targetName: "安安",
    priorityLevel: "P1",
    priorityScore: 95,
    recommendedOwnerRole: "admin",
    recommendedOwnerName: "王园长",
    recommendedAction: "确认协同安排",
    recommendedDeadline: "2026-04-07T13:00:00.000Z",
    reasonText: "高风险会诊升级",
    evidence: [{ label: "risk", value: "high", weight: 1 }],
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
    ...overrides,
  };
}

test("normalizeAdminConsultationFeedItem keeps valid feed payloads and rejects malformed history", () => {
  const valid = normalizeAdminConsultationFeedItem({
    consultationId: "consult-1",
    childId: "child-1",
    generatedAt: "2026-04-07T10:00:00.000Z",
    riskLevel: "high",
    triggerReason: "连续两天情绪波动",
    triggerReasons: ["连续两天情绪波动"],
    summary: "需尽快跟进幼儿情绪与家园协同。",
    directorDecisionCard: {
      title: "Admin Decision Card",
      status: "pending",
      recommendedOwnerName: "陈园长",
      recommendedOwnerRole: "admin",
      recommendedAt: "2026-04-07T12:30:00.000Z",
    },
    status: "pending",
    ownerName: "陈园长",
    ownerRole: "admin",
    dueAt: "2026-04-07T12:30:00.000Z",
    whyHighPriority: "后端已给出独立优先级原因",
    todayInSchoolActions: ["后端园内动作"],
    tonightAtHomeActions: ["后端家庭动作"],
    followUp48h: ["后端 48 小时复查"],
    syncTargets: ["教师端结果卡", "园长端决策卡"],
    shouldEscalateToAdmin: true,
    evidenceItems: [
      {
        id: "ce:consult-1:derived_explainability:feed:0",
        sourceType: "derived_explainability",
        sourceLabel: "关键发现推断",
        sourceId: "finding:key:0",
        summary: "杩炵画涓ゆ鏅ㄦ寮傚父",
        confidence: "medium",
        requiresHumanReview: true,
        evidenceCategory: "risk_control",
        supports: [
          {
            type: "finding",
            targetId: "finding:key:0",
            targetLabel: "杩炵画涓ゆ鏅ㄦ寮傚父",
          },
        ],
      },
    ],
  });

  assert.ok(valid);
  assert.equal(valid?.consultationId, "consult-1");
  assert.deepEqual(valid?.todayInSchoolActions, ["后端园内动作"]);
  assert.equal(
    normalizeAdminConsultationFeedItem({
      childId: "child-1",
      riskLevel: "high",
    }),
    null
  );
});

test("buildAdminConsultationPriorityItems projects feed escalation into decision and notification payload", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-escalation-feed",
        childId: "child-1",
        generatedAt: "2026-04-08T10:30:00.000Z",
        riskLevel: "high",
        summary: "Escalation projection test",
        directorDecisionCard: {
          title: "Escalation Decision",
          status: "pending",
          recommendedAt: "2026-04-08T12:30:00.000Z",
        },
        shouldEscalateToAdmin: true,
        activeEscalation: {
          taskId: "task-feed-escalation",
          childId: "child-1",
          shouldEscalate: true,
          escalationLevel: "director_attention",
          escalationReason: "Repeated follow-up needs director attention.",
          recommendedNextStep: "Review and consolidate the follow-up loop today.",
          triggeredRules: ["same_child_repeated_follow_up_48h"],
          relatedTaskIds: ["task-feed-escalation", "task-feed-related"],
          ownerRole: "admin",
          dueRiskWindow: {
            referenceDueAt: "2026-04-08T12:30:00.000Z",
            windowStartAt: "2026-04-07T12:30:00.000Z",
            windowEndAt: "2026-04-10T12:30:00.000Z",
            status: "overdue",
            hoursOverdue: 20,
            label: "Overdue by 20h",
          },
        },
      },
    ],
    children: [{ id: "child-1", name: "瀹夊畨", className: "鍚戞棩钁电彮" }],
    notificationEvents: [],
    limit: 4,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.decision.whyHighPriority, "Repeated follow-up needs director attention.");
  assert.equal(
    items[0]?.notificationPayload?.recommendedAction,
    "Review and consolidate the follow-up loop today."
  );
  assert.equal(
    items[0]?.notificationPayload?.reasonText,
    "Repeated follow-up needs director attention."
  );
  assert.equal(items[0]?.notificationPayload?.source.taskId, "task-feed-escalation");
  assert.equal(
    items[0]?.notificationPayload?.source.escalation?.escalationLevel,
    "director_attention"
  );
  assert.equal(items[0]?.notificationPayload?.evidence[1]?.label, "Task escalation");
});

test("buildAdminConsultationPriorityItems lets notification source escalation override feed metadata", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-escalation-override",
        childId: "child-1",
        generatedAt: "2026-04-08T10:30:00.000Z",
        riskLevel: "high",
        summary: "Dispatch escalation override test",
        directorDecisionCard: {
          title: "Override Decision",
          status: "pending",
          recommendedAt: "2026-04-08T12:30:00.000Z",
        },
        shouldEscalateToAdmin: true,
        activeEscalation: {
          taskId: "task-feed-review",
          childId: "child-1",
          shouldEscalate: true,
          escalationLevel: "review_required",
          escalationReason: "Teacher review is due soon.",
          recommendedNextStep: "Check with the teacher.",
          triggeredRules: ["teacher_follow_up_stalled"],
          relatedTaskIds: ["task-feed-review"],
          ownerRole: "teacher",
          dueRiskWindow: {
            referenceDueAt: "2026-04-08T12:30:00.000Z",
            windowStartAt: "2026-04-07T12:30:00.000Z",
            windowEndAt: "2026-04-10T12:30:00.000Z",
            status: "due_soon",
            hoursOverdue: 0,
            label: "Due in 4h",
          },
        },
      },
    ],
    children: [{ id: "child-1", name: "瀹夊畨", className: "鍚戞棩钁电彮" }],
    notificationEvents: [
      buildNotificationEvent({
        id: "event-escalation-override",
        priorityItemId: "consult-escalation-override",
        source: {
          institutionName: "SmartChildcare",
          workflow: "daily-priority",
          relatedChildIds: ["child-1"],
          relatedClassNames: ["鍚戞棩钁电彮"],
          consultationId: "consult-escalation-override",
          relatedConsultationIds: ["consult-escalation-override"],
          escalation: {
            taskId: "task-dispatch-director",
            childId: "child-1",
            shouldEscalate: true,
            escalationLevel: "director_attention",
            escalationReason: "Dispatch source requires director attention.",
            recommendedNextStep: "Assign a director review before noon.",
            triggeredRules: ["multiple_pending_tasks_same_child"],
            relatedTaskIds: ["task-dispatch-director", "task-feed-review"],
            ownerRole: "admin",
            dueRiskWindow: {
              referenceDueAt: "2026-04-08T12:30:00.000Z",
              windowStartAt: "2026-04-07T12:30:00.000Z",
              windowEndAt: "2026-04-10T12:30:00.000Z",
              status: "overdue",
              hoursOverdue: 12,
              label: "Overdue by 12h",
            },
          },
        },
      }),
    ],
    limit: 4,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.decision.whyHighPriority, "Dispatch source requires director attention.");
  assert.equal(items[0]?.recommendedOwnerRole, "admin");
  assert.equal(
    items[0]?.decision.recommendedOwnerName,
    items[0]?.dispatchEvent?.recommendedOwnerName
  );
  assert.equal(
    items[0]?.notificationPayload?.reasonText,
    "Dispatch source requires director attention."
  );
  assert.equal(
    items[0]?.notificationPayload?.recommendedAction,
    "Assign a director review before noon."
  );
  assert.equal(
    items[0]?.notificationPayload?.source.escalation?.taskId,
    "task-dispatch-director"
  );
});

test("buildAdminConsultationPriorityItems prefers backend-native actions, sync targets and consultation-level overlay", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-1",
        childId: "child-1",
        generatedAt: "2026-04-07T10:00:00.000Z",
        riskLevel: "high",
        triggerReason: "连续两天情绪波动",
        triggerReasons: ["连续两天情绪波动", "晨检备注出现异常"],
        summary: "需尽快跟进幼儿情绪与家园协同。",
        directorDecisionCard: {
          title: "Backend Admin Decision",
          status: "pending",
          reason: "需要园长确认家园协同动作",
          recommendedOwnerName: "陈园长",
          recommendedOwnerRole: "admin",
          recommendedAt: "2026-04-07T12:30:00.000Z",
        },
        status: "pending",
        ownerName: "陈园长",
        ownerRole: "admin",
        dueAt: "2026-04-07T12:30:00.000Z",
        whyHighPriority: "后端优先级解释",
        todayInSchoolActions: ["后端园内动作"],
        tonightAtHomeActions: ["后端家庭动作"],
        followUp48h: ["后端 48 小时复查"],
        syncTargets: ["教师端结果卡", "家长端今晚任务", "园长端决策卡"],
        shouldEscalateToAdmin: true,
        evidenceItems: [
          {
            id: "ce:consult-1:derived_explainability:feed:0",
            sourceType: "derived_explainability",
            sourceLabel: "关键发现推断",
            sourceId: "finding:key:0",
            summary: "杩炵画涓ゆ鏅ㄦ寮傚父",
            confidence: "medium",
            requiresHumanReview: true,
            evidenceCategory: "risk_control",
            supports: [
              {
                type: "finding",
                targetId: "finding:key:0",
                targetLabel: "杩炵画涓ゆ鏅ㄦ寮傚父",
              },
            ],
          },
        ],
        explainabilitySummary: {
          agentParticipants: ["Health Agent", "Parent Agent"],
          keyFindings: ["情绪波动持续", "需要家园同步观察"],
          coordinationConclusion: "需要园长牵头同步老师和家长",
          evidenceHighlights: ["晨检: 连续两次异常"],
        },
        providerTraceSummary: {
          provider: "vivo",
          model: "BlueLM",
          realProvider: true,
        },
        memoryMetaSummary: {
          backend: "memory",
          degraded: false,
          usedSources: ["snapshot"],
          errors: [],
          matchedSnapshotIds: ["snap-1"],
          matchedTraceIds: ["trace-1"],
        },
      },
    ],
    localConsultations: [buildLocalConsultation()],
    children: [{ id: "child-1", name: "安安", className: "向日葵班" }],
    notificationEvents: [
      buildNotificationEvent({
        id: "child-fallback",
        priorityItemId: "child-priority",
        status: "completed",
        recommendedOwnerName: "不应命中的 child fallback",
        recommendedDeadline: "2026-04-07T14:00:00.000Z",
        source: {
          institutionName: "SmartChildcare",
          workflow: "daily-priority",
          relatedChildIds: ["child-1"],
          relatedClassNames: ["向日葵班"],
        },
      }),
      buildNotificationEvent({
        id: "consult-match",
        priorityItemId: "consult-other",
        status: "in_progress",
        recommendedOwnerName: "王园长",
        recommendedDeadline: "2026-04-07T13:00:00.000Z",
        source: {
          institutionName: "SmartChildcare",
          workflow: "daily-priority",
          relatedChildIds: ["child-1"],
          relatedClassNames: ["向日葵班"],
          consultationId: "consult-1",
          relatedConsultationIds: ["consult-1"],
        },
      }),
    ],
    limit: 4,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.decision.status, "in_progress");
  assert.equal(items[0]?.decision.recommendedOwnerName, "王园长");
  assert.equal(items[0]?.trace.providerState, "real");
  assert.equal(items[0]?.decision.whyHighPriority, "后端优先级解释");
  assert.deepEqual(items[0]?.decision.schoolActions, ["后端园内动作"]);
  assert.deepEqual(items[0]?.decision.homeActions, ["后端家庭动作"]);
  assert.deepEqual(items[0]?.decision.followUpActions, ["后端 48 小时复查"]);
  assert.deepEqual(items[0]?.trace.syncTargets, [
    "教师端结果卡",
    "家长端今晚任务",
    "园长端决策卡",
  ]);
  assert.equal(items[0]?.dispatchBindingScope, "consultation");
  assert.equal(items[0]?.notificationPayload?.priorityItemId, "consult-1");
  assert.equal(items[0]?.notificationPayload?.priorityScore, 90);
  assert.equal(items[0]?.notificationPayload?.source.consultationId, "consult-1");
  assert.deepEqual(items[0]?.notificationPayload?.source.relatedConsultationIds, ["consult-1"]);
  assert.deepEqual(items[0]?.notificationPayload?.source.relatedChildIds, ["child-1"]);
  assert.deepEqual(items[0]?.notificationPayload?.source.relatedClassNames, ["向日葵班"]);
});

test("buildAdminConsultationPriorityItems filters malformed feed rows and keeps partial rows renderable", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-2",
        childId: "child-2",
        generatedAt: "2026-04-07T09:00:00.000Z",
        riskLevel: "medium",
        summary: "需要继续观察，但暂无补充摘要字段。",
        directorDecisionCard: {},
        shouldEscalateToAdmin: true,
      },
      {
        childId: "child-3",
        riskLevel: "high",
      },
    ],
    children: [{ id: "child-2", name: "乐乐", className: "海豚班" }],
    notificationEvents: [],
    limit: 4,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.consultationId, "consult-2");
  assert.deepEqual(items[0]?.decision.schoolActions, []);
  assert.equal(items[0]?.trace.providerState, "unknown");
  assert.equal(items[0]?.trace.memoryState, "unknown");
  assert.deepEqual(items[0]?.trace.explainability, []);
  assert.equal(items[0]?.notificationPayload?.priorityScore, 70);
});

test("buildAdminConsultationPriorityItems refuses ambiguous child-level overlay when a child has multiple consultations", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-1",
        childId: "child-1",
        generatedAt: "2026-04-07T10:00:00.000Z",
        riskLevel: "high",
        summary: "第一条会诊",
        directorDecisionCard: {
          title: "Consultation Decision",
          status: "pending",
          recommendedOwnerName: "陈园长",
          recommendedOwnerRole: "admin",
          recommendedAt: "2026-04-07T12:30:00.000Z",
        },
        shouldEscalateToAdmin: true,
      },
      {
        consultationId: "consult-2",
        childId: "child-1",
        generatedAt: "2026-04-07T09:30:00.000Z",
        riskLevel: "medium",
        summary: "第二条会诊",
        directorDecisionCard: {
          title: "Consultation Decision",
          status: "pending",
          recommendedOwnerName: "陈园长",
          recommendedOwnerRole: "admin",
          recommendedAt: "2026-04-07T15:00:00.000Z",
        },
        shouldEscalateToAdmin: true,
      },
    ],
    children: [{ id: "child-1", name: "安安", className: "向日葵班" }],
    notificationEvents: [
      buildNotificationEvent({
        priorityItemId: "child-priority",
        status: "completed",
        recommendedOwnerName: "不应误绑定的事件",
        source: {
          institutionName: "SmartChildcare",
          workflow: "daily-priority",
          relatedChildIds: ["child-1"],
          relatedClassNames: ["向日葵班"],
        },
      }),
    ],
    limit: 4,
  });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.decision.status, "pending");
  assert.equal(items[0]?.decision.recommendedOwnerName, "陈园长");
  assert.equal(items[1]?.decision.status, "pending");
  assert.equal(items[1]?.decision.recommendedOwnerName, "陈园长");
  assert.equal(items[0]?.dispatchBindingScope, undefined);
  assert.equal(items[1]?.dispatchBindingScope, undefined);
  assert.equal(items[0]?.notificationPayload?.priorityItemId, "consult-1");
  assert.equal(items[1]?.notificationPayload?.priorityItemId, "consult-2");
});

test("buildAdminConsultationPriorityItems lets admin trace consume structured evidenceItems", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-evidence",
        childId: "child-1",
        generatedAt: "2026-04-08T10:00:00.000Z",
        riskLevel: "high",
        triggerReason: "杩炵画涓ゆ鏅ㄦ寮傚父",
        summary: "闇€瑕佷紭鍏堢淮鎸佸鍥棴鐜€?",
        directorDecisionCard: {
          title: "Evidence Decision",
          status: "pending",
          recommendedOwnerName: "闄堝洯闀?",
          recommendedOwnerRole: "admin",
          recommendedAt: "2026-04-08T12:00:00.000Z",
        },
        shouldEscalateToAdmin: true,
        evidenceItems: [
          {
            id: "ce:consult-evidence:teacher_note:multimodal:0",
            sourceType: "teacher_note",
            sourceLabel: "教师补充",
            sourceId: "multimodalNotes.teacherNote",
            summary: "老师补充孩子午休前情绪更黏老师。",
            confidence: "high",
            requiresHumanReview: false,
            evidenceCategory: "risk_control",
            supports: [
              {
                type: "finding",
                targetId: "finding:key:0",
                targetLabel: "杩炵画涓ゆ鏅ㄦ寮傚父",
              },
            ],
          },
        ],
      },
    ],
    children: [{ id: "child-1", name: "瀹夊畨", className: "鍚戞棩钁电彮" }],
    notificationEvents: [],
    limit: 4,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.trace.evidenceItems.length, 1);
  assert.equal(items[0]?.trace.evidenceItems[0]?.sourceLabel, "教师补充");
  assert.equal(
    items[0]?.trace.evidenceHighlights[0],
    "教师补充: 老师补充孩子午休前情绪更黏老师。"
  );
});

test("buildAdminConsultationPriorityItems falls back to legacy evidence highlights when structured evidence is unavailable", () => {
  const items = buildAdminConsultationPriorityItems({
    institutionName: "SmartChildcare",
    feedItems: [
      {
        consultationId: "consult-legacy-evidence",
        childId: "child-1",
        generatedAt: "2026-04-08T10:30:00.000Z",
        riskLevel: "high",
        summary: "当前仍需优先围绕午休前情绪波动继续复核。",
        directorDecisionCard: {
          title: "Legacy Evidence Decision",
          status: "pending",
          recommendedOwnerName: "王园长",
          recommendedOwnerRole: "admin",
          recommendedAt: "2026-04-08T12:30:00.000Z",
        },
        shouldEscalateToAdmin: true,
        evidenceItems: [],
        explainabilitySummary: {
          agentParticipants: ["Health Agent"],
          keyFindings: ["情绪波动持续"],
          coordinationConclusion: "先保留兼容摘要，等待结构化证据补齐。",
          evidenceHighlights: ["教师补充: 今日午休前情绪更黏老师。"],
        },
      },
    ],
    children: [{ id: "child-1", name: "安安", className: "向日葵班" }],
    notificationEvents: [],
    limit: 4,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.trace.evidenceItems.length, 0);
  assert.deepEqual(items[0]?.trace.evidenceHighlights, [
    "教师补充: 今日午休前情绪更黏老师。",
  ]);
});
