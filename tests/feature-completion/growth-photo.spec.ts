import { expect, test } from "@playwright/test";

import {
  loginAs,
  resetDemoStorage,
  tinyPngDataUrl,
} from "./helpers";

const PHOTO_FILE = {
  name: "growth-photo-test.png",
  mimeType: "image/png",
  buffer: Buffer.from(tinyPngDataUrl().split(",")[1], "base64"),
};

test("demo growth photo preview never masquerades as a persisted private upload", async ({
  page,
}) => {
  await resetDemoStorage(page);
  let uploadRequests = 0;
  page.on("request", (request) => {
    if (
      request.url().includes("/api/attachments/upload") &&
      request.method() === "POST"
    ) {
      uploadRequests += 1;
    }
  });

  await loginAs(page, "u-teacher2", "/growth");
  await page.locator("#growth-child").click();
  await page.getByRole("option", { name: /林小雨/ }).click();

  await page.getByTestId("growth-photo-input").setInputFiles(PHOTO_FILE);
  await expect(page.getByTestId("growth-photo-preview")).toBeVisible();

  const token = `演示成长照片边界-${Date.now()}`;
  await page.locator("#growth-description").fill(token);
  await page.getByTestId("r05-growth-save-record").click();

  await expect(
    page.getByText("演示账号仅保存结构化观察，不上传幼儿原始照片。")
  ).toBeVisible();
  await expect(page.getByTestId("growth-photo-preview")).toHaveCount(0);
  const savedCard = page
    .getByTestId("growth-record-card")
    .filter({ hasText: token })
    .first();
  await expect(savedCard).toBeVisible();
  await expect(savedCard.getByTestId("growth-record-image")).toHaveCount(0);
  expect(uploadRequests).toBe(0);
});
