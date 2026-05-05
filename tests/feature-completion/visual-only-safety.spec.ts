import { expect, test, type Page } from "@playwright/test";
import type { MobileDraft } from "../../lib/ai/types";
import { filterRemotePersistableMobileDrafts } from "../../lib/mobile/local-draft-cache";
import {
  capture,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 mock and local-only mobile drafts are excluded from remote persistence payload", async ({ page }) => {
  const remoteDraft = buildDraft({
    draftId: "draft-d08-remote",
    persistenceScope: "remote",
    structuredPayload: { source: "teacher-upload" },
  });
  const localScopeDraft = buildDraft({
    draftId: "draft-d08-local-scope",
    persistenceScope: "local",
    structuredPayload: { source: "teacher-demo" },
  });
  const mockSourceDraft = buildDraft({
    draftId: "draft-d08-mock-source",
    persistenceScope: "remote",
    structuredPayload: { source: "mock-voice" },
  });
  const mockUploadDraft = buildDraft({
    draftId: "draft-d08-mock-upload",
    persistenceScope: "remote",
    structuredPayload: { upload: { source: "mock", status: "mocked" } },
  });
  const localFallbackUploadDraft = buildDraft({
    draftId: "draft-e10-local-fallback-upload",
    persistenceScope: "remote",
    structuredPayload: { upload: { source: "local-text-fallback", status: "local_fallback" } },
  });

  expect(
    filterRemotePersistableMobileDrafts([
      remoteDraft,
      localScopeDraft,
      mockSourceDraft,
      mockUploadDraft,
      localFallbackUploadDraft,
    ]).map((draft) => draft.draftId)
  ).toEqual(["draft-d08-remote"]);

  await capture(page, "visual-01-mock-draft-filter-unit.png");
});

test("D08 visual-only actions are disabled or explicitly labeled and demo drafts do not hit remote state", async ({ page }) => {
  const statePutRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/state") && request.method() === "PUT") {
      statePutRequests.push(request.postData() ?? "");
    }
  });

  await resetDemoStorage(page);
  await expect(page.getByTestId("d07-forgot-password-disabled")).toBeDisabled();
  await expect(page.getByTestId("d07-forgot-password-disabled")).toContainText(/暂未开放|鏆傛湭寮€鏀?/);
  await capture(page, "visual-02-login-disabled.png");

  await loginAs(page, "u-admin", "/admin");
  await expect(page.getByTestId("e10-notification-disabled")).toBeDisabled();
  await expect(page.getByTestId("e10-message-disabled")).toBeDisabled();
  await loginAs(page, "u-admin", "/admin/agent");
  await expect(page.locator("body")).toContainText(/周报|weekly|派单|风险|weekly-report/i);
  await capture(page, "visual-03-admin-current-mvp-controls.png");

  await loginAs(page, "u-teacher", "/teacher/agent");
  await page.getByRole("button", { name: /演示语音草稿|婕旂ず璇煶鑽夌/ }).click();
  await page.getByRole("button", { name: /演示 OCR 草稿|婕旂ず OCR 鑽夌/ }).click();
  await expect(page.locator("body")).toContainText(/演示|本地|草稿|婕旂ず|浠呮湰鍦皘鑽夌/);
  await page.waitForTimeout(500);
  expect(statePutRequests).toEqual([]);
  await capture(page, "visual-04-teacher-demo-drafts-local.png");
});

test("D08 login next redirect blocks unauthorized role escalation", async ({ page }) => {
  await page.request.post("/api/auth/logout");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");

  await clickDemoCard(page, 3);
  await page.waitForURL(/\/parent/);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/parent");
  expect(url.searchParams.get("accessDenied")).toBe("1");
  await capture(page, "visual-05-login-next-access-denied.png");
});

async function clickDemoCard(page: Page, index: number) {
  const cards = page.locator('button[class*="demoCard"]');
  await expect.poll(() => cards.count()).toBeGreaterThan(index);
  await cards.nth(index).click();
}

function buildDraft(params: {
  draftId: string;
  persistenceScope: MobileDraft["persistenceScope"];
  structuredPayload?: MobileDraft["structuredPayload"];
}): MobileDraft {
  return {
    draftId: params.draftId,
    childId: "c-1",
    draftType: "voice",
    targetRole: "teacher",
    content: params.draftId,
    structuredPayload: params.structuredPayload,
    persistenceScope: params.persistenceScope,
    syncStatus: "local_pending",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}
