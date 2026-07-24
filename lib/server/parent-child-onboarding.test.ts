import assert from "node:assert/strict";
import test from "node:test";

import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/accounts";
import type { DatabaseConnection } from "@/lib/db/server";
import { registrationWorkspaceSnapshot } from "@/lib/persistence/bootstrap";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  CHILD_ONBOARDING_CONSENT_TYPES,
  createParentChildWithConsent,
  type ParentChildOnboardingConsentRecord,
  type ParentChildOnboardingDependencies,
} from "@/lib/server/parent-child-onboarding";

type ParentUserRow = NonNullable<
  Awaited<ReturnType<ParentChildOnboardingDependencies["loadParentUserForUpdate"]>>
>;

type TestState = {
  userRow: ParentUserRow;
  snapshot: unknown | null;
  consents: ParentChildOnboardingConsentRecord[];
  childAuthorizations: Array<{
    userId: string;
    institutionId: string;
    classId: string;
    childId: string;
  }>;
};

function parentSession(overrides: Partial<SessionUser> = {}) {
  return {
    id: "u-parent",
    username: "+8613800000000",
    name: "测试家长",
    role: "家长",
    avatar: "👩",
    institutionId: "inst-family",
    childIds: [],
    accountKind: "normal",
    ...overrides,
  } satisfies SessionUser;
}

