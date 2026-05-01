import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "feature-implementation", "D04");
const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
const BUCKETS = {
  children: `childcare.${SHARED_NAMESPACE}.children.v3`,
  messages: `childcare.${SHARED_NAMESPACE}.messages.v1`,
  reminders: `childcare.${SHARED_NAMESPACE}.reminders.v1`,
  nutritionMenus: `childcare.${SHARED_NAMESPACE}.nutrition-menus.v1`,
  storybooks: `childcare.${SHARED_NAMESPACE}.storybooks.v1`,
} as const;

async function loginAsParent(page: Page, route: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId: "u-parent" },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(route);
  await expect(page.locator("body")).not.toHaveText("");
}

async function waitForSharedDemoSeed(page: Page) {
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), BUCKETS.children))
    .not.toBeNull();
}

async function screenshot(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, fileName),
    fullPage: true,
  });
}

async function expectChildParam(page: Page, childId = "c-1") {
  expect(new URL(page.url()).searchParams.get("child")).toBe(childId);
}

test.describe.configure({ mode: "serial" });

test("D04 parent menus use D01 store and persist reminder/storybook state", async ({ page }) => {
  const storyId = `d04-story-${Date.now()}`;

  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());

  await loginAsParent(page, "/parent?child=c-1");
  await waitForSharedDemoSeed(page);
  await expect(page.locator("body")).toContainText("林");
  await expect
    .poll(() =>
      page.evaluate(
        (keys) => ({
          messages: window.localStorage.getItem(keys.messages),
          reminders: window.localStorage.getItem(keys.reminders),
          nutritionMenus: window.localStorage.getItem(keys.nutritionMenus),
        }),
        BUCKETS
      )
    )
    .toMatchObject({
      messages: expect.any(String),
      reminders: expect.any(String),
      nutritionMenus: expect.any(String),
    });
  await screenshot(page, "01-parent-home.png");

  const menuRoutes = [
    ["/parent/agent?child=c-1#feedback", "02-parent-agent.png"],
    ["/growth?child=c-1", "03-growth-file.png"],
    ["/health?child=c-1", "04-health-readonly.png"],
    ["/diet?child=c-1", "05-diet-menu.png"],
    ["/parent/reminders?child=c-1", "06-reminders.png"],
  ] as const;

  for (const [route, shot] of menuRoutes) {
    await page.goto(route);
    await expect(page.locator("body")).not.toHaveText("");
    await expectChildParam(page);
    await screenshot(page, shot);
  }

  await page.goto("/parent/reminders?child=c-1");
  await expectChildParam(page);
  const markReadButton = page.locator("article").filter({ hasText: "family-task" }).locator("button:not([disabled])");
  const markReadButtonCount = await markReadButton.count();
  expect(markReadButtonCount).toBeGreaterThan(0);
  await markReadButton.first().click();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const reminders = JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{
          reminderId?: string;
          childId?: string;
          targetId?: string;
          status?: string;
        }>;
        return reminders.some(
          (reminder) => (reminder.childId === "c-1" || reminder.targetId === "c-1") && reminder.status === "acknowledged"
        );
      }, BUCKETS.reminders)
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator("body")).toContainText("已读");
  await screenshot(page, "07-reminder-read-refresh.png");

  await page.evaluate((key) => window.localStorage.setItem(key, "[]"), BUCKETS.storybooks);
  await page.route("**/api/ai/parent-storybook", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        storyId,
        childId: "c-1",
        mode: "storybook",
        title: "D04 林小雨成长绘本",
        summary: "D04 Playwright 生成的本地演示绘本。",
        moral: "记录真实成长，刷新后仍能看到。",
        parentNote: "本地演示已保存到 D01。",
        source: "fallback",
        fallback: true,
        fallbackReason: "d04-playwright",
        generatedAt: new Date().toISOString(),
        stylePreset: "sunrise-watercolor",
        providerMeta: {
          provider: "playwright",
          mode: "storybook",
          transport: "next-json-fallback",
          imageProvider: "playwright",
          audioProvider: "browser-preview",
          imageDelivery: "svg-fallback",
          audioDelivery: "preview-only",
          requestSource: "d04-parent-acceptance",
          fallbackReason: "d04-playwright",
          realProvider: false,
          highlightCount: 1,
          sceneCount: 1,
        },
        scenes: [
          {
            sceneIndex: 0,
            sceneTitle: "在花园里练习表达",
            sceneText: "林小雨把今天的成长记录变成了一页故事。",
            imagePrompt: "child growth story",
            imageUrl: null,
            imageSourceKind: "svg-fallback",
            imageStatus: "fallback",
            audioUrl: null,
            audioScript: "林小雨把今天的成长记录变成了一页故事。",
            audioStatus: "fallback",
            voiceStyle: "gentle",
            highlightSource: "d04-growth-record",
          },
        ],
      }),
    });
  });
  await page.goto("/parent/storybook?child=c-1");
  await expect(page.locator("body")).toContainText("D04 林小雨成长绘本");
  await expectChildParam(page);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key)?.includes("D04 林小雨成长绘本") ?? false, BUCKETS.storybooks))
    .toBe(true);
  await screenshot(page, "08-storybook-generated.png");
  await page.unroute("**/api/ai/parent-storybook");
  await page.reload();
  await expect(page.locator("body")).toContainText("D04 林小雨成长绘本");
  await screenshot(page, "09-storybook-refresh.png");

  await page.goto("/parent?child=c-2");
  expect(new URL(page.url()).searchParams.get("child")).toBe("c-2");
  await expect(page.locator("body")).toContainText("授权");
  await screenshot(page, "10-invalid-child-no-fallback.png");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileRoutes = [
    "/parent?child=c-1",
    "/parent/agent?child=c-1#feedback",
    "/growth?child=c-1",
    "/health?child=c-1",
    "/diet?child=c-1",
    "/parent/reminders?child=c-1",
  ];
  for (const route of mobileRoutes) {
    await page.goto(route);
    await expect(page.locator("body")).not.toHaveText("");
    await expectChildParam(page);
  }
  await screenshot(page, "11-mobile-390x844.png");
});
