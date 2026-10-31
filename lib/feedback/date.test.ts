import assert from "node:assert/strict";
import test from "node:test";
import { feedbackBusinessDate, getFeedbackBusinessToday, isFeedbackOnDate, normalizeFeedbackBusinessDate } from "./date.ts";
import { normalizeParentStructuredFeedback } from "./normalize.ts";
import { buildTeacherHomeViewModel } from "../view-models/role-home.ts";
import type { Child } from "../store.tsx";

test("feedback ISO instants use UTC+8 across UTC/offset date boundaries independently of host timezone", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Asia/Taipei", "America/New_York"]) {
      process.env.TZ = timezone;
      assert.equal(normalizeFeedbackBusinessDate("2026-10-31T08:00:00.000Z"), "2026-10-31");
      assert.equal(normalizeFeedbackBusinessDate("2026-10-31T15:59:59Z"), "2026-10-31");
      assert.equal(normalizeFeedbackBusinessDate("2026-10-31T16:00:00Z"), "2026-11-01");
      assert.equal(normalizeFeedbackBusinessDate("2026-11-01T00:30:00+09:00"), "2026-10-31");
      assert.equal(normalizeFeedbackBusinessDate("2026-10-31T23:00:00-05:00"), "2026-11-01");
      assert.equal(getFeedbackBusinessToday(new Date("2026-10-31T16:00:00Z")), "2026-11-01");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("historical pure dates retain their intended day and raw feedback timestamps are never rewritten", () => {
  assert.equal(normalizeFeedbackBusinessDate("2026-10-31"), "2026-10-31");
  assert.equal(normalizeFeedbackBusinessDate("20261031"), "2026-10-31");
  assert.equal(normalizeFeedbackBusinessDate("2026/10/31"), "2026-10-31");
  assert.equal(normalizeFeedbackBusinessDate("2026-10-31T23:30:00"), "2026-10-31");
  assert.equal(feedbackBusinessDate({ date: "2026-10-31", submittedAt: "2026-11-01T00:30:00+08:00" }), "2026-10-31");
  const feedback = normalizeParentStructuredFeedback({ id: "synthetic-feedback", childId: "synthetic-child", submittedAt: "2026-10-31T17:10:00Z" })!;
  assert.equal(isFeedbackOnDate(feedback, "2026-11-01"), true);
  assert.equal(feedback.date, "2026-10-31T17:10:00Z");
  assert.equal(feedback.submittedAt, "2026-10-31T17:10:00Z");
  assert.equal(isFeedbackOnDate({ date: "not-a-date" }, "2026-11-01"), false);
});

function child(id: string): Child {
  return { id, name: "合成儿童", birthDate: "2026-02-01", gender: "女", allergies: [], heightCm: 70, weightKg: 8,
    guardians: [], institutionId: "synthetic-institution", className: "合成托班", specialNotes: "", avatar: "", parentUserId: `parent-${id}` };
}

test("teacher home no longer asks parents with same-business-day ISO feedback to communicate again", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T02:00:00Z") });
  const children = [child("synthetic-child1"), child("synthetic-child2"), child("synthetic-child3")];
  const feedbacks = [
    normalizeParentStructuredFeedback({ id: "fb1", childId: children[0].id, submittedAt: "2026-10-31T18:00:00Z" })!,
    normalizeParentStructuredFeedback({ id: "fb2", childId: children[1].id, date: "2026-11-01T09:00:00+08:00" })!,
    normalizeParentStructuredFeedback({ id: "fb3", childId: children[2].id, date: "2026-10-31" })!,
  ];
  const home = buildTeacherHomeViewModel({ visibleChildren: children, presentChildren: children,
    healthCheckRecords: [], growthRecords: [], guardianFeedbacks: feedbacks });
  assert.deepEqual(home.parentsToCommunicate.map((item) => item.child.id), ["synthetic-child3"]);
  assert.equal(home.heroStats.find((item) => item.label === "待沟通家长")?.value, "1");
  assert.equal(feedbacks[0].date, "2026-10-31T18:00:00Z");
});
