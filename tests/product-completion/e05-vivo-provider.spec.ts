import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { loginAs, resetDemoStorage } from "../feature-completion/helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E05");

async function captureE05(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, fileName), fullPage: true });
}

const aiPayload = {
  childId: "c-1",
  sourceRole: "teacher",
  files: [
    {
      name: "e05-note.txt",
      mimeType: "text/plain",
      previewText: "temperature 39.0 high risk follow up tomorrow",
    },
  ],
  requestSource: "e05-playwright",
};

test.describe.configure({ mode: "serial" });

test("E05 AI routes return auth errors and health parse uses explicit provider fallback", async ({ page, request }) => {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  const unauth = await request.post("/api/ai/health-file-bridge", { data: aiPayload });
  expect(unauth.status()).toBe(401);
  await expect.poll(async () => (await unauth.json()).code).toBe("unauthorized");

  const forbidden = await request.post("/api/ai/health-file-bridge", {
    data: aiPayload,
    headers: { "x-demo-account-id": "u-teacher2" },
  });
  expect(forbidden.status()).toBe(403);
  await expect.poll(async () => (await forbidden.json()).code).toBe("forbidden_scope");

  await resetDemoStorage(page);
  await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
  const token = `E05-TEXT-${Date.now()}`;
  await page.getByTestId("d05-health-preview-text").fill(`${token} temperature 39.0 high risk follow up tomorrow`);
  await page.getByTestId("d05-start-parse").click();
  await expect(page.getByTestId("d05-parse-result")).toContainText("本地文本 fallback", { timeout: 30_000 });
  await expect(page.getByTestId("d05-parse-result")).toContainText("extracted text");
  await captureE05(page, "e05-01-text-fallback-provider-status.png");

  const saveButton = page.getByTestId("d05-save-parse");
  await saveButton.click();
  await expect(saveButton).toBeDisabled({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("d05-health-history")).toContainText("manual-health-material-note.txt");
  await expect(page.getByTestId("d05-parse-result")).toContainText(token, { timeout: 20_000 });
  await captureE05(page, "e05-02-saved-refresh.png");

  await page.getByTestId("d05-create-consultation").click();
  await page.waitForURL(/\/teacher\/high-risk-consultation/);
  await expect(page.locator("body")).toContainText("manual-health-material-note.txt", { timeout: 15_000 });
  await captureE05(page, "e05-03-consultation-created.png");

  await page.goto("/teacher/health-file-bridge");
  const imageFailureName = `e05-image-${Date.now()}.png`;
  await page.getByTestId("d05-health-file-input").setInputFiles({
    name: imageFailureName,
    mimeType: "image/png",
    buffer: Buffer.from("not-a-real-image"),
  });
  const invalidImageResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/ai/health-file-bridge") && response.request().method() === "POST"
  );
  await page.getByTestId("d05-start-parse").click();
  const invalidImageResult = await invalidImageResponse;
  expect(invalidImageResult.status()).toBe(503);
  expect((await invalidImageResult.json()).code).toBe("provider_unavailable");
  await expect(page.getByTestId("d05-health-history")).toContainText(imageFailureName, { timeout: 30_000 });
  await expect(page.getByTestId("d05-health-history")).toContainText("解析失败");
  await captureE05(page, "e05-04-provider-unavailable-no-fake-success.png");

  const asrMissingEnv = await page.request.post("/api/ai/voice-asr", {
    multipart: {
      audio: {
        name: "e05-audio-only.webm",
        mimeType: "audio/webm",
        buffer: Buffer.from("not-a-real-audio-file"),
      },
      scene: "e05-asr-missing-env",
    },
  });
  expect(asrMissingEnv.status()).toBe(503);
  expect((await asrMissingEnv.json()).code).toBe("provider_unavailable");

  const teacherUnderstandMissingEnv = await page.request.post("/api/ai/teacher-voice-understand", {
    multipart: {
      audio: {
        name: "e05-teacher-audio-only.webm",
        mimeType: "audio/webm",
        buffer: Buffer.from("not-a-real-audio-file"),
      },
      scene: "e05-teacher-understand-missing-env",
    },
  });
  expect(teacherUnderstandMissingEnv.ok()).toBe(false);
  await captureE05(page, "e05-05-asr-missing-env-no-fake-success.png");
});
