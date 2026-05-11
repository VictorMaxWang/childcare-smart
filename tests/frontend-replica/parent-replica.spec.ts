import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { loginAs } from "../feature-completion/helpers";
import {
  LIN_XIAOYU_FIXED_STORYBOOK_PAGES,
  LIN_XIAOYU_FIXED_STORYBOOK_TITLE,
} from "../../lib/storybooks/lin-xiaoyu-bravery";

const CARE_MODE_STORAGE_KEY = "smartchildcare.parent.care-mode";
const CHILD_ID = "c-1";

type PageGuards = {
  consoleErrors: string[];
  forbiddenUrls: string[];
  notFoundUrls: string[];
};

function installPageGuards(page: Page): PageGuards {
  const guards: PageGuards = { consoleErrors: [], forbiddenUrls: [], notFoundUrls: [] };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (
      /favicon|ResizeObserver loop|provider-status|audio|NotSupportedError|play\(\)|net::ERR_CONNECTION_RESET|Failed to load resource: the server responded with a status of 40[13]/i.test(
        text
      )
    ) {
      return;
    }
    guards.consoleErrors.push(text);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (
      /favicon|provider-status|parent-trend-query|follow-up|suggestions|lin-xiaoyu\/tts|storybooks\/lin-xiaoyu\/audio/i.test(
        url
      )
    ) {
      return;
    }
    if (response.status() === 404) guards.notFoundUrls.push(url);
    if (response.status() === 403) guards.forbiddenUrls.push(url);
  });

  return guards;
}

async function loginParent(page: Page, route: string) {
  await page.goto("/login");
  await page.evaluate((key) => window.localStorage.setItem(key, "0"), CARE_MODE_STORAGE_KEY);
  await loginAs(page, "u-parent", route);
  await page.evaluate((key) => window.localStorage.setItem(key, "0"), CARE_MODE_STORAGE_KEY);
}

async function expectParentShell(page: Page) {
  await expect(page.getByTestId("r02-app-shell")).toHaveAttribute("data-role-shell", "parent");
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
}

async function expectNoPageProblems(page: Page, guards: PageGuards) {
  await page.waitForLoadState("networkidle");
  expect(guards.notFoundUrls, "no page asset/api 404").toEqual([]);
  expect(guards.forbiddenUrls, "no unexpected 403 responses").toEqual([]);
  expect(guards.consoleErrors, "no browser console errors").toEqual([]);
}

async function expectLoadedDemoImage(page: Page, selector: string) {
  await expect
    .poll(
      async () =>
        page.locator(selector).evaluateAll((images) =>
          images.filter((node) => {
            const image = node as HTMLImageElement;
            return (
              (image.currentSrc.includes("/demo-media/") || image.src.includes("/demo-media/")) &&
              image.naturalWidth > 0 &&
              image.naturalHeight > 0
            );
          }).length
        ),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);
}

