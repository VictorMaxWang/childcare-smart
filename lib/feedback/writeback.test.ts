import assert from "node:assert/strict";
import test from "node:test";

import { upsertGuardianFeedbackWriteback } from "@/lib/feedback/writeback";

test("upsertGuardianFeedbackWriteback preserves API feedback id and replaces existing local mirror", () => {
  const next = upsertGuardianFeedbackWriteback({
    previous: [
      {
        feedbackId: "feedback-api-1",
        id: "feedback-api-1",
        childId: "c-1",
        sourceRole: "parent",
        sourceChannel: "parent-agent",
        executionStatus: "partial",
        executorRole: "parent",
        childReaction: "neutral",
        improvementStatus: "unknown",
        barriers: [],
        notes: "older note",
        attachments: {},
        submittedAt: "2026-05-19T10:00:00.000Z",
        source: { kind: "structured", workflow: "parent-agent" },
        fallback: {},
        date: "2026-05-19T10:00:00.000Z",
        status: "partial",
        content: "older note",
        createdBy: "林小雨妈妈",
        createdByRole: "家长",
        executed: true,
        improved: "unknown",
      },
    ],
    input: {
      feedbackId: "feedback-api-1",
      id: "feedback-api-1",
      childId: "c-1",
      executionStatus: "completed",
      executionCount: 1,
      executorRole: "parent",
      childReaction: "improved",
      improvementStatus: "clear_improvement",
      barriers: [],
      notes: "家长反馈写回测试：完成共读并愿意走到门口。",
      content: "家长反馈写回测试：完成共读并愿意走到门口。",
      attachments: { image: [{ name: "writeback.png", mimeType: "image/png" }] },
      submittedAt: "2026-05-19T21:00:00.000Z",
      date: "2026-05-19T21:00:00.000Z",
      sourceChannel: "parent-agent",
    },
    currentUserName: "林小雨妈妈",
    currentUserRole: "家长",
    fallbackFeedbackId: "fb-client-should-not-be-used",
  });

  assert.equal(next.length, 1);
  assert.equal(next[0]?.feedbackId, "feedback-api-1");
  assert.equal(next[0]?.id, "feedback-api-1");
  assert.equal(next[0]?.executionStatus, "completed");
  assert.equal(next[0]?.childReaction, "improved");
  assert.equal(next[0]?.improvementStatus, "clear_improvement");
  assert.equal(next[0]?.notes, "家长反馈写回测试：完成共读并愿意走到门口。");
  assert.equal(next[0]?.attachments.image?.[0]?.name, "writeback.png");
});

test("upsertGuardianFeedbackWriteback generates fallback id only when API id is absent", () => {
  const next = upsertGuardianFeedbackWriteback({
    previous: [],
    input: {
      childId: "c-1",
      executionStatus: "completed",
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "slight_improvement",
      barriers: [],
      notes: "no api id",
      attachments: {},
      sourceChannel: "parent-agent",
    },
    currentUserName: "林小雨妈妈",
    currentUserRole: "家长",
    fallbackFeedbackId: "fb-local-fallback",
  });

  assert.equal(next.length, 1);
  assert.equal(next[0]?.feedbackId, "fb-local-fallback");
  assert.equal(next[0]?.id, "fb-local-fallback");
});
