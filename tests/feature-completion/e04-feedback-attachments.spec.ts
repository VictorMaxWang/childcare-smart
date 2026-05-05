import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { loginAs } from "./helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E04");

async function ensureArtifacts() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

async function writeFixtureFiles() {
  await ensureArtifacts();
  const token = Date.now();
  const imagePath = path.join(ARTIFACT_DIR, `fixture-feedback-image-${token}.png`);
  const audioPath = path.join(ARTIFACT_DIR, `fixture-teacher-audio-${token}.wav`);
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  const wavHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  await fs.writeFile(imagePath, tinyPng);
  await fs.writeFile(audioPath, wavHeader);
  return {
    imagePath,
    audioPath,
    imageFileName: path.basename(imagePath),
    imageDataUrl: `data:image/png;base64,${tinyPng.toString("base64")}`,
  };
}

async function screenshot(page: import("@playwright/test").Page, fileName: string) {
  await ensureArtifacts();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, fileName), fullPage: true });
}

test("E04 feedback details and scoped media attachments close the parent-teacher-director loop", async ({ page }) => {
  const { imagePath, audioPath, imageFileName, imageDataUrl } = await writeFixtureFiles();

  await loginAs(page, "u-parent", "/parent/agent?child=c-1");
  const parentMessagePicker = page.locator("[data-testid='parent-communication-panel'] [data-testid='attachment-media-picker']");
  await parentMessagePicker.locator("input[type='file']").first().setInputFiles(imagePath);
  await expect(parentMessagePicker).toContainText(imageFileName);

  const feedbackResponse = await page.request.post("/api/feedback", {
    data: {
      childId: "c-1",
      executionStatus: "completed",
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "slight_improvement",
      barriers: [],
      notes: "E04 林妈妈反馈：孩子完成绘本阅读，并补充一张图片。",
      content: "E04 林妈妈反馈：孩子完成绘本阅读，并补充一张图片。",
      sourceChannel: "parent-agent",
    },
  });
  expect(feedbackResponse.ok()).toBeTruthy();
  const feedbackPayload = await feedbackResponse.json();
  const feedbackId = feedbackPayload.data.feedback.feedbackId as string;

  const attachmentResponse = await page.request.post("/api/attachments", {
    data: {
      childId: "c-1",
      relatedType: "feedback",
      relatedId: feedbackId,
      kind: "image",
      fileName: "e04-parent-feedback.png",
      mimeType: "image/png",
      byteSize: 68,
      localPreviewUrl: imageDataUrl,
    },
  });
  expect(attachmentResponse.ok()).toBeTruthy();
  const attachmentPayload = await attachmentResponse.json();
  const parentAttachmentId = attachmentPayload.data.attachmentId as string;

  await page.reload();
  await expect(page.getByTestId("parent-feedback-detail-list")).toBeVisible();
  const parentDetailButton = page.locator(`[data-testid="parent-open-feedback-detail"][data-feedback-id="${feedbackId}"]`);
  await expect(parentDetailButton).toBeEnabled();
  await parentDetailButton.click();
  await expect(page.getByTestId("feedback-detail-dialog")).toBeVisible();
  await expect(page.getByTestId("feedback-detail-dialog")).toContainText("e04-parent-feedback.png");
  await screenshot(page, "parent-feedback-detail.png");

  await page.keyboard.press("Escape");
  await page.getByTestId("parent-message-input").fill("E04 林妈妈发送一条带图片附件的家园消息。");
  await page.getByTestId("parent-send-message").click();
  await expect(page.getByTestId("parent-communication-panel")).toContainText("E01 API 已保存");
  await page.reload();
  await expect(page.getByTestId("parent-message-list")).toContainText("E04 林妈妈发送一条带图片附件");
  await screenshot(page, "parent-message-attachment-after-refresh.png");

  await loginAs(page, "u-teacher", "/teacher/agent?action=communication");
  await expect(page.getByTestId("communication-thread-card").first()).toBeVisible();
  const teacherDetailButton = page.locator(`[data-testid="teacher-open-feedback-detail"][data-feedback-id="${feedbackId}"]`).first();
  await expect(teacherDetailButton).toBeEnabled();
  await teacherDetailButton.click();
  await expect(page.getByTestId("feedback-detail-dialog")).toBeVisible();
  await expect(page.getByTestId("feedback-detail-dialog")).toContainText("e04-parent-feedback.png");
  await screenshot(page, "teacher-feedback-detail.png");
  await page.keyboard.press("Escape");

  await page.getByTestId("communication-thread-card").first().getByRole("button").first().click();
  await page.getByTestId("teacher-reply-input").fill("E04 李老师回复：已查看图片，语音附件同步给家长。");
  await page.getByTestId("communication-thread-card").first().locator("input[type='file']").first().setInputFiles(audioPath);
  await page.getByTestId("teacher-send-reply").click();
  await screenshot(page, "teacher-reply-audio.png");

  await loginAs(page, "u-parent", "/parent/agent?child=c-1");
  await expect(page.getByTestId("parent-message-list")).toContainText("E04 李老师回复");
  await expect(page.locator("audio").first()).toBeVisible();
  await screenshot(page, "parent-sees-teacher-audio.png");

  await loginAs(page, "u-admin", "/admin");
  await expect(page.getByTestId("admin-open-feedback-detail")).toBeEnabled();
  await page.getByTestId("admin-open-feedback-detail").click();
  await expect(page.getByTestId("feedback-detail-dialog")).toBeVisible();
  await page.getByTestId("feedback-status-select").selectOption("resolved");
  await page.getByTestId("feedback-status-save").click();
  await expect(page.getByTestId("feedback-detail-dialog")).toContainText("状态已保存");
  await screenshot(page, "admin-feedback-status-resolved.png");

  await loginAs(page, "u-teacher2", "/teacher/agent?action=communication");
  const forbiddenDetail = await page.request.get(`/api/attachments/${parentAttachmentId}`);
  expect(forbiddenDetail.status()).toBe(403);
  const forbiddenContent = await page.request.get(`/api/attachments/${parentAttachmentId}/content`);
  expect(forbiddenContent.status()).toBe(403);
});
