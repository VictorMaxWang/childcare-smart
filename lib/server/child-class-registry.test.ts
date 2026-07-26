import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import type { DatabaseConnection } from "@/lib/db/server";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import {
  synchronizeChangedChildBindings,
  type RegistryChild,
} from "@/lib/server/child-class-registry";

function directorSession(): SessionUser {
  return {
    id: "director-1",
    name: "测试园长",
    role: "机构管理员",
    avatar: "",
    institutionId: "inst-1",
    accountKind: "normal",
  };
}

function child(overrides: Partial<RegistryChild> = {}): RegistryChild {
  return {
    id: "child-1",
    name: "测试幼儿",
    birthDate: "2023-01-01",
    gender: "女",
    allergies: [],
    heightCm: 95,
    weightKg: 14,
    guardians: [],
    institutionId: "inst-1",
    className: "晨曦班",
    classId: "class-proposed",
    specialNotes: "",
    avatar: "👧",
    ...overrides,
  };
}

test("child class registry reuses canonical class id and writes archive status", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection = {
    async execute(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("select id") && sql.includes("institution_classes")) {
        return [[{ id: "class-canonical" }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabaseConnection;
  const snapshot = normalizeExtendedSnapshot(
    emptyInstitutionSnapshot(),
    directorSession()
  );
  snapshot.children = [child({ archivedAt: "2026-07-26T00:00:00.000Z" })];

  await synchronizeChangedChildBindings(
    connection,
    directorSession(),
    [child({ className: "向阳班", classId: "class-old" })],
    snapshot
  );

  assert.equal(snapshot.children[0].classId, "class-canonical");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].params, [
    "class-proposed",
    "inst-1",
    "晨曦班",
  ]);
  assert.deepEqual(calls[2].params, [
    "child-1",
    "inst-1",
    "class-canonical",
    "archived",
    "director-1",
  ]);
});

test("unchanged child binding does not touch relationship tables", async () => {
  let executeCount = 0;
  const connection = {
    async execute() {
      executeCount += 1;
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabaseConnection;
  const current = child();
  const snapshot = normalizeExtendedSnapshot(
    emptyInstitutionSnapshot(),
    directorSession()
  );
  snapshot.children = [current];

  await synchronizeChangedChildBindings(
    connection,
    directorSession(),
    [structuredClone(current)],
    snapshot
  );

  assert.equal(executeCount, 0);
});
