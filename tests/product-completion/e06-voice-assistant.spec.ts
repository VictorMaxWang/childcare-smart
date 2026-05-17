import { expect, request as playwrightRequest, test, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { loginAs } from "../feature-completion/helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E06");
const LIVE_OR_FALLBACK_PROVIDER_STATUS = /vivo provider ready|fallback|missing-env/i;
const ASR_STATUS_VALUES = ["ready", "missing-env", "provider-unavailable", "unsupported"];

async function screenshot(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, fileName), fullPage: true });
}

async function demoRequest(testInfo: TestInfo, accountId?: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: accountId ? { "x-demo-account-id": accountId } : undefined,
  });
}

function weeklyPayload(role: "admin" | "teacher" | "parent") {
  return {
    role,
    snapshot: {
      institutionName: "春芽普惠托育中心",
      periodLabel: "2026-04-27 - 2026-05-03",
      role,
      overview: {
        visibleChildren: 3,
        attendanceRate: 95,
        mealRecordCount: 12,
        healthAbnormalCount: 1,
        pendingReviewCount: 0,
        feedbackCount: 1,
      },
      diet: {
        balancedRate: 80,
        vegetableDays: 4,
        proteinDays: 4,
        hydrationAvg: 600,
      },
      topAttentionChildren: [],
      highlights: ["E06 payload"],
      risks: [],
      nextWeekActions: [],
    },
  };
}

test.describe("E06 voice assistant core framework", () => {
  test("voice and AI APIs keep auth and role guards", async ({}, testInfo) => {
    const anonymous = await demoRequest(testInfo);
    const parent = await demoRequest(testInfo, "u-parent");
    try {
      const plan401 = await anonymous.post("/api/voice-assistant/commands", {
        data: {
          action: "plan",
          utterance: { text: "打开成长档案", inputMode: "text" },
        },
      });
      expect(plan401.status()).toBe(401);

      const provider401 = await anonymous.get("/api/ai/provider-status");
      expect(provider401.status()).toBe(401);

      const provider = await parent.get("/api/ai/provider-status");
      expect(provider.status()).toBe(200);
      const providerBody = await provider.json();
      expect(providerBody.ok).toBe(true);
      expect(ASR_STATUS_VALUES).toContain(providerBody.data.asr.status);
      if (providerBody.data.asr.status === "ready") {
        expect(providerBody.data.asr.isRealProvider).toBe(true);
      }

      const weekly403 = await parent.post("/api/ai/weekly-report", {
        data: weeklyPayload("admin"),
      });
      expect(weekly403.status()).toBe(403);

      const forbiddenExecute = await parent.post("/api/voice-assistant/commands", {
        data: {
          action: "execute",
          confirmed: true,
          command: {
            id: "forged-admin-weekly",
            intent: "generate_weekly_report",
            confidence: 1,
            role: "parent",
            requiredConfirmation: true,
            params: { scopeType: "institution", scopeId: "inst-1" },
            missingParams: [],
            safetyLevel: "write",
            previewText: "forged admin command",
            execute: "weekly_report.generate",
            status: "needs_confirmation",
          },
        },
      });
      expect(forbiddenExecute.status()).toBe(403);

      const forgedWrite = await parent.post("/api/voice-assistant/commands", {
        data: {
          action: "execute",
          confirmed: false,
          command: {
            id: "e10-forged-parent-message",
            intent: "send_message",
            confidence: 1,
            role: "parent",
            requiredConfirmation: false,
            params: { childId: "c-1", content: "E10 forged write should not persist" },
            missingParams: [],
            safetyLevel: "safe",
            previewText: "forged parent message",
            execute: "message.send",
            status: "ready",
          },
          context: {
            currentPath: "/parent?child=c-1",
            currentQuery: { child: "c-1" },
            objects: { childId: "c-1" },
          },
        },
      });
      expect(forgedWrite.status()).toBe(422);
      const forgedWriteBody = await forgedWrite.json();
      expect(forgedWriteBody.code).toBe("needs_confirmation");
      const messagesAfterForgedWrite = await parent.get("/api/messages?childId=c-1");
      expect(messagesAfterForgedWrite.status()).toBe(200);
      expect(JSON.stringify(await messagesAfterForgedWrite.json())).not.toContain("E10 forged write should not persist");

      const forgedApiNavigation = await parent.post("/api/voice-assistant/commands", {
        data: {
          action: "execute",
          confirmed: true,
          command: {
            id: "e10-forged-api-navigation",
            intent: "navigate",
            confidence: 1,
            role: "parent",
            requiredConfirmation: false,
            params: { path: "/api/state" },
            missingParams: [],
            safetyLevel: "safe",
            previewText: "open api route",
            execute: "navigate",
            status: "ready",
            deeplink: "/api/state",
          },
        },
      });
      expect(forgedApiNavigation.status()).toBe(403);
    } finally {
      await anonymous.dispose();
      await parent.dispose();
    }
  });

  test("director sees VoiceOrb, text fallback, provider fallback, and navigation", async ({ page }) => {
    await loginAs(page, "u-admin", "/admin");
    await expect(page.getByTestId("voice-orb-button")).toBeVisible();
    await page.getByTestId("voice-orb-button").click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await expect(page.getByTestId("voice-orb-provider-status")).toContainText(LIVE_OR_FALLBACK_PROVIDER_STATUS);
    await screenshot(page, "director-voice-orb-open.png");

    await page.getByTestId("voice-orb-input").fill("打开教师管理");
    await page.getByTestId("voice-orb-submit").click();
    await expect(page).toHaveURL(/\/admin\/teachers/);
    await screenshot(page, "director-voice-orb-navigation.png");
  });

  test("teacher write command requires confirmation and persists through API", async ({ page }) => {
    await loginAs(page, "u-teacher", "/teacher");
    await expect(page.getByTestId("r06-teacher-voice-button")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveCount(0);
    await page.getByTestId("r06-teacher-command-assistant").click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await page.getByTestId("voice-orb-input").fill("给林小雨记录晨检，体温三十六点八，状态正常");
    await page.getByTestId("voice-orb-submit").click();
    await expect(page.getByTestId("voice-orb-confirm")).toBeVisible();
    await expect(page.getByTestId("voice-orb-plan")).toContainText("林小雨");
    await screenshot(page, "teacher-write-confirmation.png");

    await page.getByTestId("voice-orb-confirm").click();
    await expect(page.getByTestId("voice-orb-result")).toContainText("晨检记录已保存");
    await screenshot(page, "teacher-write-executed.png");
  });

  test("parent sees VoiceOrb and unknown command does not execute", async ({ page }) => {
    await loginAs(page, "u-parent", "/parent?child=c-1");
    await expect(page.getByTestId("voice-orb-button")).toBeVisible();
    await page.getByTestId("voice-orb-button").click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await page.getByTestId("voice-orb-input").fill("帮我做一个不存在的动作");
    await page.getByTestId("voice-orb-submit").click();
    await expect(page.getByTestId("voice-orb-error")).toContainText(/不能理解|暂时/);
    await screenshot(page, "parent-unknown-command.png");
  });

  test("mobile VoiceOrb is above bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", "/parent?child=c-1");
    const orb = page.getByTestId("voice-orb-button");
    await expect(orb).toBeVisible();
    const box = await orb.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844 - 48);
    await orb.click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await screenshot(page, "mobile-parent-voice-orb.png");
  });
});
