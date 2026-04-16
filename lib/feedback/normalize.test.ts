import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeGuardianFeedbackCollection,
  normalizeParentStructuredFeedback,
  toFollowUpFeedbackLite,
} from "@/lib/feedback/normalize";

test("normalizeParentStructuredFeedback upgrades legacy guardian feedback into canonical record with legacy mirror", () => {
  const normalized = normalizeParentStructuredFeedback({
    id: "fb-legacy-1",
    childId: "child-1",
    date: "2026-04-10T08:00:00.000Z",
    status: "partial",
    content: "Bedtime routine was only partially completed.",
    sourceWorkflow: "parent-agent",
    executed: true,
    improved: false,
    freeNote: "Child resisted near the last step.",
    interventionCardId: "card-1",
    createdBy: "Parent Wang",
    createdByRole: "parent",
  });

  assert.ok(normalized);
  assert.equal(normalized?.feedbackId, "fb-legacy-1");
  assert.equal(normalized?.id, "fb-legacy-1");
  assert.equal(normalized?.sourceRole, "parent");
  assert.equal(normalized?.sourceChannel, "parent-agent");
  assert.equal(normalized?.relatedTaskId, "card-1");
  assert.equal(normalized?.interventionCardId, "card-1");
  assert.equal(normalized?.executionStatus, "completed");
  assert.equal(normalized?.improvementStatus, "no_change");
  assert.equal(normalized?.notes, "Child resisted near the last step.");
  assert.equal(normalized?.content, "Bedtime routine was only partially completed.");
});

test("normalizeParentStructuredFeedback backfills legacy mirror from structured feedback fields", () => {
  const normalized = normalizeParentStructuredFeedback({
    feedbackId: "fb-structured-1",
    childId: "child-2",
    sourceRole: "parent",
    sourceChannel: "manual",
    relatedTaskId: "task-parent-1",
    relatedConsultationId: "consult-1",
    executionStatus: "unable_to_execute",
    executionCount: 1,
    executorRole: "grandparent",
    childReaction: "resisted",
    improvementStatus: "worse",
    barriers: ["Child got sick", "Schedule changed"],
    notes: "The family could not execute the step tonight.",
    attachments: {
      voice: [{ url: "https://example.com/audio.mp3", mimeType: "audio/mpeg" }],
    },
    submittedAt: "2026-04-10T20:00:00.000Z",
    source: {
      kind: "structured",
      workflow: "manual",
      createdBy: "Grandma Li",
      createdByRole: "grandparent" as never,
    },
    fallback: {
      rawExecutionStatus: "unable_to_execute",
    },
    createdBy: "Grandma Li",
    createdByRole: "grandparent" as never,
  });

  assert.ok(normalized);
  assert.equal(normalized?.id, "fb-structured-1");
  assert.equal(normalized?.date, "2026-04-10T20:00:00.000Z");
  assert.equal(normalized?.interventionCardId, "task-parent-1");
  assert.equal(normalized?.executed, false);
  assert.equal(normalized?.improved, false);
  assert.match(normalized?.content ?? "", /Barriers:/);
  assert.match(normalized?.freeNote ?? "", /Schedule changed/);
});

test("normalizeGuardianFeedbackCollection dedupes mixed legacy and structured feedback by keeping the richer record", () => {
  const feedback = normalizeGuardianFeedbackCollection([
    {
      id: "fb-mixed-1",
      childId: "child-3",
      date: "2026-04-10T08:00:00.000Z",
      status: "partial",
      content: "Legacy note.",
      createdBy: "Parent Zhou",
      createdByRole: "parent",
    },
    {
      feedbackId: "fb-mixed-1",
      childId: "child-3",
      sourceRole: "parent",
      sourceChannel: "manual",
      relatedTaskId: "task-parent-3",
      executionStatus: "partial",
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "slight_improvement",
      barriers: ["Needed extra prompting"],
      notes: "Structured note.",
      attachments: {},
      submittedAt: "2026-04-10T08:00:00.000Z",
      source: { kind: "structured", workflow: "manual" },
      fallback: {},
      createdBy: "Parent Zhou",
      createdByRole: "parent",
    },
  ]);

  assert.ok(feedback);
  assert.equal(feedback?.length, 1);
  assert.equal(feedback?.[0]?.relatedTaskId, "task-parent-3");
  assert.equal(feedback?.[0]?.notes, "Structured note.");
  assert.deepEqual(feedback?.[0]?.barriers, ["Needed extra prompting"]);
});

test("toFollowUpFeedbackLite preserves canonical fields needed by follow-up and consultation bridges", () => {
  const lite = toFollowUpFeedbackLite({
    feedbackId: "fb-lite-1",
    childId: "child-4",
    sourceRole: "parent",
    sourceChannel: "manual",
    relatedTaskId: "task-parent-4",
    executionStatus: "partial",
    executorRole: "parent",
    childReaction: "accepted",
    improvementStatus: "slight_improvement",
    barriers: ["Child got distracted"],
    notes: "The child accepted the first two steps.",
    attachments: {},
    submittedAt: "2026-04-10T21:00:00.000Z",
    source: { kind: "structured", workflow: "manual" },
    fallback: {},
    createdBy: "Parent Lin",
    createdByRole: "parent",
  });

  assert.ok(lite);
  assert.equal(lite?.feedbackId, "fb-lite-1");
  assert.equal(lite?.relatedTaskId, "task-parent-4");
  assert.equal(lite?.executionStatus, "partial");
  assert.equal(lite?.improvementStatus, "slight_improvement");
  assert.deepEqual(lite?.barriers, ["Child got distracted"]);
  assert.equal(lite?.notes, "The child accepted the first two steps.");
});

test("normalizeParentStructuredFeedback accepts UI-originated canonical payload with execution count, barriers, notes, and empty attachments", () => {
  const normalized = normalizeParentStructuredFeedback({
    childId: "child-ui-1",
    executionStatus: "completed",
    executionCount: 2,
    executorRole: "parent",
    childReaction: "accepted",
    improvementStatus: "clear_improvement",
    barriers: ["孩子抗拒", "今晚没时间"],
    notes: "先抗拒，后面愿意配合完成两次。",
    relatedTaskId: "task-parent-ui-1",
    relatedConsultationId: "consult-ui-1",
    attachments: {},
    sourceChannel: "parent-agent",
    createdBy: "Parent Chen",
    createdByRole: "parent",
  });

  assert.ok(normalized);
  assert.equal(normalized?.executionStatus, "completed");
  assert.equal(normalized?.executionCount, 2);
  assert.equal(normalized?.executorRole, "parent");
  assert.equal(normalized?.childReaction, "accepted");
  assert.equal(normalized?.improvementStatus, "clear_improvement");
  assert.deepEqual(normalized?.barriers, ["孩子抗拒", "今晚没时间"]);
  assert.equal(normalized?.notes, "先抗拒，后面愿意配合完成两次。");
  assert.deepEqual(normalized?.attachments, {});
  assert.equal(normalized?.relatedTaskId, "task-parent-ui-1");
  assert.equal(normalized?.relatedConsultationId, "consult-ui-1");
  assert.equal(normalized?.sourceChannel, "parent-agent");
});
