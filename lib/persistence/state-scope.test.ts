import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import {
  filterChildrenForSessionUser,
  mergeScopedSnapshotIntoInstitutionSnapshot,
  mergeScopedSnapshotForSessionUser,
  resolveAuthorizedChildIdSet,
  scopeSnapshotForSessionUser,
} from "@/lib/persistence/state-scope";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

type SnapshotChild = AppStateSnapshot["children"][number];

function child(input: Partial<SnapshotChild> & { id: string; institutionId: string }): SnapshotChild {
  return {
    id: input.id,
    name: input.name ?? input.id,
    birthDate: input.birthDate ?? "2022-05-10",
    gender: input.gender ?? "女",
    allergies: [],
    heightCm: 0,
    weightKg: 0,
    guardians: [],
    institutionId: input.institutionId,
    classId: input.classId,
    className: input.className ?? "待分班",
    specialNotes: "",
    avatar: input.avatar ?? "👧",
    parentUserId: input.parentUserId,
  };
}

const parentSession = {
  id: "u-parent",
  name: "测试家长",
  role: "家长",
  avatar: "👩",
  institutionId: "inst-family",
  childIds: ["c-explicit"],
  accountKind: "normal",
} satisfies SessionUser;

const teacherSession = {
  id: "u-teacher",
  name: "测试教师",
  role: "教师",
  avatar: "👩‍🏫",
  institutionId: "inst-family",
  classId: "class-a",
  className: "小一班",
  childIds: [],
  accountKind: "normal",
} satisfies SessionUser;

const adminSession = {
  id: "u-admin",
  name: "测试园长",
  role: "机构管理员",
  avatar: "👩‍💼",
  institutionId: "inst-family",
  childIds: [],
  accountKind: "normal",
} satisfies SessionUser;

test("parent visible children include explicit childIds or parentUserId within institution", () => {
  const children = [
    child({ id: "c-explicit", institutionId: "inst-family" }),
    child({ id: "c-owned", institutionId: "inst-family", parentUserId: "u-parent" }),
    child({ id: "c-other-parent", institutionId: "inst-family", parentUserId: "u-other" }),
    child({ id: "c-other-inst", institutionId: "inst-other", parentUserId: "u-parent" }),
  ];

  const visible = filterChildrenForSessionUser(children, parentSession).map((item) => item.id).sort();
  const authorized = [...resolveAuthorizedChildIdSet(parentSession, children)].sort();

  assert.deepEqual(visible, ["c-explicit", "c-owned"]);
  assert.deepEqual(authorized, ["c-explicit", "c-owned"]);
});

test("scoped parent snapshot keeps records for owned children added after session childIds", () => {
  const snapshot = emptyInstitutionSnapshot("2026-07-04T00:00:00.000Z");
  snapshot.children = [
    child({ id: "c-explicit", institutionId: "inst-family" }),
    child({ id: "c-owned", institutionId: "inst-family", parentUserId: "u-parent" }),
    child({ id: "c-other-parent", institutionId: "inst-family", parentUserId: "u-other" }),
  ];
  snapshot.attendance = [
    { id: "a-explicit", childId: "c-explicit", date: "2026-07-04", isPresent: true },
    { id: "a-owned", childId: "c-owned", date: "2026-07-04", isPresent: true },
    { id: "a-other", childId: "c-other-parent", date: "2026-07-04", isPresent: true },
  ];

  const scoped = scopeSnapshotForSessionUser(snapshot, parentSession);

  assert.deepEqual(scoped.children.map((item) => item.id).sort(), ["c-explicit", "c-owned"]);
  assert.deepEqual(scoped.attendance.map((item) => item.id).sort(), ["a-explicit", "a-owned"]);
});

