import assert from "node:assert/strict";
import test from "node:test";

import {
  insertAppUserWithPhoneFallback,
  registerNormalAccountWithDependencies,
  type RegisterNormalAccountDependencies,
} from "@/lib/auth/account-server";
import type { AccountRole } from "@/lib/auth/accounts";
import type { DatabaseConnection } from "@/lib/db/server";

function existingRow(username: string, role: AccountRole = "家长") {
  return {
    id: `existing-${username}`,
    username_normalized: username,
    display_name: "existing user",
    password_hash: "hash",
    role,
    avatar: null,
    institution_id: "inst-existing",
    class_name: null,
    child_ids: [],
    is_demo: false,
  };
}

function createRegisterDeps(options?: { usernames?: string[]; phones?: string[]; failInsert?: boolean; failSnapshot?: boolean }) {
  const usernames = new Set(options?.usernames ?? []);
  const phones = new Set(options?.phones ?? []);
  const insertedRows: Array<Record<string, unknown>> = [];
  const snapshots: Array<{ institutionId: string; updatedBy: string; snapshot: unknown }> = [];
  let stagedTransaction: { insertedRows: Array<Record<string, unknown>>; snapshots: typeof snapshots } | null = null;
  let idCounter = 0;

  const dependencies: RegisterNormalAccountDependencies = {
    createId(prefix) {
      idCounter += 1;
      return `${prefix}-test-${idCounter}`;
    },
    async getUserByPhoneNormalized(phone) {
      return { row: phones.has(phone) ? existingRow(phone) : null, error: null };
    },
    async getUserByUsername(username) {
      return { row: usernames.has(username) ? existingRow(username) : null, error: null };
    },
    async hashPassword(password) {
      return `hash:${password}`;
    },
    async insertAppUser(_connection, row) {
      if (options?.failInsert) {
        throw new Error("insert failed");
      }

      const target = stagedTransaction?.insertedRows ?? insertedRows;
      target.push(row as unknown as Record<string, unknown>);
    },
    async runInTransaction(callback) {
      const previousTransaction = stagedTransaction;
      const transaction = { insertedRows: [], snapshots: [] as typeof snapshots };
      stagedTransaction = transaction;

      try {
        const result = await callback({} as DatabaseConnection);
        insertedRows.push(...transaction.insertedRows);
        snapshots.push(...transaction.snapshots);
        return result;
      } finally {
        stagedTransaction = previousTransaction;
      }
    },
    async upsertInstitutionSnapshot(_connection, institutionId, snapshot, updatedBy) {
      if (options?.failSnapshot) {
        throw new Error("snapshot failed");
      }

      const target = stagedTransaction?.snapshots ?? snapshots;
      target.push({ institutionId, snapshot, updatedBy });
    },
  };

  return { dependencies, insertedRows, snapshots };
}

function readSnapshotMeta(snapshot: unknown) {
  assert.equal(typeof snapshot, "object");
  assert.ok(snapshot);
  return (snapshot as {
    children?: unknown[];
    meta?: {
      workspace?: {
        kind?: string;
        institutionId?: string;
        ownerUserId?: string;
        ownerRole?: string;
        isDemo?: boolean;
      };
      usageLimits?: {
        maxChildren?: number;
        maxStorybooksPerMonth?: number;
        maxAiCallsPerDay?: number;
      };
    };
  }).meta;
}

