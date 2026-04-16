import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAdminNotificationSource } from "./notification-event-source";

test("normalizeAdminNotificationSource keeps task metadata and drops empty source", () => {
  assert.equal(normalizeAdminNotificationSource(undefined), null);
  assert.equal(normalizeAdminNotificationSource({ relatedChildIds: ["", "  "] }), null);

  assert.deepEqual(
    normalizeAdminNotificationSource({
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      relatedChildIds: ["child-1", "", "child-1"],
      relatedClassNames: ["向日葵班", ""],
      consultationId: "consult-1",
      relatedConsultationIds: ["consult-1", "consult-1"],
      taskId: "task-child-1",
      sourceType: "consultation",
      sourceId: "consult-1",
      relatedTaskIds: ["task-child-1", "task-child-1"],
      escalation: {
        taskId: "task-child-1",
        childId: "child-1",
        shouldEscalate: true,
        escalationLevel: "director_attention",
        escalationReason: "Multiple pending tasks require director attention.",
        recommendedNextStep: "Review the child plan today.",
        triggeredRules: ["multiple_pending_tasks_same_child"],
        relatedTaskIds: ["task-child-1", "task-child-2"],
        ownerRole: "admin",
        dueRiskWindow: {
          referenceDueAt: "2026-04-11T10:00:00.000Z",
          windowStartAt: "2026-04-10T10:00:00.000Z",
          windowEndAt: "2026-04-13T10:00:00.000Z",
          status: "overdue",
          hoursOverdue: 26,
          label: "Overdue by 26h",
        },
      },
    }),
    {
      institutionName: "SmartChildcare",
      workflow: "daily-priority",
      relatedChildIds: ["child-1"],
      relatedClassNames: ["向日葵班"],
      consultationId: "consult-1",
      relatedConsultationIds: ["consult-1"],
      taskId: "task-child-1",
      sourceType: "consultation",
      sourceId: "consult-1",
      relatedTaskIds: ["task-child-1"],
      escalation: {
        taskId: "task-child-1",
        childId: "child-1",
        shouldEscalate: true,
        escalationLevel: "director_attention",
        escalationReason: "Multiple pending tasks require director attention.",
        recommendedNextStep: "Review the child plan today.",
        triggeredRules: ["multiple_pending_tasks_same_child"],
        relatedTaskIds: ["task-child-1", "task-child-2"],
        ownerRole: "admin",
        dueRiskWindow: {
          referenceDueAt: "2026-04-11T10:00:00.000Z",
          windowStartAt: "2026-04-10T10:00:00.000Z",
          windowEndAt: "2026-04-13T10:00:00.000Z",
          status: "overdue",
          hoursOverdue: 26,
          label: "Overdue by 26h",
        },
      },
    }
  );
});