function initialSnapshot(session = parentSession()) {
  return registrationWorkspaceSnapshot({
    institutionId: session.institutionId,
    ownerUserId: session.id,
    ownerRole: session.role,
    createdAt: "2026-07-04T00:00:00.000Z",
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createFixture(options: {
  userRow?: Partial<ParentUserRow>;
  snapshot?: unknown | null;
  failConsentInsert?: boolean;
} = {}) {
  let ensureConsentStorageCount = 0;
  let transactionCount = 0;
  let idCounter = 0;
  let committed: TestState = {
    userRow: {
      id: "u-parent",
      role: "家长",
      institution_id: "inst-family",
      child_ids: [],
      is_demo: false,
      ...options.userRow,
    } as ParentUserRow,
    snapshot: options.snapshot === undefined ? initialSnapshot() : options.snapshot,
    consents: [],
    childAuthorizations: [],
  };
  let active: TestState | null = null;

  function current() {
    assert.ok(active, "transaction is not active");
    return active;
  }

  const dependencies: ParentChildOnboardingDependencies = {
    async ensureConsentRecordsStorage() {
      ensureConsentStorageCount += 1;
    },
    async runInTransaction(callback) {
      transactionCount += 1;
      active = clone(committed);
      try {
        const result = await callback({} as DatabaseConnection);
        committed = active;
        return result;
      } finally {
        active = null;
      }
    },
    async loadParentUserForUpdate() {
      return current().userRow;
    },
    async loadSnapshotForUpdate() {
      return current().snapshot;
    },
    async saveSnapshot(_connection, _institutionId, snapshot) {
      current().snapshot = clone(snapshot);
    },
    async updateUserChildIds(_connection, _userId, childIds) {
      current().userRow.child_ids = [...childIds];
    },
    async insertConsentRecord(_connection, record) {
      if (options.failConsentInsert) {
        throw new Error("insert consent failed");
      }
      current().consents.push({ ...record });
    },
    async upsertChildAuthorization(_connection, authorization) {
      current().childAuthorizations.push({ ...authorization });
    },
    createId(prefix) {
      idCounter += 1;
      return `${prefix}-${idCounter}`;
    },
    now() {
      return new Date("2026-07-04T12:00:00.000Z");
    },
  };

  return {
    dependencies,
    ensureConsentStorageCount: () => ensureConsentStorageCount,
    state: () => committed,
    transactionCount: () => transactionCount,
  };
}

function assertApiError(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ApiRouteError);
    assert.equal(error.code, code);
    return true;
  };
}

test("parent child onboarding rejects consentAccepted=false before DB writes", async () => {
  const fixture = createFixture();

  await assert.rejects(
    () =>
      createParentChildWithConsent(
        parentSession(),
        { name: "小雨", birthDate: "2022-05-10", consentAccepted: false },
        {},
        fixture.dependencies
      ),
    assertApiError("invalid_request")
  );

  assert.equal(fixture.transactionCount(), 0);
  assert.equal(fixture.ensureConsentStorageCount(), 0);
  assert.equal((fixture.state().snapshot as ApiExtendedSnapshot).children.length, 0);
  assert.deepEqual(fixture.state().userRow.child_ids, []);
  assert.deepEqual(fixture.state().consents, []);
});

test("parent child onboarding creates child, child_ids, and three consent records in scope", async () => {
  const fixture = createFixture();
  const child = await createParentChildWithConsent(
    parentSession({ classId: "class-sunrise", className: "向阳班" }),
    {
      name: " 小雨 ",
      nickname: "雨雨",
      birthDate: "2022-05-10",
      gender: "女",
      consentAccepted: true,
    },
    { ip: "203.0.113.9", userAgent: "unit-test-agent" },
    fixture.dependencies
  );
  const snapshot = fixture.state().snapshot as ApiExtendedSnapshot;

  assert.equal(child.id, "c-1");
  assert.equal(child.name, "小雨");
  assert.equal(child.nickname, "雨雨");
  assert.equal(child.institutionId, "inst-family");
  assert.equal(child.parentUserId, "u-parent");
  assert.equal(child.classId, "class-sunrise");
  assert.equal(child.className, "向阳班");
  assert.deepEqual(child.guardians, []);
  assert.equal(snapshot.children[0].id, child.id);
  assert.deepEqual(fixture.state().userRow.child_ids, ["c-1"]);
  assert.deepEqual(
    fixture.state().consents.map((item) => item.consentType),
    [...CHILD_ONBOARDING_CONSENT_TYPES]
  );
  assert.equal(fixture.ensureConsentStorageCount(), 1);
  assert.equal(fixture.state().consents.every((item) => item.institutionId === "inst-family"), true);
  assert.equal(fixture.state().consents.every((item) => item.userId === "u-parent"), true);
  assert.equal(fixture.state().consents.every((item) => item.childId === "c-1"), true);
  assert.equal(fixture.state().consents[0].ip, "203.0.113.9");
  assert.equal(fixture.state().consents[0].userAgent, "unit-test-agent");
  assert.equal(fixture.state().consents[0].agreedAt instanceof Date, true);
  assert.deepEqual(fixture.state().childAuthorizations, [
    {
      userId: "u-parent",
      institutionId: "inst-family",
      classId: "class-sunrise",
      childId: "c-1",
    },
  ]);
});

test("parent child onboarding creates a registration snapshot when the parent snapshot is missing", async () => {
  const fixture = createFixture({ snapshot: null });

  const child = await createParentChildWithConsent(
    parentSession(),
    { name: "Snapshot Child", birthDate: "2022-05-10", consentAccepted: true },
    {},
    fixture.dependencies
  );
  const snapshot = fixture.state().snapshot as ApiExtendedSnapshot;

  assert.equal(child.id, "c-1");
  assert.equal(snapshot.children[0].id, "c-1");
  assert.equal(snapshot.meta?.workspace?.institutionId, "inst-family");
  assert.equal(snapshot.meta?.workspace?.ownerUserId, "u-parent");
  assert.deepEqual(fixture.state().userRow.child_ids, ["c-1"]);
  assert.equal(fixture.state().consents.length, 3);
});

test("parent child onboarding rejects demo, non-parent, and cross-institution attempts", async () => {
  const demoFixture = createFixture();
  const teacherFixture = createFixture();
  const crossInstitutionFixture = createFixture({
    userRow: { institution_id: "inst-other" },
  });

  await assert.rejects(
    () =>
      createParentChildWithConsent(
        parentSession({ accountKind: "demo" }),
        { name: "小雨", birthDate: "2022-05-10", consentAccepted: true },
        {},
        demoFixture.dependencies
      ),
    assertApiError("forbidden_scope")
  );
  await assert.rejects(
    () =>
      createParentChildWithConsent(
        parentSession({ role: "教师" }),
        { name: "小雨", birthDate: "2022-05-10", consentAccepted: true },
        {},
        teacherFixture.dependencies
      ),
    assertApiError("forbidden_scope")
  );
  await assert.rejects(
    () =>
      createParentChildWithConsent(
        parentSession(),
        { name: "小雨", birthDate: "2022-05-10", consentAccepted: true },
        {},
        crossInstitutionFixture.dependencies
      ),
    assertApiError("forbidden_scope")
  );

  assert.equal(demoFixture.transactionCount(), 0);
  assert.equal(teacherFixture.transactionCount(), 0);
  assert.equal(crossInstitutionFixture.transactionCount(), 1);
  assert.equal((crossInstitutionFixture.state().snapshot as ApiExtendedSnapshot).children.length, 0);
});

test("parent child onboarding rolls back child and child_ids when consent insert fails", async () => {
  const fixture = createFixture({ failConsentInsert: true });

  await assert.rejects(
    () =>
      createParentChildWithConsent(
        parentSession(),
        { name: "小雨", birthDate: "2022-05-10", consentAccepted: true },
        {},
        fixture.dependencies
      ),
    assertApiError("server_error")
  );

  assert.equal((fixture.state().snapshot as ApiExtendedSnapshot).children.length, 0);
  assert.deepEqual(fixture.state().userRow.child_ids, []);
  assert.deepEqual(fixture.state().consents, []);
});

test("parent child onboarding converts ageMonth fallback to birthDate", async () => {
  const fixture = createFixture();

  const child = await createParentChildWithConsent(
    parentSession(),
    { name: "小雨", ageMonth: 24, consentAccepted: true },
    {},
    fixture.dependencies
  );

  assert.equal(child.birthDate, "2024-07-04");
});
