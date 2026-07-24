import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "feature-implementation", "D03");
const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
const BUCKETS = {
  health: `childcare.${SHARED_NAMESPACE}.health.v3`,
  meals: `childcare.${SHARED_NAMESPACE}.meals.v3`,
  growth: `childcare.${SHARED_NAMESPACE}.growth.v3`,
  storybooks: `childcare.${SHARED_NAMESPACE}.storybooks.v1`,
  children: `childcare.${SHARED_NAMESPACE}.children.v3`,
} as const;

async function loginAs(page: Page, accountId: string, route: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
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

async function bucketIncludes(page: Page, bucketKey: string, token: string) {
  return page.evaluate(
    ({ bucketKey, token }) => {
      const raw = window.localStorage.getItem(bucketKey) ?? "[]";
      return raw.includes(token);
    },
    { bucketKey, token }
  );
}

async function storybookIncludesGrowthSource(page: Page, growthToken: string) {
  return page.evaluate(
    ({ growthKey, storybookKey, growthToken }) => {
      const growth = JSON.parse(window.localStorage.getItem(growthKey) ?? "[]") as Array<{
        id?: string;
        description?: string;
      }>;
      const recordId = growth.find((record) => record.description === growthToken)?.id;
      if (!recordId) return false;
      const storybooks = JSON.parse(window.localStorage.getItem(storybookKey) ?? "[]") as Array<{
        sourceRecordIds?: string[];
      }>;
      return storybooks.some((storybook) => storybook.sourceRecordIds?.includes(recordId));
    },
    { growthKey: BUCKETS.growth, storybookKey: BUCKETS.storybooks, growthToken }
  );
}

async function bucketHasRecordForChild(page: Page, bucketKey: string, token: string, childId: string) {
  return page.evaluate(
    ({ bucketKey, token, childId }) => {
      const records = JSON.parse(window.localStorage.getItem(bucketKey) ?? "[]") as Array<{
        childId?: string;
      }>;
      return records.some((record) => record.childId === childId && JSON.stringify(record).includes(token));
    },
    { bucketKey, token, childId }
  );
}

async function screenshot(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, fileName),
    fullPage: true,
  });
}

async function selectDietChild(page: Page, childName: string) {
  const childCard = page.locator("button").filter({ hasText: childName }).filter({ hasText: "今日评分" });
  await childCard.scrollIntoViewIfNeeded();
  await childCard.click();
  await expect(page.locator("h2").filter({ hasText: childName })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("D03 teacher health, diet and growth records persist across roles", async ({ page }) => {
  const suffix = Date.now();
  const healthToken = `D03-HEALTH-${suffix}`;
  const dietToken = `D03-FOOD-${suffix}`;
  const growthToken = `D03-GROWTH-${suffix}`;

  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());

  await loginAs(page, "u-teacher", "/health");
  await waitForSharedDemoSeed(page);
  await page.reload();

  await page.getByRole("button", { name: /打开 林小雨 的晨检记录/ }).click();
  await page.locator("#temperature").fill("37.6");
  await page.locator("#remark").fill(healthToken);
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.health, healthToken)).toBe(true);
  await screenshot(page, "01-li-health-after-save.png");

  await page.reload();
  await expect(page.locator("body")).toContainText("37.6°C");
  await page.getByRole("button", { name: /打开 林小雨 的晨检记录/ }).click();
  await expect(page.locator("#remark")).toHaveValue(healthToken);
  await page.keyboard.press("Escape");
  await screenshot(page, "02-li-health-after-refresh.png");

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect(page.locator("body")).toContainText("37.6°C");
  await expect.poll(() => bucketIncludes(page, BUCKETS.health, healthToken)).toBe(true);
  await screenshot(page, "03-parent-health-visible.png");

  await loginAs(page, "u-teacher", "/diet");
  await selectDietChild(page, "林小雨");
  const lunchCard = page.getByTestId("meal-card-午餐");
  await expect(lunchCard).toBeVisible();
  await lunchCard.locator('input[placeholder="食物名称"]').fill(dietToken);
  await lunchCard.locator('input[placeholder="摄入量"]').fill("1份");
  await page.getByTestId("add-food-午餐").click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.meals, dietToken)).toBe(true);
  await screenshot(page, "04-li-diet-after-save.png");

  await page.reload();
  await selectDietChild(page, "林小雨");
  await expect(page.locator("body")).toContainText(dietToken);
  await screenshot(page, "04b-li-diet-after-refresh.png");

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect(page.locator("body")).toContainText(dietToken);
  await screenshot(page, "05-parent-diet-visible.png");

  await loginAs(page, "u-teacher", "/growth");
  await page.locator("#growth-child").click();
  await page.getByRole("option", { name: /林小雨/ }).click();
  await page.locator("#growth-tags").fill("D03, 共享演示");
  await page.locator("#growth-description").fill(growthToken);
  await page.getByRole("button", { name: "正常观察" }).click();
  await page.getByRole("button", { name: /保存记录/ }).click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.growth, growthToken)).toBe(true);
  await expect.poll(() => bucketHasRecordForChild(page, BUCKETS.growth, growthToken, "c-1")).toBe(true);
  // 教师保存观察记录不应伪造“已生成绘本”；真实绘本只在家长触发 AI 后保存。
  await expect.poll(() => storybookIncludesGrowthSource(page, growthToken)).toBe(false);
  await screenshot(page, "06-li-growth-after-save.png");

  await page.reload();
  await expect(page.locator("body")).toContainText(growthToken);
  await screenshot(page, "06b-li-growth-after-refresh.png");

  await loginAs(page, "u-parent", "/growth?child=c-1");
  await expect(page.locator("body")).toContainText(growthToken);
  await screenshot(page, "07-parent-growth-visible.png");

  await loginAs(page, "u-teacher2", "/health");
  await expect(page.locator("body")).not.toContainText("林小雨");
  await expect(page.locator("body")).not.toContainText(healthToken);
  await loginAs(page, "u-teacher2", "/diet");
  await expect(page.locator("body")).not.toContainText(dietToken);
  await loginAs(page, "u-teacher2", "/growth");
  await expect(page.locator("body")).not.toContainText(growthToken);
  await screenshot(page, "08-zhou-isolation.png");

  await loginAs(page, "u-admin", "/admin");
  await expect(page.locator("body")).toContainText("晨检");
  await expect(page.locator("body")).toContainText("成长");
  await expect.poll(() => bucketIncludes(page, BUCKETS.health, healthToken)).toBe(true);
  await expect.poll(() => bucketIncludes(page, BUCKETS.meals, dietToken)).toBe(true);
  await expect.poll(() => bucketIncludes(page, BUCKETS.growth, growthToken)).toBe(true);
  await screenshot(page, "09-admin-summary.png");
});
