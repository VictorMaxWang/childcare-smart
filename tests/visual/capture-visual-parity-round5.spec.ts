import { test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type ViewportName = "desktop" | "tablet" | "mobile";

interface CaptureCase {
  id: string;
  accountId: string;
  route: string;
  reference: string;
  viewports: ViewportName[];
  prepare?: (page: Page) => Promise<void>;
  afterOnly?: boolean;
}

interface CaptureEntry {
  id: string;
  accountId: string;
  route: string;
  reference: string;
  viewport: ViewportName;
  filename: string;
  capturedAt: string;
}

const BASE_URL = (process.env.CAPTURE_BASE_URL ?? "http://localhost:3230").replace(/\/$/, "");
const PHASE = process.env.VISUAL_PARITY_PHASE ?? "current";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "visual-parity", "round5", PHASE);

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

const ADMIN_ACCOUNT_ID = "u-admin";
const TEACHER_ACCOUNT_ID = "u-teacher";
const PARENT_ACCOUNT_ID = "u-parent";

const BUSINESS_CASES: CaptureCase[] = [
  {
    id: "children-table-filter",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/child_records_management_dashboard_interface.png",
    viewports: ["desktop", "tablet", "mobile"],
  },
  {
    id: "children-empty",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/child_records_management_dashboard_interface.png",
    viewports: ["desktop", "mobile"],
    prepare: async (page) => {
      await page.locator("input").first().fill("__no_match_round5__");
      await page.waitForTimeout(300);
    },
  },
  {
    id: "children-add-dialog",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/smart_childcare_platform_admin_dashboard.png",
    viewports: ["desktop", "mobile"],
    prepare: async (page) => {
      await clickFirstVisible(page, [
        page.getByRole("button", { name: /新增|档案|幼儿/i }),
        page.locator("button").filter({ hasText: /新增|档案|幼儿/i }),
      ]);
      await page.waitForTimeout(300);
    },
  },
  {
    id: "children-delete-dialog",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/child_archive_deletion_confirmation_dialog.png",
    viewports: ["desktop"],
    prepare: async (page) => {
      await clickFirstVisible(page, [
        page.getByRole("button", { name: /删除|移除/i }),
        page.locator("button").filter({ hasText: /删除|移除/i }),
      ]);
      await page.waitForTimeout(300);
    },
  },
  {
    id: "teacher-health-list",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/teacher_app_morning_health_check_dashboard.png",
    viewports: ["desktop", "mobile"],
  },
  {
    id: "teacher-health-dialog",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/child_profile_dashboard_in_pastel_tones.png",
    viewports: ["desktop", "mobile"],
    prepare: async (page) => {
      await clickFirstVisible(page, [
        page.locator("button[aria-label*='晨检']").first(),
        page.locator("button").filter({ hasText: /录入|晨检|待检/i }).first(),
      ]);
      await page.waitForTimeout(300);
    },
  },
  {
    id: "teacher-health-empty",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/child_friendly_app_interface_with_locked_content.png",
    viewports: ["mobile"],
    prepare: async (page) => {
      await page.locator("input").first().fill("__no_health_match__");
      await page.waitForTimeout(300);
    },
  },
  {
    id: "teacher-diet-batch-dialog",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/diet",
    reference: "artifacts/refactor-design-assets/images/food_record_batch_confirmation_interface.png",
    viewports: ["desktop"],
    prepare: async (page) => {
      await page.locator('input[placeholder="食物名称"]').first().fill("米饭");
      await page.locator('input[placeholder="摄入量"]').first().fill("半碗");
      await clickFirstVisible(page, [
        page.getByRole("button", { name: /^添加食物$/ }),
        page.locator("button").filter({ hasText: /^添加食物$/ }),
      ]);
      await page.waitForTimeout(200);
      await clickFirstVisible(page, [
        page.getByRole("button", { name: /批量|确认/i }),
        page.locator("button").filter({ hasText: /批量|确认/i }),
      ]);
      await page.waitForTimeout(300);
    },
  },
  {
    id: "parent-health-permission",
    accountId: PARENT_ACCOUNT_ID,
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/health_information_permission_page_ui.png",
    viewports: ["mobile"],
  },
  {
    id: "mobile-drawer",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/teacher",
    reference: "artifacts/refactor-design-assets/images/daycare_admin_app_dashboard_overview.png",
    viewports: ["mobile"],
    prepare: async (page) => {
      await page.locator('[aria-controls="mobile-nav-panel"]').click();
      await page.waitForTimeout(300);
    },
  },
];

