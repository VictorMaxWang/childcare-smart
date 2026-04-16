import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStructuredFeedbackConsumption,
  selectStructuredFeedback,
} from "@/lib/feedback/consumption";

const baseFeedback = {
  childId: "child-1",
  sourceRole: "parent" as const,
  sourceChannel: "manual",
  executionStatus: "completed" as const,
  executorRole: "parent" as const,
  childReaction: "accepted" as const,
  improvementStatus: "clear_improvement" as const,
  barriers: [] as string[],
  notes: "The child settled quickly.",
  attachments: {},
  source: { kind: "structured" as const, workflow: "manual" },
  fallback: {},
  createdBy: "Parent Lin",
  createdByRole: "parent" as never,
};

test("selectStructuredFeedback prefers relatedTaskId before consultation and raw card fallback", () => {
  const selected = selectStructuredFeedback(
    [
      {
        ...baseFeedback,
        feedbackId: "fb-latest",
        submittedAt: "2026-04-11T08:00:00.000Z",
        relatedConsultationId: "consult-other",
      },
      {
        ...baseFeedback,
        feedbackId: "fb-task",
        submittedAt: "2026-04-10T08:00:00.000Z",
        relatedTaskId: "task-parent-1",
        relatedConsultationId: "consult-1",
        fallback: { rawInterventionCardId: "card-1" },
      },
      {
        ...baseFeedback,
        feedbackId: "fb-card",
        submittedAt: "2026-04-09T08:00:00.000Z",
        relatedConsultationId: "consult-1",
        fallback: { rawInterventionCardId: "card-1" },
      },
    ],
    {
      childId: "child-1",
      relatedTaskId: "task-parent-1",
      relatedConsultationId: "consult-1",
      interventionCardId: "card-1",
    }
  );

  assert.equal(selected?.feedbackId, "fb-task");
});

test("buildStructuredFeedbackConsumption turns barriers and no-improvement states into open loops", () => {
  const consumption = buildStructuredFeedbackConsumption({
    feedbackId: "fb-open-loop",
    childId: "child-1",
    sourceRole: "parent",
    sourceChannel: "manual",
    relatedTaskId: "task-parent-2",
    relatedConsultationId: "consult-2",
    executionStatus: "unable_to_execute",
    executionCount: 1,
    executorRole: "parent",
    childReaction: "resisted",
    improvementStatus: "worse",
    barriers: ["Child had a fever"],
    notes: "The family could not execute the task tonight.",
    attachments: {},
    submittedAt: "2026-04-11T08:00:00.000Z",
    source: { kind: "structured", workflow: "manual" },
    fallback: { rawInterventionCardId: "card-2" },
    id: "fb-open-loop",
    date: "2026-04-11T08:00:00.000Z",
    status: "unable_to_execute",
    content: "The child was sick tonight.",
    interventionCardId: "task-parent-2",
    sourceWorkflow: "manual",
    executed: false,
    improved: false,
    freeNote: "Child had a fever",
  });

  assert.match(consumption.summary ?? "", /暂时无法执行/);
  assert.ok(consumption.openLoops.some((item) => item.includes("task-parent-2")));
  assert.ok(consumption.openLoops.some((item) => item.includes("Child had a fever")));
  assert.match(consumption.primaryActionSupport ?? "", /阻碍/);
});
