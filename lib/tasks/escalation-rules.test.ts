import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalTask, TaskEscalationSuggestion } from "@/lib/tasks/types";
import {
  buildInterventionTasksFromCard,
  buildTaskFromAdminDispatchEvent,
} from "@/lib/tasks/task-model";
import {
  evaluateTaskEscalations,
  pickHighestPriorityEscalation,
} from "./escalation-rules";

function buildTaskPair(params: {
  id: string;
  childId?: string;
  createdAt: string;
}) {
  return buildInterventionTasksFromCard({
    id: params.id,
    title: `Task ${params.id}`,
    targetChildId: params.childId ?? "child-1",
    tonightHomeAction: `Home action for ${params.id}`,
    reviewIn48h: `Review action for ${params.id}`,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
  });
}

function buildAdminTask(params: {
  id: string;
  childId?: string;
  deadline: string;
}) {
  return buildTaskFromAdminDispatchEvent({
    id: params.id,
    institutionId: "inst-1",
    eventType: "admin-focus",
    status: "in_progress",
    priorityItemId: `priority-${params.id}`,
    title: `Admin follow-up ${params.id}`,
    summary: "Review the current case.",
    targetType: "child",
    targetId: params.childId ?? "child-1",
    targetName: "Anan",
    priorityLevel: "P1",
    priorityScore: 90,
    recommendedOwnerRole: "admin",
    recommendedOwnerName: "Director Wang",
    recommendedAction: "Review the case today.",
    recommendedDeadline: params.deadline,
    reasonText: "Task escalation",
    evidence: [],
    source: {
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      relatedChildIds: [params.childId ?? "child-1"],
      consultationId: `consult-${params.id}`,
      relatedConsultationIds: [`consult-${params.id}`],
    },
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
  });
}

function byTaskId(
  suggestions: TaskEscalationSuggestion[],
  taskId: string
): TaskEscalationSuggestion | undefined {
  return suggestions.find((item) => item.taskId === taskId);
}

test("evaluateTaskEscalations marks overdue teacher follow-up and keeps due risk window", () => {
  const { followUpTask } = buildTaskPair({
    id: "card-overdue-teacher",
    createdAt: "2026-04-01T08:00:00.000Z",
  });
  const overdueTask: CanonicalTask = {
    ...followUpTask,
    dueAt: "2026-04-02T00:00:00.000Z",
    status: "overdue",
  };

  const suggestions = evaluateTaskEscalations({
    tasks: [overdueTask],
    reminders: [
      {
        childId: overdueTask.childId,
        taskId: overdueTask.taskId,
        scheduledAt: "2026-04-02T02:00:00.000Z",
        status: "pending",
      },
      {
        childId: overdueTask.childId,
        taskId: overdueTask.taskId,
        scheduledAt: "2026-04-02T03:00:00.000Z",
        status: "snoozed",
      },
    ],
    now: "2026-04-04T12:00:00.000Z",
  });

  const suggestion = byTaskId(suggestions, overdueTask.taskId);
  assert.ok(suggestion);
  assert.equal(suggestion?.escalationLevel, "review_required");
  assert.ok(suggestion?.triggeredRules.includes("overdue_48h"));
  assert.ok(!suggestion?.triggeredRules.includes("legacy_low_response_proxy"));
  assert.equal(suggestion?.dueRiskWindow.status, "overdue");
  assert.equal(suggestion?.dueRiskWindow.referenceDueAt, "2026-04-02T00:00:00.000Z");
  assert.ok((suggestion?.dueRiskWindow.hoursOverdue ?? 0) >= 60);
  assert.match(suggestion?.dueRiskWindow.label ?? "", /Overdue/i);
});

