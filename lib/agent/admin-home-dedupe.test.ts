import assert from "node:assert/strict";
import test from "node:test";

import type { AdminConsultationPriorityItem } from "./admin-consultation.ts";
import {
  dedupeAdminAgentResultExposure,
  dedupeAdminHomeExposure,
} from "./admin-home-dedupe.ts";
import type {
  AdminAgentResult,
  AdminDispatchEvent,
  AdminFeedbackRiskSummary,
  AdminHomeViewModel,
  AdminRiskChildSummary,
  InstitutionPriorityItem,
} from "./admin-types.ts";

function buildPriorityItem(
  overrides: Partial<InstitutionPriorityItem> & Pick<InstitutionPriorityItem, "id" | "targetType" | "targetId" | "targetName">
): InstitutionPriorityItem {
  return {
    id: overrides.id,
    targetType: overrides.targetType,
    targetId: overrides.targetId,
    targetName: overrides.targetName,
    priorityScore: overrides.priorityScore ?? 90,
    priorityLevel: overrides.priorityLevel ?? "P1",
    reason: overrides.reason ?? `${overrides.targetName} needs follow-up`,
    evidence: overrides.evidence ?? [],
    recommendedOwner: overrides.recommendedOwner ?? { role: "admin", label: "Director Chen" },
    recommendedAction: overrides.recommendedAction ?? "Follow up today",
    recommendedDeadline: overrides.recommendedDeadline ?? "Today 18:00",
    relatedChildIds: overrides.relatedChildIds ?? (overrides.targetType === "child" ? [overrides.targetId] : []),
    relatedClassNames: overrides.relatedClassNames ?? ["Sun Class"],
    dispatchPayload: overrides.dispatchPayload ?? {
      eventType: "admin_action",
      priorityItemId: overrides.id,
      title: `${overrides.targetName} follow-up`,
      summary: overrides.reason ?? `${overrides.targetName} needs follow-up`,
      targetType: overrides.targetType,
      targetId: overrides.targetId,
      targetName: overrides.targetName,
      priorityLevel: overrides.priorityLevel ?? "P1",
      priorityScore: overrides.priorityScore ?? 90,
      recommendedOwnerRole: overrides.recommendedOwner?.role ?? "admin",
      recommendedOwnerName: overrides.recommendedOwner?.label ?? "Director Chen",
      recommendedAction: overrides.recommendedAction ?? "Follow up today",
      recommendedDeadline: overrides.recommendedDeadline ?? "Today 18:00",
      reasonText: overrides.reason ?? `${overrides.targetName} needs follow-up`,
      evidence: overrides.evidence ?? [],
      source: {
        institutionName: "SmartChildcare",
        workflow: "daily-priority",
        relatedChildIds:
          overrides.relatedChildIds ?? (overrides.targetType === "child" ? [overrides.targetId] : []),
        relatedClassNames: overrides.relatedClassNames ?? ["Sun Class"],
      },
    },
  };
}

function buildRiskChild(
  childId: string,
  childName: string,
  overrides: Partial<AdminRiskChildSummary> = {}
): AdminRiskChildSummary {
  return {
    childId,
    childName,
    className: overrides.className ?? "Sun Class",
    priorityLevel: overrides.priorityLevel ?? "P1",
    priorityScore: overrides.priorityScore ?? 88,
    reason: overrides.reason ?? `${childName} remains high risk`,
    ownerLabel: overrides.ownerLabel ?? "Director Chen",
    deadline: overrides.deadline ?? "Today 18:00",
  };
}

function buildFeedbackRisk(
  childId: string,
  childName: string,
  overrides: Partial<AdminFeedbackRiskSummary> = {}
): AdminFeedbackRiskSummary {
  return {
    childId,
    childName,
    className: overrides.className ?? "Sun Class",
    priorityLevel: overrides.priorityLevel ?? "P2",
    reason: overrides.reason ?? `${childName} family feedback is missing`,
    lastFeedbackDate: overrides.lastFeedbackDate,
    recommendedOwner: overrides.recommendedOwner ?? "Teacher Li",
  };
}

