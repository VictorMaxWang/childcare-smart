import { expect, test } from "@playwright/test";
import {
  BUCKETS,
  capture,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 director dashboard summarizes current D01 store records instead of fixed mock", async ({ page }) => {
  const stamp = Date.now();
  const messageToken = `D08-DIRECTOR-MESSAGE-${stamp}`;

  await resetDemoStorage(page);

  await loginAs(page, "u-parent", "/parent/agent?child=c-1#feedback");
  await page.getByTestId("parent-message-input").scrollIntoViewIfNeeded();
  await page.getByTestId("parent-message-input").fill(messageToken);
  await page.getByTestId("parent-send-message").click();
  await expect(page.getByTestId("parent-message-list")).toContainText(messageToken);

  await page.reload();
  await expect(page.getByTestId("parent-message-list")).toContainText(messageToken);

  await loginAs(page, "u-admin", "/admin");
  const adminSummary = page.getByTestId("admin-communication-summary");
  await expect(adminSummary).toBeVisible();
  await expect(adminSummary).toContainText(messageToken);
  await capture(page, "director-01-store-summary.png");

  await adminSummary.getByTestId("admin-mark-communication-handled").first().click();
  await expectConversationStatus(page, "closed");

  await page.reload();
  await expect(page.getByTestId("admin-communication-summary")).toContainText(messageToken);
  await expectConversationStatus(page, "closed");
});

async function expectConversationStatus(page: import("@playwright/test").Page, status: string) {
  await expect
    .poll(() =>
      page.evaluate((conversationsKey) => {
        const conversations = JSON.parse(window.localStorage.getItem(conversationsKey) ?? "[]") as Array<{
          conversationId?: string;
          status?: string;
        }>;
        return conversations.find((item) => item.conversationId === "conv-c-1-home-school")?.status ?? null;
      }, BUCKETS.conversations)
    )
    .toBe(status);
}
