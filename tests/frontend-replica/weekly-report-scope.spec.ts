import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";

interface CapturedWeeklyReportPayload {
  role?: string;
  scopeType?: string;
  scopeId?: string;
}

function weeklyReportResponse(role: string) {
  return {
    schemaVersion: "weekly-report.v1",
    role,
    summary: "Scoped weekly report test response.",
    highlights: [],
    risks: [],
    nextWeekActions: [],
    trendPrediction: "stable",
    sections: [],
    disclaimer: "Test response.",
    source: "mock",
  };
}

test("role pages attach a canonical scope to weekly report requests", async ({ page }) => {
  const captured = new Map<string, CapturedWeeklyReportPayload>();

  await page.route("**/api/ai/weekly-report", async (route) => {
    const payload = route.request().postDataJSON() as CapturedWeeklyReportPayload;
    if (payload.role) captured.set(payload.role, payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(weeklyReportResponse(payload.role ?? "parent")),
    });
  });

  await loginAs(page, "u-admin", "/admin");
  await expect
    .poll(() => captured.get("admin"), { timeout: 20_000 })
    .toMatchObject({ role: "admin", scopeType: "institution" });
  expect(captured.get("admin")?.scopeId).toBeTruthy();

  await loginAs(page, "u-teacher", "/teacher/agent");
  await expect
    .poll(() => captured.get("teacher"), { timeout: 20_000 })
    .toMatchObject({ role: "teacher", scopeType: "class" });
  expect(captured.get("teacher")?.scopeId).toBeTruthy();

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect
    .poll(() => captured.get("parent"), { timeout: 20_000 })
    .toMatchObject({ role: "parent", scopeType: "child", scopeId: "c-1" });
});
