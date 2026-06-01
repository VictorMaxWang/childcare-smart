import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { demoContext, expectFailure, expectOk } from "./e11-helpers";

const TITLE = "林小雨的一小步勇敢";
const PAGE_1_TEXT = "今天，林小雨听见走廊里“哗啦”一声。\n她抱紧小兔，小声说：“我有一点害怕。”";
const PAGE_2_TEXT = "老师蹲下来，说：“害怕也没关系。我们先吸一口气，再慢慢吐出来。”\n林小雨跟着做了一次，心里好像亮了一点点。";

async function loginParent(page: Page, url = "/parent/storybook?child=c-1") {
  await page.context().clearCookies();
  const login = await page.request.post("/api/auth/demo-login", { data: { accountId: "u-parent" } });
  expect(login.ok()).toBe(true);
  await page.goto(url);
}

test("林妈妈打开 c-1 默认显示固定 6 页绘本并支持刷新", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await loginParent(page);
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await expect(page.getByText("成长绘本 · 勇敢练习").first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-image-status")).toContainText("本地演示预览");
  await expect(page.getByText("1 / 6").first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-page-text")).toContainText(PAGE_1_TEXT);
  await expect(page.getByTestId("parent-storybook-generation-panel")).toBeVisible();
  await expect(page.getByTestId("parent-storybook-mode-child-personalized")).toBeVisible();
  await expect(page.getByTestId("parent-storybook-page-count-6")).toBeVisible();
  await expect(page.getByTestId("parent-storybook-style-mode-preset")).toBeVisible();
  await expect(page.getByTestId("parent-storybook-style-preset-sunrise-watercolor")).toBeVisible();
  await expect(page.getByTestId("parent-storybook-regenerate")).toBeEnabled();

  const image = page.locator('[data-testid="lin-xiaoyu-fixed-storybook"] img').first();
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  expect(src).toBe("/demo-media/storybooks/lin-xiaoyu/images/page-01.webp");
  expect((await page.request.get(src!)).status()).toBe(200);

  await page.getByTestId("lin-xiaoyu-next-page").click();
  await expect(page.getByText("2 / 6").first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-page-text")).toContainText(PAGE_2_TEXT);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible();
  await expect(page.getByText(/1 \/ 6|2 \/ 6/u).first()).toBeVisible();
  expect(consoleErrors.filter((item) => !item.includes("favicon")).length).toBe(0);
});

test("c-1 fixed default does not block manual vivo storybook generation", async ({ page }) => {
  const generatedRequest: { value?: Record<string, unknown> } = {};
  const generatedTitle = `storybook-lock-02-regenerated-${Date.now()}`;
  let generationPostCount = 0;

  await page.route("**/api/ai/parent-storybook**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== "/api/ai/parent-storybook" || request.method() !== "POST") {
      await route.continue();
      return;
    }
    generationPostCount += 1;
    generatedRequest.value = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        storyId: "storybook-lock-02-regenerated",
        childId: "c-1",
        mode: "storybook",
        title: generatedTitle,
        summary: "manual generation smoke",
        moral: "manual generation smoke",
        parentNote: "manual generation smoke",
        source: "vivo",
        fallback: false,
        fallbackReason: null,
        generatedAt: new Date().toISOString(),
        stylePreset: "moonlit-cutout",
        providerMeta: {
          provider: "vivo-llm",
          mode: "storybook",
          transport: "remote-brain-proxy",
          textProvider: "vivo-llm",
          textDelivery: "real",
          imageProvider: "vivo-story-image",
          audioProvider: "vivo-story-tts",
          imageDelivery: "real",
          audioDelivery: "real",
          stylePreset: "moonlit-cutout",
          requestSource: "storybook-lock-02-test",
          fallbackReason: null,
          realProvider: true,
          highlightCount: 1,
          sceneCount: 1,
        },
        scenes: [
          {
            sceneIndex: 1,
            sceneTitle: "AI generated page",
            sceneText: "manual generated storybook result",
            imagePrompt: "manual generated prompt",
            imageUrl: "/demo-media/storybooks/demo-storybook-placeholder.svg",
            assetRef: "/demo-media/storybooks/demo-storybook-placeholder.svg",
            imageSourceKind: "real",
            imageStatus: "ready",
            audioUrl: "/api/ai/parent-storybook/media/testcached",
            audioRef: "testcached",
            audioStorageObject: {
              id: "storybook-lock-02-regenerated:scene:1:audio",
              owner: { ownerType: "child", ownerId: "c-1", childId: "c-1", institutionId: "inst-1" },
              scope: { institutionId: "inst-1", childId: "c-1", relatedType: "storybook-media", relatedId: "storybook-lock-02-regenerated" },
              kind: "storybook-audio",
              storageMode: "cached_media",
              url: null,
              localPreviewUrl: "/api/ai/parent-storybook/media/testcached",
              metadataOnly: false,
              expiresAt: "2026-05-01T00:20:00.000Z",
              permissions: { canRead: true, canPreview: true, canDownload: true, canShare: false, reason: "in_memory_cached_media" },
            },
            audioScript: "manual generated storybook result",
            audioStatus: "ready",
            voiceStyle: "warm narration",
            engineId: "short_audio_synthesis_jovi",
            voiceName: "yige_child",
            highlightSource: "test",
          },
        ],
        cacheMeta: {
          storyResponse: "miss",
          audioDelivery: "stream-url",
          ttlSeconds: 60,
          realSceneCount: 1,
        },
      }),
    });
  });

  await loginParent(page);
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await page.getByTestId("parent-storybook-page-count-4").click();
  await page.getByTestId("parent-storybook-mode-hybrid").click();
  await page.getByTestId("parent-storybook-manual-theme").fill("brave demo");
  await page.getByTestId("parent-storybook-style-mode-custom").click();
  await page.getByTestId("parent-storybook-custom-style-prompt").fill("warm watercolor demo");
  await page.getByTestId("parent-storybook-style-mode-preset").click();
  await page.getByTestId("parent-storybook-style-preset-moonlit-cutout").click();
  await Promise.all([
    page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/ai/parent-storybook" && request.method() === "POST";
    }),
    page.getByTestId("parent-storybook-regenerate").click(),
  ]);

  await expect(page.getByText(generatedTitle).first()).toBeVisible();
  await expect(page.getByText("已缓存媒体").first()).toBeVisible();
  await expect(page.getByTestId("parent-storybook-text-status")).toContainText("文案：真实 AI");
  await expect(page.getByTestId("parent-storybook-image-status")).toContainText("插图：真实插图");
  await expect(page.getByTestId("parent-storybook-audio-status")).toContainText("朗读：真实 TTS");
  expect(generatedRequest.value?.childId).toBe("c-1");
  expect(generatedRequest.value?.pageCount).toBe(4);
  expect(generatedRequest.value?.generationMode).toBe("hybrid");
  expect(generatedRequest.value?.styleMode).toBe("preset");
  expect(generatedRequest.value?.stylePreset).toBe("moonlit-cutout");
  expect(generationPostCount).toBe(1);

  const refreshRequested = page
    .waitForRequest(
      (request) => {
        const url = new URL(request.url());
        return url.pathname === "/api/ai/parent-storybook" && request.method() === "POST";
      },
      { timeout: 750 }
    )
    .then(() => true)
    .catch(() => false);
  await page.getByTestId("parent-storybook-refresh-current").click();
  expect(await refreshRequested).toBe(false);
  expect(generationPostCount).toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible();
  await expect(page.getByTestId("parent-storybook-generation-panel")).toBeVisible();
});

