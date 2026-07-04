import { expect, request as playwrightRequest, test, type APIRequestContext, type TestInfo } from "@playwright/test";

type RegisterResult =
  | {
      ok: true;
      user: { id: string; role: string; childIds?: string[]; className?: string };
    }
  | { ok: false; status: number; error: string };

async function newApiContext(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  return playwrightRequest.newContext({ baseURL });
}

function uniqueToken(testInfo: TestInfo) {
  return `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(16).slice(2)}`;
}

function uniqueMainlandPhone(testInfo: TestInfo) {
  const digits = `${Date.now()}${testInfo.workerIndex}`.replace(/\D/g, "");
  return `139${digits.slice(-8).padStart(8, "0")}`;
}

async function registerNormal(api: APIRequestContext, data: Record<string, unknown>): Promise<RegisterResult> {
  const response = await api.post("/api/auth/register", { data });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; user: { id: string; role: string; childIds?: string[]; className?: string } }
    | { ok: false; error?: string }
    | null;

  if (!response.ok() || !body || body.ok !== true) {
    return {
      ok: false,
      status: response.status(),
      error: body && body.ok === false ? body.error ?? "register failed" : "register failed",
    };
  }

  return { ok: true, user: body.user };
}

function skipIfNormalAccountUnavailable(result: RegisterResult) {
  if (!result.ok && (result.status === 503 || /DATABASE_URL|AUTH_SESSION_SECRET|配置|服务暂时不可用/.test(result.error))) {
    test.skip(true, `normal account DB/session config unavailable: ${result.error}`);
  }
  expect(result.ok, result.ok ? undefined : `${result.status}: ${result.error}`).toBe(true);
}

async function expectLoginCookie(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.user).toBeDefined();
  expect(response.headers()["set-cookie"] ?? "").toContain("ccs_session=");
  return body.user as { id: string; role: string };
}

test.describe("T6 normal account login", () => {
  test("new phone accounts and legacy username accounts can log in and reach protected pages", async ({}, testInfo) => {
    const phoneRegisterApi = await newApiContext(testInfo);
    const phoneLoginApi = await newApiContext(testInfo);
    const legacyRegisterApi = await newApiContext(testInfo);
    const legacyLoginApi = await newApiContext(testInfo);
    try {
      const token = uniqueToken(testInfo);
      const phone = uniqueMainlandPhone(testInfo);
      const phonePassword = "phone-login-123456";
      const phoneAccount = await registerNormal(phoneRegisterApi, {
        phone,
        password: phonePassword,
        confirmPassword: phonePassword,
        role: "parent",
        displayName: `T6 手机号家长 ${token}`,
      });
      skipIfNormalAccountUnavailable(phoneAccount);
      if (!phoneAccount.ok) return;

      const wrongPassword = await phoneLoginApi.post("/api/auth/login", {
        data: { phone, password: "wrong-password" },
      });
      expect(wrongPassword.status()).toBe(401);
      await expect(wrongPassword.json()).resolves.toMatchObject({ ok: false, error: "手机号或密码错误" });

      const invalidPhone = await phoneLoginApi.post("/api/auth/login", {
        data: { phone: "123", password: phonePassword },
      });
      expect(invalidPhone.status()).toBe(400);
      await expect(invalidPhone.json()).resolves.toMatchObject({ ok: false, error: "手机号格式错误" });

      const phoneLogin = await phoneLoginApi.post("/api/auth/login", {
        data: { phone, password: phonePassword },
      });
      const phoneUser = await expectLoginCookie(phoneLogin);
      expect(phoneUser.role).toBe("家长");
      expect((await phoneLoginApi.get("/parent")).status()).toBe(200);

      const legacyUsername = `legacy-teacher-${token}`.toLowerCase();
      const legacyPassword = "legacy-login-123456";
      const legacyAccount = await registerNormal(legacyRegisterApi, {
        username: legacyUsername,
        password: legacyPassword,
        confirmPassword: legacyPassword,
        role: "teacher",
        className: "晨曦班",
      });
      skipIfNormalAccountUnavailable(legacyAccount);
      if (!legacyAccount.ok) return;

      const legacyLogin = await legacyLoginApi.post("/api/auth/login", {
        data: { username: legacyUsername, password: legacyPassword },
      });
      const legacyUser = await expectLoginCookie(legacyLogin);
      expect(legacyUser.role).toBe("教师");
      expect((await legacyLoginApi.get("/teacher")).status()).toBe(200);
    } finally {
      await phoneRegisterApi.dispose();
      await phoneLoginApi.dispose();
      await legacyRegisterApi.dispose();
      await legacyLoginApi.dispose();
    }
  });
});
