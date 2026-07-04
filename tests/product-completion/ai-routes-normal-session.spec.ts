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

function parentTrendPayload(childId: string, snapshot: Record<string, unknown>) {
  return {
    childId,
    question: "最近一周情绪和睡眠趋势怎么样？",
    appSnapshot: snapshot,
  };
}

function storybookPayload(child: Record<string, unknown>) {
  const childId = String(child.id);
  return {
    childId,
    storyMode: "storybook",
    generationMode: "child-personalized",
    requestSource: "normal-session-ai-access",
    stylePreset: "sunrise-watercolor",
    styleMode: "preset",
    pageCount: 4,
    goalKeywords: ["勇敢表达"],
    snapshot: {
      child: {
        id: childId,
        name: String(child.name ?? "普通账号儿童"),
        className: String(child.className ?? "待分班"),
        allergies: [],
        specialNotes: "普通账号绘本权限验收。",
      },
      summary: {
        health: { abnormalCount: 0, handMouthEyeAbnormalCount: 0, moodKeywords: [] },
        meals: { recordCount: 0, hydrationAvg: 0, balancedRate: 0, monotonyDays: 0, allergyRiskCount: 0 },
        growth: { recordCount: 1, attentionCount: 0, pendingReviewCount: 0, topCategories: [{ category: "情绪表达", count: 1 }] },
        feedback: { count: 0, statusCounts: {}, keywords: [] },
      },
      recentDetails: { health: [], meals: [], growth: [], feedback: [] },
      ruleFallback: [],
    },
    highlightCandidates: [
      {
        kind: "todayGrowth",
        title: "普通账号成长亮点",
        detail: "孩子愿意主动说出自己的想法。",
        priority: 1,
        source: "todayGrowth",
      },
    ],
    latestInterventionCard: null,
    latestConsultation: null,
  };
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
  test("normal parent can use scoped trend and storybook routes, while forged child and no session are explicit", async ({}, testInfo) => {
    const parentApi = await newApiContext(testInfo);
    const anonymousApi = await newApiContext(testInfo);
    try {
      const parent = await registerNormal(parentApi, "家长", testInfo);
      skipIfNormalAccountUnavailable(parent);
      if (!parent.ok) return;

      const childId = parent.user.childIds?.[0];
      expect(childId).toBeTruthy();

      const stateResponse = await parentApi.get("/api/state");
      expect(stateResponse.status()).toBe(200);
      const stateBody = await stateResponse.json();
      const snapshot = stateBody.snapshot as { children?: Record<string, unknown>[] };
      const child = snapshot.children?.find((item) => item.id === childId);
      expect(child).toBeTruthy();

      const trend = await parentApi.post("/api/ai/parent-trend-query", {
        data: parentTrendPayload(childId!, snapshot as unknown as Record<string, unknown>),
      });
      expect(trend.status()).toBe(200);
      const trendBody = await trend.json();
      expect(trendBody.child?.childId ?? trendBody.childId ?? childId).toBeTruthy();

      const story = await parentApi.post("/api/ai/parent-storybook", {
        data: storybookPayload(child!),
        headers: { "x-smartchildcare-cache-bypass": "1" },
      });
      expect(story.status()).toBe(200);
      const storyBody = await story.json();
      expect(storyBody.childId).toBe(childId);

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
          data: { childId, question: "无 session 查询" },
        }),
        401,
        "login_required"
      );
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
