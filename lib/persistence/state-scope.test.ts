import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import {
  filterChildrenForSessionUser,
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
