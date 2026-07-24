import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateLoginAccountWithDependencies,
  type LoginNormalAccountDependencies,
} from "@/lib/auth/account-server";
import type { AccountRole } from "@/lib/auth/accounts";
import type { MembershipAuthorizationProjection } from "@/lib/auth/membership-projection";

function appUserRow(username: string, passwordHash = "hash:secret123", role: AccountRole = "家长") {
  return {
    id: `u-${username}`,
    username_normalized: username,
    display_name: "测试用户",
    password_hash: passwordHash,
    role,
    avatar: null,
    institution_id: "inst-test",
    class_name: role === "教师" ? "晨曦班" : null,
    child_ids: role === "家长" ? ["c-test"] : [],
    is_demo: false,
  };
}

function createLoginDeps(options?: {
  phoneRows?: Record<string, ReturnType<typeof appUserRow>>;
  usernameRows?: Record<string, ReturnType<typeof appUserRow>>;
  phoneError?: string;
  usernameError?: string;
  membershipProjection?: MembershipAuthorizationProjection | null;
  membershipError?: Error;
}) {
  const phoneCalls: string[] = [];
  const usernameCalls: string[] = [];

  const dependencies: LoginNormalAccountDependencies = {
    async getUserByPhoneNormalized(phone) {
      phoneCalls.push(phone);
      return {
        row: options?.phoneRows?.[phone] ?? null,
        error: options?.phoneError ?? null,
      };
    },
    async getUserByUsername(username) {
      usernameCalls.push(username);
      return {
        row: options?.usernameRows?.[username] ?? null,
        error: options?.usernameError ?? null,
      };
    },
    async verifyPassword(password, hash) {
      return hash === `hash:${password}`;
    },
    async loadMembershipProjection() {
      if (options?.membershipError) throw options.membershipError;
      return options?.membershipProjection ?? null;
    },
  };

  return { dependencies, phoneCalls, usernameCalls };
}

test("authenticateLoginAccount accepts phone and reads phone_normalized first", async () => {
  const { dependencies, phoneCalls, usernameCalls } = createLoginDeps({
    phoneRows: {
      "+8613800000000": appUserRow("+8613800000000", "hash:secret123", "家长"),
    },
  });

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "13800000000", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.id, "u-+8613800000000");
  assert.equal(result.data.role, "家长");
  assert.deepEqual(result.data.childIds, ["c-test"]);
  assert.deepEqual(phoneCalls, ["+8613800000000"]);
  assert.deepEqual(usernameCalls, []);
});

test("authenticateLoginAccount falls back from phone_normalized to username_normalized", async () => {
  const { dependencies, phoneCalls, usernameCalls } = createLoginDeps({
    usernameRows: {
      "+8613800000000": appUserRow("+8613800000000", "hash:secret123", "家长"),
    },
  });

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "+8613800000000", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.username, "+8613800000000");
  assert.deepEqual(phoneCalls, ["+8613800000000"]);
  assert.deepEqual(usernameCalls, ["+8613800000000"]);
});

test("authenticateLoginAccount preserves legacy username login", async () => {
  const { dependencies, phoneCalls, usernameCalls } = createLoginDeps({
    usernameRows: {
      legacyteacher: appUserRow("legacyteacher", "hash:secret123", "教师"),
    },
  });

  const result = await authenticateLoginAccountWithDependencies(
    { username: "LegacyTeacher", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.role, "教师");
  assert.equal(result.data.className, "晨曦班");
  assert.deepEqual(phoneCalls, []);
  assert.deepEqual(usernameCalls, ["legacyteacher"]);
});

test("authenticateLoginAccount rejects bad passwords without leaking account existence", async () => {
  const { dependencies } = createLoginDeps({
    phoneRows: {
      "+8613800000000": appUserRow("+8613800000000", "hash:secret123", "家长"),
    },
  });

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "13800000000", password: "wrong-password" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 401);
  assert.equal(result.error, "手机号或密码错误");
});

test("authenticateLoginAccount rejects invalid explicit phone numbers", async () => {
  const { dependencies, phoneCalls, usernameCalls } = createLoginDeps();

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "123", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.equal(result.error, "手机号格式错误");
  assert.deepEqual(phoneCalls, []);
  assert.deepEqual(usernameCalls, []);
});

test("authenticateLoginAccount returns service unavailable for lookup failures", async () => {
  const { dependencies } = createLoginDeps({ phoneError: "DATABASE_URL missing" });

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "13800000000", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 503);
  assert.equal(result.error, "服务暂时不可用");
});

test("authenticateLoginAccount returns the canonical membership projection immediately", async () => {
  const role = "\u6559\u5e08" as AccountRole;
  const { dependencies } = createLoginDeps({
    phoneRows: {
      "+8613800000000": appUserRow("+8613800000000", "hash:secret123", role),
    },
    membershipProjection: {
      institutionId: "inst-canonical",
      role,
      classId: "class-canonical",
      className: "\u8054\u8c03\u793a\u4f8b\u73ed",
      childIds: [],
      authzVersion: 3,
    },
  });

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "13800000000", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.institutionId, "inst-canonical");
  assert.equal(result.data.classId, "class-canonical");
  assert.equal(result.data.className, "\u8054\u8c03\u793a\u4f8b\u73ed");
  assert.equal(result.data.authzVersion, 3);
});

test("authenticateLoginAccount reports projection query failures as service unavailable", async () => {
  const { dependencies } = createLoginDeps({
    phoneRows: {
      "+8613800000000": appUserRow("+8613800000000"),
    },
    membershipError: new Error("membership query failed"),
  });

  const result = await authenticateLoginAccountWithDependencies(
    { phone: "13800000000", password: "secret123" },
    dependencies
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 503);
  assert.equal(result.error, "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528");
});
