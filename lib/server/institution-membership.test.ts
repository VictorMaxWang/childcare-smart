import assert from "node:assert/strict";
import test from "node:test";

import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import type { DatabaseConnection } from "@/lib/db/server";
import { registrationWorkspaceSnapshot } from "@/lib/persistence/bootstrap";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  acceptMemberInvitation,
  createMemberInvitation,
  type InstitutionMembershipDependencies,
  type MemberInvitationRecord,
  type MembershipRecord,
} from "@/lib/server/institution-membership";

type TestUser = {
  id: string;
  role: AccountRole;
  display_name: string;
  institution_id: string;
  class_name: string | null;
  child_ids: string[];
  is_demo: boolean;
};

type TestState = {
  users: Record<string, TestUser>;
  snapshots: Record<string, ApiExtendedSnapshot>;
  invitations: Record<string, MemberInvitationRecord>;
  memberships: Record<string, MembershipRecord>;
  teacherAssignments: Array<{ userId: string; institutionId: string; classId: string }>;
  childBindings: Array<{ userId: string; institutionId: string; classId: string; childId: string }>;
  consents: Array<{ userId: string; childId: string; institutionId: string; consentType: string }>;
  auditEvents: Array<{ action: string; userId: string; institutionId: string }>;
};

const REQUIRED_CONSENTS = [
  "guardian_authorization",
  "terms_of_service",
  "child_privacy_policy",
] as const;

function session(
  id: string,
  role: AccountRole,
  institutionId: string,
  overrides: Partial<SessionUser> = {}
): SessionUser {
  return {
    id,
    username: id,
    name: id,
    role,
    avatar: "",
    institutionId,
    childIds: [],
    accountKind: "normal",
    ...overrides,
  };
}

