import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { finalizeFeatureTest, loginAs, resetDemoStorage } from "./helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "feedback-writeback");

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

async function createEvidenceImage(token: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const filePath = path.join(ARTIFACT_DIR, `${token}.png`);
  await fs.writeFile(
    filePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64"
    )
  );
  return filePath;
}

test("parent feedback writeback updates parent, teacher, consultation, and admin views", async ({ page }) => {
  const token = `写回链路-${Date.now()}`;
  const evidencePath = await createEvidenceImage(token);
  const feedbackNote = `${token}：完成共读，孩子愿意复述我害怕，并走到门口小步尝试。`;

  await resetDemoStorage(page);
  await loginAs(page, "u-parent", "/parent/agent?child=c-1#feedback");

  const feedbackSection = page.getByTestId("r07-parent-agent-feedback-section").first();
  await expect(feedbackSection).toBeVisible({ timeout: 45_000 });
  await feedbackSection.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("parent-submit-structured-feedback")).toBeEnabled({ timeout: 45_000 });

  await page.getByTestId("feedback-execution-completed").click();
  await page.getByTestId("feedback-reaction-improved-4").click();
  await page.getByTestId("feedback-improvement-clear_improvement-4").click();
  await feedbackSection.getByPlaceholder("可以描述孩子的表现、遇到的困难或其他想告诉老师的内容...").fill(feedbackNote);
  await feedbackSection.locator("[data-testid='attachment-media-picker'] input[type='file']").first().setInputFiles(evidencePath);
  await page.getByTestId("parent-submit-structured-feedback").click();

  await expect(feedbackSection).toContainText("下一轮建议已更新", { timeout: 45_000 });
  await expect(page.locator("body")).toContainText(token, { timeout: 20_000 });

  await page.reload();
  await expect(page.locator("body")).toContainText(token, { timeout: 30_000 });

  await loginAs(page, "u-teacher2", "/teacher/agent?action=weekly-summary");
  await expect(page.getByTestId("teacher-agent-ai-status-bar")).toContainText("lastRequestStatus: success", {
    timeout: 45_000,
  });
  await expect(page.getByTestId("teacher-agent-latest-result")).toContainText(token, { timeout: 45_000 });

  await loginAs(page, "u-teacher2", "/teacher/high-risk-consultation?childId=c-1");
  await expect(page.getByTestId("r06-consultation-setup")).toContainText("家长反馈：", { timeout: 30_000 });
  await page.getByTestId("r06-consultation-start-button").click();
  await expect(page.locator("#consultation-result")).toContainText(token, { timeout: 60_000 });

  await loginAs(page, "u-admin", "/admin");
  await expect(page.getByTestId("admin-family-feedback-writeback")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("admin-family-feedback-writeback")).toContainText(token, { timeout: 30_000 });
  await expect(page.getByTestId("admin-family-feedback-writeback")).toContainText("已回流");
});
