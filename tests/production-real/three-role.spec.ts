import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type TestInfo,
} from "@playwright/test";

type AccountRole = "机构管理员" | "教师" | "家长";
type Credentials = {
  phone: string;
  password: string;
};
type SessionUser = {
  id: string;
  name: string;
  role: AccountRole;
  institutionId: string;
  classId?: string;
  className?: string;
  childIds?: string[];
  accountKind: "normal" | "demo";
};
type Snapshot = {
  children: Array<{
    id: string;
    name: string;
    institutionId: string;
    classId?: string;
    className?: string;
  }>;
  health: Array<Record<string, unknown>>;
  meals: Array<Record<string, unknown>>;
  growth: Array<Record<string, unknown>>;
  feedback: Array<Record<string, unknown>>;
  consultations: Array<Record<string, unknown>>;
};

const mode = String(process.env.REAL_SMOKE_MODE ?? "all")
  .trim()
  .toLowerCase();
const runExisting = mode === "all" || mode === "existing";
const runFresh = mode === "all" || mode === "fresh";
const requireLiveAi = ["1", "true", "yes", "on"].includes(
  String(process.env.REAL_SMOKE_REQUIRE_LIVE_AI ?? "1")
    .trim()
    .toLowerCase()
);
const mealImagePath = path.join(
  process.cwd(),
  "public",
  "demo-media",
  "gpt-image2",
  "meals",
  "demo-meal-auto-001.webp"
);
const healthImagePath = path.join(
  process.cwd(),
  "public",
  "demo-media",
  "gpt-image2",
  "health-materials",
  "demo-health-auto-001.webp"
);
const speechAudioPath = path.join(
  process.cwd(),
  "public",
  "demo-media",
  "storybooks",
  "lin-xiaoyu",
  "audio",
  "page-01.mp3"
);
const STORYBOOK_MEDIA_ACCEPTANCE_TIMEOUT_MS = 5 * 60 * 1_000;
const STORYBOOK_MEDIA_ACCEPTANCE_MAX_ATTEMPTS = 40;

test.describe.configure({ mode: "serial" });

function baseURL(testInfo: TestInfo) {
  return String(testInfo.project.use.baseURL ?? "").replace(/\/$/, "");
}

function valueFromEnv(name: string) {
  const value = String(process.env[name] ?? "").trim();
  expect(value, `${name} must be configured by the smoke gate`).not.toBe("");
  return value;
}

async function newApi(testInfo: TestInfo) {
  return playwrightRequest.newContext({ baseURL: baseURL(testInfo) });
}

async function readJson(response: APIResponse) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

async function expectEnvelope<T>(
  response: APIResponse,
  expectedStatus = 200
): Promise<T> {
  const body = await readJson(response);
  const diagnostic = {
    status: response.status(),
    code: body?.code ?? null,
    message: body?.message ?? body?.error ?? null,
  };
  expect(response.status(), JSON.stringify(diagnostic)).toBe(expectedStatus);
  expect(body?.ok).toBe(true);
  return body?.data as T;
}

async function login(api: APIRequestContext, credentials: Credentials) {
  const response = await api.post("/api/auth/login", {
    data: credentials,
  });
  expect(response.status()).toBe(200);
  const body = await readJson(response);
  expect(body?.ok).toBe(true);
}

