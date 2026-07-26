import { expect, test, type Page } from "@playwright/test";

import { loginAs, tinyPngDataUrl } from "./helpers";

const IMAGE_FILE = {
  name: "meal-vision-test.png",
  mimeType: "image/png",
  buffer: Buffer.from(tinyPngDataUrl().split(",")[1], "base64"),
};

async function installVisionStub(page: Page) {
  let providerAvailable = true;
  await page.route("**/api/ai/vision-meal", async (route) => {
    if (!providerAvailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          foods: [],
          source: "unavailable",
          code: "provider_unavailable",
          error: "图片识别服务暂时不可用，请改用手动录入。",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        foods: [{ name: "测试餐盘菜", category: "蔬果", amount: "60g" }],
        source: "fallback",
        model: "vision-rule-fallback",
      }),
    });
  });

  return {
    disableProvider() {
      providerAvailable = false;
    },
  };
}

test("meal photo recognition clears stale draft and exposes provider failure", async ({ page }) => {
  const vision = await installVisionStub(page);
  await loginAs(page, "u-teacher", "/diet?child=c-1");

  const lunchCard = page.getByTestId("meal-card-午餐");
  await expect(lunchCard).toBeVisible();
  const input = lunchCard.getByTestId("meal-vision-input-午餐");

  await input.setInputFiles(IMAGE_FILE);
  await expect(lunchCard.getByTestId("meal-vision-result-午餐")).toBeVisible();
  await expect(lunchCard.locator('input[value="测试餐盘菜"]')).toBeVisible();

  vision.disableProvider();
  await input.setInputFiles(IMAGE_FILE);

  await expect(lunchCard.getByTestId("meal-vision-result-午餐")).toHaveCount(0);
  await expect(page.getByText("图片识别服务暂时不可用，请改用手动录入。")).toBeVisible();
});

test("bulk photo recognition removes stale provider badge after a failed retry", async ({ page }) => {
  const vision = await installVisionStub(page);
  await loginAs(page, "u-teacher", "/diet?child=c-1");

  const input = page.getByTestId("bulk-meal-vision-input");
  await input.setInputFiles(IMAGE_FILE);
  await expect(page.getByText("测试餐盘菜", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("vision-rule-fallback", { exact: true })).toBeVisible();

  vision.disableProvider();
  await input.setInputFiles(IMAGE_FILE);

  await expect(page.getByText("vision-rule-fallback", { exact: true })).toHaveCount(0);
  await expect(page.getByText("图片识别服务暂时不可用，请改用手动录入。")).toBeVisible();
});
