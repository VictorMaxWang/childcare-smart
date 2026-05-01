import { expect, test } from "@playwright/test";
import {
  BUCKETS,
  capture,
  expectChildParam,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
  waitForSharedDemoSeed,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 parent child query survives core routes and mobile viewport", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-parent", "/parent?child=c-1");
  await waitForSharedDemoSeed(page);

  const routes = [
    "/parent/agent?child=c-1#feedback",
    "/growth?child=c-1",
    "/health?child=c-1",
    "/diet?child=c-1",
    "/parent/reminders?child=c-1",
    "/parent/storybook?child=c-1",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("body")).not.toHaveText("");
    await expectChildParam(page, "c-1");
  }

  await page.goto("/parent?child=c-2");
  expect(new URL(page.url()).searchParams.get("child")).toBe("c-2");
  await expect(page.locator("body")).toContainText(/授权|无权限|没有该 childId/);
  await capture(page, "parent-01-invalid-child-no-fallback.png");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes.slice(0, 5)) {
    await page.goto(route);
    await expect(page.locator("body")).not.toHaveText("");
    await expectChildParam(page, "c-1");
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
  }
  await capture(page, "parent-02-mobile-core-routes.png");
});

test("D08 parent storybook demoSeed stays isolated from real provider and remote state", async ({ page }) => {
  const statePutRequests: string[] = [];
  const storybookPayloads: Array<Record<string, unknown>> = [];

  page.on("request", async (request) => {
    if (request.url().includes("/api/state") && request.method() === "PUT") {
      statePutRequests.push(request.postData() ?? "");
    }
    if (request.url().includes("/api/ai/parent-storybook") && request.method() === "POST") {
      storybookPayloads.push((await request.postDataJSON()) as Record<string, unknown>);
    }
  });

  await resetDemoStorage(page);
  await loginAs(page, "u-parent", "/parent?child=c-1");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/ai/parent-storybook") && response.request().method() === "POST"
  );
  await page.goto("/parent/storybook?child=c-1&demoSeed=recording-c1-bedtime");
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["x-smartchildcare-storybook-demo-seed"]).toBe("isolated");

  const payload = (await response.json()) as {
    childId?: string;
    fallbackReason?: string;
    providerMeta?: { transport?: string; realProvider?: boolean; fallbackReason?: string };
  };
  expect(payload.childId).toBe("c-1");
  expect(payload.fallbackReason ?? payload.providerMeta?.fallbackReason).toBe("demo-seed-isolated");
  expect(payload.providerMeta?.transport).toBe("next-json-fallback");
  expect(payload.providerMeta?.realProvider).toBe(false);

  await expect(page.locator("body")).toContainText(/绘本|故事|storybook/i);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key)?.includes("c-1") ?? false, BUCKETS.storybooks))
    .toBe(true);
  await capture(page, "parent-03-storybook-demo-seed-isolated.png");

  expect(storybookPayloads.length).toBeGreaterThan(0);
  expect(storybookPayloads[0]).toMatchObject({
    childId: "c-1",
  });
  expect(String(storybookPayloads[0].requestSource)).toContain("parent-storybook-demo-seed:");
  expect(statePutRequests).toEqual([]);
});
