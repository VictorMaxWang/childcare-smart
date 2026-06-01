import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";
import { CHILD_TEACHER, demoContext, expectOk } from "./e11-helpers";

function dispatchPayload(token: string) {
  return {
    eventType: "admin_action",
    priorityItemId: `contract-${token}`,
    title: `Admin dispatch contract ${token}`,
    summary: `Teacher-visible dispatch ${token}`,
    targetType: "child",
    targetId: CHILD_TEACHER,
    targetName: CHILD_TEACHER,
    priorityLevel: "P1",
    priorityScore: 98,
    recommendedOwnerRole: "teacher",
    recommendedOwnerName: "Teacher Li",
    recommendedAction: `Complete dispatch closure ${token}`,
    recommendedDeadline: "2099-01-01T00:00:00.000Z",
    reasonText: `Contract evidence ${token}`,
    evidence: [{ label: "contract", value: token, weight: 1 }],
    source: {
      institutionName: "Demo Kindergarten",
      workflow: "daily-priority",
      relatedChildIds: [CHILD_TEACHER],
      relatedClassNames: [],
      relatedTaskIds: [],
    },
  };
}

test("admin dispatch enters teacher task chain and completion updates admin status", async ({ page }, testInfo) => {
  const token = `dispatch-${Date.now()}`;
  const director = await demoContext(testInfo, "u-admin");
  const teacher = await demoContext(testInfo, "u-teacher2");

  const createdResponse = await director.post("/api/admin/notification-events", {
    data: dispatchPayload(token),
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  const event = created.item as {
    id: string;
    assignmentId: string;
    taskId: string;
    sourceType: string;
    sourceId: string;
    assigneeRole: string;
    source?: { sourceType?: string; sourceId?: string; taskId?: string; relatedTaskIds?: string[] };
  };

  expect(created.source).toBe("canonical_task");
  expect(event.assignmentId).toBe(event.id);
  expect(event.sourceType).toBe("admin_dispatch");
  expect(event.sourceId).toBe(event.id);
  expect(event.assigneeRole).toBe("teacher");
  expect(event.source?.sourceType).toBe("admin_dispatch");
  expect(event.source?.sourceId).toBe(event.id);
  expect(event.source?.taskId).toBe(event.taskId);
  expect(event.source?.relatedTaskIds).toContain(event.taskId);

  const assignments = await expectOk<Array<{ assignmentId: string; status: string; sourceType: string; sourceId: string; assigneeRole: string }>>(
    await teacher.get(`/api/assignments?teacherId=u-teacher2`)
  );
  const assignment = assignments.find((item) => item.assignmentId === event.assignmentId);
  expect(assignment).toBeTruthy();
  expect(assignment?.sourceType).toBe("admin_dispatch");
  expect(assignment?.sourceId).toBe(event.id);
  expect(assignment?.assigneeRole).toBe("teacher");

  await loginAs(page, "u-admin", "/admin/agent");
  const adminCard = page.getByTestId("admin-notification-event-card").filter({ hasText: token }).first();
  await expect(adminCard).toBeVisible({ timeout: 30_000 });
  const adminMeta = adminCard.getByTestId("admin-notification-event-meta");
  await expect(adminMeta).toBeVisible({ timeout: 30_000 });
  await expect(adminMeta).toContainText("source: admin_dispatch");
  await expect(adminMeta).toContainText("status: pending");
  await expect(adminMeta).toContainText("assigneeRole: teacher");

  await loginAs(page, "u-teacher2", `/teacher/agent?childId=${CHILD_TEACHER}`);
  const assignmentCard = page.getByTestId("teacher-assignment-card").filter({ hasText: token }).first();
  await expect(assignmentCard).toBeVisible({ timeout: 30_000 });
  await expect(assignmentCard.getByTestId("teacher-assignment-meta")).toContainText("source: admin_dispatch");
  await expect(assignmentCard.getByTestId("teacher-assignment-meta")).toContainText("assigneeRole: teacher");

  await assignmentCard.getByTestId("teacher-assignment-complete").click();

  await expect
    .poll(async () => {
      const nextAssignments = await expectOk<Array<{ assignmentId: string; status: string }>>(
        await director.get("/api/assignments?teacherId=u-teacher2")
      );
      return nextAssignments.find((item) => item.assignmentId === event.id)?.status;
    })
    .toBe("completed");

  const notificationList = await director.get("/api/admin/notification-events");
  expect(notificationList.status()).toBe(200);
  const notificationBody = await notificationList.json();
  const completedEvent = (notificationBody.items as Array<{ id: string; status: string; sourceType?: string; sourceId?: string; assigneeRole?: string }>).find(
    (item) => item.id === event.id
  );
  expect(completedEvent?.status).toBe("completed");
  expect(completedEvent?.sourceType).toBe("admin_dispatch");
  expect(completedEvent?.sourceId).toBe(event.id);
  expect(completedEvent?.assigneeRole).toBe("teacher");
});
