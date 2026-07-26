import { expect, test, type Page, type TestInfo } from "@playwright/test";

import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import { buildSessionToken } from "@/lib/auth/session";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";

const NORMAL_PARENT: SessionUser = {
  id: "normal-parent-collision",
  username: "normal-parent-collision",
  name: "普通家长",
  role: "家长",
  avatar: "家",
  institutionId: "inst-1",
  childIds: ["c-1"],
  accountKind: "normal",
};

const NORMAL_TEACHER: SessionUser = {
  id: "normal-teacher-collision",
  username: "normal-teacher-collision",
  name: "普通教师",
  role: "教师",
  avatar: "师",
  institutionId: "inst-1",
  className: "晨曦班",
  accountKind: "normal",
};

function baseUrl(testInfo: TestInfo) {
  const value = testInfo.project.use.baseURL;
  if (typeof value !== "string" || !value) {
    throw new Error("Playwright baseURL is required");
  }
  return value;
}

async function installNormalSession(
  page: Page,
  testInfo: TestInfo,
  user: SessionUser
) {
  // 使用与应用相同的签名 cookie 通过 proxy，身份和业务快照仍由浏览器路由精确控制。
  await page.context().addCookies([
    {
      name: "ccs_session",
      value: buildSessionToken(user.id, user.role as AccountRole),
      url: baseUrl(testInfo),
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user }),
    });
  });

  const snapshot = createDemoSeedSnapshot("2026-07-26T00:00:00.000Z");
  snapshot.storybooks = [];
  snapshot.mobileDrafts = [];
  snapshot.consultations = [];

  await page.route("**/api/state", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "test read-only state" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, snapshot }),
    });
  });
}

test("normal parent with child c-1 uses the real storybook request instead of the fixed demo", async ({
  page,
}, testInfo) => {
  await installNormalSession(page, testInfo, NORMAL_PARENT);

  let generationRequests = 0;
  const generationCapture: { payload?: Record<string, unknown> } = {};
  await page.route("**/api/ai/parent-storybook**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== "/api/ai/parent-storybook" || request.method() !== "POST") {
      await route.continue();
      return;
    }

    generationRequests += 1;
    generationCapture.payload = JSON.parse(
      request.postData() ?? "{}"
    ) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        storyId: "normal-collision-storybook",
        childId: "c-1",
        mode: "storybook",
        title: "普通账号真实绘本",
        summary: "由普通账号真实请求生成。",
        moral: "使用真实数据。",
        parentNote: "普通账号不进入固定演示。",
        source: "fallback",
        fallback: true,
        fallbackReason: "playwright-controlled-response",
        generatedAt: "2026-07-26T00:00:00.000Z",
        providerMeta: {
          provider: "test-provider",
          mode: "storybook",
          transport: "next-json-fallback",
          textProvider: "test-provider",
          textDelivery: "fallback",
          imageProvider: "none",
          audioProvider: "none",
          imageDelivery: "placeholder",
          audioDelivery: "script-only",
          requestSource: "normal-account-kind-gating-test",
          fallbackReason: "playwright-controlled-response",
          realProvider: false,
          highlightCount: 1,
          sceneCount: 1,
        },
        scenes: [
          {
            sceneIndex: 1,
            sceneTitle: "真实场景",
            sceneText: "普通账号儿童的真实绘本场景。",
            imagePrompt: "real child story scene",
            imageStatus: "fallback",
            audioStatus: "script-only",
            audioScript: "普通账号儿童的真实绘本场景。",
            voiceStyle: "warm",
            highlightSource: "real-record",
          },
        ],
      }),
    });
  });

  await page.route("**/api/storybooks**", async (route) => {
    const data =
      route.request().method() === "GET"
        ? []
        : {
            storybookId: "normal-collision-storybook",
            childId: "c-1",
          };
    await route.fulfill({
      status: route.request().method() === "GET" ? 200 : 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.goto("/parent/storybook?child=c-1");

  await expect.poll(() => generationRequests).toBe(1);
  expect(generationCapture.payload?.childId).toBe("c-1");
  expect(generationCapture.payload?.demoSeed).toBeUndefined();
  await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toHaveCount(0);
});

test("normal teacher with child c-1 and name 林小雨 receives an empty real consultation draft", async ({
  page,
}, testInfo) => {
  await installNormalSession(page, testInfo, NORMAL_TEACHER);

  await page.route("**/api/feedback**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.goto("/teacher/high-risk-consultation?childId=c-1");
  await expect(page.getByTestId("r06-consultation-setup")).toBeVisible();

  await expect(
    page.getByPlaceholder("例如：走廊活动听到推车声后害怕退缩，已能在老师陪伴下说出“我害怕”，希望生成勇敢表达与小步尝试支持方案。")
  ).toHaveValue("");
  await expect(page.getByPlaceholder("先写一段图片中的关键信息。")).toHaveValue("");
  await expect(page.getByPlaceholder("先写一段语音速记内容。")).toHaveValue("");
  await expect(page.getByTestId("r06-consultation-start-button")).toHaveText(
    "一键生成会诊"
  );
});