test("evaluateTaskEscalations promotes overdue admin follow-up to director attention", () => {
  const adminTask = {
    ...buildAdminTask({
      id: "admin-overdue",
      deadline: "2026-04-01T09:00:00.000Z",
    }),
    status: "overdue" as const,
  };

  const suggestions = evaluateTaskEscalations({
    tasks: [adminTask],
    now: "2026-04-03T12:00:00.000Z",
  });

  const suggestion = byTaskId(suggestions, adminTask.taskId);
  assert.equal(suggestion?.escalationLevel, "director_attention");
  assert.deepEqual(suggestion?.triggeredRules, ["overdue_48h"]);
  assert.equal(suggestion?.ownerRole, "admin");
});

test("evaluateTaskEscalations escalates guardian negative feedback to re-consultation", () => {
  const { parentTask, followUpTask } = buildTaskPair({
    id: "card-negative-feedback",
    createdAt: "2026-04-10T08:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [parentTask, { ...followUpTask, status: "completed", completedAt: "2026-04-10T11:00:00.000Z" }],
    guardianFeedbacks: [
      {
        childId: parentTask.childId,
        date: "2026-04-10T10:30:00.000Z",
        interventionCardId: "card-negative-feedback",
        executionStatus: "not_started",
        improved: false,
        executed: false,
      },
    ],
    now: "2026-04-10T12:00:00.000Z",
  });

  const suggestion = byTaskId(suggestions, parentTask.taskId);
  assert.equal(suggestion?.escalationLevel, "reconsult_required");
  assert.ok(
    suggestion?.triggeredRules.includes("guardian_feedback_negative_no_improvement")
  );
  assert.equal(suggestion?.ownerRole, "admin");
  assert.deepEqual(suggestion?.relatedTaskIds, [followUpTask.taskId]);
});

test("evaluateTaskEscalations detects repeated follow-up within 48 hours", () => {
  const pairOne = buildTaskPair({
    id: "card-follow-up-1",
    createdAt: "2026-04-09T08:00:00.000Z",
  });
  const pairTwo = buildTaskPair({
    id: "card-follow-up-2",
    createdAt: "2026-04-10T10:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [pairOne.followUpTask, pairTwo.followUpTask],
    now: "2026-04-10T18:00:00.000Z",
  });

  const highest = pickHighestPriorityEscalation(suggestions);
  assert.equal(highest?.escalationLevel, "reconsult_required");
  assert.ok(highest?.triggeredRules.includes("same_child_repeated_follow_up_48h"));
  assert.ok(
    highest?.relatedTaskIds.includes(
      highest.taskId === pairOne.followUpTask.taskId
        ? pairTwo.followUpTask.taskId
        : pairOne.followUpTask.taskId
    )
  );
});

test("evaluateTaskEscalations upgrades repeated follow-up to director attention when admin follow-up is pending", () => {
  const pairOne = buildTaskPair({
    id: "card-follow-up-3",
    createdAt: "2026-04-09T08:00:00.000Z",
  });
  const pairTwo = buildTaskPair({
    id: "card-follow-up-4",
    createdAt: "2026-04-10T10:00:00.000Z",
  });
  const adminTask = buildAdminTask({
    id: "admin-pending",
    deadline: "2026-04-11T18:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [pairOne.followUpTask, pairTwo.followUpTask, adminTask],
    now: "2026-04-10T18:00:00.000Z",
  });

  const highest = pickHighestPriorityEscalation(suggestions);
  assert.equal(highest?.escalationLevel, "director_attention");
  assert.ok(highest?.triggeredRules.includes("same_child_repeated_follow_up_48h"));
});

test("evaluateTaskEscalations flags stalled teacher follow-up after 24 hours without evidence", () => {
  const { parentTask, followUpTask } = buildTaskPair({
    id: "card-stalled-teacher",
    createdAt: "2026-04-08T08:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [parentTask, followUpTask],
    now: "2026-04-09T10:30:00.000Z",
  });

  const suggestion = byTaskId(suggestions, followUpTask.taskId);
  assert.equal(suggestion?.escalationLevel, "review_required");
  assert.ok(suggestion?.triggeredRules.includes("teacher_follow_up_stalled"));
});

