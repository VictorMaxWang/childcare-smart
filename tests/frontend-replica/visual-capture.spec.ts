import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type ViewportName = "desktop" | "tablet" | "mobile";

type PageSpec = {
  designId: string;
  specPath: string;
  route: string;
  targetRoute: string;
  role: string;
  priority: string;
  pageType: string;
  viewportName: ViewportName;
  viewportLabel: string;
  imageSize: string;
  fileName: string;
  sourceRelativePath: string;
  accountId: string | null;
  visualEffectiveRoute: string;
  captureState: string;
  stateCorrectionReason: string | null;
};

type PageSpecBase = Omit<PageSpec, "visualEffectiveRoute" | "captureState" | "stateCorrectionReason">;

type CaptureEntry = PageSpec & {
  id: string;
  filename: string;
  outputPath: string;
  capturedAt: string;
  reusedCaptureKey: string;
  ok: true;
};

type CaptureFailure = PageSpec & {
  id: string;
  reason: string;
  capturedAt: string;
  ok: false;
};

const REPO_ROOT = process.cwd();
const PAGE_SPECS_ROOT = path.join(REPO_ROOT, "docs", "frontend-replica", "PAGE_SPECS");
const OUTPUT_ROOT = path.join(REPO_ROOT, "artifacts", "frontend-replica", "current");
const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

test.describe.configure({ mode: "serial" });
test.setTimeout(45 * 60 * 1000);

test("capture frontend replica visual pages", async ({ browser }) => {
  const specs = await readPageSpecs();
  const captureGroups = groupSpecs(specs);
  const entries: CaptureEntry[] = [];
  const failures: CaptureFailure[] = [];

  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  for (const [captureKey, groupSpecsForPage] of captureGroups) {
    const first = groupSpecsForPage[0];
    const capturePath = path.join(OUTPUT_ROOT, `${safeFileName(captureKey)}.__capture.png`);
    let captured = false;
    let failureReason: string | null = null;

    const page = await newPage(browser, first.viewportName);
    try {
      await prepareSession(page, first.accountId);
      await gotoStable(page, first.visualEffectiveRoute);
      await prepareVisualState(page, first);
      await expect(page.locator("body")).not.toHaveText("");
      await page.screenshot({
        path: capturePath,
        fullPage: false,
        animations: "disabled",
      });
      captured = true;
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
    } finally {
      await page.context().close().catch(() => undefined);
    }

    for (const spec of groupSpecsForPage) {
      const filename = `${spec.designId}.png`;
      const outputPath = path.join(OUTPUT_ROOT, filename);
      const capturedAt = new Date().toISOString();

      if (captured) {
        await fs.copyFile(capturePath, outputPath);
        entries.push({
          ...spec,
          id: spec.designId,
          filename,
          outputPath: toPosix(path.relative(REPO_ROOT, outputPath)),
          capturedAt,
          reusedCaptureKey: captureKey,
          ok: true,
        });
      } else {
        failures.push({
          ...spec,
          id: spec.designId,
          reason: failureReason ?? "Unknown capture failure.",
          capturedAt,
          ok: false,
        });
      }
    }

    await fs.rm(capturePath, { force: true }).catch(() => undefined);
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "docs/frontend-replica/PAGE_SPECS",
    viewportPolicy: VIEWPORTS,
    summary: {
      specs: specs.length,
      uniqueCaptures: captureGroups.size,
      captured: entries.length,
      failures: failures.length,
      byPriority: countBy(specs, "priority"),
      byViewport: countBy(specs, "viewportName"),
      byRole: countBy(specs, "role"),
      byVisualEffectiveRoute: countBy(specs, "visualEffectiveRoute"),
      byCaptureState: countBy(specs, "captureState"),
    },
    entries,
    failures,
  };

  await fs.writeFile(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expect(failures, "all PAGE_SPECS should capture").toEqual([]);
});

async function newPage(browser: Browser, viewportName: ViewportName) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewportName],
    locale: "zh-CN",
    deviceScaleFactor: 1,
  });
  if (process.env.FRONTEND_REPLICA_STUB_AI === "1") {
    await installVisualRequestStubs(context);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  return page;
}

