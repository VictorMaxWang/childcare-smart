import assert from "node:assert/strict";
import test from "node:test";
import { CARE_COURSES } from "@/lib/courses/catalog";
import { courseAgeMonths, courseInputFingerprint, getParentCourses, recommendationFailureStatus, saveCourseLearning, videoMetadataIsFresh } from "./parent-course-service";
import { MaasProviderError } from "@/lib/providers/maas/maas-provider";
import { ApiRouteError } from "./api-errors";
import { getSessionScope } from "./session-scope";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/accounts";

test("course age uses complete UTC months and rejects malformed dates", () => {
  assert.equal(courseAgeMonths("2025-10-31", new Date("2026-10-30T12:00:00Z")), 11);
  assert.equal(courseAgeMonths("2025-10-31", new Date("2026-10-31T12:00:00Z")), 12);
  assert.equal(courseAgeMonths("not-a-date"), null);
});
test("MySQL JSON key order cannot change idempotence or cache identity", () => {
  assert.equal(courseInputFingerprint({ requestId: "one", note: "观察", payload: { first: 1, second: 2 } }), courseInputFingerprint({ payload: { second: 2, first: 1 }, note: "观察", requestId: "one" }));
  assert.notEqual(courseInputFingerprint({ child: "one" }), courseInputFingerprint({ child: "two" }));
  assert.notEqual(courseInputFingerprint(["one", "two"]), courseInputFingerprint(["two", "one"]));
});
test("course reads and learning writes reject another parent's child before touching course storage", async () => {
  const user: SessionUser = { id: "parent-a", name: "合成家长", avatar: "P", role: "家长", institutionId: "test-institution", childIds: ["own-child"], accountKind: "normal" };
  const snapshot = emptyInstitutionSnapshot("2026-10-31T00:00:00Z") as ApiExtendedSnapshot;
  snapshot.children = ["own-child", "other-child"].map(id => ({ id, name: "合成儿童", institutionId: "test-institution", birthDate: "2025-01-01", gender: "女", allergies: [], heightCm: 0, weightKg: 0, guardians: [], className: "验收班", specialNotes: "", avatar: "C", parentUserId: id === "own-child" ? "parent-a" : "parent-b" }));
  const scope = await getSessionScope(user, { load: async () => snapshot, save: async () => {} });
  await assert.rejects(getParentCourses(scope, "other-child"), error => Boolean(error && typeof error === "object" && "status" in error && error.status === 404));
  await assert.rejects(saveCourseLearning(scope, "nutrition-signals", { childId: "other-child", requestId: "one", type: "opened" }), error => Boolean(error && typeof error === "object" && "status" in error && error.status === 404));
});
test("video freshness requires real positive duration, verified source and a current timestamp", () => {
  const course = structuredClone(CARE_COURSES[0]);
  const stamp = Date.parse(course.video.verifiedAt!);
  assert.equal(videoMetadataIsFresh(course, stamp + 1000), true);
  assert.equal(videoMetadataIsFresh(course, stamp + 24 * 3600 * 1000), false);
  assert.equal(videoMetadataIsFresh(course, stamp - 1), false);
  assert.equal(videoMetadataIsFresh({ ...course, video: { ...course.video, durationSeconds: null } }, stamp), false);
  assert.equal(videoMetadataIsFresh({ ...course, video: { ...course.video, verificationStatus: "pending" } }, stamp), false);
  assert.equal(videoMetadataIsFresh({ ...course, video: { ...course.video, url: "https://evil.test" } }, stamp), false);
});
test("a dispatched timeout or network interruption remains unknown and cannot imply a free retry", () => {
  assert.equal(recommendationFailureStatus(new MaasProviderError("deadline", "request-timeout"), false), "failed");
  assert.equal(recommendationFailureStatus(new MaasProviderError("deadline", "request-timeout"), true), "unknown");
  assert.equal(recommendationFailureStatus(new MaasProviderError("network", "provider-response"), true), "unknown");
  assert.equal(recommendationFailureStatus(new Error("database commit disconnected"), true), "unknown");
  assert.equal(recommendationFailureStatus(new MaasProviderError("auth", "authentication", 401), true), "failed");
  assert.equal(recommendationFailureStatus(new MaasProviderError("invalid JSON", "provider-response", 200), true), "failed");
  assert.equal(recommendationFailureStatus(new ApiRouteError("provider_unavailable", "known invalid goals"), true), "failed");
});