test("evaluateTaskEscalations marks multiple pending tasks for the same child as director attention", () => {
  const taskOne = buildTaskPair({
    id: "card-pending-1",
    createdAt: "2026-04-10T08:00:00.000Z",
  }).parentTask;
  const taskTwo = buildTaskPair({
    id: "card-pending-2",
    createdAt: "2026-04-10T09:00:00.000Z",
  }).parentTask;
  const taskThree = buildTaskPair({
    id: "card-pending-3",
    createdAt: "2026-04-10T10:00:00.000Z",
  }).parentTask;

  const suggestions = evaluateTaskEscalations({
    tasks: [taskOne, taskTwo, taskThree],
    now: "2026-04-10T12:00:00.000Z",
  });

  const highest = pickHighestPriorityEscalation(suggestions);
  assert.equal(highest?.escalationLevel, "director_attention");
  assert.ok(highest?.triggeredRules.includes("multiple_pending_tasks_same_child"));
});

test("evaluateTaskEscalations uses legacy low-response proxy only when canonical evidence is missing", () => {
  const { parentTask } = buildTaskPair({
    id: "card-legacy-proxy",
    createdAt: "2026-04-08T08:00:00.000Z",
  });

  const noFallbackYet = evaluateTaskEscalations({
    tasks: [parentTask],
    reminders: [
      {
        childId: parentTask.childId,
        taskId: parentTask.taskId,
        scheduledAt: "2026-04-08T09:00:00.000Z",
        status: "pending",
      },
    ],
    now: "2026-04-09T12:00:00.000Z",
  });

  assert.equal(noFallbackYet.length, 0);

  const staleProxySuggestions = evaluateTaskEscalations({
    tasks: [{ ...parentTask, dueAt: "2026-04-12T12:00:00.000Z" }],
    reminders: [
      {
        childId: parentTask.childId,
        taskId: parentTask.taskId,
        scheduledAt: "2026-04-08T09:00:00.000Z",
        status: "pending",
      },
    ],
    now: "2026-04-10T12:00:00.000Z",
  });

  assert.equal(staleProxySuggestions[0]?.escalationLevel, "review_required");
  assert.deepEqual(staleProxySuggestions[0]?.triggeredRules, [
    "legacy_low_response_proxy",
  ]);

  const canonicalEvidenceSuggestions = evaluateTaskEscalations({
    tasks: [{ ...parentTask, lastEvidenceAt: "2026-04-09T09:00:00.000Z" }],
    reminders: [
      {
        childId: parentTask.childId,
        taskId: parentTask.taskId,
        scheduledAt: "2026-04-08T09:00:00.000Z",
        status: "pending",
      },
    ],
    now: "2026-04-10T12:00:00.000Z",
  });

  assert.equal(canonicalEvidenceSuggestions.length, 0);
});

test("pickHighestPriorityEscalation prefers higher levels over lower ones", () => {
  const highest = pickHighestPriorityEscalation([
    {
      taskId: "task-review",
      childId: "child-1",
      shouldEscalate: true,
      escalationLevel: "review_required",
      escalationReason: "Teacher review is overdue.",
      recommendedNextStep: "Follow up with the teacher.",
      triggeredRules: ["teacher_follow_up_stalled"],
      relatedTaskIds: [],
      ownerRole: "teacher",
      dueRiskWindow: {
        referenceDueAt: "2026-04-10T10:00:00.000Z",
        windowStartAt: "2026-04-09T10:00:00.000Z",
        windowEndAt: "2026-04-12T10:00:00.000Z",
        status: "due_soon",
        hoursOverdue: 0,
        label: "Due in 2h",
      },
    },
    {
      taskId: "task-director",
      childId: "child-1",
      shouldEscalate: true,
      escalationLevel: "director_attention",
      escalationReason: "Multiple pending tasks require director attention.",
      recommendedNextStep: "Escalate to the director.",
      triggeredRules: ["multiple_pending_tasks_same_child"],
      relatedTaskIds: ["task-review"],
      ownerRole: "admin",
      dueRiskWindow: {
        referenceDueAt: "2026-04-09T10:00:00.000Z",
        windowStartAt: "2026-04-08T10:00:00.000Z",
        windowEndAt: "2026-04-11T10:00:00.000Z",
        status: "overdue",
        hoursOverdue: 26,
        label: "Overdue by 26h",
      },
    },
  ]);

  assert.equal(highest?.taskId, "task-director");
  assert.equal(highest?.escalationLevel, "director_attention");
});

