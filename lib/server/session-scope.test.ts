import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { AppDataRepository } from "@/lib/server/app-data-repository";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";

type SnapshotChild = AppStateSnapshot["children"][number];

class MemoryRepository implements AppDataRepository {
  constructor(private readonly snapshot: ApiExtendedSnapshot) {}

  async load() {
    return this.snapshot;
  }

  async save() {
    return;
  }
}

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
    className: input.className ?? "小一班",
    specialNotes: "",
    avatar: input.avatar ?? "C",
    parentUserId: input.parentUserId,
  };
}

function user(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: "u-default",
    name: "Default User",
    role: "家长",
    avatar: "U",
    institutionId: "inst-a",
    childIds: [],
    accountKind: "normal",
    ...overrides,
  };
}

function snapshot() {
  const value = emptyInstitutionSnapshot("2026-07-05T00:00:00.000Z") as ApiExtendedSnapshot;
  value.children = [
    child({ id: "c-a", institutionId: "inst-a", parentUserId: "parent-a", className: "小一班" }),
    child({ id: "c-b", institutionId: "inst-a", parentUserId: "parent-b", className: "小二班" }),
    child({ id: "c-other-inst", institutionId: "inst-b", parentUserId: "parent-a", className: "小一班" }),
  ];
  value.health = [
    { id: "h-a", childId: "c-a", date: "2026-07-05", temperature: 36.6, mood: "稳定", handMouthEye: "正常", isAbnormal: false, checkedBy: "teacher", checkedByRole: "教师" },
    { id: "h-b", childId: "c-b", date: "2026-07-05", temperature: 38.1, mood: "低落", handMouthEye: "异常", isAbnormal: true, checkedBy: "teacher", checkedByRole: "教师" },
  ];
  value.consultations = [
    {
      consultationId: "consult-a",
      childId: "c-a",
      triggerReason: "A",
      triggerReasons: ["A"],
      participants: [],
      agentFindings: [],
      shouldEscalateToAdmin: false,
      riskLevel: "low",
      summary: "A",
      keyFindings: [],
      todayInSchoolActions: [],
      tonightAtHomeActions: [],
      followUp48h: [],
      generatedAt: "2026-07-05T00:00:00.000Z",
      source: "fallback",
      fallback: true,
    },
    {
      consultationId: "consult-b",
      childId: "c-b",
      triggerReason: "B",
      triggerReasons: ["B"],
      participants: [],
      agentFindings: [],
      shouldEscalateToAdmin: true,
      riskLevel: "high",
      summary: "B",
      keyFindings: [],
      todayInSchoolActions: [],
      tonightAtHomeActions: [],
      followUp48h: [],
      generatedAt: "2026-07-05T00:00:00.000Z",
      source: "fallback",
      fallback: true,
    },
  ] as unknown as ApiExtendedSnapshot["consultations"];
  return value;
}

test("parent scope only includes owned childIds and rejects another parent child", async () => {
  const scope = await getSessionScope(
    user({ id: "parent-a", role: "家长", childIds: ["c-a"] }),
    new MemoryRepository(snapshot())
  );

  assert.deepEqual(scope.visibleChildren.map((item) => item.id), ["c-a"]);
  assert.deepEqual(scope.scopedSnapshot.health.map((item) => item.id), ["h-a"]);
  assert.deepEqual(scope.scopedSnapshot.consultations.map((item) => item.consultationId), ["consult-a"]);
  assert.throws(() => requireScopedChild(scope, "c-b"), (error) => {
    assert.ok(error instanceof ApiRouteError);
    assert.equal(error.code, "not_found");
    return true;
  });
});

test("admin scope is limited to current institution", async () => {
  const scope = await getSessionScope(
    user({ id: "admin-a", role: "机构管理员" }),
    new MemoryRepository(snapshot())
  );

  assert.deepEqual(scope.visibleChildren.map((item) => item.id).sort(), ["c-a", "c-b"]);
  assert.deepEqual(buildServiceScopeClaim(scope).childIds.sort(), ["c-a", "c-b"]);
  assert.doesNotThrow(() => requireScopedChild(scope, "c-b"));
  assert.throws(() => requireScopedChild(scope, "c-other-inst"));
});

test("teacher scope is limited to current institution and className", async () => {
  const scope = await getSessionScope(
    user({ id: "teacher-a", role: "教师", className: "小一班" }),
    new MemoryRepository(snapshot())
  );

  assert.deepEqual(scope.visibleChildren.map((item) => item.id), ["c-a"]);
  assert.deepEqual(buildServiceScopeClaim(scope), {
    institutionId: "inst-a",
    role: "教师",
    accountKind: "normal",
    childIds: ["c-a"],
    className: "小一班",
  });
  assert.throws(() => requireScopedChild(scope, "c-b"));
});