async function postWithTransientNetworkRetry(
  api: APIRequestContext,
  url: string,
  options: Parameters<APIRequestContext["post"]>[1]
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await api.post(url, options);
    } catch (error) {
      lastError = error;
      const reason = error instanceof Error ? error.message : String(error);
      if (
        attempt >= 2 ||
        !/(?:ECONNRESET|ETIMEDOUT|fetch failed|socket hang up)/iu.test(reason)
      ) {
        throw error;
      }
      // 仅供无业务写入的分析请求，或携带稳定 uploadRequestId 的幂等上传使用。
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function register(
  api: APIRequestContext,
  role: "admin" | "teacher" | "parent",
  credentials: Credentials,
  displayName: string
) {
  const response = await api.post("/api/auth/register", {
    data: {
      phone: credentials.phone,
      username: credentials.phone,
      password: credentials.password,
      confirmPassword: credentials.password,
      role,
      displayName,
    },
  });
  expect(response.status()).toBe(200);
  const body = await readJson(response);
  expect(body?.ok).toBe(true);
  return body?.user as SessionUser;
}

async function getSession(
  api: APIRequestContext,
  expectedRole: AccountRole
) {
  let lastDiagnostic: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await api.get("/api/auth/session");
    const body = await readJson(response);
    lastDiagnostic = {
      expectedRole,
      status: response.status(),
      code: body?.code ?? null,
      message: body?.message ?? body?.error ?? null,
      retryable: body?.retryable ?? null,
    };
    if (response.status() === 200 && body?.ok) {
      const user = body.user as SessionUser;
      expect(user.role).toBe(expectedRole);
      expect(user.accountKind).toBe("normal");
      expect(user.institutionId).not.toBe("");
      return user;
    }
    if (
      attempt < 3 &&
      [500, 502, 503, 504].includes(response.status())
    ) {
      const retryAfterSeconds = Number(
        response.headers()["retry-after"]
      );
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.min(Math.max(retryAfterSeconds * 1_000, 250), 2_000)
        : 750;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    break;
  }

  expect(
    lastDiagnostic.status,
    JSON.stringify(lastDiagnostic)
  ).toBe(200);
  throw new Error(`session unavailable: ${JSON.stringify(lastDiagnostic)}`);
}

async function getState(api: APIRequestContext) {
  const response = await api.get("/api/state");
  expect(response.status()).toBe(200);
  const body = await readJson(response);
  expect(body?.ok).toBe(true);
  expect(body?.snapshot).toBeTruthy();
  return body?.snapshot as Snapshot;
}

function randomPhone() {
  return `199${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

function randomPassword() {
  return `Smoke!${randomBytes(12).toString("base64url")}`;
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function expectMeaningfulAiResult(
  body: Record<string, unknown> | null,
  label: string,
  options: { requireLive?: boolean } = {}
) {
  expect(body, `${label} returned JSON`).toBeTruthy();
  const serialized = JSON.stringify(body);
  expect(serialized.length, `${label} returned a meaningful payload`).toBeGreaterThan(80);
  const envelopeData =
    body?.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : body;
  const providerTrace =
    envelopeData?.providerTrace &&
    typeof envelopeData.providerTrace === "object" &&
    !Array.isArray(envelopeData.providerTrace)
      ? (envelopeData.providerTrace as Record<string, unknown>)
      : null;
  const dataQuality =
    envelopeData?.dataQuality &&
    typeof envelopeData.dataQuality === "object" &&
    !Array.isArray(envelopeData.dataQuality)
      ? (envelopeData.dataQuality as Record<string, unknown>)
      : null;
  const source = String(envelopeData?.source ?? "").toLowerCase();
  const mode = String(envelopeData?.mode ?? providerTrace?.mode ?? "").toLowerCase();

  // 只校验当前 AI 结果的 provenance，避免被响应中无关 capability 的状态误伤。
  expect(envelopeData?.mock, `${label} must not return a mock result`).not.toBe(true);
  expect(dataQuality?.isMock, `${label} must not return mock data quality`).not.toBe(true);
  expect(source, `${label} must not use a mock source`).not.toBe("mock");
  expect(mode, `${label} must not use mock mode`).not.toBe("mock");
  if (options.requireLive ?? requireLiveAi) {
    expect(envelopeData?.fallback, `${label} must not silently fall back`).not.toBe(true);
    expect(dataQuality?.isFallback, `${label} must not use fallback data quality`).not.toBe(true);
    expect(providerTrace?.fallback, `${label} provider trace must be live`).not.toBe(true);
    expect(source, `${label} must not use a fallback source`).not.toBe("fallback");
    expect(mode, `${label} must report live mode`).not.toBe("fallback");
  }
}

async function callRoleAi(
  admin: APIRequestContext,
  teacher: APIRequestContext,
  parent: APIRequestContext,
  childId: string,
  marker: string
) {
  const teacherResponse = await teacher.post("/api/ai/teacher-agent", {
    data: {
      workflow: "follow-up",
      scope: "child",
      targetChildId: childId,
      question: `${marker} 请分析最新健康、饮食和成长记录并给出复查建议。`,
    },
  });
  expect(teacherResponse.status()).toBe(200);
  expectMeaningfulAiResult(
    await readJson(teacherResponse),
    "teacher agent",
    { requireLive: requireLiveAi }
  );

  const parentResponse = await parent.post("/api/ai/parent-trend-query", {
    data: {
      childId,
      question: `${marker} 请总结孩子近期趋势和今晚可执行的家庭建议。`,
    },
  });
  expect(parentResponse.status()).toBe(200);
  expectMeaningfulAiResult(
    await readJson(parentResponse),
    "parent trend",
    { requireLive: requireLiveAi }
  );

  const adminResponse = await admin.post("/api/ai/admin-agent", {
    data: {
      workflow: "daily-priority",
      question: `${marker} 请给出今日机构优先事项。`,
    },
  });
  expect(adminResponse.status()).toBe(200);
  expectMeaningfulAiResult(
    await readJson(adminResponse),
    "admin agent",
    { requireLive: requireLiveAi }
  );
}

function expectCompleteDietEvaluation(
  body: Record<string, unknown> | null
) {
  expect(body).toBeTruthy();
  const evaluation = body?.evaluation as Record<string, unknown> | undefined;
  expectMeaningfulAiResult(evaluation ?? null, "diet evaluation", {
    requireLive: requireLiveAi,
  });
  for (const key of ["mealScore", "todayScore", "recentScore"]) {
    expect(typeof evaluation?.[key], `${key} must be numeric`).toBe("number");
  }
  expect(
    Array.isArray(evaluation?.suggestions) &&
      evaluation.suggestions.length > 0,
    "diet evaluation must include actionable suggestions"
  ).toBe(true);
}

function storyMediaReady(story: Record<string, unknown> | null) {
  const providerMeta = story?.providerMeta as
    | Record<string, unknown>
    | undefined;
  return (
    providerMeta?.imageDelivery === "real" &&
    providerMeta?.audioDelivery === "real"
  );
}

function storyMediaRetryDelayMs(story: Record<string, unknown>) {
  const providerMeta = story.providerMeta as
    | Record<string, unknown>
    | undefined;
  const diagnostics = providerMeta?.diagnostics as
    | Record<string, unknown>
    | undefined;
  const image = diagnostics?.image as Record<string, unknown> | undefined;
  const retryAfterMs = Number(image?.retryAfterMs);
  return Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.min(Math.max(retryAfterMs, 1_000), 75_000)
    : 1_500;
}

function storyMediaDiagnostic(story: Record<string, unknown>) {
  const providerMeta = story.providerMeta as
    | Record<string, unknown>
    | undefined;
  const diagnostics = providerMeta?.diagnostics as
    | Record<string, unknown>
    | undefined;
  const image = diagnostics?.image as Record<string, unknown> | undefined;
  const audio = diagnostics?.audio as Record<string, unknown> | undefined;

  return JSON.stringify({
    imageProvider: providerMeta?.imageProvider ?? null,
    imageDelivery: providerMeta?.imageDelivery ?? null,
    imageJobStatus: image?.jobStatus ?? null,
    imageReadySceneCount: image?.readySceneCount ?? null,
    imagePendingSceneCount: image?.pendingSceneCount ?? null,
    imageLastErrorStage: image?.lastErrorStage ?? null,
    imageLastErrorReason: image?.lastErrorReason ?? null,
    imageRetryAfterMs: image?.retryAfterMs ?? null,
    audioProvider: providerMeta?.audioProvider ?? null,
    audioDelivery: providerMeta?.audioDelivery ?? null,
    audioJobStatus: audio?.jobStatus ?? null,
    audioReadySceneCount: audio?.readySceneCount ?? null,
    audioPendingSceneCount: audio?.pendingSceneCount ?? null,
    audioBlockedSceneCount: audio?.blockedSceneCount ?? null,
    audioLastErrorStage: audio?.lastErrorStage ?? null,
    audioLastErrorReason: audio?.lastErrorReason ?? null,
  });
}

async function completeStorybookMedia(
  parent: APIRequestContext,
  childId: string,
  initialStory: Record<string, unknown>
) {
  let story = initialStory;
  let lastNetworkError: unknown = null;
  const deadline = Date.now() + STORYBOOK_MEDIA_ACCEPTANCE_TIMEOUT_MS;
  for (
    let attempt = 0;
    attempt < STORYBOOK_MEDIA_ACCEPTANCE_MAX_ATTEMPTS &&
    Date.now() < deadline &&
    !storyMediaReady(story);
    attempt += 1
  ) {
    let response: APIResponse;
    try {
      response = await parent.post(
        "/api/ai/parent-storybook/media-status",
        {
          data: {
            childId,
            storyId: story.storyId,
            retryFailed: true,
            prioritySceneIndices: [0, 1, 2, 3],
            story,
          },
        }
      );
      lastNetworkError = null;
    } catch (error) {
      lastNetworkError = error;
      if (
        attempt >= STORYBOOK_MEDIA_ACCEPTANCE_MAX_ATTEMPTS - 1 ||
        Date.now() + 2_000 >= deadline
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    expect(response.status()).toBe(200);
    story = (await readJson(response)) ?? {};
    if (
      !storyMediaReady(story) &&
      attempt < STORYBOOK_MEDIA_ACCEPTANCE_MAX_ATTEMPTS - 1
    ) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(storyMediaRetryDelayMs(story), remainingMs)
        )
      );
    }
  }
  if (lastNetworkError) throw lastNetworkError;
  return story;
}

async function verifyDietAndStorybookAi(
  teacher: APIRequestContext,
  parent: APIRequestContext,
  child: Pick<
    Snapshot["children"][number],
    "id" | "name" | "className"
  >,
  marker: string
) {
  const foods = [
    { name: "番茄炒蛋", category: "蛋白", amount: "80g" },
    { name: "西兰花", category: "蔬菜", amount: "60g" },
    { name: "米饭", category: "主食", amount: "100g" },
  ];
  const dietResponse = await teacher.post("/api/ai/diet-evaluation", {
    data: {
      childId: child.id,
      input: {
        childName: child.name,
        ageText: "4岁",
        ageBand: "3-6岁",
        mealType: "午餐",
        mealFoods: foods,
        todayMeals: [{ meal: "午餐", foods, waterMl: 180 }],
        recentMeals: [
          {
            date: new Date().toISOString().slice(0, 10),
            meal: "午餐",
            foods,
            waterMl: 180,
          },
        ],
      },
    },
  });
  expect(dietResponse.status()).toBe(200);
  expectCompleteDietEvaluation(await readJson(dietResponse));

  const storyResponse = await parent.post("/api/ai/parent-storybook", {
    data: {
      childId: child.id,
      requestSource: "production-real-smoke",
      generationMode: "child-personalized",
      pageCount: 4,
      stylePreset: "sunrise-watercolor",
      styleMode: "preset",
      snapshot: {
        child: {
          id: child.id,
          name: child.name,
          className: child.className,
        },
        summary: {
          growth: { recordCount: 1, topCategories: [] },
          feedback: { count: 1, keywords: [marker] },
        },
        recentDetails: [
          {
            date: new Date().toISOString().slice(0, 10),
            source: "production-smoke",
            title: "今日成长记录",
            detail: `${marker} 孩子完成了健康、饮食和成长记录。`,
          },
        ],
        ruleFallback: [
          {
            title: "今日亮点",
            description: `${marker} 愿意尝试均衡午餐。`,
          },
        ],
      },
      highlightCandidates: [
        {
          kind: "todayGrowth",
          title: "今日小进步",
          detail: `${marker} 愿意尝试均衡午餐并完成健康记录。`,
          priority: 1,
          source: "production-smoke",
        },
      ],
    },
  });
  expect(storyResponse.status()).toBe(200);
  let story = (await readJson(storyResponse)) ?? {};
  expectMeaningfulAiResult(story, "parent storybook", {
    requireLive: requireLiveAi,
  });

  if (requireLiveAi) {
    story = await completeStorybookMedia(parent, child.id, story);
    expect(
      storyMediaReady(story),
      `storybook image and audio must be real: ${storyMediaDiagnostic(story)}`
    ).toBe(true);
    const providerMeta = story.providerMeta as
      | Record<string, unknown>
      | undefined;
    expect(String(providerMeta?.imageProvider ?? "")).toContain(
      "dashscope-qwen-image"
    );
  }
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  expect(scenes.length, "storybook must include four scenes").toBeGreaterThanOrEqual(
    4
  );
  for (const scene of scenes.slice(0, 4)) {
    const item = scene as Record<string, unknown>;
    expect(String(item.sceneText ?? "").trim()).not.toBe("");
    if (requireLiveAi) {
      const imageUrl = String(item.imageUrl ?? item.assetRef ?? "");
      expect(item.imageProvider).toBe("dashscope-qwen-image");
      expect(
        Boolean(imageUrl),
        "storybook scene must have image media"
      ).toBe(true);
      expect(imageUrl).toMatch(
        /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u
      );
      const imageResponse = await parent.get(imageUrl, {
        headers: {
          "x-smartchildcare-require-database": "1",
        },
      });
      expect(imageResponse.status()).toBe(200);
      expect(imageResponse.headers()["content-type"]).toBe("image/webp");
      expect(
        imageResponse.headers()["x-smartchildcare-storage-mode"]
      ).toBe("private_blob");
      const imageBytes = await imageResponse.body();
      expect(imageBytes.byteLength).toBeGreaterThan(0);
      expect(imageBytes.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(imageBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(imageBytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      const audioUrl = String(item.audioUrl ?? "");
      expect(item.audioProvider).toBe("vivo-story-tts");
      expect(audioUrl, "storybook scene must have audio media").toMatch(
        /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u
      );
      const audioResponse = await parent.get(audioUrl, {
        headers: {
          "x-smartchildcare-require-database": "1",
        },
      });
      expect(audioResponse.status()).toBe(200);
      expect(audioResponse.headers()["content-type"]).toBe("audio/wav");
      expect(
        audioResponse.headers()["x-smartchildcare-storage-mode"]
      ).toBe("private_blob");
      const audioBytes = await audioResponse.body();
      expect(audioBytes.byteLength).toBeGreaterThan(44);
      expect(audioBytes.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(audioBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(audioBytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    }
  }
}

async function verifyRolePages(
  browser: Browser,
  testInfo: TestInfo,
  input: {
    admin: Credentials;
    teacher: Credentials;
    parent: Credentials;
    childId: string;
  }
) {
  const cases = [
    {
      credentials: input.admin,
      route: "/admin",
      shell: "director",
    },
    {
      credentials: input.teacher,
      route: "/teacher",
      shell: "teacher",
    },
    {
      credentials: input.parent,
      route: `/parent?child=${encodeURIComponent(input.childId)}`,
      shell: "parent",
    },
  ] as const;

  for (const item of cases) {
    const context = await browser.newContext({
      baseURL: baseURL(testInfo),
      locale: "zh-CN",
    });
    try {
      await login(context.request, item.credentials);
      const page = await context.newPage();
      await page.goto(item.route, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("r02-app-shell")).toHaveAttribute(
        "data-role-shell",
        item.shell
      );
      await expect(page.getByTestId("global-search-trigger")).toBeVisible();
      await expect(page.getByTestId("notification-center-trigger")).toBeVisible();
      await expect(page.getByTestId("message-center-trigger")).toBeVisible();
      for (const [trigger, dialog] of [
        ["global-search-trigger", "global-search-dialog"],
        ["notification-center-trigger", "notification-center-dialog"],
        ["message-center-trigger", "message-center-dialog"],
      ] as const) {
        await page.getByTestId(trigger).click();
        await expect(page.getByTestId(dialog)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId(dialog)).toBeHidden();
      }
      await expect(page.locator("body")).not.toContainText(
        /Application error|客户端异常|加载失败/u
      );
    } finally {
      await context.close();
    }
  }
}

test("existing real admin, teacher, and parent share records and AI", async ({
  browser,
}, testInfo) => {
  test.skip(!runExisting, "REAL_SMOKE_MODE does not include existing accounts.");
  const adminCredentials = {
    phone: valueFromEnv("REAL_SMOKE_EXISTING_ADMIN_PHONE"),
    password: valueFromEnv("REAL_SMOKE_EXISTING_ADMIN_PASSWORD"),
  };
  const teacherCredentials = {
    phone: valueFromEnv("REAL_SMOKE_EXISTING_TEACHER_PHONE"),
    password: valueFromEnv("REAL_SMOKE_EXISTING_TEACHER_PASSWORD"),
  };
  const parentCredentials = {
    phone: valueFromEnv("REAL_SMOKE_EXISTING_PARENT_PHONE"),
    password: valueFromEnv("REAL_SMOKE_EXISTING_PARENT_PASSWORD"),
  };
  const admin = await newApi(testInfo);
  const teacher = await newApi(testInfo);
  const parent = await newApi(testInfo);
  const marker = `REAL-EXISTING-${Date.now()}`;

  try {
    await login(admin, adminCredentials);
    await login(teacher, teacherCredentials);
    await login(parent, parentCredentials);
    const [adminUser, teacherUser, parentUser] = await Promise.all([
      getSession(admin, "机构管理员"),
      getSession(teacher, "教师"),
      getSession(parent, "家长"),
    ]);
    expect(teacherUser.institutionId).toBe(adminUser.institutionId);
    expect(parentUser.institutionId).toBe(adminUser.institutionId);

    const [teacherState, parentState] = await Promise.all([
      getState(teacher),
      getState(parent),
    ]);
    const teacherChildIds = new Set(
      teacherState.children.map((child) => child.id)
    );
    const child = parentState.children.find((item) =>
      teacherChildIds.has(item.id)
    );
    expect(child, "existing teacher and parent need a shared child").toBeTruthy();

    await expectEnvelope(
      await teacher.post("/api/records", {
        data: {
          type: "health",
          childId: child?.id,
          date: todayInShanghai(),
          temperature: 36.8,
          mood: "平稳",
          handMouthEye: "正常",
          isAbnormal: false,
          remark: `${marker} 现有账号链路复核。`,
        },
      }),
      201
    );

    for (const api of [parent, admin]) {
      const records = await expectEnvelope<Array<Record<string, unknown>>>(
        await api.get(
          `/api/records?type=health&childId=${encodeURIComponent(child!.id)}&includeArchived=1`
        )
      );
      expect(JSON.stringify(records)).toContain(marker);
    }

    await callRoleAi(admin, teacher, parent, child!.id, marker);
    await verifyRolePages(browser, testInfo, {
      admin: adminCredentials,
      teacher: teacherCredentials,
      parent: parentCredentials,
      childId: child!.id,
    });
  } finally {
    await Promise.all([admin.dispose(), teacher.dispose(), parent.dispose()]);
  }
});

test("fresh real trio completes binding, media, voice, consultation, and AI", async ({
  browser,
}, testInfo) => {
  test.skip(!runFresh, "REAL_SMOKE_MODE does not include fresh accounts.");
  const stamp = `${Date.now()}-${randomInt(1000, 9999)}`;
  const marker = `REAL-FRESH-${stamp}`;
  const className = `生产验收班${stamp.slice(-6)}`;
  const childName = `验收幼儿${stamp.slice(-4)}`;
  const credentials = {
    admin: { phone: randomPhone(), password: randomPassword() },
    teacher: { phone: randomPhone(), password: randomPassword() },
    parent: { phone: randomPhone(), password: randomPassword() },
  };
  const admin = await newApi(testInfo);
  const teacher = await newApi(testInfo);
  const parent = await newApi(testInfo);

  try {
    const adminRegistered = await register(
      admin,
      "admin",
      credentials.admin,
      `验收园长${stamp.slice(-4)}`
    );
    const parentRegistered = await register(
      parent,
      "parent",
      credentials.parent,
      `验收家长${stamp.slice(-4)}`
    );
    await register(
      teacher,
      "teacher",
      credentials.teacher,
      `验收教师${stamp.slice(-4)}`
    );

    const child = await expectEnvelope<{ id: string; name: string }>(
      await parent.post("/api/parent/children", {
        data: {
          name: childName,
          nickname: "小验",
          birthDate: "2022-05-10",
          gender: "女",
          consentAccepted: true,
        },
      }),
      201
    );
    expect(child.id).toBeTruthy();
    expect(parentRegistered.childIds ?? []).toEqual([]);

    const parentInvite = await expectEnvelope<{ code: string }>(
      await admin.post("/api/admin/member-invitations", {
        data: { role: "家长", className },
      }),
      201
    );
    const teacherInvite = await expectEnvelope<{ code: string }>(
      await admin.post("/api/admin/member-invitations", {
        data: { role: "教师", className },
      }),
      201
    );
    await expectEnvelope(
      await parent.post("/api/account/member-invitations/accept", {
        data: { code: parentInvite.code },
      })
    );
    await expectEnvelope(
      await teacher.post("/api/account/member-invitations/accept", {
        data: { code: teacherInvite.code },
      })
    );

    const [adminUser, teacherUser, parentUser] = await Promise.all([
      getSession(admin, "机构管理员"),
      getSession(teacher, "教师"),
      getSession(parent, "家长"),
    ]);
    expect(adminUser.id).toBe(adminRegistered.id);
    expect(teacherUser.institutionId).toBe(adminUser.institutionId);
    expect(parentUser.institutionId).toBe(adminUser.institutionId);
    expect(teacherUser.className).toBe(className);

    const [adminState, teacherState, parentState] = await Promise.all([
      getState(admin),
      getState(teacher),
      getState(parent),
    ]);
    for (const snapshot of [adminState, teacherState, parentState]) {
      expect(snapshot.children.map((item) => item.id)).toContain(child.id);
    }

    const health = await expectEnvelope<{ id: string }>(
      await teacher.post("/api/records", {
        data: {
          type: "health",
          childId: child.id,
          date: todayInShanghai(),
          temperature: 37.7,
          mood: "需关注",
          handMouthEye: "正常",
          isAbnormal: true,
          remark: `${marker} 晨检轻微发热，建议复测。`,
        },
      }),
      201
    );
    const meal = await expectEnvelope<{ id: string }>(
      await teacher.post("/api/records", {
        data: {
          type: "meal",
          childId: child.id,
          date: todayInShanghai(),
          meal: "午餐",
          foods: [
            { name: `米饭 ${marker}`, category: "主食", amount: "半碗" },
            { name: "青菜", category: "蔬果", amount: "少量" },
          ],
          intakeLevel: "少量",
          preference: "正常",
          waterMl: 120,
          notes: marker,
        },
      }),
      201
    );
    const growth = await expectEnvelope<{ id: string }>(
      await teacher.post("/api/records", {
        data: {
          type: "growth",
          childId: child.id,
          category: "情绪表现",
          tags: ["生产验收", "主动表达"],
          description: `${marker} 能主动表达需要帮助。`,
          needsAttention: true,
          followUpAction: "明日继续观察并同步家长。",
        },
      }),
      201
    );
    expect(health.id).toBeTruthy();
    expect(meal.id).toBeTruthy();
    expect(growth.id).toBeTruthy();

    const planned = await expectEnvelope<{
      command: Record<string, unknown>;
    }>(
      await teacher.post("/api/voice-assistant/commands", {
        data: {
          action: "plan",
          utterance: {
            text: `给${childName}记录晨检，体温三十六点七，状态正常 ${marker}`,
            inputMode: "text",
            transcriptSource: "production-real-smoke",
          },
          context: {
            currentPath: "/teacher",
            objects: { childId: child.id },
          },
        },
      })
    );
    expect(planned.command.intent).toBe("create_morning_check");
    await expectEnvelope(
      await teacher.post("/api/voice-assistant/commands", {
        data: {
          action: "execute",
          command: planned.command,
          confirmed: true,
          context: {
            currentPath: "/teacher",
            objects: { childId: child.id },
          },
        },
      })
    );

    const parentMessage = await expectEnvelope<{
      messageId: string;
      conversationId: string;
    }>(
      await parent.post("/api/messages", {
        data: {
          childId: child.id,
          content: `${marker} 家长已收到今日复查提醒。`,
        },
      }),
      201
    );
    await expectEnvelope(
      await teacher.post(
        `/api/messages/${encodeURIComponent(parentMessage.messageId)}/reply`,
        {
          data: {
            conversationId: parentMessage.conversationId,
            content: `${marker} 教师回复：明早入园后复测。`,
          },
        }
      ),
      201
    );

    const consultation = await expectEnvelope<{ consultationId: string }>(
      await teacher.post("/api/consultations", {
        data: {
          childId: child.id,
          riskLevel: "high",
          summary: `${marker} 高风险会诊：发热与情绪变化需园家共同复查。`,
          notes: `${marker} 教师已记录并通知家长。`,
        },
      }),
      201
    );
    const adminConsultations = await expectEnvelope<
      Array<Record<string, unknown>>
    >(
      await admin.get(
        `/api/consultations?childId=${encodeURIComponent(child.id)}`
      )
    );
    expect(JSON.stringify(adminConsultations)).toContain(marker);
    await expectEnvelope(
      await admin.patch(
        `/api/consultations/${encodeURIComponent(consultation.consultationId)}/status`,
        { data: { status: "resolved" } }
      )
    );

    const mealImage = await fs.readFile(mealImagePath);
    const growthAttachment = await expectEnvelope<{
      attachmentId: string;
      downloadUrl?: string;
    }>(
      await postWithTransientNetworkRetry(
        teacher,
        "/api/attachments/upload",
        {
          multipart: {
            file: {
              name: `growth-${stamp}.webp`,
              mimeType: "image/webp",
              buffer: mealImage,
            },
            childId: child.id,
            relatedType: "growth",
            relatedId: growth.id,
            uploadRequestId: `upload-growth-${stamp}`,
          },
        }
      ),
      201
    );
    expect(growthAttachment.downloadUrl).toContain(
      `/api/attachments/${growthAttachment.attachmentId}/content`
    );
    const attachmentContent = await parent.get(growthAttachment.downloadUrl!);
    expect(attachmentContent.status()).toBe(200);
    expect((await attachmentContent.body()).byteLength).toBeGreaterThan(100);

    const healthMaterial = await expectEnvelope<{
      materialId: string;
    }>(
      await teacher.post("/api/health-materials", {
        data: {
          childId: child.id,
          filename: `health-${stamp}.webp`,
          fileType: "image/webp",
          description: `${marker} 健康材料原图。`,
        },
      }),
      201
    );
    const healthImage = await fs.readFile(healthImagePath);
    const healthAttachment = await expectEnvelope<{
      attachmentId: string;
    }>(
      await postWithTransientNetworkRetry(
        teacher,
        "/api/attachments/upload",
        {
          multipart: {
            file: {
              name: `health-${stamp}.webp`,
              mimeType: "image/webp",
              buffer: healthImage,
            },
            childId: child.id,
            relatedType: "health-material",
            relatedId: healthMaterial.materialId,
            uploadRequestId: `upload-health-${stamp}`,
          },
        }
      ),
      201
    );
    const healthBridgeResponse = await postWithTransientNetworkRetry(
      teacher,
      "/api/ai/health-file-bridge",
      {
        data: {
          childId: child.id,
          sourceRole: "teacher",
          files: [
            {
              fileId: `health-file-${stamp}`,
              name: `health-${stamp}.webp`,
              mimeType: "image/webp",
              sizeBytes: healthImage.byteLength,
              attachmentId: healthAttachment.attachmentId,
            },
          ],
          fileKind: "lab-report",
          requestSource: "production-real-smoke",
        },
      }
    );
    expect(healthBridgeResponse.status()).toBe(200);
    const healthBridge = await readJson(healthBridgeResponse);
    expectMeaningfulAiResult(healthBridge, "health OCR bridge", {
      requireLive: false,
    });
    expect(JSON.stringify(healthBridge)).toMatch(
      /dashscope-ocr-provider|"isRealProvider"\s*:\s*true/u
    );
    await expectEnvelope(
      await teacher.post(
        `/api/health-materials/${encodeURIComponent(healthMaterial.materialId)}/parse`,
        {
          data: {
            parseStatus: "parsed",
            parseResult: healthBridge,
          },
        }
      )
    );

    const visionResponse = await teacher.post("/api/ai/vision-meal", {
      data: {
        imageDataUrl: `data:image/webp;base64,${mealImage.toString("base64")}`,
      },
    });
    expect(visionResponse.status()).toBe(200);
    const vision = await readJson(visionResponse);
    expect(Array.isArray(vision?.foods)).toBe(true);
    expect((vision?.foods as unknown[]).length).toBeGreaterThan(0);
    if (requireLiveAi) {
      expect(vision?.source).toBe("ai");
    }

    const speechAudio = await fs.readFile(speechAudioPath);
    const asrResponse = await teacher.post("/api/ai/voice-asr", {
      multipart: {
        audio: {
          name: "storybook-speech.mp3",
          mimeType: "audio/mpeg",
          buffer: speechAudio,
        },
        durationMs: "12000",
        scene: "production-real-smoke",
      },
    });
    const asr = await expectEnvelope<{
      transcript: string;
      source: string;
      mode: string;
      fallback: boolean;
      provider: string;
      providerTrace?: {
        realProvider?: boolean;
        fallback?: boolean;
      };
    }>(asrResponse);
    expect(asr.transcript.trim().length).toBeGreaterThan(3);
    if (requireLiveAi) {
      expect(asr.fallback).toBe(false);
      expect(asr.source).toBe("provider");
      expect(asr.mode).toBe("live");
      expect(["vivo", "dashscope"]).toContain(asr.provider);
      expect(asr.providerTrace?.realProvider).toBe(true);
      expect(asr.providerTrace?.fallback).toBe(false);
    }

    const latestTeacherState = await getState(teacher);
    const highRiskResponse = await teacher.post(
      "/api/ai/high-risk-consultation",
      {
        data: {
          targetChildId: child.id,
          currentUser: {
            name: teacherUser.name,
            role: teacherUser.role,
            institutionId: teacherUser.institutionId,
            className: teacherUser.className,
          },
          visibleChildren: latestTeacherState.children,
          presentChildren: latestTeacherState.children,
          healthCheckRecords: latestTeacherState.health,
          growthRecords: latestTeacherState.growth,
          guardianFeedbacks: latestTeacherState.feedback,
          teacherNote: marker,
        },
      }
    );
    expect(highRiskResponse.status()).toBe(200);
    expectMeaningfulAiResult(
      await readJson(highRiskResponse),
      "high-risk consultation",
      { requireLive: requireLiveAi }
    );

    for (const api of [parent, admin]) {
      for (const type of ["health", "meal", "growth"]) {
        const records = await expectEnvelope<Array<Record<string, unknown>>>(
          await api.get(
            `/api/records?type=${type}&childId=${encodeURIComponent(child.id)}&includeArchived=1`
          )
        );
        expect(JSON.stringify(records)).toContain(marker);
      }
      const messages = await expectEnvelope<Array<Record<string, unknown>>>(
        await api.get(`/api/messages?childId=${encodeURIComponent(child.id)}`)
      );
      expect(JSON.stringify(messages)).toContain(marker);
    }

    await callRoleAi(admin, teacher, parent, child.id, marker);
    await verifyDietAndStorybookAi(teacher, parent, child, marker);
    await verifyRolePages(browser, testInfo, {
      admin: credentials.admin,
      teacher: credentials.teacher,
      parent: credentials.parent,
      childId: child.id,
    });
  } finally {
    await Promise.all([admin.dispose(), teacher.dispose(), parent.dispose()]);
  }
});