const STATE_CASES: CaptureCase[] = [
  ["table-filter", "child_records_management_dashboard_interface.png"],
  ["form-detail", "child_profile_dashboard_in_pastel_tones.png"],
  ["modal", "child_archive_deletion_confirmation_dialog.png"],
  ["drawer", "daycare_admin_app_dashboard_overview.png"],
  ["empty", "child_friendly_app_interface_with_locked_content.png"],
  ["error", "permission_denied_on_childcare_platform.png"],
  ["permission", "health_information_permission_page_ui.png"],
  ["loading", "child_friendly_app_interface_with_locked_content.png"],
].map(([state, image]) => ({
  id: `states-${state}`,
  accountId: ADMIN_ACCOUNT_ID,
  route: `/visual-parity/states?state=${state}`,
  reference: `artifacts/refactor-design-assets/images/${image}`,
  viewports: ["desktop", "mobile"] as ViewportName[],
  afterOnly: true,
}));

const ROUTES = [...BUSINESS_CASES, ...STATE_CASES];

test.describe.configure({ mode: "serial" });
test.setTimeout(22 * 60 * 1000);

test("capture round5 common UI states", async ({ browser }) => {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const entries: CaptureEntry[] = [];

  for (const [accountId, routes] of groupByAccount(ROUTES.filter((item) => !item.afterOnly || PHASE === "after"))) {
    for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
      const routesForViewport = routes.filter((route) => route.viewports.includes(viewportName));
      if (routesForViewport.length === 0) continue;

      const page = await newPage(browser, viewportName);
      await loginWithDemo(page, accountId);

      for (const route of routesForViewport) {
        await gotoStable(page, route.route);
        await route.prepare?.(page);
        await capture(page, route, viewportName, entries);
      }

      await page.context().close();
    }
  }

  await fs.writeFile(path.join(OUTPUT_ROOT, "manifest.json"), JSON.stringify(entries, null, 2), "utf8");
});

function groupByAccount(routes: CaptureCase[]) {
  const groups = new Map<string, CaptureCase[]>();
  for (const route of routes) {
    const current = groups.get(route.accountId) ?? [];
    current.push(route);
    groups.set(route.accountId, current);
  }
  return groups;
}

async function newPage(browser: Browser, viewportName: ViewportName) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewportName],
    locale: "zh-CN",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

async function loginWithDemo(page: Page, accountId: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  const response = await page.request.post(`${BASE_URL}/api/auth/demo-login`, {
    data: { accountId },
  });
  if (!response.ok()) {
    throw new Error(`Demo login failed for ${accountId}: ${response.status()} ${await response.text()}`);
  }

  // next start runs with NODE_ENV=production, so the auth API marks cookies as
  // Secure. Local visual capture uses http://localhost, so mirror the returned
  // token into the browser context without the Secure flag.
  const sessionCookie = response.headers()["set-cookie"]?.match(/ccs_session=([^;]+)/)?.[1];
  if (sessionCookie) {
    await page.context().addCookies([
      {
        name: "ccs_session",
        value: decodeURIComponent(sessionCookie),
        url: BASE_URL,
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
  }
  await settle(page);
}

async function gotoStable(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  if (route !== "/login" && new URL(page.url()).pathname === "/login") {
    throw new Error(`Route ${route} redirected to /login during visual capture.`);
  }
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(900);
}

async function clickFirstVisible(page: Page, locators: ReturnType<Page["locator"]>[]) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        return;
      }
    }
  }
  throw new Error("No visible target found for visual parity capture interaction.");
}

async function capture(page: Page, route: CaptureCase, viewport: ViewportName, entries: CaptureEntry[]) {
  const filename = `${route.id}-${viewport}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_ROOT, filename),
    fullPage: false,
    animations: "disabled",
  });

  entries.push({
    id: route.id,
    accountId: route.accountId,
    route: route.route,
    reference: route.reference,
    viewport,
    filename,
    capturedAt: new Date().toISOString(),
  });
}