function workspace(
  institutionId: string,
  ownerUserId: string,
  ownerRole: AccountRole
): ApiExtendedSnapshot {
  return normalizeExtendedSnapshot(
    registrationWorkspaceSnapshot({
      institutionId,
      ownerUserId,
      ownerRole,
      createdAt: "2026-07-24T00:00:00.000Z",
    }),
    session(ownerUserId, ownerRole, institutionId)
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createFixture() {
  let committed: TestState = {
    users: {
      admin: {
        id: "admin",
        role: "机构管理员",
        display_name: "园长",
        institution_id: "inst-main",
        class_name: null,
        child_ids: [],
        is_demo: false,
      },
      teacher: {
        id: "teacher",
        role: "教师",
        display_name: "教师",
        institution_id: "inst-teacher",
        class_name: "新注册班",
        child_ids: [],
        is_demo: false,
      },
      parent: {
        id: "parent",
        role: "家长",
        display_name: "家长",
        institution_id: "inst-family",
        class_name: null,
        child_ids: ["child-1"],
        is_demo: false,
      },
    },
    snapshots: {
      "inst-main": workspace("inst-main", "admin", "机构管理员"),
      "inst-teacher": workspace("inst-teacher", "teacher", "教师"),
      "inst-family": workspace("inst-family", "parent", "家长"),
    },
    invitations: {},
    memberships: {},
    teacherAssignments: [],
    childBindings: [],
    consents: REQUIRED_CONSENTS.map((consentType) => ({
      userId: "parent",
      childId: "child-1",
      institutionId: "inst-family",
      consentType,
    })),
    auditEvents: [],
  };

  committed.snapshots["inst-family"].children.push({
    id: "child-1",
    name: "小雨",
    birthDate: "2022-05-10",
    gender: "女",
    allergies: [],
    heightCm: 96,
    weightKg: 14,
    guardians: [],
    institutionId: "inst-family",
    className: "待分班",
    specialNotes: "",
    avatar: "👧",
    parentUserId: "parent",
  });
  committed.snapshots["inst-family"].growth.push({
    id: "growth-1",
    childId: "child-1",
    createdAt: "2026-07-23T08:00:00.000Z",
    recorder: "家长",
    recorderRole: "家长",
    category: "语言表达",
    tags: ["表达"],
    description: "能完整复述绘本片段",
    needsAttention: false,
  });

  let active: TestState | null = null;
  let idCounter = 0;

  function state() {
    assert.ok(active, "transaction is not active");
    return active;
  }

  const dependencies: InstitutionMembershipDependencies = {
    async runInTransaction(callback) {
      active = clone(committed);
      try {
        const result = await callback({} as DatabaseConnection);
        committed = active;
        return result;
      } finally {
        active = null;
      }
    },
    createId(prefix) {
      idCounter += 1;
      return `${prefix}-${idCounter}`;
    },
    generateCode() {
      return "ABCD-EFGH-JKLM";
    },
    hashCode(code) {
      return `hash:${code.replaceAll("-", "")}`;
    },
    now() {
      return new Date("2026-07-24T12:00:00.000Z");
    },
    async ensureClass(
      _connection,
      institutionId,
      className,
      proposedClassId,
      createdBy
    ) {
      assert.equal(createdBy, "admin");
      return { classId: proposedClassId, institutionId, name: className };
    },
    async insertInvitation(_connection, invitation) {
      state().invitations[invitation.codeHash] = clone(invitation);
    },
    async loadInvitationForUpdate(_connection, codeHash) {
      return clone(state().invitations[codeHash] ?? null);
    },
    async markInvitationAccepted(_connection, invitationId, userId, acceptedAt) {
      const invitation = Object.values(state().invitations).find(
        (item) => item.invitationId === invitationId
      );
      assert.ok(invitation);
      invitation.status = "accepted";
      invitation.acceptedBy = userId;
      invitation.acceptedAt = acceptedAt;
    },
    async loadUserForUpdate(_connection, userId) {
      return clone(state().users[userId] ?? null);
    },
    async loadMembershipForUpdate(_connection, userId) {
      return clone(state().memberships[userId] ?? null);
    },
    async loadSnapshotForUpdate(_connection, institutionId) {
      return clone(state().snapshots[institutionId] ?? null);
    },
    async saveSnapshot(_connection, institutionId, snapshot) {
      state().snapshots[institutionId] = clone(snapshot);
    },
    async loadConsentTypesForChildrenForUpdate(_connection, userId, childIds) {
      return state().consents
        .filter((item) => item.userId === userId && childIds.includes(item.childId))
        .map((item) => ({ childId: item.childId, consentType: item.consentType }));
    },
    async moveConsentRecords(_connection, userId, childIds, institutionId) {
      state().consents = state().consents.map((item) =>
        item.userId === userId && childIds.includes(item.childId)
          ? { ...item, institutionId }
          : item
      );
    },
    async upsertMembership(_connection, membership) {
      state().memberships[membership.userId] = clone(membership);
    },
    async updateUserProjection(
      _connection,
      userId,
      institutionId,
      className,
      childIds
    ) {
      const user = state().users[userId];
      assert.ok(user);
      user.institution_id = institutionId;
      user.class_name = className;
      user.child_ids = [...childIds];
    },
    async upsertTeacherAssignment(_connection, assignment) {
      state().teacherAssignments = state().teacherAssignments.filter(
        (item) => item.userId !== assignment.userId
      );
      state().teacherAssignments.push(clone(assignment));
    },
    async upsertChildBinding(_connection, binding) {
      state().childBindings.push(clone(binding));
    },
    async appendAuthorizationAudit(_connection, event) {
      state().auditEvents.push({
        action: event.action,
        userId: event.subjectUserId,
        institutionId: event.institutionId,
      });
    },
  };

  return {
    dependencies,
    state: () => committed,
    removeConsent(consentType: string) {
      committed.consents = committed.consents.filter(
        (item) => item.consentType !== consentType
      );
    },
  };
}

function assertApiError(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ApiRouteError);
    assert.equal(error.code, code);
    return true;
  };
}

test("teacher accepts a role-scoped invitation and becomes visible in the shared institution", async () => {
  const fixture = createFixture();
  const invitation = await createMemberInvitation(
    session("admin", "机构管理员", "inst-main"),
    { role: "教师", className: "向阳班" },
    fixture.dependencies
  );

  const result = await acceptMemberInvitation(
    session("teacher", "教师", "inst-teacher", { className: "新注册班" }),
    { code: invitation.code },
    fixture.dependencies
  );

  assert.equal(result.institutionId, "inst-main");
  assert.equal(result.className, "向阳班");
  assert.equal(fixture.state().users.teacher.institution_id, "inst-main");
  assert.equal(fixture.state().users.teacher.class_name, "向阳班");
  assert.equal(fixture.state().memberships.teacher.institutionId, "inst-main");
  assert.equal(fixture.state().teacherAssignments[0].classId, invitation.classId);
  assert.equal(
    fixture.state().snapshots["inst-main"].teachers.some(
      (item) => item.userId === "teacher" && item.className === "向阳班"
    ),
    true
  );
});