test("state projection isolates role-specific queues and conversations", () => {
  const snapshot = emptyInstitutionSnapshot("2026-07-26T00:00:00.000Z");
  snapshot.children = [
    child({
      id: "c-explicit",
      institutionId: "inst-family",
      classId: "class-a",
      className: "小一班",
      parentUserId: parentSession.id,
    }),
  ];
  snapshot.tasks = (["parent", "teacher", "admin"] as const).map((ownerRole) => ({
    taskId: `task-${ownerRole}`,
    taskType: "follow_up",
    childId: "c-explicit",
    sourceType: "consultation",
    sourceId: `source-${ownerRole}`,
    ownerRole,
    title: `${ownerRole} task`,
    description: `${ownerRole} only`,
    dueWindow: { kind: "within_48h", label: "48 小时内" },
    dueAt: "2026-07-28T00:00:00.000Z",
    status: "pending",
    evidenceSubmissionMode:
      ownerRole === "parent"
        ? "guardian_feedback"
        : ownerRole === "teacher"
          ? "task_checkin"
          : "dispatch_status_update",
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  }));
  snapshot.taskCheckIns = (["parent", "teacher", "admin"] as const).map((role) => ({
    id: `checkin-${role}`,
    taskId: `task-${role}`,
    childId: "c-explicit",
    date: "2026-07-26T00:00:00.000Z",
    completed: true,
    note: `${role} evidence`,
  }));
  snapshot.mobileDrafts = (["parent", "teacher", "admin"] as const).map((targetRole) => ({
    draftId: `draft-${targetRole}`,
    childId: "c-explicit",
    draftType: "voice",
    targetRole,
    content: `${targetRole} draft`,
    syncStatus: "synced",
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  }));
  snapshot.reminders = (["parent", "teacher", "admin"] as const).map((targetRole) => ({
    reminderId: `reminder-${targetRole}`,
    reminderType:
      targetRole === "parent"
        ? "family-task"
        : targetRole === "teacher"
          ? "review-48h"
          : "admin-focus",
    targetRole,
    targetId: "c-explicit",
    childId: "c-explicit",
    title: `${targetRole} reminder`,
    description: `${targetRole} only`,
    scheduledAt: "2026-07-27T00:00:00.000Z",
    status: "pending",
  }));
  snapshot.conversations = [
    {
      conversationId: "conversation-home-school",
      childId: "c-explicit",
      classId: "class-a",
      participantIds: [parentSession.id, teacherSession.id],
      participantRoles: ["parent", "teacher"],
      status: "open",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
    {
      conversationId: "conversation-staff",
      childId: "c-explicit",
      classId: "class-a",
      participantIds: [teacherSession.id, adminSession.id],
      participantRoles: ["teacher", "admin"],
      status: "open",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
  ];
  snapshot.messages = snapshot.conversations.map((conversation) => ({
    messageId: `message-${conversation.conversationId}`,
    conversationId: conversation.conversationId,
    childId: conversation.childId,
    classId: conversation.classId,
    senderRole: "teacher",
    senderId: teacherSession.id,
    senderName: teacherSession.name,
    receiverRole: conversation.participantRoles.includes("parent") ? "parent" : "admin",
    targetRole: conversation.participantRoles.includes("parent") ? "parent" : "admin",
    content: conversation.conversationId,
    createdAt: "2026-07-26T00:00:00.000Z",
    readBy: [],
    status: "sent",
  }));

  const parentScoped = scopeSnapshotForSessionUser(snapshot, parentSession);
  assert.deepEqual(parentScoped.tasks.map((item) => item.taskId), ["task-parent"]);
  assert.deepEqual(parentScoped.taskCheckIns.map((item) => item.id), ["checkin-parent"]);
  assert.deepEqual(parentScoped.mobileDrafts.map((item) => item.draftId), ["draft-parent"]);
  assert.deepEqual(parentScoped.reminders.map((item) => item.reminderId), ["reminder-parent"]);
  assert.deepEqual(parentScoped.conversations.map((item) => item.conversationId), [
    "conversation-home-school",
  ]);
  assert.deepEqual(parentScoped.messages.map((item) => item.conversationId), [
    "conversation-home-school",
  ]);

  const teacherScoped = scopeSnapshotForSessionUser(snapshot, teacherSession);
  assert.deepEqual(teacherScoped.tasks.map((item) => item.taskId), ["task-teacher"]);
  assert.deepEqual(teacherScoped.taskCheckIns.map((item) => item.id), ["checkin-teacher"]);
  assert.deepEqual(teacherScoped.mobileDrafts.map((item) => item.draftId), ["draft-teacher"]);
  assert.deepEqual(teacherScoped.reminders.map((item) => item.reminderId), ["reminder-teacher"]);
  assert.deepEqual(
    teacherScoped.conversations.map((item) => item.conversationId).sort(),
    ["conversation-home-school", "conversation-staff"]
  );

  const adminScoped = scopeSnapshotForSessionUser(snapshot, adminSession);
  assert.equal(adminScoped.tasks.length, 3);
  assert.equal(adminScoped.taskCheckIns.length, 3);
  assert.equal(adminScoped.mobileDrafts.length, 3);
  assert.equal(adminScoped.reminders.length, 3);
  assert.equal(adminScoped.conversations.length, 2);
});

test("partial parent cache cannot delete remote child records during snapshot merge", () => {
  const parent: SessionUser = {
    ...parentSession,
    id: "parent-normal",
    institutionId: "institution-normal",
    childIds: ["child-normal"],
  };
  const childRecord = child({
    id: "child-normal",
    institutionId: parent.institutionId,
    parentUserId: parent.id,
  });
  const health = {
    id: "health-normal",
    childId: childRecord.id,
    date: "2026-07-24",
    temperature: 36.5,
    mood: "正常",
    handMouthEye: "正常" as const,
    isAbnormal: false,
    checkedBy: "测试教师",
    checkedByRole: "教师" as const,
  };
  const currentSnapshot = {
    ...emptyInstitutionSnapshot("2026-07-24T00:00:00.000Z"),
    children: [childRecord],
    health: [health],
  };
  const incomingSnapshot = {
    ...emptyInstitutionSnapshot("2026-07-24T01:00:00.000Z"),
    storybooks: [
      {
        storybookId: "storybook-normal",
        childId: childRecord.id,
        sourceRecordIds: [health.id],
        pages: [],
        generatedAt: "2026-07-24T01:00:00.000Z",
      },
    ],
  };

  const merged = mergeScopedSnapshotForSessionUser({
    currentSnapshot,
    incomingSnapshot,
    user: parent,
  });

  assert.deepEqual(merged.children.map((item) => item.id), [childRecord.id]);
  assert.deepEqual(merged.health.map((item) => item.id), [health.id]);
  assert.deepEqual(merged.storybooks.map((item) => item.storybookId), [
    "storybook-normal",
  ]);
});

test("shared demo cache keeps other role data when a scoped snapshot is merged", () => {
  const familyChild = child({
    id: "child-family",
    institutionId: teacherSession.institutionId,
    classId: "class-b",
    className: "小二班",
    parentUserId: parentSession.id,
  });
  const teacherChild = child({
    id: "child-teacher",
    institutionId: teacherSession.institutionId,
    classId: teacherSession.classId,
    className: teacherSession.className,
  });
  const currentSnapshot = {
    ...emptyInstitutionSnapshot("2026-07-26T00:00:00.000Z"),
    children: [teacherChild, familyChild],
    health: [
      {
        id: "health-family",
        childId: familyChild.id,
        date: "2026-07-26",
        temperature: 36.5,
        mood: "正常",
        handMouthEye: "正常" as const,
        isAbnormal: false,
        checkedBy: "示例教师",
        checkedByRole: "教师" as const,
      },
    ],
  };
  const incomingSnapshot = {
    ...emptyInstitutionSnapshot("2026-07-26T01:00:00.000Z"),
    children: [teacherChild],
    health: [
      {
        id: "health-teacher",
        childId: teacherChild.id,
        date: "2026-07-26",
        temperature: 36.7,
        mood: "正常",
        handMouthEye: "正常" as const,
        isAbnormal: false,
        checkedBy: "示例教师",
        checkedByRole: "教师" as const,
      },
    ],
  };

  const merged = mergeScopedSnapshotIntoInstitutionSnapshot({
    currentSnapshot,
    incomingSnapshot,
    user: teacherSession,
  });

  assert.deepEqual(
    merged.children.map((item) => item.id).sort(),
    [familyChild.id, teacherChild.id]
  );
  assert.deepEqual(
    merged.health.map((item) => item.id).sort(),
    ["health-family", "health-teacher"]
  );
});
