import { expect, test } from "@playwright/test";
import {
  capture,
  demoContext,
  expectFailure,
  expectOk,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 director dashboard summarizes current API records instead of fixed mock", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const messageToken = `R02-DIRECTOR-MESSAGE-${stamp}`;
  const feedbackToken = `R02-DIRECTOR-FEEDBACK-${stamp}`;
  const reportTitle = `R02 director weekly ${stamp}`;
  const childId = "c-1";

  const parent = await demoContext(testInfo, "u-parent");
  const director = await demoContext(testInfo, "u-admin");
  const teacher = await demoContext(testInfo, "u-teacher");

  try {
    await resetDemoStorage(page);

    await expectOk(
      await parent.post("/api/messages", {
        data: {
          childId,
          content: messageToken,
        },
      }),
      201
    );

    const feedback = await expectOk<{ feedback: { feedbackId: string; childId: string; status?: string } }>(
      await parent.post("/api/feedback", {
        data: {
          childId,
          title: `${feedbackToken} title`,
          content: `${feedbackToken} content`,
          notes: `${feedbackToken} notes`,
          sourceChannel: "r02-director-summary",
        },
      }),
      201
    );
    expect(feedback.feedback.childId).toBe(childId);

    const summary = await expectOk<{
      childCount: number;
      teacherCount: number;
      recent7DayTrend: { series: unknown[] };
      feedbackCount?: number;
    }>(await director.get("/api/analytics/admin/summary"));
    expect(summary.childCount).toBeGreaterThanOrEqual(3);
    expect(summary.teacherCount).toBeGreaterThanOrEqual(2);
    expect(summary.recent7DayTrend.series).toHaveLength(7);

    const trend = await expectOk<{ metric: string; series: unknown[]; dataQuality?: { source?: string } }>(
      await director.get("/api/analytics/trends?timeRange=7d&metric=meal")
    );
    expect(trend.metric).toBe("meal");
    expect(trend.series).toHaveLength(7);
    expect(trend.dataQuality?.source).toBe("app-data-service");

    const patchedFeedback = await expectOk<{ feedback: { feedbackId: string; status?: string } }>(
      await director.patch(`/api/feedback/${feedback.feedback.feedbackId}`, {
        data: { status: "resolved" },
      })
    );
    expect(patchedFeedback.feedback.feedbackId).toBe(feedback.feedback.feedbackId);
    expect(JSON.stringify(patchedFeedback)).toContain("resolved");

    const weekly = await expectOk<{ reportId: string; title: string; status: string; sourceRecordIds?: string[] }>(
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
    expect(weekly.status).toBe("draft");
    expect(weekly.title).toBe(reportTitle);

    const exported = await expectOk<{ content: string; format: string }>(
      await director.get(`/api/weekly-reports/${weekly.reportId}/export?format=markdown`)
    );
    expect(exported.format).toBe("markdown");
    expect(exported.content).toContain(reportTitle);

    const shared = await expectOk<{ status: string; share?: { localText?: string } }>(
      await director.post(`/api/weekly-reports/${weekly.reportId}/share`, { data: {} })
    );
    expect(shared.status).toBe("shared");
    expect(shared.share?.localText).toContain(weekly.reportId);

    await expectFailure(await teacher.get(`/api/weekly-reports/${weekly.reportId}/export?format=json`), 403, "forbidden_scope");
    const archived = await expectOk<{ status: string }>(
      await director.post(`/api/weekly-reports/${weekly.reportId}/archive`, {
        data: { action: "archive" },
      })
    );
    expect(archived.status).toBe("archived");

    await loginAs(page, "u-admin", "/admin");
    await expect(page.getByTestId("admin-api-summary")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("admin-communication-summary")).toContainText(messageToken, { timeout: 20_000 });
    await capture(page, "director-01-admin-summary-api-backed.png");

    await page.goto("/admin/agent?action=weekly-report");
    await expect(page.getByTestId("weekly-history-list")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /查看归档|查看褰掓。/ }).click();
    await expect(page.getByTestId("weekly-history-list")).toContainText(reportTitle, { timeout: 20_000 });
    await capture(page, "director-02-weekly-report-archive-share-export.png");
  } finally {
    await parent.dispose();
    await director.dispose();
    await teacher.dispose();
  }
});
