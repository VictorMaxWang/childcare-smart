import { test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type ViewportName = "desktop" | "mobile";
type KeyPageId = "login" | "admin" | "teacher" | "parent";

interface CaptureEntry {
  id: string;
  page: KeyPageId;
  route: string;
  viewport: ViewportName;
  filename: string;
  capturedAt: string;
  reference: string;
}

const BASE_URL = (process.env.CAPTURE_BASE_URL ?? "http://localhost:3230").replace(/\/$/, "");
const PHASE = process.env.VISUAL_PARITY_PHASE ?? "current";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "visual-parity", PHASE);

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const KEY_PAGES: Array<{
  id: Exclude<KeyPageId, "login">;
  route: string;
  accountId: string;
  demoName: string;
  reference: string;
}> = [
  {
    id: "admin",
    route: "/admin",
    accountId: "u-admin",
    demoName: "陈园长",
    reference: "artifacts/refactor-design-assets/images/ai_powered_childcare_management_dashboard.png",
  },
  {
    id: "teacher",
    route: "/teacher",
    accountId: "u-teacher",
    demoName: "李老师",
    reference: "artifacts/refactor-design-assets/images/teacher_dashboard_with_class_overview_and_tasks.png",
  },
  {
    id: "parent",
    route: "/parent?child=c-1",
    accountId: "u-parent",
    demoName: "林小雨妈妈",
    reference: "artifacts/refactor-design-assets/images/soft_pastel_parenting_dashboard_ui_design.png",
  },
];

const LOGIN_REFERENCE = "artifacts/refactor-design-assets/images/smart_childcare_platform_login_page_design.png";

test.describe.configure({ mode: "serial" });
test.setTimeout(12 * 60 * 1000);

test("capture key visual parity pages", async ({ browser }) => {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const entries: CaptureEntry[] = [];

  for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
    const page = await newPage(browser, viewportName);
    await gotoStable(page, "/login");
    await capture(page, "login", "/login", viewportName, LOGIN_REFERENCE, entries);
    await page.context().close();
  }

  for (const spec of KEY_PAGES) {
    for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
      const page = await newPage(browser, viewportName);
      await loginWithDemo(page, spec.accountId);
      await gotoStable(page, spec.route);
      await capture(page, spec.id, spec.route, viewportName, spec.reference, entries);
      await page.context().close();
    }
  }

  await fs.writeFile(path.join(OUTPUT_ROOT, "manifest.json"), JSON.stringify(entries, null, 2), "utf8");
});

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
  const response = await page.request.post(`${BASE_URL}/api/auth/demo-login`, {
    data: { accountId },
  });
  if (!response.ok()) {
    throw new Error(`Demo login failed for ${accountId}: ${response.status()} ${await response.text()}`);
  }
  await settle(page);
}

async function gotoStable(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(700);
}

async function capture(
  page: Page,
  pageId: KeyPageId,
  route: string,
  viewport: ViewportName,
  reference: string,
  entries: CaptureEntry[]
) {
  const filename = `${pageId}-${viewport}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_ROOT, filename),
    fullPage: false,
    animations: "disabled",
  });

  entries.push({
    id: `${pageId}-${viewport}`,
    page: pageId,
    route,
    viewport,
    filename,
    capturedAt: new Date().toISOString(),
    reference,
  });
}
