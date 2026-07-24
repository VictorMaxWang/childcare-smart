import assert from "node:assert/strict";
import test from "node:test";

import { collectStorybookSourceRecordIds } from "@/lib/parent/storybook-provenance";

test("storybook provenance includes every supported record type for the selected child", () => {
  const sourceRecordIds = collectStorybookSourceRecordIds({
    childId: "child-1",
    healthCheckRecords: [
      { id: "health-1", childId: "child-1" },
      { id: "health-other", childId: "child-2" },
    ],
    mealRecords: [{ id: "meal-1", childId: "child-1" }],
    growthRecords: [{ id: "growth-1", childId: "child-1" }],
    guardianFeedbacks: [{ id: "feedback-1", childId: "child-1" }],
    taskCheckInRecords: [
      { id: "task-1", childId: "child-1" },
      { id: "growth-1", childId: "child-1" },
    ],
    interventionId: "intervention-1",
    consultationId: "consultation-1",
  });

  assert.deepEqual(sourceRecordIds, [
    "health-1",
    "meal-1",
    "growth-1",
    "feedback-1",
    "task-1",
    "intervention-1",
    "consultation-1",
  ]);
});

test("storybook provenance ignores blank ids and records from other children", () => {
  assert.deepEqual(
    collectStorybookSourceRecordIds({
      childId: "child-1",
      healthCheckRecords: [{ id: "", childId: "child-1" }],
      mealRecords: [{ id: "meal-other", childId: "child-2" }],
      growthRecords: [],
      guardianFeedbacks: [],
      taskCheckInRecords: [],
      interventionId: "",
    }),
    []
  );
});