async function installVisualRequestStubs(context: Awaited<ReturnType<Browser["newContext"]>>) {
  await context.route(
    /\/api\/ai\/(admin-agent|teacher-agent|parent-agent|weekly-report|suggestions|high-risk-consultation\/feed)(\?|$|\/)/,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "AI provider unavailable during deterministic visual capture.",
          source: "frontend-replica-visual-capture",
        }),
      });
    }
  );
}

async function prepareSession(page: Page, accountId: string | null) {
  await page.context().clearCookies();
  if (!accountId) return;

  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
  });
  if (!response.ok()) {
    throw new Error(`Demo login failed for ${accountId}: ${response.status()} ${await response.text()}`);
  }
}

async function gotoStable(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("body").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(450);

  const current = new URL(page.url());
  if (route !== "/login" && current.pathname === "/login") {
    throw new Error(`Route ${route} redirected to /login during capture.`);
  }

  const frameworkOverlay = page.locator("[data-nextjs-dialog-overlay], nextjs-portal").first();
  if (await frameworkOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
    throw new Error(`Framework error overlay is visible on ${route}.`);
  }
}

async function readPageSpecs() {
  const filenames = (await fs.readdir(PAGE_SPECS_ROOT)).filter((filename) => filename.endsWith(".md")).sort();
  const specs: PageSpec[] = [];

  for (const filename of filenames) {
    const specPath = path.join(PAGE_SPECS_ROOT, filename);
    const raw = await fs.readFile(specPath, "utf8");
    const designId = path.basename(filename, ".md");
    const route = readBacktickField(raw, "Current project route") || readBacktickField(raw, "Target route") || "/";
    const targetRoute = readBacktickField(raw, "Target route") || route;
    const viewportLabel = readPlainField(raw, "Viewport");
    const sourceRelativePath = readBacktickField(raw, "Actual file") || readBacktickField(raw, "Design file");
    const pageType = readPlainField(raw, "Page type");
    const fileName = readBacktickField(raw, "File name");

    const baseSpec = {
      designId,
      specPath: toPosix(path.relative(REPO_ROOT, specPath)),
      route,
      targetRoute,
      role: readPlainField(raw, "Normalized role") || "shared",
      priority: readPlainField(raw, "Priority") || "P2",
      pageType,
      viewportName: normalizeViewport(viewportLabel),
      viewportLabel,
      imageSize: readPlainField(raw, "Image size"),
      fileName,
      sourceRelativePath,
      accountId: resolveAccountId(route),
    };

    const captureState = resolveCaptureState(baseSpec);
    const visualState = resolveVisualEffectiveRoute({ ...baseSpec, captureState });

    specs.push({
      ...baseSpec,
      visualEffectiveRoute: visualState.visualEffectiveRoute,
      captureState: visualState.captureState,
      stateCorrectionReason: visualState.reason,
    });
  }

  return specs;
}

async function prepareVisualState(page: Page, spec: PageSpec) {
  switch (spec.captureState) {
    case "login-register-dialog":
    case "login-register-standard-dialog":
      await clickFirstVisible(page, [
        page.locator('button[class*="registerButton"]').first(),
        page.locator('button[class*="mobileRegisterButton"]').first(),
        page.getByRole("button", { name: /注册|申请|register|娉ㄥ唽|鐢宠/i }).first(),
      ]);
      await waitForDialogOrPanel(page, "dialog");
      break;
    case "children-archive-dialog":
      await page.locator('[data-testid^="e02-child-row-"]').first().waitFor({ state: "visible", timeout: 15_000 });
      await clickFirstVisible(page, [
        page.locator('[data-testid^="e02-archive-child-"]:not([data-testid^="e02-archive-child-mobile-"])'),
        page.locator('[data-testid^="e02-archive-child-mobile-"]'),
      ]);
      await waitForDialogOrPanel(page, "dialog");
      break;
    case "admin-feedback-dialog":
      await clickFirstVisible(page, [
        page.getByTestId("admin-open-feedback-detail"),
        page.getByRole("button", { name: /反馈|详情|follow|detail|鍙嶉|璇︽儏/i }).first(),
      ]);
      await waitForDialogOrPanel(page, "dialog");
      break;
    case "diet-batch-confirm-dialog":
      await prepareDietBatchDialog(page);
      await waitForDialogOrPanel(page, "dialog");
      break;
    case "mobile-menu-open":
    case "mobile-menu-open-compact":
      {
        const menuButton = page.locator('button[aria-controls="mobile-nav-panel"]').first();
        await clickFirstVisible(page, [menuButton]);
        await expect(menuButton).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
      }
      break;
    default:
      break;
  }

  await page.waitForTimeout(spec.captureState === "default" ? 120 : 360);
}