function buildDispatchEvent(overrides: Partial<AdminDispatchEvent> = {}): AdminDispatchEvent {
  return {
    id: overrides.id ?? "dispatch-1",
    institutionId: overrides.institutionId ?? "inst-1",
    eventType: overrides.eventType ?? "admin_action",
    status: overrides.status ?? "pending",
    priorityItemId: overrides.priorityItemId ?? "consult-ava",
    title: overrides.title ?? "Ava consultation dispatch",
    summary: overrides.summary ?? "Ava still needs consultation follow-up",
    targetType: overrides.targetType ?? "child",
    targetId: overrides.targetId ?? "child-1",
    targetName: overrides.targetName ?? "Ava",
    priorityLevel: overrides.priorityLevel ?? "P1",
    priorityScore: overrides.priorityScore ?? 92,
    recommendedOwnerRole: overrides.recommendedOwnerRole ?? "admin",
    recommendedOwnerName: overrides.recommendedOwnerName ?? "Director Chen",
    recommendedAction: overrides.recommendedAction ?? "Follow up",
    recommendedDeadline: overrides.recommendedDeadline ?? "Today 18:00",
    reasonText: overrides.reasonText ?? "Consultation still open",
    evidence: overrides.evidence ?? [],
    source: overrides.source ?? {
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      consultationId: "consult-ava",
      relatedConsultationIds: ["consult-ava"],
      relatedChildIds: ["child-1"],
      relatedClassNames: ["Sun Class"],
    },
    createdBy: overrides.createdBy ?? "system",
    updatedBy: overrides.updatedBy ?? "system",
    createdAt: overrides.createdAt ?? "2026-04-09T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-09T08:00:00.000Z",
    completedAt: overrides.completedAt ?? null,
  };
}

function buildConsultationPriorityItem(): AdminConsultationPriorityItem {
  return {
    consultationId: "consult-ava",
    childId: "child-1",
    riskLevel: "high",
    generatedAt: "2026-04-09T08:00:00.000Z",
    shouldEscalateToAdmin: true,
    decision: {
      consultationId: "consult-ava",
      childId: "child-1",
      childName: "Ava",
      className: "Sun Class",
      riskLevel: "high",
      riskLabel: "High Risk",
      priorityLabel: "P1",
      status: "pending",
      statusLabel: "Pending",
      statusSource: "consultation",
      summary: "Ava needs escalation",
      whyHighPriority: "Repeated abnormal follow-up",
      recommendedOwnerName: "Director Chen",
      recommendedAt: "2026-04-09T12:00:00.000Z",
      recommendedAtLabel: "Apr 9 12:00",
      generatedAtLabel: "Apr 9 08:00",
      triggerReasons: ["Repeated abnormal follow-up"],
      keyFindings: ["Mood fluctuations are increasing"],
      schoolActions: ["Observe at noon"],
      homeActions: ["Request parent feedback tonight"],
      followUpActions: ["Review within 48 hours"],
    },
    trace: {
      participants: ["Health", "Diet"],
      keyFindings: ["Mood fluctuations are increasing"],
      collaborationSummary: "Ava needs escalation",
      explainability: [],
      evidenceItems: [],
      providerState: "real",
      providerStateLabel: "Real Provider",
      providerLabel: "provider/model",
      memoryState: "ready",
      memoryStateLabel: "Memory Ready",
      memoryDetail: "1 source matched",
      syncTargets: [],
      evidenceHighlights: [],
      providerTrace: null,
    },
    recommendedOwnerRole: "admin",
    dispatchBindingScope: "consultation",
    dispatchEvent: buildDispatchEvent(),
  };
}

function buildHomeViewModel(): AdminHomeViewModel {
  return {
    riskChildrenCount: 2,
    feedbackCompletionRate: 100,
    pendingItems: ["Ava still needs follow-up today", "Sun Class morning loop is complete"],
    weeklySummary: "Weekly summary",
    weeklyHighlights: ["Ava remains the top concern", "Overall operations are stable"],
    heroStats: [
      { label: "Top priorities", value: "2" },
      { label: "Risk children", value: "2" },
      { label: "Feedback rate", value: "100%" },
      { label: "Pending dispatches", value: "1" },
    ],
    priorityTopItems: [
      buildPriorityItem({
        id: "priority-ava",
        targetType: "child",
        targetId: "child-1",
        targetName: "Ava",
      }),
      buildPriorityItem({
        id: "priority-sun-class",
        targetType: "class",
        targetId: "class-sun",
        targetName: "Sun Class",
        priorityLevel: "P2",
        priorityScore: 72,
      }),
    ],
    riskChildren: [buildRiskChild("child-1", "Ava"), buildRiskChild("child-2", "Ben")],
    riskClasses: [],
    pendingDispatches: [buildDispatchEvent()],
    actionEntrySummary: "Director should push Ava related actions first.",
    adminContext: {} as AdminHomeViewModel["adminContext"],
  };
}