test("registerNormalAccount rejects requests without phone or username", async () => {
  const { dependencies } = createRegisterDeps();

  const result = await registerNormalAccountWithDependencies(
    { password: "secret123", confirmPassword: "secret123", role: "parent" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
  }
});

test("registerNormalAccount rejects invalid phone numbers", async () => {
  const { dependencies } = createRegisterDeps();

  const result = await registerNormalAccountWithDependencies(
    { phone: "123", password: "secret123", confirmPassword: "secret123", role: "parent" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
  }
});

test("registerNormalAccount rejects short or blank passwords", async () => {
  const { dependencies } = createRegisterDeps();

  const shortResult = await registerNormalAccountWithDependencies(
    { phone: "13800000000", password: "12345", confirmPassword: "12345", role: "parent" },
    dependencies
  );
  const blankResult = await registerNormalAccountWithDependencies(
    { phone: "13800000000", password: "      ", confirmPassword: "      ", role: "parent" },
    dependencies
  );

  assert.equal(shortResult.ok, false);
  assert.equal(blankResult.ok, false);
  if (!shortResult.ok) assert.equal(shortResult.status, 400);
  if (!blankResult.ok) assert.equal(blankResult.status, 400);
});

test("registerNormalAccount returns 409 for duplicate phone numbers", async () => {
  const { dependencies } = createRegisterDeps({ phones: ["+8613800000000"] });

  const result = await registerNormalAccountWithDependencies(
    { phone: "13800000000", password: "secret123", confirmPassword: "secret123", role: "parent" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
  }
});

test("registerNormalAccount treats legacy raw-phone usernames as duplicate phones", async () => {
  const { dependencies } = createRegisterDeps({ usernames: ["13800000000"] });

  const result = await registerNormalAccountWithDependencies(
    { phone: "13800000000", password: "secret123", confirmPassword: "secret123", role: "parent" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
  }
});

test("registerNormalAccount creates phone-first parent accounts without child records", async () => {
  const { dependencies, insertedRows, snapshots } = createRegisterDeps();

  const result = await registerNormalAccountWithDependencies(
    {
      phone: "13800000000",
      password: "secret123",
      confirmPassword: "secret123",
      role: "parent",
      displayName: "测试家长",
      child: {
        name: "不应创建的儿童",
        birthDate: "2022-01-01",
        gender: "女",
      },
    },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.username, "+8613800000000");
  assert.equal(result.data.name, "测试家长");
  assert.equal(result.data.role, "家长");
  assert.deepEqual(result.data.childIds, []);
  assert.equal(insertedRows[0].username_normalized, "+8613800000000");
  assert.equal(insertedRows[0].phone_normalized, "+8613800000000");
  assert.equal(insertedRows[0].is_demo, false);
  assert.deepEqual(insertedRows[0].child_ids, []);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].institutionId, insertedRows[0].institution_id);
  assert.equal(snapshots[0].updatedBy, result.data.id);
  assert.deepEqual((snapshots[0].snapshot as { children?: unknown[] }).children, []);
  const meta = readSnapshotMeta(snapshots[0].snapshot);
  assert.equal(meta?.workspace?.kind, "family");
  assert.equal(meta?.workspace?.institutionId, insertedRows[0].institution_id);
  assert.equal(meta?.workspace?.ownerUserId, result.data.id);
  assert.equal(meta?.workspace?.ownerRole, "家长");
  assert.equal(meta?.workspace?.isDemo, false);
  assert.deepEqual(meta?.usageLimits, {
    maxChildren: 5,
    maxStorybooksPerMonth: 20,
    maxAiCallsPerDay: 50,
  });
});

test("registerNormalAccount creates real institution workspaces for admin aliases", async () => {
  const { dependencies, insertedRows, snapshots } = createRegisterDeps();

  const result = await registerNormalAccountWithDependencies(
    {
      phone: "13900000000",
      password: "secret123",
      confirmPassword: "secret123",
      role: "institution_admin",
      displayName: "测试园长",
    },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.role, "机构管理员");
  assert.equal(result.data.institutionId, insertedRows[0].institution_id);
  assert.deepEqual(result.data.childIds, []);
  assert.equal(insertedRows[0].is_demo, false);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].institutionId, result.data.institutionId);
  assert.deepEqual((snapshots[0].snapshot as { children?: unknown[] }).children, []);
  const meta = readSnapshotMeta(snapshots[0].snapshot);
  assert.equal(meta?.workspace?.kind, "institution");
  assert.equal(meta?.workspace?.ownerRole, "机构管理员");
  assert.equal(meta?.workspace?.isDemo, false);
});