test("evaluateTaskEscalations matches negative feedback by relatedTaskId before legacy card linkage", () => {
  const { parentTask, followUpTask } = buildTaskPair({
    id: "card-related-negative",
    createdAt: "2026-04-10T08:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [parentTask, { ...followUpTask, status: "completed", completedAt: "2026-04-10T11:00:00.000Z" }],
    guardianFeedbacks: [
      {
        childId: parentTask.childId,
        date: "2026-04-10T10:30:00.000Z",
        submittedAt: "2026-04-10T10:30:00.000Z",
        relatedTaskId: parentTask.taskId,
        interventionCardId: "different-card",
        executionStatus: "unable_to_execute",
        improvementStatus: "worse",
        executed: false,
        improved: false,
        notes: "The parent could not execute the intervention tonight.",
        barriers: ["Child had a fever"],
      },
    ],
    now: "2026-04-10T12:00:00.000Z",
  });

  const suggestion = byTaskId(suggestions, parentTask.taskId);
  assert.equal(suggestion?.escalationLevel, "reconsult_required");
  assert.ok(suggestion?.triggeredRules.includes("guardian_feedback_negative_no_improvement"));
  assert.equal(suggestion?.ownerRole, "admin");
});

test("evaluateTaskEscalations can bind negative feedback through relatedConsultationId", () => {
  const { parentTask, followUpTask } = buildInterventionTasksFromCard({
    id: "card-consult-link",
    consultationId: "consult-shared-1",
    title: "Task card-consult-link",
    targetChildId: "child-1",
    tonightHomeAction: "Home action for card-consult-link",
    reviewIn48h: "Review action for card-consult-link",
    createdAt: "2026-04-10T08:00:00.000Z",
    updatedAt: "2026-04-10T08:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [parentTask, { ...followUpTask, status: "completed", completedAt: "2026-04-10T11:00:00.000Z" }],
    guardianFeedbacks: [
      {
        childId: parentTask.childId,
        date: "2026-04-10T10:30:00.000Z",
        submittedAt: "2026-04-10T10:30:00.000Z",
        relatedConsultationId: "consult-shared-1",
        interventionCardId: "different-card",
        executionStatus: "unable_to_execute",
        improvementStatus: "worse",
        executed: false,
        improved: false,
        notes: "The parent could not execute the intervention tonight.",
        barriers: ["Child had a fever"],
      },
    ],
    now: "2026-04-10T12:00:00.000Z",
  });

  const suggestion = byTaskId(suggestions, parentTask.taskId);
  assert.equal(suggestion?.escalationLevel, "reconsult_required");
  assert.ok(suggestion?.triggeredRules.includes("guardian_feedback_negative_no_improvement"));
});

test("evaluateTaskEscalations treats no_change improvement as negative structured feedback", () => {
  const { parentTask, followUpTask } = buildTaskPair({
    id: "card-no-change",
    createdAt: "2026-04-10T08:00:00.000Z",
  });

  const suggestions = evaluateTaskEscalations({
    tasks: [parentTask, { ...followUpTask, status: "completed", completedAt: "2026-04-10T11:00:00.000Z" }],
    guardianFeedbacks: [
      {
        childId: parentTask.childId,
        date: "2026-04-10T10:45:00.000Z",
        interventionCardId: "card-no-change",
        executionStatus: "partial",
        improvementStatus: "no_change",
        executed: true,
        improved: false,
      },
    ],
    now: "2026-04-10T12:00:00.000Z",
  });

  const suggestion = byTaskId(suggestions, parentTask.taskId);
  assert.equal(suggestion?.escalationLevel, "reconsult_required");
  assert.ok(suggestion?.triggeredRules.includes("guardian_feedback_negative_no_improvement"));
});