function buildAgentResult(): AdminAgentResult {
  return {
    title: "Daily institution priorities",
    summary: "Ava is the top institution risk today.",
    assistantAnswer: "Start with Ava and coordinate the next loop.",
    institutionScope: {
      institutionName: "SmartChildcare",
      date: "2026-04-10",
      visibleChildren: 2,
      classCount: 1,
      attendanceRate: 100,
      healthAbnormalCount: 1,
      growthAttentionCount: 1,
      pendingReviewCount: 1,
      feedbackCount: 1,
      feedbackCompletionRate: 100,
      riskChildrenCount: 2,
      riskClassCount: 1,
      pendingDispatchCount: 1,
    },
    priorityTopItems: [
      buildPriorityItem({
        id: "priority-ava",
        targetType: "child",
        targetId: "child-1",
        targetName: "Ava",
      }),
      buildPriorityItem({
        id: "priority-ben",
        targetType: "child",
        targetId: "child-2",
        targetName: "Ben",
        priorityLevel: "P2",
        priorityScore: 70,
      }),
    ],
    riskChildren: [buildRiskChild("child-1", "Ava"), buildRiskChild("child-2", "Ben")],
    riskClasses: [],
    feedbackRiskItems: [
      buildFeedbackRisk("child-1", "Ava"),
      buildFeedbackRisk("child-3", "Cara"),
    ],
    highlights: ["Ava still needs escalation", "Ben is improving"],
    actionItems: [
      {
        id: "action-ava",
        title: "Follow up Ava",
        targetType: "child",
        targetId: "child-1",
        targetName: "Ava",
        priorityLevel: "P1",
        ownerRole: "admin",
        ownerLabel: "Director Chen",
        action: "Follow up today",
        deadline: "Today 18:00",
        summary: "Follow up Ava today",
        dispatchPayload: buildPriorityItem({
          id: "priority-ava-action",
          targetType: "child",
          targetId: "child-1",
          targetName: "Ava",
        }).dispatchPayload,
        status: "suggested",
      },
    ],
    recommendedOwnerMap: [],
    quickQuestions: ["What should I do first?"],
    notificationEvents: [buildDispatchEvent()],
    source: "rule",
    generatedAt: "2026-04-10T08:00:00.000Z",
  };
}

test("dedupeAdminHomeExposure removes repeated child exposure outside consultation primary section", () => {
  const deduped = dedupeAdminHomeExposure(buildHomeViewModel(), [buildConsultationPriorityItem()]);

  assert.equal(
    deduped.priorityTopItems.some((item) => item.targetType === "child" && item.targetId === "child-1"),
    false
  );
  assert.equal(deduped.priorityTopItems.some((item) => item.targetId === "class-sun"), true);
  assert.equal(deduped.riskChildren.some((item) => item.childId === "child-1"), false);
  assert.equal(deduped.riskChildren.some((item) => item.childId === "child-2"), true);
  assert.equal(deduped.weeklyHighlights.some((item) => item.includes("Ava")), false);
  assert.equal(deduped.pendingDispatches[0]?.summary.includes("Ava"), false);
});

test("dedupeAdminHomeExposure still dedupes cross-block child exposure without consultation items", () => {
  const deduped = dedupeAdminHomeExposure(buildHomeViewModel(), []);

  assert.equal(deduped.priorityTopItems[0]?.targetId, "child-1");
  assert.deepEqual(
    deduped.riskChildren.map((item) => item.childId),
    ["child-2"]
  );
  assert.deepEqual(deduped.pendingItems, ["Sun Class morning loop is complete"]);
  assert.equal(deduped.actionEntrySummary.includes("Ava"), false);
  assert.notEqual(deduped.actionEntrySummary, buildHomeViewModel().actionEntrySummary);
});

test("dedupeAdminAgentResultExposure keeps consultation child only in the highest-priority section", () => {
  const deduped = dedupeAdminAgentResultExposure(buildAgentResult(), [buildConsultationPriorityItem()]);

  assert.deepEqual(
    deduped.priorityTopItems.map((item) => item.targetId),
    ["child-2"]
  );
  assert.deepEqual(deduped.riskChildren.map((item) => item.childId), []);
  assert.deepEqual(
    deduped.feedbackRiskItems.map((item) => item.childId),
    ["child-3"]
  );
  assert.deepEqual(deduped.highlights, []);
});

test("dedupeAdminAgentResultExposure removes child highlights already surfaced by action items", () => {
  const result = buildAgentResult();
  result.priorityTopItems = [
    buildPriorityItem({
      id: "priority-sun-class",
      targetType: "class",
      targetId: "class-sun",
      targetName: "Sun Class",
      priorityLevel: "P2",
      priorityScore: 72,
    }),
  ];
  result.riskChildren = [];
  result.feedbackRiskItems = [];
  result.highlights = ["Ava still needs escalation", "Overall operations are stable"];

  const deduped = dedupeAdminAgentResultExposure(result, []);

  assert.deepEqual(deduped.highlights, ["Overall operations are stable"]);
});
