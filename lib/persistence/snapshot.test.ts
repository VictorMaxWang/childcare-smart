import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppStateSnapshot } from "@/lib/persistence/snapshot";

function buildBaseSnapshot() {
  return {
    children: [{ id: "child-1", name: "Ava" }],
    attendance: [],
    meals: [],
    growth: [],
    feedback: [],
    health: [],
    taskCheckIns: [],
    interventionCards: [],
    consultations: [],
    mobileDrafts: [],
    reminders: [],
    updatedAt: "2026-04-10T10:00:00.000Z",
  };
}

test("normalizeAppStateSnapshot accepts legacy guardian feedback records", () => {
  const snapshot = normalizeAppStateSnapshot({
    ...buildBaseSnapshot(),
    feedback: [
      {
        id: "fb-legacy-1",
        childId: "child-1",
        date: "2026-04-10T09:00:00.000Z",
        status: "partial",
        content: "Legacy feedback content.",
        sourceWorkflow: "parent-agent",
        executed: true,
        improved: false,
        freeNote: "Legacy free note.",
        createdBy: "Parent Chen",
        createdByRole: "parent",
      },
    ],
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.feedback.length, 1);
  assert.equal(snapshot?.feedback[0]?.feedbackId, "fb-legacy-1");
  assert.equal(snapshot?.feedback[0]?.notes, "Legacy free note.");
});

test("normalizeAppStateSnapshot accepts structured feedback-only records and backfills the legacy mirror", () => {
  const snapshot = normalizeAppStateSnapshot({
    ...buildBaseSnapshot(),
    feedback: [
      {
        feedbackId: "fb-structured-1",
        childId: "child-1",
        sourceRole: "parent",
        sourceChannel: "manual",
        relatedTaskId: "task-parent-1",
        executionStatus: "unable_to_execute",
        executorRole: "parent",
        childReaction: "resisted",
        improvementStatus: "worse",
        barriers: ["Child had a fever"],
        notes: "Could not execute tonight due to fever.",
        attachments: {},
        submittedAt: "2026-04-10T09:00:00.000Z",
        source: { kind: "structured", workflow: "manual" },
        fallback: {},
        createdBy: "Parent Chen",
        createdByRole: "parent",
      },
    ],
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.feedback.length, 1);
  assert.equal(snapshot?.feedback[0]?.id, "fb-structured-1");
  assert.equal(snapshot?.feedback[0]?.interventionCardId, "task-parent-1");
  assert.equal(snapshot?.feedback[0]?.executed, false);
  assert.equal(snapshot?.feedback[0]?.improved, false);
});

test("normalizeAppStateSnapshot dedupes mixed legacy and structured feedback before materializing tasks", () => {
  const snapshot = normalizeAppStateSnapshot({
    ...buildBaseSnapshot(),
    interventionCards: [
      {
        id: "card-1",
        title: "Sleep support",
        riskLevel: "medium",
        targetChildId: "child-1",
        summary: "Keep the bedtime routine stable.",
        tonightHomeAction: "Keep the same bedtime routine.",
        reviewIn48h: "Review bedtime reaction in 48 hours.",
        createdAt: "2026-04-09T08:00:00.000Z",
        updatedAt: "2026-04-09T08:00:00.000Z",
      },
    ],
    feedback: [
      {
        id: "fb-dedupe-1",
        childId: "child-1",
        date: "2026-04-10T09:00:00.000Z",
        status: "partial",
        content: "Legacy content only.",
        interventionCardId: "card-1",
        createdBy: "Parent Chen",
        createdByRole: "parent",
      },
      {
        feedbackId: "fb-dedupe-1",
        childId: "child-1",
        sourceRole: "parent",
        sourceChannel: "manual",
        relatedTaskId: "task:intervention_card:card-1:parent",
        executionStatus: "partial",
        executorRole: "parent",
        childReaction: "accepted",
        improvementStatus: "slight_improvement",
        barriers: ["Needed a reminder"],
        notes: "Structured content should win.",
        attachments: {},
        submittedAt: "2026-04-10T09:00:00.000Z",
        source: { kind: "structured", workflow: "manual" },
        fallback: {},
        createdBy: "Parent Chen",
        createdByRole: "parent",
      },
    ],
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.feedback.length, 1);
  assert.equal(snapshot?.feedback[0]?.notes, "Structured content should win.");
  assert.equal(snapshot?.tasks.length, 2);
});

test("normalizeAppStateSnapshot rejects feedback records that cannot be normalized", () => {
  const snapshot = normalizeAppStateSnapshot({
    ...buildBaseSnapshot(),
    feedback: [
      {
        childId: "child-1",
        status: "partial",
      },
    ],
  });

  assert.equal(snapshot, null);
});

test("normalizeAppStateSnapshot accepts structured feedback records with execution details and empty attachment stubs", () => {
  const snapshot = normalizeAppStateSnapshot({
    ...buildBaseSnapshot(),
    feedback: [
      {
        feedbackId: "fb-structured-ui-2",
        childId: "child-1",
        sourceRole: "parent",
        sourceChannel: "parent-agent",
        relatedTaskId: "task-parent-ui-2",
        relatedConsultationId: "consult-ui-2",
        executionStatus: "completed",
        executionCount: 3,
        executorRole: "mixed",
        childReaction: "improved",
        improvementStatus: "clear_improvement",
        barriers: ["孩子抗拒"],
        notes: "家里两位照护人都跟着做，第三次明显更顺。",
        attachments: {},
        submittedAt: "2026-04-10T09:30:00.000Z",
        source: { kind: "structured", workflow: "parent-agent" },
        fallback: {},
        createdBy: "Parent Chen",
        createdByRole: "parent",
      },
    ],
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.feedback.length, 1);
  assert.equal(snapshot?.feedback[0]?.executionCount, 3);
  assert.equal(snapshot?.feedback[0]?.executorRole, "mixed");
  assert.equal(snapshot?.feedback[0]?.relatedConsultationId, "consult-ui-2");
  assert.deepEqual(snapshot?.feedback[0]?.attachments, {});
});
