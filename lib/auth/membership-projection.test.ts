import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@/lib/auth/accounts";
import { applyMembershipProjection } from "@/lib/auth/membership-projection";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u-1",
    name: "测试账号",
    role: "教师",
    avatar: "",
    institutionId: "inst-trial",
    className: "新注册班",
    childIds: [],
    accountKind: "normal",
    ...overrides,
  };
}

test("canonical teacher membership overrides legacy institution and class projections", () => {
  const projected = applyMembershipProjection(user(), {
    institutionId: "inst-main",
    role: "教师",
    classId: "class-sunrise",
    className: "向阳班",
    childIds: [],
    authzVersion: 3,
  });

  assert.equal(projected.institutionId, "inst-main");
  assert.equal(projected.classId, "class-sunrise");
  assert.equal(projected.className, "向阳班");
  assert.equal(projected.authzVersion, 3);
});

test("canonical parent membership replaces stale child_ids", () => {
  const projected = applyMembershipProjection(
    user({ role: "家长", childIds: ["legacy-child"], className: undefined }),
    {
      institutionId: "inst-main",
      role: "家长",
      childIds: ["child-1", "child-2"],
      authzVersion: 2,
    }
  );

  assert.deepEqual(projected.childIds, ["child-1", "child-2"]);
  assert.equal(projected.className, undefined);
});

test("legacy session remains unchanged when no canonical membership exists", () => {
  const legacy = user();
  assert.deepEqual(applyMembershipProjection(legacy, null), legacy);
});
