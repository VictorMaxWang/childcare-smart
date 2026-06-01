import { expect, test } from "@playwright/test";
import { finalizeFeatureTest, loginAs, resetDemoStorage } from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("high-risk consultation start shows a stable result within 30 seconds", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-teacher2", "/teacher/high-risk-consultation?childId=c-1");

  await expect(page.getByTestId("r06-consultation-setup")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("r06-consultation-start-button").click();

  const result = page.locator("#consultation-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText(/evidenceItems|DataQuality|fallback/i, { timeout: 10_000 });
  await expect(result).toContainText(/48/, { timeout: 10_000 });

  await expect
    .poll(async () => Boolean(await latestConsultationForChild(page, "c-1")), { timeout: 10_000 })
    .toBe(true);
  const latest = await latestConsultationForChild(page, "c-1");
  if (!latest) throw new Error("consultation was not persisted");

  expect((latest.evidenceItems as unknown[]).length).toBeGreaterThanOrEqual(4);
  expect(latest.humanReviewRequired).toBe(true);
  expect((latest.followUp48h as unknown[]).length).toBeGreaterThan(0);
});

async function latestConsultationForChild(page: import("@playwright/test").Page, childId: string) {
  return page.evaluate((targetChildId) => {
    const records = Object.keys(window.localStorage)
      .filter((key) => key.endsWith("consultations.v1"))
      .flatMap((key) => {
        try {
          const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
          return Array.isArray(value) ? value : [];
        } catch {
          return [];
        }
      }) as Array<Record<string, unknown>>;

    return (
      records
        .filter((item) => item.childId === targetChildId)
        .sort((left, right) => String(right.generatedAt ?? "").localeCompare(String(left.generatedAt ?? "")))[0] ?? null
    );
  }, childId);
}
