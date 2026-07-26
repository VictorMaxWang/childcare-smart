import { expect, test } from "@playwright/test";
import {
  loginAs,
  resetDemoStorage,
} from "../feature-completion/helpers";

test.describe("global utility center", () => {
  test.beforeEach(async ({ page }) => {
    await resetDemoStorage(page);
  });

  test("teacher can search scoped data, review notifications, and send a persisted message", async ({ page }) => {
    await loginAs(page, "u-teacher2", "/teacher");

    await page
      .getByTestId("shell-account-menu")
      .locator("summary")
      .click();
    await expect(page.getByTestId("shell-account-menu-panel")).toBeVisible();
    await expect(
      page.getByTestId("shell-account-menu-panel").getByRole("link", {
        name: "角色首页",
      })
    ).toHaveAttribute("href", "/teacher");
    await page
      .getByTestId("shell-account-menu")
      .locator("summary")
      .click();

    await page.getByTestId("global-search-trigger").click();
    await page.getByTestId("global-search-input").fill("陈乐然");
    await expect(page.getByTestId("global-search-results")).toContainText("陈乐然");
    await page.keyboard.press("Escape");

    await page.getByTestId("notification-center-trigger").click();
    await expect(page.getByTestId("notification-center-dialog")).toBeVisible();
    const unreadMessageNotification = page
      .locator(
        "[data-testid='notification-entry'][data-message-notification='true']"
      )
      .first();
    await expect(unreadMessageNotification).toBeVisible();
    const notificationPath = new URL(page.url()).pathname;
    await unreadMessageNotification.click();
    await expect(page.getByTestId("message-center-dialog")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(notificationPath);
    await page.keyboard.press("Escape");

    await page.getByTestId("message-center-trigger").click();
    await expect(page.getByTestId("message-center-dialog")).toBeVisible();
    const scopedThread = page.getByTestId("message-thread").first();
    await expect(scopedThread).toBeVisible();
    const scopedThreadChildId = await scopedThread.getAttribute("data-child-id");
    expect(scopedThreadChildId).toMatch(/^c-/);
    await scopedThread.click();

    const token = `顶部消息中心-${Date.now()}`;
    await page.getByTestId("message-center-input").fill(token);
    const response = page.waitForResponse(
      (item) =>
        item.url().includes("/api/messages") &&
        item.request().method() === "POST" &&
        item.status() === 201
    );
    await page.getByTestId("message-center-send").click();
    await response;
    await expect(page.getByTestId("message-thread-detail")).toContainText(token);

    await page.getByTestId("message-center-new").click();
    await expect(page.getByTestId("message-center-child-select")).toBeVisible();
    const composeChildId = await page
      .getByTestId("message-center-child-select")
      .locator("option")
      .evaluateAll((options) => {
        const values = options.map((option) => (option as HTMLOptionElement).value);
        return values.find((value) => value && value !== "c-1") ?? values[0] ?? "";
      });
    expect(composeChildId).not.toBe("");
    await page.getByTestId("message-center-child-select").selectOption(composeChildId);
    const newThreadToken = `顶部新会话-${Date.now()}`;
    await page.getByTestId("message-center-input").fill(newThreadToken);
    const newThreadResponse = page.waitForResponse(
      (item) =>
        item.url().includes("/api/messages") &&
        item.request().method() === "POST" &&
        item.status() === 201
    );
    await page.getByTestId("message-center-send").click();
    const createdResponse = await newThreadResponse;
    const createdEnvelope = (await createdResponse.json()) as {
      data?: { childId?: string };
    };
    expect(createdEnvelope.data?.childId).toBe(composeChildId);
    await expect(page.getByTestId("message-thread-detail")).toContainText(newThreadToken);

    const persisted = await page.request.get(
      `/api/messages?childId=${encodeURIComponent(scopedThreadChildId ?? "")}`
    );
    expect(persisted.status()).toBe(200);
    expect(await persisted.text()).toContain(token);
  });

  test("parent utilities only expose authorized children", async ({ page }) => {
    await loginAs(page, "u-parent", "/parent?child=c-1");
    await page.getByTestId("global-search-trigger").click();
    await page.getByTestId("global-search-input").fill("林小雨");
    await expect(page.getByTestId("global-search-results")).toContainText("林小雨");

    await page.getByTestId("global-search-input").fill("张晨曦");
    await expect(page.getByTestId("global-search-results")).not.toContainText("张晨曦");
  });

  test("admin high-risk notification preserves the exact consultation context", async ({ page }) => {
    await loginAs(page, "u-admin", "/admin");
    await page.getByTestId("notification-center-trigger").click();

    const notification = page
      .getByTestId("notification-entry")
      .filter({ hasText: "林小雨高风险会诊待处理" })
      .first();
    await expect(notification).toBeVisible();

    await notification.click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === "/admin" &&
        url.searchParams.get("childId") === "c-1" &&
        url.searchParams.get("consultationId") === "consultation-defense-c-1" &&
        url.hash === "#admin-risk-priority-detail"
      );
    });
    await expect(page.locator("#admin-risk-priority-detail")).toBeVisible();
    await expect(page.locator("#admin-risk-priority-detail")).toContainText("林小雨");
  });
});
