import { expect, request as playwrightRequest, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { loginAs } from "../feature-completion/helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E07");

async function captureE07(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, fileName), fullPage: true });
}

async function demoContext(testInfo: TestInfo, accountId: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  const context = await playwrightRequest.newContext({ baseURL });
  const response = await context.post("/api/auth/demo-login", { data: { accountId } });
  expect(response.ok()).toBeTruthy();
  return context;
}

async function expectOk(response: Awaited<ReturnType<APIRequestContext["get"]>>, expectedStatus = 200) {
  expect(response.status()).toBe(expectedStatus);
  const body = await response.json();
  expect(body.ok).toBe(true);
  return body.data;
}

async function expectApiFailure(response: Awaited<ReturnType<APIRequestContext["post"]>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  return body;
}

async function planVoiceCommand(
  api: APIRequestContext,
  text: string,
  currentPath = "/admin",
  objects: Record<string, string | undefined> = {}
) {
  const data = await expectOk(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "plan",
        utterance: { text, inputMode: "text", transcriptSource: "playwright-e07" },
        context: { currentPath, objects },
      },
    })
  );
  return data.command;
}

async function executeVoiceCommand(
  api: APIRequestContext,
  text: string,
  currentPath = "/admin",
  objects: Record<string, string | undefined> = {}
) {
  const command = await planVoiceCommand(api, text, currentPath, objects);
  const data = await expectOk(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "execute",
        command,
        confirmed: true,
        context: { currentPath, objects },
      },
    })
  );
  return data;
}

async function openVoiceOrb(page: Page) {
  await expect(page.getByTestId("voice-orb-button")).toBeVisible();
  await page.getByTestId("voice-orb-button").click();
  await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
}

async function submitVoiceText(page: Page, text: string, confirm = false) {
  await page.getByTestId("voice-orb-input").fill(text);
  await page.getByTestId("voice-orb-submit").click();
  if (confirm) {
    await expect(page.getByTestId("voice-orb-confirm")).toBeVisible();
    await page.getByTestId("voice-orb-confirm").click();
  }
  await expect
    .poll(async () => {
      const resultVisible = await page.getByTestId("voice-orb-result").isVisible().catch(() => false);
      const errorVisible = await page.getByTestId("voice-orb-error").isVisible().catch(() => false);
      return resultVisible || errorVisible;
    }, { timeout: 30_000 })
    .toBe(true);
}

test.describe.configure({ mode: "serial" });

