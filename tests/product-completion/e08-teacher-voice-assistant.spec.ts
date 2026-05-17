import { expect, request as playwrightRequest, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { loginAs, resetDemoStorage } from "../feature-completion/helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E08");
const CHILD_ID = "c-4";

async function captureE08(page: Page, fileName: string) {
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

async function expectApiFailure(response: Awaited<ReturnType<APIRequestContext["get"]>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  return body;
}

async function planVoiceCommand(
  api: APIRequestContext,
  text: string,
  objects: Record<string, string | undefined> = {}
) {
  const command = await expectOk(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "plan",
        utterance: { text, inputMode: "text", transcriptSource: "playwright-e08" },
        context: { currentPath: "/teacher", objects },
      },
    })
  );
  return command.command;
}

async function executeVoiceCommand(
  api: APIRequestContext,
  text: string,
  objects: Record<string, string | undefined> = {}
) {
  const command = await planVoiceCommand(api, text, objects);
  const result = await expectOk(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "execute",
        command,
        confirmed: true,
        context: { currentPath: "/teacher", objects },
      },
    })
  );
  return result;
}

test.describe.configure({ mode: "serial" });

test.describe("E08 teacher voice assistant skills", () => {
  test("teacher voice commands persist through E01 API and are parent/director visible", async ({}, testInfo) => {
    const teacher = await demoContext(testInfo, "u-teacher");
    const parent = await demoContext(testInfo, "u-parent");
    const director = await demoContext(testInfo, "u-admin");
    const token = `E08-${Date.now()}`;

    try {
      const morning = await planVoiceCommand(teacher, `给小明记录晨检，体温三十六点八，状态正常 ${token}`);
      expect(morning.intent).toBe("create_morning_check");
      expect(morning.status).toBe("needs_confirmation");
      await executeVoiceCommand(teacher, `给小明记录晨检，体温三十六点八，状态正常 ${token}`);

      const teacherHealth = await expectOk(await teacher.get(`/api/records?type=health&childId=${CHILD_ID}&includeArchived=1`));
      expect(teacherHealth.some((record: { childId?: string; temperature?: number; remark?: string }) =>
        record.childId === CHILD_ID && record.temperature === 36.8 && record.remark?.includes(token)
      )).toBe(true);
      const parentHealth = await expectOk(await parent.get(`/api/records?type=health&childId=${CHILD_ID}&includeArchived=1`));
      expect(parentHealth.some((record: { remark?: string }) => record.remark?.includes(token))).toBe(true);

      await executeVoiceCommand(teacher, `记录小明午餐吃完了 ${token}`);
      const mealRecords = await expectOk(await teacher.get(`/api/records?type=meal&childId=${CHILD_ID}&includeArchived=1`));
      expect(mealRecords.some((record: { childId?: string; meal?: string }) => record.childId === CHILD_ID && record.meal === "午餐")).toBe(true);

      await executeVoiceCommand(teacher, `给小明新增成长记录，今天会自己穿鞋 ${token}`);
      const parentGrowth = await expectOk(await parent.get(`/api/records?type=growth&childId=${CHILD_ID}&includeArchived=1`));
      expect(parentGrowth.some((record: { description?: string }) => record.description?.includes(token))).toBe(true);

      await executeVoiceCommand(teacher, `回复林妈妈，今天小明午睡很好 ${token}`);
      const parentMessages = await expectOk(await parent.get(`/api/messages?childId=${CHILD_ID}`));
      expect(parentMessages.some((message: { senderRole?: string; content?: string }) =>
        message.senderRole === "teacher" && message.content?.includes(token)
      )).toBe(true);

      await executeVoiceCommand(teacher, `给小明创建健康材料解析任务 ${token}`);
      const healthMaterials = await expectOk(await teacher.get(`/api/health-materials?childId=${CHILD_ID}`));
      expect(healthMaterials.some((material: { childId?: string; description?: string; parseStatus?: string }) =>
        material.childId === CHILD_ID && material.description?.includes(token) && material.parseStatus === "pending"
      )).toBe(true);

      const consultationResult = await executeVoiceCommand(teacher, `给小明创建高风险会诊 ${token}`);
      const consultationId = consultationResult.refs?.consultationId ?? consultationResult.data?.consultationId;
      expect(consultationId).toBeTruthy();

      await executeVoiceCommand(teacher, "把这个派单标记为跟进中", { consultationId });
      let directorConsultations = await expectOk(await director.get(`/api/consultations?childId=${CHILD_ID}`));
      expect(directorConsultations.some((item: { consultationId?: string; workflowStatus?: string }) =>
        item.consultationId === consultationId && item.workflowStatus === "in-progress"
      )).toBe(true);

      await executeVoiceCommand(teacher, "把这个派单标记为已完成", { consultationId });
      directorConsultations = await expectOk(await director.get(`/api/consultations?childId=${CHILD_ID}`));
      expect(directorConsultations.some((item: { consultationId?: string; workflowStatus?: string; status?: string }) =>
        item.consultationId === consultationId && item.workflowStatus === "resolved" && item.status === "resolved"
      )).toBe(true);
    } finally {
      await teacher.dispose();
      await parent.dispose();
      await director.dispose();
    }
  });

  test("cross-class teacher voice command is forbidden and does not write", async ({}, testInfo) => {
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const teacher = await demoContext(testInfo, "u-teacher");
    const token = `E08-denied-${Date.now()}`;

    try {
      const command = await planVoiceCommand(teacher2, `给小明记录晨检，体温三十六点八，状态正常 ${token}`);
      expect(command.intent).toBe("create_morning_check");
      expect(command.status).toBe("forbidden");

      await expectApiFailure(
        await teacher2.post("/api/voice-assistant/commands", {
          data: { action: "execute", command, confirmed: true },
        }),
        403,
        "forbidden_scope"
      );

      const records = await expectOk(await teacher.get(`/api/records?type=health&childId=${CHILD_ID}&includeArchived=1`));
      expect(records.some((record: { remark?: string }) => record.remark?.includes(token))).toBe(false);
    } finally {
      await teacher2.dispose();
      await teacher.dispose();
    }
  });

  test("teacher uses VoiceOrb text fallback for record and navigation", async ({ page }) => {
    const token = `E08-ui-${Date.now()}`;
    await resetDemoStorage(page);
    await loginAs(page, "u-teacher", "/teacher");
    await expect(page.getByTestId("r06-teacher-voice-button")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveCount(0);
    await page.getByTestId("r06-teacher-command-assistant").click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await page.getByTestId("voice-orb-input").fill(`给小明记录晨检，体温三十六点八，状态正常 ${token}`);
    await page.getByTestId("voice-orb-submit").click();
    await expect(page.getByTestId("voice-orb-confirm")).toBeVisible();
    await captureE08(page, "teacher-voice-morning-check-preview.png");
    await page.getByTestId("voice-orb-confirm").click();
    await expect(page.getByTestId("voice-orb-result")).toContainText(/晨检|保存|记录/, { timeout: 20_000 });
    await captureE08(page, "teacher-voice-morning-check-executed.png");

    await page.reload();
    await expect(page.getByTestId("voice-orb-button")).toHaveCount(0);
    await page.getByTestId("r06-teacher-command-assistant").click();
    await page.getByTestId("voice-orb-input").fill("打开家园沟通");
    await page.getByTestId("voice-orb-submit").click();
    await expect(page).toHaveURL(/\/teacher\/agent/);
    await captureE08(page, "teacher-voice-open-communication.png");

    await page.goto("/teacher");
    await page.getByTestId("r06-teacher-command-assistant").click();
    await page.getByTestId("voice-orb-input").fill("打开健康材料解析");
    await page.getByTestId("voice-orb-submit").click();
    await expect(page).toHaveURL(/\/teacher\/health-file-bridge/);
    await captureE08(page, "teacher-voice-open-health-file-bridge.png");
  });

  test("mobile VoiceOrb stays above primary bottom actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-teacher", "/teacher");
    await expect(page.getByTestId("voice-orb-button")).toHaveCount(0);
    const orb = page.getByTestId("r06-teacher-voice-button");
    await expect(orb).toBeVisible();
    const box = await orb.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844 - 48);
    await page.getByTestId("r06-teacher-command-assistant").click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await captureE08(page, "teacher-mobile-voice-orb.png");
  });
});
