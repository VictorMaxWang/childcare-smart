import assert from "node:assert/strict";
import test from "node:test";

import { buildParentWeeklyReportSnapshot } from "./parent-weekly-report.ts";
import type { ParentAgentChildContext } from "./parent-agent.ts";

function createContext(
  overrides: Partial<ParentAgentChildContext> = {}
): ParentAgentChildContext {
  const base: ParentAgentChildContext = {
    today: "2026-04-11",
    child: {
      id: "child-1",
      name: "Mia",
      birthDate: "2022-06-01",
      gender: "girl",
      allergies: ["peanut"],
      heightCm: 98,
      weightKg: 15,
      guardians: [{ name: "Lin", relation: "mother", phone: "13800000000" }],
      institutionId: "inst-1",
      className: "Sun Class",
      specialNotes: "Needs extra calming before nap",
      avatar: "/demo/mia.png",
      parentUserId: "parent-1",
    },
    smartInsights: [
      {
        id: "insight-warning",
        title: "Hydration needs attention",
        description: "Hydration has been a bit low this week.",
        level: "warning",
        tags: ["hydration"],
      },
      {
        id: "insight-info",
        title: "Nap routine is calmer",
        description: "Nap preparation has been steadier this week.",
        level: "info",
        tags: ["sleep"],
      },
    ],
    todayMeals: [],
    weeklyMeals: [
      {
        id: "meal-1",
        childId: "child-1",
        date: "2026-04-08",
        meal: "lunch",
        foods: [{ id: "food-1", name: "rice", category: "grain", amount: "1 bowl" }],
        intakeLevel: "medium",
        preference: "neutral",
        waterMl: 120,
        nutritionScore: 88,
        recordedBy: "teacher-1",
        recordedByRole: "teacher",
      },
      {
        id: "meal-2",
        childId: "child-1",
        date: "2026-04-10",
        meal: "lunch",
        foods: [{ id: "food-2", name: "broccoli", category: "vegetable", amount: "1 bowl" }],
        intakeLevel: "medium",
        preference: "like",
        waterMl: 140,
        nutritionScore: 90,
        recordedBy: "teacher-1",
        recordedByRole: "teacher",
      },
    ],
    weeklyHealthChecks: [
      {
        id: "health-1",
        childId: "child-1",
        date: "2026-04-08",
        temperature: 37.5,
        mood: "a bit restless",
        handMouthEye: "normal",
        isAbnormal: true,
        checkedBy: "teacher-1",
        checkedByRole: "teacher",
      },
      {
        id: "health-2",
        childId: "child-1",
        date: "2026-04-10",
        temperature: 36.7,
        mood: "steady",
        handMouthEye: "normal",
        isAbnormal: false,
        checkedBy: "teacher-1",
        checkedByRole: "teacher",
      },
    ],
    weeklyGrowthRecords: [
      {
        id: "growth-1",
        childId: "child-1",
        createdAt: "2026-04-09T10:00:00.000Z",
        recorder: "teacher-1",
        recorderRole: "teacher",
        category: "emotion",
        tags: ["nap"],
        description: "Needs extra calming before nap.",
        needsAttention: true,
        followUpAction: "Continue observing nap preparation.",
        reviewStatus: "pending",
      },
      {
        id: "growth-2",
        childId: "child-1",
        createdAt: "2026-04-10T11:00:00.000Z",
        recorder: "teacher-1",
        recorderRole: "teacher",
        category: "sleep",
        tags: ["nap"],
        description: "Fell asleep faster than last week.",
        needsAttention: false,
      },
    ],
    attentionGrowthRecords: [
      {
        id: "growth-1",
        childId: "child-1",
        createdAt: "2026-04-09T10:00:00.000Z",
        recorder: "teacher-1",
        recorderRole: "teacher",
        category: "emotion",
        tags: ["nap"],
        description: "Needs extra calming before nap.",
        needsAttention: true,
        followUpAction: "Continue observing nap preparation.",
        reviewStatus: "pending",
      },
    ],
    pendingReviews: [
      {
        id: "growth-1",
        childId: "child-1",
        createdAt: "2026-04-09T10:00:00.000Z",
        recorder: "teacher-1",
        recorderRole: "teacher",
        category: "emotion",
        tags: ["nap"],
        description: "Needs extra calming before nap.",
        needsAttention: true,
        followUpAction: "Continue observing nap preparation.",
        reviewStatus: "pending",
      },
    ],
    weeklyFeedbacks: [
      {
        feedbackId: "feedback-1",
        id: "feedback-1",
        childId: "child-1",
        date: "2026-04-10T20:00:00.000Z",
        status: "completed",
        content: "The child settled more quickly at bedtime.",
        relatedTaskId: "task-parent-1",
        relatedConsultationId: "consult-1",
        sourceRole: "parent",
        sourceChannel: "manual",
        executionStatus: "completed",
        executed: true,
        executorRole: "parent",
        childReaction: "accepted",
        improvementStatus: "clear_improvement",
        barriers: [],
        improved: true,
        notes: "The child settled more quickly at bedtime.",
        freeNote: "The child settled more quickly at bedtime.",
        attachments: {},
        submittedAt: "2026-04-10T20:00:00.000Z",
        source: { kind: "structured", workflow: "manual" },
        fallback: { rawInterventionCardId: "card-1" },
        createdBy: "parent-1",
        createdByRole: "parent",
      },
    ],
    latestFeedback: {
      feedbackId: "feedback-1",
      id: "feedback-1",
      childId: "child-1",
      date: "2026-04-10T20:00:00.000Z",
      status: "completed",
      content: "The child settled more quickly at bedtime.",
      relatedTaskId: "task-parent-1",
      relatedConsultationId: "consult-1",
      sourceRole: "parent",
      sourceChannel: "manual",
      executionStatus: "completed",
      executed: true,
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "clear_improvement",
      barriers: [],
      improved: true,
      notes: "The child settled more quickly at bedtime.",
      freeNote: "The child settled more quickly at bedtime.",
      attachments: {},
      submittedAt: "2026-04-10T20:00:00.000Z",
      source: { kind: "structured", workflow: "manual" },
      fallback: { rawInterventionCardId: "card-1" },
      createdBy: "parent-1",
      createdByRole: "parent",
    },
    weeklyTrend: {
      balancedRate: 72,
      vegetableDays: 4,
      proteinDays: 5,
      stapleDays: 5,
      hydrationAvg: 138,
      monotonyDays: 1,
    },
    task: {
      id: "task-1",
      title: "Bedtime calming",
      description: "Keep the same calming routine before sleep.",
      durationText: "10 min",
      tag: "tonight",
    },
    taskCheckIns: [],
    teacherSuggestionSummary: "Keep watching the nap transition this week.",
    currentInterventionCard: {
      id: "card-1",
      title: "Bedtime calming",
      riskLevel: "medium",
      targetChildId: "child-1",
      triggerReason: "Sleep routine needs support",
      summary: "Keep the bedtime routine steady tonight.",
      todayInSchoolAction: "Observe pre-nap transition.",
      tonightHomeAction: "Keep the same calming routine before sleep.",
      homeSteps: ["Keep lights dim", "Repeat the same phrase"],
      observationPoints: ["Watch bedtime resistance."],
      tomorrowObservationPoint: "Check morning arrival mood.",
      reviewIn48h: "Review bedtime stability in 48 hours.",
      parentMessageDraft: "Please keep the bedtime routine steady tonight.",
      teacherFollowupDraft: "Review tomorrow morning.",
      consultationId: "consult-1",
      source: "mock",
      createdAt: "2026-04-10T09:00:00.000Z",
      updatedAt: "2026-04-10T09:00:00.000Z",
    },
    activeTask: {
      taskId: "task-parent-1",
      taskType: "intervention",
      childId: "child-1",
      sourceType: "intervention_card",
      sourceId: "card-1",
      ownerRole: "parent",
      title: "Bedtime calming",
      description: "Keep the same calming routine before sleep.",
      dueWindow: { kind: "same_day", label: "Today" },
      dueAt: "2026-04-10T23:59:59.999Z",
      status: "in_progress",
      evidenceSubmissionMode: "guardian_feedback",
      createdAt: "2026-04-10T09:00:00.000Z",
      updatedAt: "2026-04-10T09:00:00.000Z",
      relatedTaskIds: ["task-follow-up-1"],
      legacyRefs: {
        interventionCardId: "card-1",
        consultationId: "consult-1",
      },
    },
    taskTimeline: [],
    focusReasons: ["Hydration needs attention", "There is still one pending review."],
    observationDefaults: ["Watch whether bedtime calming is easier tonight."],
  };

  return {
    ...base,
    ...overrides,
  };
}

