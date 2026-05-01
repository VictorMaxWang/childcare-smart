import { expect, test, type Page } from "@playwright/test";
import {
  BUCKETS,
  capture,
  expectBucketIncludes,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
  waitForSharedDemoSeed,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 teacher records persist after refresh and are visible to parent", async ({ page }) => {
  const suffix = Date.now();
  const healthToken = `D08-HEALTH-${suffix}`;
  const dietToken = `D08-FOOD-${suffix}`;
  const growthToken = `D08-GROWTH-${suffix}`;

  await resetDemoStorage(page);

  await loginAs(page, "u-teacher", "/health");
  await waitForSharedDemoSeed(page);
  await page.reload();

  await page.getByRole("button", { name: /打开 林小雨 的晨检记录/ }).click();
  await page.locator("#temperature").fill("37.6");
  await page.locator("#remark").fill(healthToken);
  await page.getByRole("button", { name: "保存记录" }).click();
  await expectBucketIncludes(page, "health", healthToken);
  await capture(page, "records-01-health-save.png");

  await page.reload();
  await expect(page.locator("body")).toContainText("37.6");
  await page.getByRole("button", { name: /打开 林小雨 的晨检记录/ }).click();
  await expect(page.locator("#remark")).toHaveValue(healthToken);
  await page.keyboard.press("Escape");

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect(page.locator("body")).toContainText("37.6");
  await expectBucketIncludes(page, "health", healthToken);

  await loginAs(page, "u-teacher", "/diet");
  await selectDietChild(page, "林小雨");
  const lunchCard = page.getByTestId("meal-card-午餐");
  await expect(lunchCard).toBeVisible();
  await lunchCard.locator('input[placeholder="食物名称"]').fill(dietToken);
  await lunchCard.locator('input[placeholder="摄入量"]').fill("1份");
  await page.getByTestId("add-food-午餐").click();
  await expectBucketIncludes(page, "meals", dietToken);
  await capture(page, "records-02-diet-save.png");

  await page.reload();
  await selectDietChild(page, "林小雨");
  await expect(page.locator("body")).toContainText(dietToken);

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect(page.locator("body")).toContainText(dietToken);

  await loginAs(page, "u-teacher", "/growth");
  await page.locator("#growth-child").click();
  await page.getByRole("option", { name: /林小雨/ }).click();
  await page.locator("#growth-tags").fill("D08, persistence");
  await page.locator("#growth-description").fill(growthToken);
  await page.getByRole("button", { name: "正常观察" }).click();
  await page.getByRole("button", { name: /保存记录/ }).click();
  await expectBucketIncludes(page, "growth", growthToken);
  await expect.poll(() => bucketHasRecordForChild(page, "growth", growthToken, "c-1")).toBe(true);
  await expect.poll(() => storybookIncludesGrowthSource(page, growthToken)).toBe(true);
  await capture(page, "records-03-growth-save.png");

  await page.reload();
  await expect(page.locator("body")).toContainText(growthToken);

  await loginAs(page, "u-parent", "/growth?child=c-1");
  await expect(page.locator("body")).toContainText(growthToken);
  await capture(page, "records-04-parent-visible.png");

  await loginAs(page, "u-teacher2", "/health");
  await expect(page.locator("body")).not.toContainText(healthToken);
  await loginAs(page, "u-teacher2", "/diet");
  await expect(page.locator("body")).not.toContainText(dietToken);
  await loginAs(page, "u-teacher2", "/growth");
  await expect(page.locator("body")).not.toContainText(growthToken);
});

async function selectDietChild(page: Page, childName: string) {
  const childCard = page.locator("button").filter({ hasText: childName }).filter({ hasText: "今日评分" });
  await childCard.scrollIntoViewIfNeeded();
  await childCard.click();
  await expect(page.locator("h2").filter({ hasText: childName })).toBeVisible();
}

async function bucketHasRecordForChild(page: Page, bucket: "health" | "meals" | "growth", token: string, childId: string) {
  return page.evaluate(
    ({ key, token, childId }) => {
      const records = JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ childId?: string }>;
      return records.some((record) => record.childId === childId && JSON.stringify(record).includes(token));
    },
    { key: BUCKETS[bucket], token, childId }
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
