import assert from "node:assert/strict";
import test from "node:test";

import { isValidFollowUpPayload } from "@/lib/ai/server";

function buildFollowUpSnapshot() {
  return {
    child: { id: "child-1", name: "Ava" },
    summary: {
      health: {
        abnormalCount: 0,
        handMouthEyeAbnormalCount: 0,
        moodKeywords: [],
      },
      meals: {
        recordCount: 1,
        hydrationAvg: 220,
        balancedRate: 80,
        monotonyDays: 0,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 1,
        attentionCount: 1,
        pendingReviewCount: 1,
        topCategories: [],
      },
      feedback: {
        count: 1,
        statusCounts: { partial: 1 },
        keywords: ["sleep"],
      },
    },
    recentDetails: {
      health: [],
      meals: [],
      growth: [],
      feedback: [],
    },
    ruleFallback: [
      {
        id: "rule-1",
        title: "Sleep loop",
        description: "Keep the bedtime routine stable.",
        level: "warning",
      },
    ],
  };
}

test("isValidFollowUpPayload accepts canonical structured latestFeedback", () => {
  const isValid = isValidFollowUpPayload({
    snapshot: buildFollowUpSnapshot(),
    suggestionTitle: "Sleep loop",
    question: "What should the parent do tonight?",
    latestFeedback: {
      feedbackId: "fb-1",
      childId: "child-1",
      sourceRole: "parent",
      sourceChannel: "manual",
      relatedTaskId: "task-parent-1",
      executionStatus: "partial",
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "slight_improvement",
      barriers: ["Needed one reminder"],
      notes: "The child completed the first two steps.",
      attachments: {},
      submittedAt: "2026-04-10T20:00:00.000Z",
      source: { kind: "structured", workflow: "manual" },
      fallback: {},
    },
  });

  assert.equal(isValid, true);
});

test("isValidFollowUpPayload rejects malformed latestFeedback payloads", () => {
  const isValid = isValidFollowUpPayload({
    snapshot: buildFollowUpSnapshot(),
    suggestionTitle: "Sleep loop",
    question: "What should the parent do tonight?",
    latestFeedback: {
      executionStatus: "partial",
    },
  });

  assert.equal(isValid, false);
});