test("buildParentWeeklyReportSnapshot carries structured feedback into highlights and continuity notes", () => {
  const snapshot = buildParentWeeklyReportSnapshot(createContext());

  assert.equal(snapshot.role, "parent");
  assert.equal(snapshot.institutionName, "Sun Class");
  assert.equal(snapshot.periodLabel, "近7天");
  assert.deepEqual(snapshot.overview, {
    visibleChildren: 1,
    attendanceRate: 60,
    mealRecordCount: 2,
    healthAbnormalCount: 1,
    growthAttentionCount: 1,
    pendingReviewCount: 1,
    feedbackCount: 1,
  });
  assert.ok(snapshot.highlights.some((item) => item.includes("结构化反馈")));
  assert.ok(snapshot.continuityNotes?.some((item) => item.includes("task-parent-1")));
  assert.ok(snapshot.continuityNotes?.some((item) => item.includes("consult-1")));
});

test("buildParentWeeklyReportSnapshot surfaces barriers and open loops from task-aware feedback", () => {
  const snapshot = buildParentWeeklyReportSnapshot(
    createContext({
      weeklyFeedbacks: [
        {
          feedbackId: "feedback-negative",
          id: "feedback-negative",
          childId: "child-1",
          date: "2026-04-11T20:00:00.000Z",
          status: "unable_to_execute",
          content: "The family could not execute the bedtime task.",
          relatedTaskId: "task-parent-1",
          relatedConsultationId: "consult-1",
          sourceRole: "parent",
          sourceChannel: "manual",
          executionStatus: "unable_to_execute",
          executed: false,
          executorRole: "parent",
          childReaction: "resisted",
          improvementStatus: "worse",
          barriers: ["Child had a fever"],
          improved: false,
          notes: "The family could not execute the task tonight.",
          freeNote: "Child had a fever",
          attachments: {},
          submittedAt: "2026-04-11T20:00:00.000Z",
          source: { kind: "structured", workflow: "manual" },
          fallback: { rawInterventionCardId: "card-1" },
          createdBy: "parent-1",
          createdByRole: "parent",
        },
      ],
      latestFeedback: {
        feedbackId: "feedback-unrelated",
        id: "feedback-unrelated",
        childId: "child-1",
        date: "2026-04-12T20:00:00.000Z",
        status: "completed",
        content: "A different task went well.",
        relatedTaskId: "task-unrelated",
        relatedConsultationId: "consult-unrelated",
        sourceRole: "parent",
        sourceChannel: "manual",
        executionStatus: "completed",
        executed: true,
        executorRole: "parent",
        childReaction: "accepted",
        improvementStatus: "clear_improvement",
        barriers: [],
        improved: true,
        notes: "A different task went well.",
        freeNote: "A different task went well.",
        attachments: {},
        submittedAt: "2026-04-12T20:00:00.000Z",
        source: { kind: "structured", workflow: "manual" },
        fallback: {},
        createdBy: "parent-1",
        createdByRole: "parent",
      },
    })
  );

  assert.ok(snapshot.risks.some((item) => item.includes("Child had a fever")));
  assert.ok(snapshot.continuityNotes?.some((item) => item.includes("Child had a fever")));
  assert.ok(snapshot.continuityNotes?.some((item) => item.includes("task-parent-1")));
});

