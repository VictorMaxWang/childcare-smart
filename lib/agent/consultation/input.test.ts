import assert from "node:assert/strict";
import test from "node:test";

import { buildConsultationInputFromSnapshot } from "./input.ts";

test("buildConsultationInputFromSnapshot prefers task-aware structured feedback and carries barriers into reasons", () => {
  const input = buildConsultationInputFromSnapshot({
    snapshot: {
      child: {
        id: "child-1",
        name: "Ava",
      },
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
          count: 2,
          statusCounts: { unable_to_execute: 1, completed: 1 },
          keywords: ["sleep"],
        },
      },
      recentDetails: {
        health: [],
        meals: [],
        growth: [],
        feedback: [
          {
            feedbackId: "fb-task-match",
            childId: "child-1",
            sourceRole: "parent",
            sourceChannel: "manual",
            relatedTaskId: "task-parent-1",
            relatedConsultationId: "consult-1",
            executionStatus: "unable_to_execute",
            executorRole: "parent",
            childReaction: "resisted",
            improvementStatus: "worse",
            barriers: ["Child had a fever"],
            notes: "The family could not execute the task tonight.",
            attachments: {},
            submittedAt: "2026-04-11T08:00:00.000Z",
            source: { kind: "structured", workflow: "manual" },
            fallback: { rawInterventionCardId: "card-1" },
          },
          {
            feedbackId: "fb-unrelated",
            childId: "child-1",
            sourceRole: "parent",
            sourceChannel: "manual",
            relatedTaskId: "task-parent-other",
            executionStatus: "completed",
            executorRole: "parent",
            childReaction: "accepted",
            improvementStatus: "clear_improvement",
            barriers: [],
            notes: "A different task went well.",
            attachments: {},
            submittedAt: "2026-04-12T08:00:00.000Z",
            source: { kind: "structured", workflow: "manual" },
            fallback: {},
          },
        ],
      },
      ruleFallback: [
        {
          id: "rule-1",
          title: "Sleep support",
          description: "Keep the bedtime routine stable tonight.",
          level: "warning",
        },
      ],
    },
    activeTaskId: "task-parent-1",
    latestFeedback: {
      feedbackId: "fb-unrelated",
      childId: "child-1",
      sourceRole: "parent",
      sourceChannel: "manual",
      relatedTaskId: "task-parent-other",
      executionStatus: "completed",
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "clear_improvement",
      barriers: [],
      notes: "A different task went well.",
      attachments: {},
      submittedAt: "2026-04-12T08:00:00.000Z",
      source: { kind: "structured", workflow: "manual" },
      fallback: {},
      id: "fb-unrelated",
      date: "2026-04-12T08:00:00.000Z",
      status: "completed",
      content: "A different task went well.",
      interventionCardId: "task-parent-other",
      sourceWorkflow: "manual",
      executed: true,
      improved: true,
      freeNote: "A different task went well.",
    },
    currentInterventionCard: {
      id: "card-1",
      consultationId: "consult-1",
      title: "Sleep support",
      tonightHomeAction: "Keep the same bedtime routine tonight.",
      observationPoints: ["Watch bedtime resistance."],
      tomorrowObservationPoint: "Check morning arrival mood.",
      reviewIn48h: "Review bedtime stability in 48 hours.",
    },
    source: "api",
  });

  assert.equal(input.latestFeedback?.feedbackId, "fb-task-match");
  assert.ok(input.focusReasons.some((item) => item.includes("Child had a fever")));
  assert.ok(input.continuityNotes?.some((item) => item.includes("task-parent-1")));
});
