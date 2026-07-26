import { expect, test } from "@playwright/test";
import { finalizeFeatureTest, loginAs, resetDemoStorage } from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("high-risk consultation start shows a stable result within 30 seconds", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-teacher2", "/teacher/high-risk-consultation?childId=c-1");

  await expect(page.getByTestId("r06-consultation-setup")).toBeVisible({ timeout: 20_000 });
  const existingIds = await consultationIdsForChild(page, "c-1");
  await page.getByTestId("r06-consultation-start-button").click();

  const result = page.locator("#consultation-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText(/evidenceItems|DataQuality|fallback/i, { timeout: 10_000 });
  await expect(result).toContainText(/48/, { timeout: 10_000 });

  await expect
    .poll(async () => Boolean(await newConsultationForChild(page, "c-1", existingIds)), { timeout: 10_000 })
    .toBe(true);
  const latest = await newConsultationForChild(page, "c-1", existingIds);
  if (!latest) throw new Error("consultation was not persisted");

  expect((latest.evidenceItems as unknown[]).length).toBeGreaterThanOrEqual(4);
  expect(latest.humanReviewRequired).toBe(true);
  expect((latest.followUp48h as unknown[]).length).toBeGreaterThan(0);
});

async function consultationIdsForChild(page: import("@playwright/test").Page, childId: string) {
  const records = await consultationRecordsForChild(page, childId);
  return records.map((item) => String(item.consultationId));
}

async function newConsultationForChild(
  page: import("@playwright/test").Page,
  childId: string,
  existingIds: string[]
) {
  const records = await consultationRecordsForChild(page, childId);
  return (
    records
      .filter((item) => !existingIds.includes(String(item.consultationId)))
      .sort((left, right) =>
        String(right.updatedAt ?? right.generatedAt ?? "").localeCompare(
          String(left.updatedAt ?? left.generatedAt ?? "")
        )
      )[0] ?? null
  );
}

async function consultationRecordsForChild(
  page: import("@playwright/test").Page,
  childId: string
) {
  // 资源 API 是会诊的权威存储；localStorage 可能因配额保护降级为空。
  const response = await page.request.get(
    `/api/consultations?childId=${encodeURIComponent(childId)}`
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  return Array.isArray(body.data) ? body.data : [];
}