test("lin-xiaoyu alias 可打开同一本固定绘本", async ({ page }) => {
  await loginParent(page, "/parent/storybook?child=lin-xiaoyu");
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible();
});

test("图片失败时使用安全 fallback，不影响文字阅读", async ({ page }) => {
  await page.route("**/demo-media/storybooks/lin-xiaoyu/images/page-01.webp", (route) =>
    route.fulfill({ status: 404, body: "missing" })
  );
  await loginParent(page);
  await expect(page.getByTestId("lin-xiaoyu-page-text")).toContainText(PAGE_1_TEXT);
  await expect(page.locator('img[src*="demo-storybook-placeholder"]').first()).toBeVisible();
});

test("朗读控件存在，静态音频存在时可 200 返回", async ({ page }) => {
  await loginParent(page);
  await expect(page.getByTestId("lin-xiaoyu-play-page")).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-replay-page")).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-play-book")).toBeVisible();

  const audioPath = path.join(process.cwd(), "public/demo-media/storybooks/lin-xiaoyu/audio/page-01.mp3");
  if (fs.existsSync(audioPath)) {
    const response = await page.request.get("/demo-media/storybooks/lin-xiaoyu/audio/page-01.mp3");
    expect(response.status()).toBe(200);
  }
});

test("固定绘本 API scope 保持隔离", async ({}, testInfo) => {
  const parent = await demoContext(testInfo, "u-parent");
  const teacherLi = await demoContext(testInfo, "u-teacher");
  const teacherZhou = await demoContext(testInfo, "u-teacher2");
  const admin = await demoContext(testInfo, "u-admin");

  const parentStorybooks = await expectOk<Array<{ storybookId: string; childId: string; pages?: Array<{ response?: { title?: string } }> }>>(
    await parent.get("/api/storybooks?childId=c-1")
  );
  expect(parentStorybooks.some((item) => item.storybookId === "lin-xiaoyu-one-small-brave-step")).toBe(true);
  expect(parentStorybooks.every((item) => item.childId === "c-1")).toBe(true);

  await expectFailure(await parent.get("/api/storybooks?childId=c-3"), 403, "forbidden_scope");
  await expectFailure(await teacherLi.get("/api/storybooks?childId=c-1"), 403, "forbidden_scope");
  await expectOk(await teacherZhou.get("/api/storybooks?childId=c-1"));
  await expectOk(await admin.get("/api/storybooks?childId=c-1"));
});
