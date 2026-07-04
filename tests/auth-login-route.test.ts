import assert from "node:assert/strict";
import test from "node:test";

import { handleLoginRequest, type LoginRouteDependencies } from "@/app/api/auth/login/route";
import type { LoginAccountInput, SessionUser } from "@/lib/auth/accounts";

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionUser(role: SessionUser["role"] = "家长"): SessionUser {
  return {
    id: `u-${role}`,
    username: role === "教师" ? "legacyteacher" : "+8613800000000",
    name: "测试用户",
    role,
    avatar: "👩",
    institutionId: "inst-test",
    className: role === "教师" ? "晨曦班" : undefined,
    childIds: role === "家长" ? ["c-test"] : [],
    accountKind: "normal",
  };
}

test("login route accepts phone credentials and sets the existing session cookie", async () => {
  const authInputs: LoginAccountInput[] = [];
  const sessionCalls: Array<{ userId: string; role: string }> = [];
  const dependencies: LoginRouteDependencies = {
    async authenticate(input) {
      authInputs.push(input);
      return { ok: true, data: sessionUser("家长") };
    },
    async setSession(userId, role) {
      sessionCalls.push({ userId, role });
    },
  };

  const response = await handleLoginRequest(
    jsonRequest({ phone: "13800000000", password: "secret123" }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; user?: SessionUser };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.user?.id, "u-家长");
  assert.deepEqual(authInputs, [{ phone: "13800000000", password: "secret123" }]);
  assert.deepEqual(sessionCalls, [{ userId: "u-家长", role: "家长" }]);
});

test("login route preserves legacy username credentials", async () => {
  const authInputs: LoginAccountInput[] = [];
  const dependencies: LoginRouteDependencies = {
    async authenticate(input) {
      authInputs.push(input);
      return { ok: true, data: sessionUser("教师") };
    },
    async setSession() {
      return undefined;
    },
  };

  const response = await handleLoginRequest(
    jsonRequest({ username: "LegacyTeacher", password: "secret123" }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; user?: SessionUser };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.user?.role, "教师");
  assert.deepEqual(authInputs, [{ username: "LegacyTeacher", password: "secret123" }]);
});

test("login route forwards authentication failures without setting session", async () => {
  let setSessionCalled = false;
  const dependencies: LoginRouteDependencies = {
    async authenticate() {
      return { ok: false, status: 401, error: "手机号或密码错误" };
    },
    async setSession() {
      setSessionCalled = true;
    },
  };

  const response = await handleLoginRequest(
    jsonRequest({ phone: "13800000000", password: "wrong-password" }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; error?: string };

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error, "手机号或密码错误");
  assert.equal(setSessionCalled, false);
});
