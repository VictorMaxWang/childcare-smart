import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";

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
    if (/favicon|ResizeObserver loop|provider-status|401 .*Unauthorized/i.test(text)) return;
    guards.consoleErrors.push(text);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (/favicon|provider-status|teacher-agent|high-risk-consultation\/stream/i.test(url)) return;
    if (response.status() === 404) guards.notFoundUrls.push(url);
    if (response.status() === 403) guards.forbiddenUrls.push(url);
  });

  return guards;
}

async function expectNoPageProblems(page: Page, guards: PageGuards) {
  await page.waitForLoadState("networkidle");
  expect(guards.notFoundUrls, "no page asset/api 404").toEqual([]);
  expect(guards.forbiddenUrls, "no unexpected 403 responses").toEqual([]);
  expect(guards.consoleErrors, "no browser console errors").toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
}

async function expectTeacherShell(page: Page) {
  await expect(page.getByTestId("r02-app-shell")).toHaveAttribute("data-role-shell", "teacher");
}

async function expectDemoMediaImage(page: Page, selector: string) {
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

test.describe("FRONTEND-REPLICA-R06 teacher replica", () => {
  test("teacher dashboard keeps design shell, voice orb, and Li/Zhou 18/18 baseline", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-teacher", "/teacher");
    await expectTeacherShell(page);
    await expect(page.getByTestId("r06-teacher-replica-page")).toHaveAttribute("data-visible-children", "18");
    await expect(page.getByTestId("r06-teacher-replica-page")).toContainText("李老师");
    await expect(page.getByTestId("r06-teacher-voice-orb")).toBeVisible();
    await expect(page.getByTestId("r06-teacher-voice-button")).toBeVisible();
    await expect(page.getByTestId("r06-teacher-command-assistant")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveCount(0);

    const liWorkbench = await page.request.get("/api/analytics/teacher-workbench");
    expect(liWorkbench.ok()).toBe(true);
    const liBody = (await liWorkbench.json()) as { ok: boolean; data: { visibleChildCount: number } };
    expect(liBody.ok).toBe(true);
    expect(liBody.data.visibleChildCount).toBe(18);

    await loginAs(page, "u-teacher2", "/teacher");
    await expectTeacherShell(page);
    await expect(page.getByTestId("r06-teacher-replica-page")).toHaveAttribute("data-visible-children", "18");
    await expect(page.getByTestId("r06-teacher-replica-page")).toContainText("周老师");
    await expect(page.locator("body")).not.toContainText("林小雨");
    const zhouWorkbench = await page.request.get("/api/analytics/teacher-workbench");
    expect(zhouWorkbench.ok()).toBe(true);
    const zhouBody = (await zhouWorkbench.json()) as { ok: boolean; data: { visibleChildCount: number } };
    expect(zhouBody.ok).toBe(true);
    expect(zhouBody.data.visibleChildCount).toBe(18);

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("teacher AI assistant and communication mode keep provider state and real reply controls", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-teacher", "/teacher/agent");
    await expectTeacherShell(page);
    await expect(page.getByTestId("r06-teacher-agent-page")).toBeVisible();
    await expect(page.getByTestId("r04-assistant-workspace").first()).toBeVisible();
    await expect(page.getByTestId("r04-assistant-provider-status").first()).toContainText(
      /provider (ready|degraded|unavailable)|正在读取/u
    );
    await expect(page.getByTestId("r04-prompt-chip").first()).toBeVisible();
    await page.getByTestId("r04-assistant-input").first().fill("请总结今天班级待办");
    await expect(page.getByTestId("r04-assistant-send").first()).toBeEnabled({ timeout: 30_000 });

    await page.goto("/teacher/agent?action=communication");
    await expect(page.getByTestId("r06-teacher-agent-page")).toBeVisible();
    await expect(page.getByTestId("communication-thread-card").first()).toBeVisible({ timeout: 20_000 });
    const pendingThread = page.getByTestId("communication-thread-card").filter({ hasText: "待回复" }).first();
    if ((await pendingThread.count()) > 0) {
      await pendingThread.getByRole("button", { name: /回复家长/ }).click();
      await expect(page.getByTestId("teacher-reply-input")).toBeVisible();
      await expect(page.getByTestId("attachment-media-picker")).toBeVisible();
      await expect(page.getByTestId("teacher-send-reply")).toBeVisible();
    }
    await expect(page.getByTestId("teacher-open-feedback-detail").first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("health material parse can save and create a high-risk consultation", async ({ page }) => {
    const guards = installPageGuards(page);
    const stamp = Date.now();
    const filename = `r06-health-note-${stamp}.pdf`;

    await page.goto("/login");
    await page.evaluate(() => window.localStorage.clear());
    await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
    await expectTeacherShell(page);
    await expect(page.getByTestId("r06-health-file-bridge-page")).toBeVisible();
    await page.getByTestId("d05-health-file-input").setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: Buffer.from(`R06 ${stamp} 体温 38.5℃，建议明早复查，今晚继续观察。`),
    });
    await page
      .getByTestId("d05-health-preview-text")
      .fill(`R06 ${stamp}：材料说明包含体温 38.5℃、高风险、明早复查和晚间观察。`);
    await page.getByTestId("d05-start-parse").click();
    await expect(page.getByTestId("d05-parse-result")).toContainText(/结果摘要|本地演示解析|vivo OCR/u, {
      timeout: 30_000,
    });

    await page.getByTestId("d05-save-parse-sheet").click();
    await expect(page.locator("body")).toContainText(/刷新后仍可查看|已保存/u);
    await expect(page.getByTestId("d05-create-consultation-sheet")).toBeEnabled();
    await page.getByTestId("d05-create-consultation-sheet").click();
    await page.waitForURL(/\/teacher\/high-risk-consultation/);
    await expect(page.getByTestId("r06-high-risk-consultation-page")).toBeVisible();
    await expect(page.locator("body")).toContainText(filename);
    await expect(page.getByTestId("d05-consultation-status-pending")).toBeVisible();
    await expect(page.getByTestId("d05-consultation-status-in-progress")).toBeVisible();
    await expect(page.getByTestId("d05-consultation-status-resolved")).toBeVisible();
    await expect(page.getByTestId("d07-follow-up-reminder")).toBeVisible();
    const noteToken = `R06-NOTE-${stamp}`;
    await page.getByTestId("d05-consultation-note-input").fill(noteToken);
    await page.getByTestId("d05-consultation-note-send").click();
    await expect(page.getByTestId("d05-consultation-discussion")).toContainText(noteToken);
    await page.getByTestId("d05-consultation-status-in-progress").click();
    await expect(page.locator("body")).toContainText("会诊状态已更新为 处理中");
    await page.getByTestId("d05-consultation-status-resolved").click();
    await expect(page.locator("body")).toContainText("会诊状态已更新为 已解决");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("high-risk consultation entry keeps setup, discussion, and handoff controls usable", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-teacher", "/teacher/high-risk-consultation?childId=c-1");
    await expectTeacherShell(page);
    await expect(page.getByTestId("r06-high-risk-consultation-page")).toBeVisible();
    await expect(page.getByTestId("d05-consultation-discussion")).toBeVisible();
    await page.getByRole("button", { name: "发起会诊 / 邀请专家" }).click();
    await expect(page.getByTestId("r06-consultation-setup-focus-message")).toContainText("已定位到会诊输入区");
    await expect(page.getByTestId("r06-consultation-start-button")).toBeFocused();
    await expect(page.getByRole("button", { name: /一键生成会诊/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "去沟通" })).toHaveAttribute(
      "href",
      "/teacher/agent?action=communication&childId=c-1"
    );

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("diet and growth pages keep real demo media images", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-teacher", "/diet");
    await expectTeacherShell(page);
    await expect(page.getByTestId("r05-diet-page")).toBeVisible();
    await expect(page.getByTestId("r05-diet-chart-suite")).toBeVisible();
    await expect(page.locator("[data-testid^='meal-card-']").first()).toBeVisible();
    await expectDemoMediaImage(page, "img");

    await page.goto("/growth");
    await expect(page.getByTestId("r05-growth-page")).toBeVisible();
    await expect(page.getByTestId("r05-growth-chart-suite")).toBeVisible();
    await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
    await expectDemoMediaImage(page, "[data-testid='growth-record-image']");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("teacher routes remain responsive across desktop, tablet, and mobile", async ({ page }) => {
    const routes = [
      "/teacher",
      "/teacher/agent",
      "/teacher/agent?action=communication",
      "/teacher/health-file-bridge",
      "/teacher/high-risk-consultation?childId=c-1&consultationId=consultation-c-1",
      "/children",
      "/health",
      "/diet",
      "/growth",
    ];
    const viewports = [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];

    await loginAs(page, "u-teacher", "/teacher");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route);
        await expectTeacherShell(page);
        await expect(
          page
            .locator(
              "main, [data-testid='r06-teacher-replica-page'], [data-testid='r06-teacher-agent-page'], [data-testid='r06-health-file-bridge-page'], [data-testid='r06-high-risk-consultation-page'], [data-testid='r05-health-page'], [data-testid='r05-diet-page'], [data-testid='r05-growth-page'], [data-testid='r05-children-page']"
            )
            .first()
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
