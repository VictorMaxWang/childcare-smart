import { test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type ViewportName = "desktop" | "mobile";

interface CaptureRoute {
  id: string;
  demoName: string;
  route: string;
  reference: string;
}

interface CaptureEntry extends CaptureRoute {
  viewport: ViewportName;
  filename: string;
  capturedAt: string;
}

const BASE_URL = (process.env.CAPTURE_BASE_URL ?? "http://localhost:3230").replace(/\/$/, "");
const PHASE = process.env.VISUAL_PARITY_PHASE ?? "current";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "visual-parity", "round3", PHASE);

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const ROUTES: CaptureRoute[] = [
  {
    id: "teacher-ai-agent",
    demoName: "李老师",
    route: "/teacher/agent",
    reference: "artifacts/refactor-design-assets/images/teacher_ai_assistant_dashboard_overview.png",
  },
  {
    id: "teacher-communication",
    demoName: "李老师",
    route: "/teacher/agent?action=communication",
    reference: "artifacts/refactor-design-assets/images/teacher_parent_communication_platform_dashboard.png",
  },
  {
    id: "teacher-health",
    demoName: "李老师",
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/teacher_app_morning_health_check_dashboard.png",
  },
  {
    id: "teacher-diet",
    demoName: "李老师",
    route: "/diet",
    reference: "artifacts/refactor-design-assets/images/meal_record_management_interface_with_batch_confir.png",
  },
  {
    id: "teacher-growth",
    demoName: "李老师",
    route: "/growth",
    reference: "artifacts/refactor-design-assets/images/childcare_growth_and_behavior_records_dashboard.png",
  },
  {
    id: "teacher-health-file-bridge",
    demoName: "李老师",
    route: "/teacher/health-file-bridge",
    reference: "artifacts/refactor-design-assets/images/teacher_health_document_processing_dashboard.png",
  },
  {
    id: "teacher-high-risk-consultation",
    demoName: "李老师",
    route: "/teacher/high-risk-consultation",
    reference: "artifacts/refactor-design-assets/images/high_risk_child_consultation_dashboard_interface.png",
  },
];

test.describe.configure({ mode: "serial" });
test.setTimeout(18 * 60 * 1000);

test("capture round3 teacher visual parity pages", async ({ browser }) => {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const entries: CaptureEntry[] = [];

  for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
    const page = await newPage(browser, viewportName);
    await loginWithDemo(page, "李老师");

    for (const route of ROUTES) {
      await gotoStable(page, route.route);
      await capture(page, route, viewportName, entries);
    }

    await page.context().close();
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

async function loginWithDemo(page: Page, demoName: string) {
  await gotoStable(page, "/login");
  const button = page.getByRole("button").filter({ hasText: demoName }).first();
  await button.click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  await settle(page);
}

async function gotoStable(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(900);
}

async function capture(
  page: Page,
  route: CaptureRoute,
  viewport: ViewportName,
  entries: CaptureEntry[]
) {
  const filename = `${route.id}-${viewport}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_ROOT, filename),
    fullPage: false,
    animations: "disabled",
  });

  entries.push({
    ...route,
    viewport,
    filename,
    capturedAt: new Date().toISOString(),
  });
}
