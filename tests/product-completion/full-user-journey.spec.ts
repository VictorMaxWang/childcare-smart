import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";
import {
  CHILD_PARENT,
  CHILD_TEACHER,
  captureE11,
  createWeeklyReport,
  demoContext,
  expectOk,
  seedStorybook,
} from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 full user journey regression", () => {
  test("director, teacher and parent core paths remain usable with Browser Use-equivalent coverage", async ({
    page,
  }, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const parent = await demoContext(testInfo, "u-parent");
    const token = `E11-journey-${Date.now()}`;

    try {
      await loginAs(page, "u-admin", "/admin");
      await expect(page.locator("body")).not.toHaveText("");
      await expect(page.getByTestId("admin-api-summary")).toBeVisible({ timeout: 20_000 });
      await captureE11(page, "journey-director-metrics.png");

      const report = await createWeeklyReport(director, `${token} weekly report`);
      await page.goto("/admin/agent?action=weekly-report");
      await expect(page.getByTestId("weekly-history-list")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("weekly-report-detail")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("body")).toContainText(token);
      await expect(page.getByTestId("weekly-export-markdown")).toBeEnabled();
      await expect(page.getByTestId("weekly-share-report")).toBeEnabled();
      await expectOk(await director.post(`/api/weekly-reports/${report.reportId}/share`, { data: {} }));
      await captureE11(page, "journey-director-weekly-report.png");

      const assignment = await expectOk<{ assignmentId: string }>(
        await director.post("/api/assignments", {
          data: {
            childId: CHILD_TEACHER,
            teacherId: "u-teacher",
            title: `${token} dispatch`,
            description: `${token} dispatch follow up`,
          },
        }),
        201
      );
      await loginAs(page, "u-teacher", `/teacher/agent?childId=${CHILD_TEACHER}`);
      await expect(page.locator("body")).toContainText(token, { timeout: 30_000 });
      await expectOk(
        await teacher.patch(`/api/assignments/${assignment.assignmentId}`, {
          data: { status: "in-progress", completionSummary: `${token} accepted` },
        })
      );
      await captureE11(page, "journey-teacher-assignment.png");

      await expectOk(
        await teacher.post("/api/records", {
          data: { type: "health", childId: CHILD_TEACHER, temperature: 36.8, remark: `${token} health` },
        }),
        201
      );
      await expectOk(
        await teacher.post("/api/records", {
          data: { type: "meal", childId: CHILD_TEACHER, meal: "lunch", intakeLevel: "good", waterMl: 120 },
        }),
        201
      );
      await expectOk(
        await teacher.post("/api/records", {
          data: { type: "growth", childId: CHILD_TEACHER, description: `${token} growth` },
        }),
        201
      );
      await page.goto("/teacher/health-file-bridge");
      await expect(page.getByTestId("d05-health-preview-text")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("d05-health-preview-text").fill(`${token} temperature 38.1 observe tomorrow`);
      await page.getByTestId("d05-start-parse").click();
      await expect(page.getByTestId("d05-parse-result")).toContainText(token, { timeout: 30_000 });
      await captureE11(page, "journey-teacher-health-material.png");

      await expectOk(
        await parent.post("/api/messages", {
          data: { childId: CHILD_PARENT, content: `${token} parent message` },
        }),
        201
      );
      await expectOk(
        await teacher.post("/api/messages", {
          data: { childId: CHILD_PARENT, content: `${token} teacher reply` },
        }),
        201
      );
      await expectOk(
        await parent.post("/api/reminders", {
          data: {
            childId: CHILD_PARENT,
            reminderType: "family-task",
            targetRole: "parent",
            title: `${token} reminder`,
            description: "E11 reminder",
            scheduledAt: "2099-05-03T09:00:00.000Z",
          },
        }),
        201
      );
      await seedStorybook(parent, `storybook-${token}`, CHILD_PARENT);

      await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_PARENT}`);
      await expect(page.locator("body")).toContainText(token, { timeout: 30_000 });
      await captureE11(page, "journey-parent-message-reply.png");

      await page.goto(`/parent/reminders?child=${CHILD_PARENT}`);
      await expect(page.locator("body")).toContainText(token, { timeout: 30_000 });
      await page.goto(`/parent/storybook?child=${CHILD_PARENT}`);
      await expect(page.getByTestId("e10-storybook-export-markdown")).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId("e10-storybook-export-markdown").click();
      await expect(page.getByTestId("e10-storybook-action-status")).toContainText(/export|local|本地|瀵煎嚭/i);
      await page.getByTestId("e10-storybook-share-local").click();
      await expect(page.getByTestId("e10-storybook-action-status")).toContainText(/share|copy|local|分享|复制|本地/i);
      await expect(page.getByTestId("voice-orb-button")).toBeVisible();
      await captureE11(page, "journey-parent-storybook-share-export.png");
    } finally {
      await director.dispose();
      await teacher.dispose();
      await parent.dispose();
    }
  });
});
