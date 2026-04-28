import { test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type ViewportName = "desktop" | "mobile";
type DemoRole = "director" | "teacher";

interface CaptureRoute {
  id: string;
  role: DemoRole;
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
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "visual-parity", "round2", PHASE);

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const ROUTES: CaptureRoute[] = [
  {
    id: "director-ai-agent",
    role: "director",
    demoName: "陈园长",
    route: "/admin/agent",
    reference: "artifacts/refactor-design-assets/images/ai_assistant_dashboard_for_childcare_management.png",
  },
  {
    id: "director-weekly-report",
    role: "director",
    demoName: "陈园长",
    route: "/admin/agent?action=weekly-report",
    reference: "artifacts/refactor-design-assets/images/childcare_weekly_report_dashboard_interface.png",
  },
  {
    id: "director-children",
    role: "director",
    demoName: "陈园长",
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/child_management_dashboard_interface.png",
  },
  {
    id: "director-health",
    role: "director",
    demoName: "陈园长",
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/child_health_monitoring_dashboard_interface.png",
  },
  {
    id: "director-diet",
    role: "director",
    demoName: "陈园长",
    route: "/diet",
    reference: "artifacts/refactor-design-assets/images/child_meal_record_dashboard_interface.png",
  },
  {
    id: "director-growth",
    role: "director",
    demoName: "陈园长",
    route: "/growth",
    reference: "artifacts/refactor-design-assets/images/childcare_growth_and_behavior_management_dashboard.png",
  },
  {
    id: "teacher-children",
    role: "teacher",
    demoName: "李老师",
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/teacher_dashboard_for_childcare_management.png",
  },
  {
    id: "teacher-health",
    role: "teacher",
    demoName: "李老师",
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/classroom_health_check_in_dashboard_overview.png",
  },
  {
    id: "teacher-diet",
    role: "teacher",
    demoName: "李老师",
    route: "/diet",
    reference: "artifacts/refactor-design-assets/images/meal_record_management_interface_with_batch_confir.png",
  },
  {
    id: "teacher-growth",
    role: "teacher",
    demoName: "李老师",
    route: "/growth",
    reference: "artifacts/refactor-design-assets/images/smartchildcare_growth_story_timeline_dashboard.png",
  },
];

test.describe.configure({ mode: "serial" });
test.setTimeout(18 * 60 * 1000);

test("capture round2 visual parity pages", async ({ browser }) => {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const entries: CaptureEntry[] = [];

  for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
    for (const role of ["director", "teacher"] as DemoRole[]) {
      const page = await newPage(browser, viewportName);
      const firstRouteForRole = ROUTES.find((item) => item.role === role);
      if (!firstRouteForRole) {
        await page.context().close();
        continue;
      }

      await loginWithDemo(page, firstRouteForRole.demoName);

      for (const route of ROUTES.filter((item) => item.role === role)) {
        await gotoStable(page, route.route);
        await capture(page, route, viewportName, entries);
      }

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