test.describe("E07 director voice assistant skills", () => {
  test("director intents use real API scope and enforce confirmation/permission", async ({}, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const parent = await demoContext(testInfo, "u-parent");

    try {
      const feedback = await planVoiceCommand(director, "pending feedback");
      expect(feedback.intent).toBe("query_director_feedback");
      expect(feedback.status).toBe("ready");

      const risk = await planVoiceCommand(director, "浠婂ぉ鏈夊灏戝紓甯告櫒妫€");
      expect(risk.intent).toBe("query_director_risk");
      expect(risk.status).toBe("ready");

      const trend = await planVoiceCommand(director, "weekly meal trend");
      expect(trend.intent).toBe("query_director_trend");
      expect(trend.status).toBe("ready");

      const weeklyBefore = await expectOk(await director.get("/api/weekly-reports"));
      const weeklyCommand = await planVoiceCommand(director, "鐢熸垚鏈懆鍛ㄦ姤");
      expect(weeklyCommand.status).toBe("needs_confirmation");
      await expectApiFailure(
        await director.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: weeklyCommand, confirmed: false },
        }),
        422,
        "needs_confirmation"
      );
      const weeklyAfterBlocked = await expectOk(await director.get("/api/weekly-reports"));
      expect(weeklyAfterBlocked.length).toBe(weeklyBefore.length);

      const parentForbidden = await planVoiceCommand(parent, "pending feedback", "/parent");
      expect(parentForbidden.status).toBe("forbidden");
      const teacherForbidden = await planVoiceCommand(teacher, "缁欐潕鑰佸笀娲惧崟锛岃窡杩涘皬鏄庢櫒妫€寮傚父", "/teacher");
      expect(teacherForbidden.status).toBe("forbidden");
    } finally {
      await director.dispose();
      await teacher.dispose();
      await parent.dispose();
    }
  });

  test("director VoiceOrb supports feedback, weekly report, assignment, export, share, and navigation", async ({ page }, testInfo) => {
    const token = `E07-${Date.now()}`;
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");

    try {
      await loginAs(page, "u-admin", "/children");
      await openVoiceOrb(page);

      await expect(page.getByTestId("voice-orb-result")).toContainText(/feedback|none|pending/i);
      await captureE07(page, "01-director-unhandled-feedback.png");

      await submitVoiceText(page, "鐢熸垚鏈懆鍛ㄦ姤", true);
      await expect(page.getByTestId("voice-orb-result")).toContainText(/鍛ㄦ姤/);
      const reportsAfterGenerate = await expectOk(await director.get("/api/weekly-reports"));
      expect(reportsAfterGenerate.length).toBeGreaterThan(0);
      const latestReportId = reportsAfterGenerate[0].reportId;
      await captureE07(page, "02-director-weekly-report-generated.png");

      await page.reload();
      const reportsAfterReload = await expectOk(await director.get("/api/weekly-reports"));
      expect(reportsAfterReload.some((report: { reportId?: string }) => report.reportId === latestReportId)).toBe(true);
      await captureE07(page, "03-weekly-report-persisted-after-refresh.png");

      await openVoiceOrb(page);
      await submitVoiceText(page, `缁欐潕鑰佸笀娲惧崟锛岃窡杩涘皬鏄庢櫒妫€寮傚父 ${token}`, true);
      await expect(page.getByTestId("voice-orb-result")).toContainText(/宸茬粰|娲惧崟/);
      const assignments = await expectOk(await director.get("/api/assignments?teacherId=u-teacher"));
      const assignment = assignments.find((item: { description?: string }) => item.description?.includes(token));
      expect(assignment).toBeTruthy();
      await captureE07(page, "04-director-assignment-created.png");

      await page.evaluate(() => window.localStorage.clear());
      await loginAs(page, "u-teacher", "/teacher/agent?childId=c-4");
      await expect(page.getByText(token)).toBeVisible({ timeout: 30_000 });
      await captureE07(page, "05-teacher-assignment-visible.png");
      const assignmentCard = page.getByTestId("teacher-assignment-card").filter({ hasText: token }).first();
      await assignmentCard.getByTestId("teacher-assignment-complete").click();
      await expect
        .poll(async () => {
          const nextAssignments = await expectOk(await teacher.get("/api/assignments?teacherId=u-teacher"));
          return nextAssignments.find((item: { description?: string }) => item.description?.includes(token))?.status;
        })
        .toBe("completed");

      await loginAs(page, "u-admin", "/children");
      await openVoiceOrb(page);
      await submitVoiceText(page, "鏌ョ湅鏈懆杩愯惀鎶ヨ〃");
      await expect(page.getByTestId("voice-orb-result")).toContainText(/娲惧崟|鍎跨|鍙嶉|浼氳瘖/);
      await captureE07(page, "06-director-sees-assignment-closure.png");

      await page.getByTestId("voice-orb-input").fill("瀵煎嚭鏈懆鍛ㄦ姤");
      await page.getByTestId("voice-orb-submit").click();
      await expect(page.getByTestId("voice-orb-confirm")).toBeVisible();
      const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
      await page.getByTestId("voice-orb-confirm").click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(latestReportId);
      await captureE07(page, "07-director-weekly-report-exported.png");

      await submitVoiceText(page, "鍒嗕韩鏈懆鍛ㄦ姤", true);
      await expect(page.getByTestId("voice-orb-share-text")).toContainText(latestReportId);
      await captureE07(page, "08-director-weekly-report-shared.png");

      await submitVoiceText(page, "鎵撳紑鏁欏笀绠＄悊");
      await expect(page).toHaveURL(/\/admin\/teachers/);
      await captureE07(page, "09-director-open-teacher-management.png");

      await loginAs(page, "u-parent", "/parent?child=c-4");
      await openVoiceOrb(page);
      await expect(page.getByTestId("voice-orb-error")).toContainText(/涓嶈兘鎵ц|涓嶈兘|鏃犳潈|瑙掕壊/);
      await captureE07(page, "10-parent-director-command-forbidden.png");
    } finally {
      await director.dispose();
      await teacher.dispose();
    }
  });

  test("director can mark feedback resolved through current feedback context", async ({}, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const token = `E07-feedback-${Date.now()}`;

    try {
      const createdFeedback = await expectOk(
        await director.post("/api/feedback", {
          data: { childId: "c-4", title: `E07 鍙嶉 ${token}`, content: `E07 寰呭鐞嗗弽棣?${token}` },
        }),
        201
      );
      const feedbackId = createdFeedback.feedback?.feedbackId ?? createdFeedback.feedback?.id;
      expect(feedbackId).toBeTruthy();

      const command = await planVoiceCommand(director, "mark feedback resolved", "/admin", { feedbackId });
      expect(command.status).toBe("needs_confirmation");
      await executeVoiceCommand(director, "mark feedback resolved", "/admin", { feedbackId });
      const detail = await expectOk(await director.get(`/api/feedback/${feedbackId}`));
      expect(detail.feedback.status).toBe("resolved");
    } finally {
      await director.dispose();
    }
  });
});
