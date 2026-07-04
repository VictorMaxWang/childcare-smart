import assert from "node:assert/strict";
import test from "node:test";

import { handleRegisterRequest, type RegisterRouteDependencies } from "./route.ts";
import type { SessionUser } from "@/lib/auth/accounts";

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("register route rejects missing or mismatched confirmPassword before creating accounts", async () => {
  let registerCalled = false;
  const dependencies: RegisterRouteDependencies = {
    async registerAccount() {
      registerCalled = true;
      return { ok: false, status: 500, error: "should not be called" };
    },
    async setSession() {
      throw new Error("setSession should not be called");
    },
  };

  const response = await handleRegisterRequest(
    jsonRequest({ phone: "13800000000", password: "secret123", confirmPassword: "different", role: "parent" }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; error?: string };

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error, "两次输入的密码不一致。");
  assert.equal(registerCalled, false);
});

test("register route sets the existing session cookie path and never returns password_hash", async () => {
  const sessionCalls: Array<{ userId: string; role: string }> = [];
  const dependencies: RegisterRouteDependencies = {
    async registerAccount(input) {
      assert.equal(input.phone, "13800000000");
      return {
        ok: true,
        data: {
          id: "u-test",
          username: "+8613800000000",
          name: "测试家长",
          role: "家长",
          avatar: "👩",
          institutionId: "inst-test",
          childIds: [],
          accountKind: "normal",
          password_hash: "must-not-leak",
        } as SessionUser & { password_hash: string },
      };
    },
    async setSession(userId, role) {
      sessionCalls.push({ userId, role });
    },
  };

  const response = await handleRegisterRequest(
    jsonRequest({ phone: "13800000000", password: "secret123", confirmPassword: "secret123", role: "parent" }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; user?: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.user?.id, "u-test");
  assert.equal(body.user?.password_hash, undefined);
  assert.deepEqual(sessionCalls, [{ userId: "u-test", role: "家长" }]);
});