async function prepareDietBatchDialog(page: Page) {
  const bulkEntry = page.getByTestId("r05-diet-bulk-entry");
  if (await bulkEntry.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await bulkEntry.scrollIntoViewIfNeeded();
    await bulkEntry.locator('input[placeholder*="食物"], input[placeholder*="椋熺墿"]').first().fill("米饭");
    await bulkEntry.locator('input[placeholder*="摄入"], input[placeholder*="鎽勫叆"]').first().fill("半碗");
    await bulkEntry.getByRole("button", { name: /^添加食物$|^娣诲姞椋熺墿$/ }).first().click();
    await bulkEntry.getByRole("button", { name: /执行批量录入|批量确认|鎵归噺|纭/i }).first().click();
    return;
  }

  const foodInput = page.locator('input[placeholder*="食物"], input[placeholder*="椋熺墿"]').first();
  const amountInput = page.locator('input[placeholder*="摄入"], input[placeholder*="鎽勫叆"]').first();

  if (await foodInput.isVisible({ timeout: 700 }).catch(() => false)) {
    await foodInput.fill("米饭");
  }
  if (await amountInput.isVisible({ timeout: 700 }).catch(() => false)) {
    await amountInput.fill("半碗");
  }

  await clickFirstVisible(page, [
    page.getByRole("button", { name: /^添加食物$|^娣诲姞椋熺墿$/ }).first(),
    page.locator("button").filter({ hasText: /^添加食物$|^娣诲姞椋熺墿$/ }).first(),
  ]).catch(() => undefined);

  await clickFirstVisible(page, [
    page.getByRole("button", { name: /批量确认|确认录入|鎵归噺|纭/i }).first(),
    page.locator("button").filter({ hasText: /批量确认|确认录入|鎵归噺|纭/i }).first(),
  ]);
}

async function clickFirstVisible(page: Page, locators: Locator[]) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;

    for (let index = 0; index < Math.min(count, 20); index += 1) {
      const candidate = locator.nth(index);
      if (!(await candidate.isVisible({ timeout: 600 }).catch(() => false))) continue;
      await candidate.scrollIntoViewIfNeeded().catch(() => undefined);
      await candidate.click({ timeout: 5_000 });
      return;
    }
  }

  throw new Error(`No visible control found for visual state on ${page.url()}.`);
}

async function waitForDialogOrPanel(page: Page, selector: "dialog" | "#mobile-nav-panel") {
  if (selector === "dialog") {
    await page.getByRole("dialog").first().waitFor({ state: "visible", timeout: 8_000 });
    return;
  }

  await page.locator(selector).waitFor({ state: "visible", timeout: 8_000 });
}

function resolveCaptureState(spec: PageSpecBase) {
  const pageType = spec.pageType.toLowerCase();
  const fileName = spec.fileName.toLowerCase();
  const sourcePath = spec.sourceRelativePath.toLowerCase();
  const text = `${spec.designId} ${pageType} ${fileName} ${sourcePath}`.toLowerCase();
  const isExplicitModal = /\bmodal\b/.test(pageType) || /modal|dialog|popup/.test(fileName);

  if (spec.route === "/login" && isExplicitModal && /registration|register|modal/.test(text)) {
    return "login-register-standard-dialog";
  }

  if (spec.route === "/children" && isExplicitModal && /child_archive|deletion|archive/.test(text)) {
    return "children-archive-dialog";
  }

  if (spec.route === "/diet" && isExplicitModal && /food_record_batch|batch_confirmation/.test(text)) {
    return "diet-batch-confirm-dialog";
  }

  if (spec.route === "/admin" && isExplicitModal && spec.viewportName !== "mobile") {
    return "admin-feedback-dialog";
  }

  const mobileDrawerTargets = new Set([
    "parenting_dashboard_with_childcare_insights.png",
    "smart_childcare_dashboard_ui_design.png",
    "teacher_app_interface_with_childcare_details.png",
    "teacher_platform_dashboard_with_ai_assistant.png",
  ]);

  if (spec.viewportName === "mobile" && (/\bdrawer\b/.test(pageType) || mobileDrawerTargets.has(fileName))) {
    return "mobile-menu-open-compact";
  }

  return "default";
}

