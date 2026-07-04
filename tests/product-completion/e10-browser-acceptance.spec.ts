import { expect, request as playwrightRequest, test, type APIRequestContext, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { loginAs, resetDemoStorage } from "../feature-completion/helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E10");
const CHILD_ID = "c-1";

async function capture(page: Page, fileName: string) {
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

async function expectOk<T = Record<string, unknown>>(response: APIResponse, status = 200): Promise<T> {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(true);
  return body.data as T;
}

async function expectFailure(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  return body;
}

async function seedStorybook(api: APIRequestContext, storybookId: string) {
  return expectOk(
    await api.post("/api/storybooks", {
      data: {
        storybookId,
        childId: CHILD_ID,
        generatedAt: new Date().toISOString(),
        sourceRecordIds: ["growth-e10"],
        response: {
          storyId: storybookId,
          childId: CHILD_ID,
          title: "E10 local share storybook",
          summary: "E10 verifies local export and local share text.",
          moral: "Small steps should be visible.",
          parentNote: "This MVP does not create a public link or PDF.",
          generatedAt: new Date().toISOString(),
          scenes: [
            {
              sceneIndex: 1,
              sceneTitle: "Local evidence",
              sceneText: "A child completes one routine and the parent keeps a local storybook copy.",
              imageStatus: "ready",
              audioStatus: "preview-only",
              audioScript: "A child completes one routine.",
              voiceStyle: "warm",
              imagePrompt: "child completing a classroom routine",
              highlightSource: "growth",
            },
          ],
        },
      },
    }),
    201
  );
}

test.describe.configure({ mode: "serial" });

test.describe("E10 cleanup acceptance", () => {
  test("weekly report export/share and global disabled entries are explicit", async ({ page }, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const reportTitle = `E10 weekly ${Date.now()}`;
    try {
      await resetDemoStorage(page);
      const providerStatus = await expectOk<{ asr: { status: string }; ocr: { status: string } }>(
        await director.get("/api/ai/provider-status")
      );
      expect(providerStatus.asr.status).toBe("missing-env");

      const report = await expectOk<{ reportId: string; title: string }>(
        await director.post("/api/weekly-reports", {
          data: {
            scopeType: "institution",
            scopeId: "inst-1",
            title: reportTitle,
            periodStart: "2026-04-27",
            periodEnd: "2026-05-03",
          },
        }),
        201
      );
      const exported = await expectOk<{ content: string }>(
        await director.get(`/api/weekly-reports/${report.reportId}/export?format=markdown`)
      );
      expect(exported.content).toContain(reportTitle);
      const shared = await expectOk<{ status: string; share?: { localText?: string } }>(
        await director.post(`/api/weekly-reports/${report.reportId}/share`, { data: {} })
      );
      expect(shared.status).toBe("shared");
      expect(shared.share?.localText).toContain(report.reportId);

      await loginAs(page, "u-admin", "/admin");
      await expect(page.getByTestId("e10-notification-disabled")).toBeDisabled();
      await expect(page.getByTestId("e10-message-disabled")).toBeDisabled();
      await capture(page, "01-admin-provider-status-disabled-nav.png");

      await page.goto("/admin/agent?action=weekly-report");
      await expect(page.getByTestId("weekly-history-list")).toBeVisible();
      await expect(page.getByTestId("weekly-report-detail")).toBeVisible();
      await expect(page.getByTestId("weekly-export-markdown")).toBeEnabled();
      await expect(page.getByTestId("weekly-share-report")).toBeEnabled();
      await capture(page, "02-weekly-report-export-share-enabled.png");
    } finally {
      await director.dispose();
    }
  });

  test("teacher and child CRUD/archive plus assignment closure are API-backed", async ({ page }, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const token = `e10-crud-${Date.now()}`;
    try {
      const child = await expectOk<{ id: string; name: string }>(
        await director.post("/api/children", {
          data: {
            name: `${token}-child`,
            className: "E10 Class",
            guardians: [{ name: "E10 Parent", relation: "parent", phone: "13800000000" }],
            parentUserId: "u-parent",
          },
        }),
        201
      );
      const updatedChild = await expectOk<{ name: string }>(
        await director.patch(`/api/children/${child.id}`, {
          data: { name: `${token}-child-updated`, specialNotes: "E10 edit persists" },
        })
      );
      expect(updatedChild.name).toBe(`${token}-child-updated`);
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/children/${child.id}/archive`, { data: { action: "archive" } })
      )).archivedAt).toBeTruthy();
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/children/${child.id}/archive`, { data: { action: "restore" } })
      )).archivedAt).toBeFalsy();

      const createdTeacher = await expectOk<{ teacherId: string; name: string }>(
        await director.post("/api/teachers", {
          data: { name: `${token}-teacher`, className: "E10 Class" },
        }),
        201
      );
      const updatedTeacher = await expectOk<{ teacherId: string; className?: string }>(
        await director.patch(`/api/teachers/${createdTeacher.teacherId}`, {
          data: { className: "E10 Updated Class" },
        })
      );
      expect(updatedTeacher.teacherId).toBe(createdTeacher.teacherId);
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/teachers/${createdTeacher.teacherId}/archive`, { data: { action: "archive" } })
      )).archivedAt).toBeTruthy();
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/teachers/${createdTeacher.teacherId}/archive`, { data: { action: "restore" } })
      )).archivedAt).toBeFalsy();

      const assignment = await expectOk<{ assignmentId: string; status: string; description: string }>(
        await director.post("/api/assignments", {
          data: {
            childId: "c-4",
            teacherId: "u-teacher",
            title: `E10 assignment ${token}`,
            description: `E10 assignment closure ${token}`,
          },
        }),
        201
      );
      expect(assignment.status).toBe("pending");
      const teacherAssignments = await expectOk<Array<{ assignmentId: string }>>(
        await teacher.get("/api/assignments?teacherId=u-teacher")
      );
      expect(teacherAssignments.some((item) => item.assignmentId === assignment.assignmentId)).toBe(true);
      const closedAssignment = await expectOk<{ status: string }>(
        await teacher.patch(`/api/assignments/${assignment.assignmentId}`, {
          data: { status: "resolved", completionSummary: "E10 closure verified" },
        })
      );
      expect(closedAssignment.status).toBe("completed");

      await loginAs(page, "u-admin", "/admin/teachers");
      await expect(page.locator("body")).toContainText("E10");
      await capture(page, "09-teacher-management-crud-archive.png");

      await loginAs(page, "u-admin", "/children");
      await expect(page.locator("body")).toContainText("E10");
      await capture(page, "11-child-edit-archive-restore.png");
    } finally {
      await director.dispose();
      await teacher.dispose();
    }
  });

  test("feedback attachments and storybook export/share are visible MVP operations", async ({ page }) => {
    await loginAs(page, "u-parent", `/parent?child=${CHILD_ID}`);
    const storybookId = `storybook-e10-${Date.now()}`;
    await seedStorybook(page.request, storybookId);

    await page.goto(`/parent/agent?child=${CHILD_ID}`);
    await expect(page.getByTestId("parent-communication-panel")).toBeVisible();
    await expect(page.getByTestId("parent-communication-panel")).toContainText(/metadata|鏈湴|闄勪欢|鍥剧墖|璇煶/);
    await capture(page, "05-feedback-attachments-metadata-only.png");

    await page.goto(`/parent/storybook?child=${CHILD_ID}`);
    await expect(page.getByTestId("e10-storybook-export-markdown")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("e10-storybook-export-markdown").click();
    await expect(page.getByTestId("e10-storybook-action-status")).toContainText(/鏈湴|瀵煎嚭|external/i);
    await capture(page, "14-storybook-export-local.png");

    await page.getByTestId("e10-storybook-share-local").click();
    await expect(page.getByTestId("e10-storybook-action-status")).toContainText(/鍒嗕韩|澶栭儴|copy|local/i);
    await capture(page, "15-storybook-share-local.png");
  });

  test("provider missing-env and forged voice commands do not fake success", async ({ page }, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");
    try {
      await loginAs(page, "u-teacher", "/teacher");
      const voiceAsr = await page.request.post("/api/ai/voice-asr", {
        multipart: {
          audio: {
            name: "e10-audio-only.webm",
            mimeType: "audio/webm",
            buffer: Buffer.from("not-a-real-audio-file"),
          },
          scene: "e10-asr-missing-env",
        },
      });
      await expectFailure(voiceAsr, 503, "provider_unavailable");

      const teacherVoiceUnderstand = await page.request.post("/api/ai/teacher-voice-understand", {
        multipart: {
          audio: {
            name: "e10-teacher-audio-only.webm",
            mimeType: "audio/webm",
            buffer: Buffer.from("not-a-real-audio-file"),
          },
          scene: "e10-teacher-voice-missing-env",
        },
      });
      await expectFailure(teacherVoiceUnderstand, 503, "provider_unavailable");
      await capture(page, "19-asr-missing-env-no-fake-success.png");

      const forgedWrite = await parent.post("/api/voice-assistant/commands", {
        data: {
          action: "execute",
          confirmed: false,
          command: {
            id: "e10-forged-write",
            intent: "send_message",
            confidence: 1,
            role: "parent",
            requiredConfirmation: false,
            params: { childId: CHILD_ID, content: "E10 forged command should not persist" },
            missingParams: [],
            safetyLevel: "safe",
            previewText: "forged command",
            execute: "message.send",
            status: "ready",
          },
          context: {
            currentPath: `/parent?child=${CHILD_ID}`,
            currentQuery: { child: CHILD_ID },
            objects: { childId: CHILD_ID },
          },
        },
      });
      await expectFailure(forgedWrite, 422, "needs_confirmation");

      const forgedNavigation = await parent.post("/api/voice-assistant/commands", {
        data: {
          action: "execute",
          confirmed: true,
          command: {
            id: "e10-forged-api-route",
            intent: "navigate",
            confidence: 1,
            role: "parent",
            requiredConfirmation: false,
            params: { path: "/api/state" },
            missingParams: [],
            safetyLevel: "safe",
            previewText: "open api",
            execute: "navigate",
            status: "ready",
            deeplink: "/api/state",
          },
        },
      });
      await expectFailure(forgedNavigation, 403, "forbidden_scope");

      await loginAs(page, "u-parent", `/parent?child=${CHILD_ID}`);
      await expect(page.getByTestId("voice-orb-button")).toBeVisible();
      await capture(page, "22-parent-voice-orb-permission.png");
    } finally {
      await parent.dispose();
    }
  });
});