test("buildParentWeeklyReportSnapshot keeps honest defaults when parent context is sparse", () => {
  const snapshot = buildParentWeeklyReportSnapshot(
    createContext({
      smartInsights: [],
      weeklyMeals: [],
      weeklyHealthChecks: [],
      weeklyGrowthRecords: [],
      attentionGrowthRecords: [],
      pendingReviews: [],
      weeklyFeedbacks: [],
      latestFeedback: undefined,
      focusReasons: [],
      teacherSuggestionSummary: undefined,
      currentInterventionCard: null,
      activeTask: undefined,
    })
  );

  assert.equal(snapshot.overview.attendanceRate, 0);
  assert.equal(snapshot.overview.mealRecordCount, 0);
  assert.equal(snapshot.overview.feedbackCount, 0);
  assert.equal(snapshot.topAttentionChildren.length, 0);
  assert.deepEqual(snapshot.risks, []);
  assert.deepEqual(snapshot.highlights, ["本周已汇总园内观察与家庭反馈，适合继续把家园协同做成连续闭环。"]);
});
test("buildParentWeeklyReportSnapshot carries age-band context into parent weekly snapshot", () => {
  const baseContext = createContext();
  const infant = buildParentWeeklyReportSnapshot(
    createContext({
      child: {
        ...baseContext.child,
        birthDate: "2025-06-01",
      },
      today: "2026-04-12",
    })
  );
  const toddler = buildParentWeeklyReportSnapshot(
    createContext({
      child: {
        ...baseContext.child,
        birthDate: "2024-05-01",
      },
      today: "2026-04-12",
    })
  );
  const olderToddler = buildParentWeeklyReportSnapshot(
    createContext({
      child: {
        ...baseContext.child,
        birthDate: "2023-05-01",
      },
      today: "2026-04-12",
    })
  );

  assert.equal(infant.ageBandContext?.normalizedAgeBand, "0-12m");
  assert.equal(toddler.ageBandContext?.normalizedAgeBand, "12-24m");
  assert.equal(olderToddler.ageBandContext?.normalizedAgeBand, "24-36m");

  assert.notEqual(infant.highlights[0], toddler.highlights[0]);
  assert.notEqual(toddler.highlights[0], olderToddler.highlights[0]);
  assert.notDeepEqual(infant.risks, toddler.risks);
  assert.notDeepEqual(toddler.risks, olderToddler.risks);
  assert.ok(infant.continuityNotes?.some((item) => item.includes("家长动作语气建议")));
});