test.describe("FRONTEND-REPLICA-R07 parent replica", () => {
  test("parent dashboard keeps Lin Mom scope, child status, trends, media, AI entry, and voice orb", async ({ page }) => {
    const guards = installPageGuards(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await loginParent(page, `/parent?child=${CHILD_ID}`);

    await expectParentShell(page);
    await expect(page.getByTestId("r07-parent-page")).toBeVisible();
    await expect(page.getByTestId("r07-parent-replica-page")).toHaveAttribute("data-child-name", /林小雨/);
    await expect(page.getByTestId("r07-parent-status-card")).toHaveCount(5);
    await expect(page.locator('[data-testid="r07-parent-status-card"][data-status-id="meal"]')).toBeVisible();
    await expect(page.locator('[data-testid="r07-parent-status-card"][data-status-id="temp"]')).toBeVisible();
    await expect(page.locator('[data-testid="r07-parent-status-card"][data-status-id="activity"]')).toBeVisible();
    await expect(page.getByTestId("r07-parent-ai-tonight-card")).toBeVisible();
    await expect(page.getByTestId("r07-parent-reminders-summary")).toBeVisible();
    await expect(page.getByTestId("r07-parent-growth-moments")).toBeVisible();
    await expect(page.getByTestId("r03-parent-health-trend")).toBeVisible();
    await expect(page.getByTestId("r03-parent-diet-growth-trend")).toBeVisible();
    await expectLoadedDemoImage(page, "[data-testid='r07-parent-growth-image']");
    await expect(page.locator(`a[href*="/parent/agent?child=${CHILD_ID}"]`).first()).toBeVisible();
    await expect(page.locator(`a[href*="/parent/storybook?child=${CHILD_ID}"]`).first()).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("parent AI assistant exposes provider state, prompt/input/voice controls, trend chart, and degraded state", async ({
    page,
  }) => {
    const guards = installPageGuards(page);

    await page.setViewportSize({ width: 1448, height: 1086 });
    await loginParent(page, `/parent/agent?child=${CHILD_ID}`);

    await expectParentShell(page);
    await expect(page.getByTestId("r07-parent-agent-page")).toBeVisible();
    await expect(page.getByTestId("r04-assistant-workspace").first()).toBeVisible();
    await expect(page.getByTestId("r04-assistant-provider-status").first()).toContainText(
      /provider (ready|degraded|unavailable)|正在读取/i
    );
    await expect(page.getByTestId("r04-prompt-chip").first()).toBeVisible();
    await expect(page.getByTestId("r03-parent-agent-trend")).toBeVisible();

    await page.getByTestId("r04-prompt-chip").first().click();
    await page.getByTestId("r04-assistant-input").first().fill("请用一句话说明今晚先做什么");
    await expect(page.getByTestId("r04-assistant-send").first()).toBeEnabled();
    await page.getByTestId("r04-assistant-send").first().click();
    await expect(page.getByTestId("r04-assistant-conversation").first()).toBeVisible();

    await page.getByTestId("r04-assistant-voice").first().click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("feedback hash keeps structured feedback, attachments, message list, and detail dialog usable", async ({ page }) => {
    const guards = installPageGuards(page);
    const token = `R07 parent feedback ${Date.now()}`;

    await page.setViewportSize({ width: 390, height: 844 });
    await loginParent(page, `/parent/agent?child=${CHILD_ID}#feedback`);

    const feedbackSection = page.getByTestId("r07-parent-agent-feedback-section").first();
    await expect(feedbackSection).toBeVisible();
    await feedbackSection.scrollIntoViewIfNeeded();
    await expect(page.getByTestId("attachment-media-picker").first()).toBeVisible();
    await expect(page.getByTestId("parent-communication-panel")).toBeVisible();

    await page.getByTestId("feedback-execution-completed").click();
    await page.getByTestId("feedback-reaction-accepted-2").click();
    await page.getByTestId("feedback-improvement-slight_improvement-3").click();
    await feedbackSection.locator("textarea").first().fill(token);
    await page.getByTestId("parent-submit-structured-feedback").click();

    await expect(page.getByTestId("parent-message-list")).toContainText(token, { timeout: 30_000 });
    await expect(page.getByTestId("parent-feedback-detail-list")).toBeVisible();
    await page.getByTestId("parent-open-feedback-detail").first().click();
    await expect(page.getByTestId("feedback-detail-dialog")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("fixed Lin Xiaoyu storybook keeps title, real images, alias route, and narration controls", async ({ page }) => {
    const guards = installPageGuards(page);

    await page.setViewportSize({ width: 941, height: 1672 });
    await loginParent(page, `/parent/storybook?child=${CHILD_ID}`);

    await expectParentShell(page);
    await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(LIN_XIAOYU_FIXED_STORYBOOK_TITLE);
    await expect(page.getByTestId("lin-xiaoyu-page-text")).toContainText(LIN_XIAOYU_FIXED_STORYBOOK_PAGES[0].text);

    const image = page.locator('[data-testid="lin-xiaoyu-fixed-storybook"] img').first();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", "/demo-media/storybooks/lin-xiaoyu/images/page-01.webp");
    await expectLoadedDemoImage(page, '[data-testid="lin-xiaoyu-fixed-storybook"] img');
    await expect(page.getByTestId("lin-xiaoyu-play-page")).toBeVisible();
    await expect(page.getByTestId("lin-xiaoyu-replay-page")).toBeVisible();
    await expect(page.getByTestId("lin-xiaoyu-play-book")).toBeVisible();

    await page.getByTestId("lin-xiaoyu-next-page").click();
    await expect(page.getByTestId("lin-xiaoyu-page-text")).toContainText(LIN_XIAOYU_FIXED_STORYBOOK_PAGES[1].text);

    const audioPath = path.join(process.cwd(), "public/demo-media/storybooks/lin-xiaoyu/audio/page-01.mp3");
    if (fs.existsSync(audioPath)) {
      const response = await page.request.get("/demo-media/storybooks/lin-xiaoyu/audio/page-01.mp3");
      expect(response.status()).toBe(200);
    } else {
      const response = await page.request.get(
        `/api/storybooks/lin-xiaoyu/tts?childId=${CHILD_ID}&page=1&bypassStatic=1`
      );
      expect([200, 503]).toContain(response.status());
      if (response.status() === 503) {
        const body = await response.json();
        expect(body.ok).toBe(false);
        expect(typeof body.errorKind).toBe("string");
        expect(body.errorKind.length).toBeGreaterThan(0);
      }
    }

    await page.goto("/parent/storybook?child=lin-xiaoyu");
    await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(LIN_XIAOYU_FIXED_STORYBOOK_TITLE);

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("growth archive and reminders use scoped parent data and keep mobile-safe controls", async ({ page }) => {
    const guards = installPageGuards(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await loginParent(page, `/growth?child=${CHILD_ID}`);

    await expectParentShell(page);
    await expect(page.getByTestId("r07-parent-growth-page")).toBeVisible();
    await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
    await expectLoadedDemoImage(page, "[data-testid='growth-record-image']");
    const imagePaths = await page.getByTestId("growth-record-image").evaluateAll((nodes) =>
      nodes
        .map((node) => (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src)
        .filter(Boolean)
    );
    expect(imagePaths.length).toBeGreaterThan(0);
    for (const src of imagePaths) {
      expect(src).toMatch(/\/demo-media\/(gpt-image2\/growth|growth)\//);
      expect(src).not.toMatch(/[A-Z]:\\/);
    }

    await page.goto(`/growth?child=c-3`);
    await expect(page.getByTestId("r07-parent-growth-forbidden")).toBeVisible();

    await page.goto(`/parent/reminders?child=${CHILD_ID}`);
    await expect(page.getByTestId("r07-parent-reminders-page")).toBeVisible();
    const reminderButtons = page.locator('[data-testid^="parent-reminder-mark-read-"]');
    if ((await reminderButtons.count()) > 0) {
      const firstButton = reminderButtons.first();
      await expect(firstButton).toBeVisible();
      if (await firstButton.isEnabled()) {
        await firstButton.click();
        await expect(firstButton).toBeDisabled({ timeout: 15_000 });
      }
    }

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("parent replica routes stay responsive across desktop, tablet, and mobile", async ({ page }) => {
    await loginParent(page, `/parent?child=${CHILD_ID}`);

    const routes = [
      `/parent?child=${CHILD_ID}`,
      `/parent/agent?child=${CHILD_ID}`,
      `/parent/agent?child=${CHILD_ID}#feedback`,
      `/parent/storybook?child=${CHILD_ID}`,
      `/parent/reminders?child=${CHILD_ID}`,
      `/growth?child=${CHILD_ID}`,
    ];
    const viewports = [
      { width: 1448, height: 1086 },
      { width: 1086, height: 1448 },
      { width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route);
        await expectParentShell(page);
        await expect(
          page
            .locator(
              "main, [data-testid='r07-parent-page'], [data-testid='r07-parent-agent-page'], [data-testid='lin-xiaoyu-fixed-storybook'], [data-testid='r07-parent-reminders-page'], [data-testid='r07-parent-growth-page']"
            )
            .first()
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