test("parent acceptance migrates the consented child and records without deleting rollback snapshot", async () => {
  const fixture = createFixture();
  const invitation = await createMemberInvitation(
    session("admin", "机构管理员", "inst-main"),
    { role: "家长", className: "向阳班" },
    fixture.dependencies
  );

  const result = await acceptMemberInvitation(
    session("parent", "家长", "inst-family", { childIds: ["child-1"] }),
    { code: invitation.code },
    fixture.dependencies
  );
  const migratedChild = fixture.state().snapshots["inst-main"].children[0];

  assert.deepEqual(result.childIds, ["child-1"]);
  assert.equal(result.migratedChildCount, 1);
  assert.equal(migratedChild.institutionId, "inst-main");
  assert.equal(migratedChild.className, "向阳班");
  assert.equal(migratedChild.classId, invitation.classId);
  assert.equal(fixture.state().snapshots["inst-main"].growth[0].childId, "child-1");
  assert.equal(fixture.state().snapshots["inst-family"].children[0].institutionId, "inst-family");
  assert.equal(fixture.state().childBindings[0].childId, "child-1");
  assert.equal(
    fixture.state().consents.every((item) => item.institutionId === "inst-main"),
    true
  );
});

test("parent migration rejects incomplete consent and rolls the entire transaction back", async () => {
  const fixture = createFixture();
  const invitation = await createMemberInvitation(
    session("admin", "机构管理员", "inst-main"),
    { role: "家长", className: "向阳班" },
    fixture.dependencies
  );
  fixture.removeConsent("child_privacy_policy");

  await assert.rejects(
    () =>
      acceptMemberInvitation(
        session("parent", "家长", "inst-family", { childIds: ["child-1"] }),
        { code: invitation.code },
        fixture.dependencies
      ),
    assertApiError("needs_confirmation")
  );

  assert.equal(fixture.state().users.parent.institution_id, "inst-family");
  assert.equal(fixture.state().snapshots["inst-main"].children.length, 0);
  assert.equal(
    Object.values(fixture.state().invitations)[0].status,
    "pending"
  );
});

test("legacy same-institution parent binding still requires complete consent", async () => {
  const fixture = createFixture();
  const invitation = await createMemberInvitation(
    session("admin", "机构管理员", "inst-main"),
    { role: "家长", className: "向阳班" },
    fixture.dependencies
  );
  const legacyChild = structuredClone(
    fixture.state().snapshots["inst-family"].children[0]
  );
  legacyChild.institutionId = "inst-main";
  legacyChild.className = "向阳班";
  legacyChild.classId = invitation.classId;
  fixture.state().snapshots["inst-main"].children.push(legacyChild);
  fixture.state().users.parent.institution_id = "inst-main";
  fixture.removeConsent("child_privacy_policy");

  await assert.rejects(
    () =>
      acceptMemberInvitation(
        session("parent", "家长", "inst-main", { childIds: ["child-1"] }),
        { code: invitation.code },
        fixture.dependencies
      ),
    assertApiError("needs_confirmation")
  );

  assert.equal(fixture.state().memberships.parent, undefined);
  assert.equal(
    Object.values(fixture.state().invitations)[0].status,
    "pending"
  );
});

test("invitation cannot be accepted by a different role", async () => {
  const fixture = createFixture();
  const invitation = await createMemberInvitation(
    session("admin", "机构管理员", "inst-main"),
    { role: "教师", className: "向阳班" },
    fixture.dependencies
  );

  await assert.rejects(
    () =>
      acceptMemberInvitation(
        session("parent", "家长", "inst-family", { childIds: ["child-1"] }),
        { code: invitation.code },
        fixture.dependencies
      ),
    assertApiError("forbidden_scope")
  );
});
