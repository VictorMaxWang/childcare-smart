import assert from "node:assert/strict";
import test from "node:test";

import type { AdminDispatchCreatePayload } from "@/lib/agent/admin-types";
import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import type { AppDataRepository } from "@/lib/server/app-data-repository";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import { AppDataService } from "@/lib/server/app-data-service";
import { ApiRouteError } from "@/lib/server/api-errors";

class MemoryRepository implements AppDataRepository {
  private snapshot: unknown;

  constructor(snapshot: unknown = createDemoSeedSnapshot("2026-05-02T00:00:00.000Z")) {
    this.snapshot = structuredClone(snapshot);
  }

  async load(session: SessionUser): Promise<ApiExtendedSnapshot> {
    return normalizeExtendedSnapshot(structuredClone(this.snapshot), session);
  }

  async save(session: SessionUser, snapshot: ApiExtendedSnapshot): Promise<void> {
    this.snapshot = normalizeExtendedSnapshot(structuredClone(snapshot), session);
  }
}

function demoUser(id: string) {
  const user = DEMO_ACCOUNTS.find((account) => account.id === id);
  assert.ok(user, `Missing demo account ${id}`);
  return user;
}

function dispatchPayload(token: string): AdminDispatchCreatePayload {
  return {
    eventType: "admin_action",
    priorityItemId: `priority-${token}`,
    title: `Admin dispatch contract ${token}`,
    summary: `Contract summary ${token}`,
    targetType: "child",
    targetId: "c-4",
    targetName: "c-4",
    priorityLevel: "P1",
    priorityScore: 96,
    recommendedOwnerRole: "teacher",
    recommendedOwnerName: "Teacher Li",
    recommendedAction: `Follow up ${token}`,
    recommendedDeadline: "2099-01-01T00:00:00.000Z",
    reasonText: `Reason ${token}`,
    evidence: [{ label: "unit", value: token, weight: 1 }],
    source: {
      institutionName: "Demo Kindergarten",
      workflow: "daily-priority",
      relatedChildIds: ["c-4"],
      relatedClassNames: [],
      relatedTaskIds: [],
    },
  };
}

test("admin dispatch creates canonical teacher assignment and mirrors completion into reminders/events", async () => {
  const repo = new MemoryRepository();
  const token = `dispatch-${Date.now()}`;
  const admin = new AppDataService(demoUser("u-admin"), repo);
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);

  const event = await admin.createAdminDispatch(dispatchPayload(token));

  assert.ok(event.id);
  assert.equal(event.assignmentId, event.id);
  assert.equal(event.sourceType, "admin_dispatch");
  assert.equal(event.sourceId, event.id);
  assert.equal(event.assigneeRole, "teacher");
  assert.equal(event.source?.sourceType, "admin_dispatch");
  assert.equal(event.source?.sourceId, event.id);
  assert.equal(event.source?.taskId, event.taskId);
  assert.ok(event.source?.relatedTaskIds?.includes(event.taskId ?? ""));

  const teacherAssignments = await teacher.listAssignments({ teacherId: "u-teacher2" });
  const matchingAssignments = teacherAssignments.filter((item) => item.assignmentId === event.assignmentId);
  assert.equal(matchingAssignments.length, 1);
  const assignment = matchingAssignments[0];
  assert.ok(assignment, "teacher can see the dispatch as an assignment");
  assert.equal(assignment.sourceType, "admin_dispatch");
  assert.equal(assignment.sourceId, event.id);
  assert.equal(assignment.assigneeRole, "teacher");
  assert.equal(assignment.status, "pending");

  await teacher.updateAssignmentStatus(event.id, { status: "completed", completionSummary: "done in unit test" });

  const completedAssignment = (await admin.listAssignments({ teacherId: "u-teacher2" })).find(
    (item) => item.assignmentId === event.id
  );
  assert.equal(completedAssignment?.status, "completed");
  assert.ok(completedAssignment?.completedAt);

  const completedEvent = (await admin.listAdminDispatchEvents()).find((item) => item.id === event.id);
  assert.equal(completedEvent?.status, "completed");
  assert.equal(completedEvent?.sourceType, "admin_dispatch");
  assert.equal(completedEvent?.sourceId, event.id);

  const snapshot = await repo.load(demoUser("u-admin"));
  const reminder = snapshot.reminders.find((item) => item.sourceId === event.id || item.taskId === event.taskId);
  assert.equal(reminder?.status, "done");
  assert.equal(reminder?.sourceType, "admin_dispatch");
  assert.equal(reminder?.assigneeRole, "teacher");
});

test("admin dispatch rejects issue targets without an explicit child or class anchor", async () => {
  const repo = new MemoryRepository();
  const admin = new AppDataService(demoUser("u-admin"), repo);
  const payload = dispatchPayload("unanchored");
  payload.targetType = "issue";
  payload.targetId = "issue-without-child";
  payload.targetName = "Unanchored issue";
  payload.source.relatedChildIds = [];
  payload.source.relatedClassNames = [];

  await assert.rejects(
    () => admin.createAdminDispatch(payload),
    (error: unknown) => {
      assert.ok(error instanceof ApiRouteError);
      assert.equal(error.code, "invalid_request");
      return true;
    }
  );
});

test("ordinary teacher can access assignments when profile teacherId differs from login userId", async () => {
  const seed = normalizeExtendedSnapshot(
    createDemoSeedSnapshot("2026-05-02T00:00:00.000Z"),
    demoUser("u-admin")
  );
  const teacherProfile = seed.teachers.find((item) => item.userId === "u-teacher2");
  assert.ok(teacherProfile);
  teacherProfile.teacherId = "teacher-profile-zhou";

  const repo = new MemoryRepository(seed);
  const admin = new AppDataService(demoUser("u-admin"), repo);
  const teacher = new AppDataService(demoUser("u-teacher2"), repo);
  const event = await admin.createAdminDispatch(dispatchPayload(`profile-id-${Date.now()}`));

  const assignments = await teacher.listAssignments();
  const assignment = assignments.find((item) => item.assignmentId === event.assignmentId);
  assert.ok(assignment, "teacher user should resolve through the linked teacher profile");
  assert.equal(assignment.teacherId, "teacher-profile-zhou");

  const updated = await teacher.updateAssignmentStatus(event.id, {
    status: "completed",
    completionSummary: "profile-linked teacher completed task",
  });
  assert.equal(updated.status, "completed");
});

test("admin dispatch patch preserves omitted status and round-trips editable fields", async () => {
  const repo = new MemoryRepository();
  const admin = new AppDataService(demoUser("u-admin"), repo);
  const event = await admin.createAdminDispatch(
    dispatchPayload(`patch-roundtrip-${Date.now()}`)
  );

  const summaryOnly = await admin.updateAdminDispatchStatus(event.id, {
    id: event.id,
    summary: "更新后的真实摘要",
    recommendedOwnerName: "周老师",
  });
  assert.equal(summaryOnly.status, "pending");
  assert.equal(summaryOnly.summary, "更新后的真实摘要");
  assert.equal(summaryOnly.recommendedOwnerName, "周老师");

  const completed = await admin.updateAdminDispatchStatus(event.id, {
    id: event.id,
    status: "completed",
    completionSummary: "已处理",
  });
  assert.equal(completed.status, "completed");
  assert.ok(completed.completedAt);

  const reopened = await admin.updateAdminDispatchStatus(event.id, {
    id: event.id,
    status: "in_progress",
    completedAt: null,
  });
  assert.equal(reopened.status, "in_progress");
  assert.equal(reopened.completedAt, null);
});
