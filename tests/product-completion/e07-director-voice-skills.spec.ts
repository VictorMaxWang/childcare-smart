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
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-demo-account-id": accountId,
    },
  });
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
      const feedback = await planVoiceCommand(director, "查看未处理反馈");
      expect(feedback.intent).toBe("query_director_feedback");
      expect(feedback.status).toBe("ready");

      const risk = await planVoiceCommand(director, "今天有多少异常晨检");
      expect(risk.intent).toBe("query_director_risk");
      expect(risk.status).toBe("ready");

      const trend = await planVoiceCommand(director, "本周饮食记录趋势怎么样");
      expect(trend.intent).toBe("query_director_trend");
      expect(trend.status).toBe("ready");

      const weeklyBefore = await expectOk(await director.get("/api/weekly-reports"));
      const weeklyCommand = await planVoiceCommand(director, "生成本周周报");
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

      const parentForbidden = await planVoiceCommand(parent, "查看未处理反馈", "/parent");
      expect(parentForbidden.status).toBe("forbidden");
      const teacherForbidden = await planVoiceCommand(teacher, "给李老师派单，跟进小明晨检异常", "/teacher");
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

      await submitVoiceText(page, "查看未处理反馈");
      await expect(page.getByTestId("voice-orb-result")).toContainText(/未处理反馈|没有未处理反馈/);
      await captureE07(page, "01-director-unhandled-feedback.png");

      await submitVoiceText(page, "生成本周周报", true);
      await expect(page.getByTestId("voice-orb-result")).toContainText(/周报/);
      const reportsAfterGenerate = await expectOk(await director.get("/api/weekly-reports"));
      expect(reportsAfterGenerate.length).toBeGreaterThan(0);
      const latestReportId = reportsAfterGenerate[0].reportId;
      await captureE07(page, "02-director-weekly-report-generated.png");

      await page.reload();
      const reportsAfterReload = await expectOk(await director.get("/api/weekly-reports"));
      expect(reportsAfterReload.some((report: { reportId?: string }) => report.reportId === latestReportId)).toBe(true);
      await captureE07(page, "03-weekly-report-persisted-after-refresh.png");

      await openVoiceOrb(page);
      await submitVoiceText(page, `给李老师派单，跟进小明晨检异常 ${token}`, true);
      await expect(page.getByTestId("voice-orb-result")).toContainText(/已给|派单/);
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
      await submitVoiceText(page, "查看本周运营报表");
      await expect(page.getByTestId("voice-orb-result")).toContainText(/派单|儿童|反馈|会诊/);
      await captureE07(page, "06-director-sees-assignment-closure.png");

      await page.getByTestId("voice-orb-input").fill("导出本周周报");
      await page.getByTestId("voice-orb-submit").click();
      await expect(page.getByTestId("voice-orb-confirm")).toBeVisible();
      const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
      await page.getByTestId("voice-orb-confirm").click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(latestReportId);
      await captureE07(page, "07-director-weekly-report-exported.png");

      await submitVoiceText(page, "分享本周周报", true);
      await expect(page.getByTestId("voice-orb-share-text")).toContainText(latestReportId);
      await captureE07(page, "08-director-weekly-report-shared.png");

      await submitVoiceText(page, "打开教师管理");
      await expect(page).toHaveURL(/\/admin\/teachers/);
      await captureE07(page, "09-director-open-teacher-management.png");

      await loginAs(page, "u-parent", "/parent?child=c-4");
      await openVoiceOrb(page);
      await submitVoiceText(page, "查看未处理反馈");
      await expect(page.getByTestId("voice-orb-error")).toContainText(/不能执行|不能|无权|角色/);
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
          data: { childId: "c-4", title: `E07 反馈 ${token}`, content: `E07 待处理反馈 ${token}` },
        }),
        201
      );
      const feedbackId = createdFeedback.feedback?.feedbackId ?? createdFeedback.feedback?.id;
      expect(feedbackId).toBeTruthy();

      const command = await planVoiceCommand(director, "把这条反馈标记为已处理", "/admin", { feedbackId });
      expect(command.status).toBe("needs_confirmation");
      await executeVoiceCommand(director, "把这条反馈标记为已处理", "/admin", { feedbackId });
      const detail = await expectOk(await director.get(`/api/feedback/${feedbackId}`));
      expect(detail.feedback.status).toBe("resolved");
    } finally {
      await director.dispose();
    }
  });
});