function resolveVisualEffectiveRoute(spec: PageSpecBase & { captureState: string }) {
  const fileName = spec.fileName.toLowerCase();
  const sourcePath = spec.sourceRelativePath.toLowerCase();
  const pageType = spec.pageType.toLowerCase();
  const text = `${spec.designId} ${pageType} ${fileName} ${sourcePath}`.toLowerCase();
  const childArchiveTarget =
    /child_archive|archive_child|deletion_confirmation|confirmation_popup|confirmation_dialog|confirmation_di|child_care_platform_dashboard_with_modal/.test(text);
  const dietTarget = /meal|diet|food_record|nutrition_record|餐食|饮食/.test(text);
  const dietBatchTarget = /batch|confirmation|confirm|food_record_batch/.test(text);

  if (spec.route === "/admin" && childArchiveTarget) {
    return {
      visualEffectiveRoute: "/children",
      captureState: "children-archive-dialog",
      reason: "R10 maps child archive confirmation targets from /admin to /children dialog state.",
    };
  }

  if (spec.route === "/children" && dietTarget) {
    return {
      visualEffectiveRoute: "/diet",
      captureState: dietBatchTarget ? "diet-batch-confirm-dialog" : "diet-dashboard",
      reason: "R10 maps meal-management targets from /children to /diet.",
    };
  }

  if (spec.route === "/diet" && dietBatchTarget && spec.captureState !== "diet-batch-confirm-dialog") {
    return {
      visualEffectiveRoute: "/diet",
      captureState: "diet-batch-confirm-dialog",
      reason: "R10 captures diet batch-confirmation targets with the matching dialog open.",
    };
  }

  if (spec.captureState === "login-register-standard-dialog") {
    return {
      visualEffectiveRoute: spec.route,
      captureState: spec.captureState,
      reason: "R10 captures standard account registration state for login registration targets.",
    };
  }

  if (spec.captureState === "mobile-menu-open-compact") {
    if (spec.route.startsWith("/teacher/agent") && /teacher_platform_dashboard|teacher_app_interface/.test(text)) {
      return {
        visualEffectiveRoute: "/teacher",
        captureState: spec.captureState,
        reason: "R10 captures teacher mobile drawer targets against the teacher dashboard shell.",
      };
    }

    return {
      visualEffectiveRoute: spec.route,
      captureState: spec.captureState,
      reason: "R10 captures mobile navigation targets with compact drawer state.",
    };
  }

  return {
    visualEffectiveRoute: spec.route,
    captureState: spec.captureState,
    reason: null,
  };
}

function readBacktickField(raw: string, field: string) {
  return new RegExp(`- ${escapeRegExp(field)}: \`([^\`]+)\``).exec(raw)?.[1]?.trim() ?? "";
}

function readPlainField(raw: string, field: string) {
  return new RegExp(`- ${escapeRegExp(field)}: ([^\\r\\n]+)`).exec(raw)?.[1]?.trim() ?? "";
}

function normalizeViewport(label: string): ViewportName {
  if (/mobile/i.test(label)) return "mobile";
  if (/tablet/i.test(label)) return "tablet";
  return "desktop";
}

function resolveAccountId(route: string) {
  if (route === "/login" || route.startsWith("/login?")) return null;
  if (route.startsWith("/teacher")) return "u-teacher";
  if (route.startsWith("/parent")) return "u-parent";
  return "u-admin";
}

function groupSpecs(specs: PageSpec[]) {
  const groups = new Map<string, PageSpec[]>();
  for (const spec of specs) {
    const key = `${spec.accountId ?? "anonymous"}__${spec.viewportName}__${spec.visualEffectiveRoute}__${spec.captureState}`;
    const current = groups.get(key) ?? [];
    current.push(spec);
    groups.set(key, current);
  }
  return groups;
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "capture";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}