test("registerNormalAccount creates personal trial workspaces for teachers", async () => {
  const { dependencies, insertedRows, snapshots } = createRegisterDeps();

  const result = await registerNormalAccountWithDependencies(
    {
      phone: "13700000000",
      password: "secret123",
      confirmPassword: "secret123",
      role: "teacher",
    },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.role, "教师");
  assert.equal(result.data.className, "新注册班");
  assert.equal(result.data.institutionId, insertedRows[0].institution_id);
  assert.equal(insertedRows[0].is_demo, false);
  assert.equal(insertedRows[0].class_name, "新注册班");
  assert.deepEqual(result.data.childIds, []);
  assert.equal(snapshots.length, 1);
  assert.deepEqual((snapshots[0].snapshot as { children?: unknown[] }).children, []);
  const meta = readSnapshotMeta(snapshots[0].snapshot);
  assert.equal(meta?.workspace?.kind, "teacher_trial");
  assert.equal(meta?.workspace?.ownerUserId, result.data.id);
  assert.equal(meta?.workspace?.ownerRole, "教师");
});

test("registerNormalAccount preserves legacy username registration", async () => {
  const { dependencies, insertedRows } = createRegisterDeps();

  const result = await registerNormalAccountWithDependencies(
    {
      username: "LegacyTeacher",
      password: "secret123",
      confirmPassword: "secret123",
      role: "teacher",
      className: "晨曦班",
    },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.username, "legacyteacher");
  assert.equal(result.data.role, "教师");
  assert.equal(result.data.className, "晨曦班");
  assert.equal(insertedRows[0].phone_normalized, null);
});

test("registerNormalAccount rolls back staged user when snapshot creation fails", async () => {
  const { dependencies, insertedRows, snapshots } = createRegisterDeps({ failSnapshot: true });

  const result = await registerNormalAccountWithDependencies(
    { phone: "13600000000", password: "secret123", confirmPassword: "secret123", role: "admin" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
  }
  assert.deepEqual(insertedRows, []);
  assert.deepEqual(snapshots, []);
});

test("registerNormalAccount does not create snapshots when user insert fails", async () => {
  const { dependencies, insertedRows, snapshots } = createRegisterDeps({ failInsert: true });

  const result = await registerNormalAccountWithDependencies(
    { phone: "13500000000", password: "secret123", confirmPassword: "secret123", role: "parent" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
  }
  assert.deepEqual(insertedRows, []);
  assert.deepEqual(snapshots, []);
});

test("insertAppUserWithPhoneFallback retries legacy insert when phone_normalized column is missing", async () => {
  const executeCalls: string[] = [];
  const connection = {
    async execute(sql: string) {
      executeCalls.push(sql);
      if (sql.includes("phone_normalized")) {
        const error = new Error("Unknown column 'phone_normalized'");
        (error as Error & { code?: string; errno?: number }).code = "ER_BAD_FIELD_ERROR";
        throw error;
      }
      return [[]];
    },
  } as unknown as DatabaseConnection;

  await insertAppUserWithPhoneFallback(connection, {
    id: "u-test",
    username_normalized: "+8613800000000",
    phone_normalized: "+8613800000000",
    display_name: "138****0000",
    password_hash: "hash:secret123",
    role: "家长",
    avatar: null,
    institution_id: "inst-test",
    class_name: null,
    child_ids: [],
    is_demo: false,
  });

  assert.equal(executeCalls.length, 2);
  assert.match(executeCalls[0], /phone_normalized/);
  assert.doesNotMatch(executeCalls[1], /phone_normalized/);
});

test("registerNormalAccount propagates safe database config codes from duplicate lookup", async () => {
  const { dependencies, insertedRows, snapshots } = createRegisterDeps();
  dependencies.getUserByPhoneNormalized = async () =>
    ({
      row: null,
      error: "database unavailable",
      errorCode: "DATABASE_URL_INVALID",
    }) as Awaited<ReturnType<RegisterNormalAccountDependencies["getUserByPhoneNormalized"]>>;

  const result = await registerNormalAccountWithDependencies(
    { phone: "13800000000", password: "secret123", confirmPassword: "secret123", role: "parent" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    const failure = result as typeof result & { errorCode?: string };
    assert.equal(failure.status, 503);
    assert.equal(failure.error, "database unavailable");
    assert.equal(failure.errorCode, "DATABASE_URL_INVALID");
  }
  assert.deepEqual(insertedRows, []);
  assert.deepEqual(snapshots, []);
});
