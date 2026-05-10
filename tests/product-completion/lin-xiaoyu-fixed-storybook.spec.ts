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
  await expect(page.getByText("1 / 6").first()).toBeVisible();
  await expect(page.getByTestId("lin-xiaoyu-page-text")).toContainText(PAGE_1_TEXT);

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
  expect(parentStorybooks[0]?.storybookId).toBe("lin-xiaoyu-one-small-brave-step");
  expect(parentStorybooks[0]?.childId).toBe("c-1");

  await expectFailure(await parent.get("/api/storybooks?childId=c-3"), 403, "forbidden_scope");
  await expectOk(await teacherLi.get("/api/storybooks?childId=c-1"));
  await expectFailure(await teacherZhou.get("/api/storybooks?childId=c-1"), 403, "forbidden_scope");
  await expectOk(await admin.get("/api/storybooks?childId=c-1"));
});
