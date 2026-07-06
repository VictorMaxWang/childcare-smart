import { expect, request as playwrightRequest, test, type APIRequestContext, type TestInfo } from "@playwright/test";

type RegisterResult =
  | { ok: true; api: APIRequestContext; user: { id: string; role: string; childIds?: string[]; className?: string } }
  | { ok: false; api: APIRequestContext; status: number; error: string };

async function newApiContext(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  return playwrightRequest.newContext({ baseURL });
}

async function registerNormal(api: APIRequestContext, role: "家长" | "教师", testInfo: TestInfo): Promise<RegisterResult> {
  const token = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(16).slice(2)}`;
  const username = `normal-ai-${role === "家长" ? "parent" : "teacher"}-${token}`;
  const password = "normal-ai-123456";
  const response = await api.post("/api/auth/register", {
    data: {
      username,
      password,
      confirmPassword: password,
      role,
      className: role === "教师" ? "晨曦班" : undefined,
      child:
        role === "家长"
          ? {
              name: `普通账号儿童 ${token.slice(-5)}`,
              birthDate: "2022-03-01",
              gender: "女",
              heightCm: 96,
              weightKg: 14.2,
              guardianPhone: "13800000000",
            }
          : undefined,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; user: { id: string; role: string; childIds?: string[]; className?: string } }
    | { ok: false; error?: string }
    | null;

  if (!response.ok() || !body || body.ok !== true) {
    return {
      ok: false,
      api,
      status: response.status(),
      error: body && body.ok === false ? body.error ?? "register failed" : "register failed",
    };
  }

  return { ok: true, api, user: body.user };
}

function skipIfNormalAccountUnavailable(result: RegisterResult) {
  if (!result.ok && (result.status === 503 || /DATABASE_URL|AUTH_SESSION_SECRET|配置/.test(result.error))) {
    test.skip(true, `normal account DB/session config unavailable: ${result.error}`);
  }
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
}

async function expectLimited(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
  status: number,
  reason: string,
  code = status === 423 ? "limited" : status === 401 ? "unauthorized" : "forbidden_scope"
) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  expect(body.limited).toBe(true);
  expect(body.reason).toBe(reason);
  expect(body.demoAvailable).toBe(true);
  return body;
}

test.describe("normal session AI access", () => {
  test("normal parent starts with empty child scope until consent onboarding, while forged child and no session are explicit", async ({}, testInfo) => {
    const parentApi = await newApiContext(testInfo);
    const anonymousApi = await newApiContext(testInfo);
    try {
      const parent = await registerNormal(parentApi, "家长", testInfo);
      skipIfNormalAccountUnavailable(parent);
      if (!parent.ok) return;

      expect(parent.user.childIds ?? []).toEqual([]);

      const stateResponse = await parentApi.get("/api/state");
      expect(stateResponse.status()).toBe(200);
      const stateBody = await stateResponse.json();
      const snapshot = stateBody.snapshot as { children?: Record<string, unknown>[] };
      expect(snapshot.children ?? []).toEqual([]);

      await expectLimited(
        await parentApi.post("/api/ai/parent-trend-query", {
          data: { childId: "forged-child-id", question: "越权查询" },
        }),
        403,
        "forbidden_child"
      );

      await expectLimited(
        await parentApi.post("/api/ai/parent-trend-query", {
          data: { question: "missing child scope" },
        }),
        423,
        "scope_required",
        "limited"
      );

      await expectLimited(
        await anonymousApi.post("/api/ai/parent-trend-query", {
          data: { childId: "forged-child-id", question: "无 session 查询" },
        }),
        401,
        "login_required"
      );

      const createChildResponse = await parentApi.post("/api/parent/children", {
        data: {
          name: `Normal child ${Date.now()}`,
          birthDate: "2022-03-01",
          gender: "女",
          consentAccepted: true,
        },
      });
      expect(createChildResponse.status()).toBe(201);
      const createChildBody = (await createChildResponse.json()) as {
        ok: boolean;
        data?: { id?: string; parentUserId?: string };
      };
      expect(createChildBody.ok).toBe(true);
      expect(createChildBody.data?.id).toBeTruthy();
      expect(createChildBody.data?.parentUserId).toBe(parent.user.id);

      const stateAfterOnboardingResponse = await parentApi.get("/api/state");
      expect(stateAfterOnboardingResponse.status()).toBe(200);
      const stateAfterOnboardingBody = await stateAfterOnboardingResponse.json();
      const scopedSnapshot = stateAfterOnboardingBody.snapshot as { children?: Array<{ id?: string }> };
      expect((scopedSnapshot.children ?? []).map((child) => child.id)).toContain(createChildBody.data?.id);

      const trendAfterOnboardingResponse = await parentApi.post("/api/ai/parent-trend-query", {
        data: { childId: createChildBody.data?.id, question: "trend check" },
      });
      expect(trendAfterOnboardingResponse.status()).toBe(200);
    } finally {
      await parentApi.dispose();
      await anonymousApi.dispose();
    }
  });

  test("normal teacher can reach staff AI auth and gets explicit child-scope denial", async ({}, testInfo) => {
    const teacherApi = await newApiContext(testInfo);
    try {
      const teacher = await registerNormal(teacherApi, "教师", testInfo);
      skipIfNormalAccountUnavailable(teacher);
      if (!teacher.ok) return;

      const voice = await teacherApi.post("/api/ai/teacher-voice-understand", {
        multipart: {
          audio: {
            name: "normal-teacher.webm",
            mimeType: "audio/webm",
            buffer: Buffer.from("not-a-real-audio-file"),
          },
          scene: "normal-session-ai-access",
        },
      });
      expect([200, 503]).toContain(voice.status());
      if (voice.status() === 503) {
        const body = await voice.json();
        expect(body.code).toBe("provider_unavailable");
      }

      await expectLimited(
        await teacherApi.post("/api/ai/high-risk-consultation", {
          data: { targetChildId: "forged-child-id", visibleChildren: [], healthCheckRecords: [], growthRecords: [] },
          headers: { "x-ai-force-fallback": "1" },
        }),
        403,
        "forbidden_child"
      );
    } finally {
      await teacherApi.dispose();
    }
  });
});
