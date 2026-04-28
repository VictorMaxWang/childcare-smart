import { test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type ViewportName = "desktop" | "tablet" | "mobile";

interface CaptureRoute {
  id: string;
  accountId: string;
  route: string;
  reference: string;
  viewports: ViewportName[];
}

interface CaptureEntry extends Omit<CaptureRoute, "viewports"> {
  viewport: ViewportName;
  filename: string;
  capturedAt: string;
}

const BASE_URL = (process.env.CAPTURE_BASE_URL ?? "http://localhost:3230").replace(/\/$/, "");
const PHASE = process.env.VISUAL_PARITY_PHASE ?? "current";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "visual-parity", "round4", PHASE);

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

const PARENT_ACCOUNT_ID = "u-parent";
const TEACHER_ACCOUNT_ID = "u-teacher";
const ADMIN_ACCOUNT_ID = "u-admin";

const ROUTES: CaptureRoute[] = [
  {
    id: "parent-home",
    accountId: PARENT_ACCOUNT_ID,
    route: "/parent?child=c-1",
    reference: "artifacts/refactor-design-assets/images/soft_pastel_parenting_dashboard_ui_design.png",
    viewports: ["mobile", "desktop"],
  },
  {
    id: "parent-home-care",
    accountId: PARENT_ACCOUNT_ID,
    route: "/parent?child=c-1&care=1",
    reference: "artifacts/refactor-design-assets/images/soft_pastel_parenting_dashboard_ui_design.png",
    viewports: ["mobile"],
  },
  {
    id: "parent-agent",
    accountId: PARENT_ACCOUNT_ID,
    route: "/parent/agent?child=c-1",
    reference: "artifacts/refactor-design-assets/images/ai_driven_parenting_suggestions_dashboard_endofte.png",
    viewports: ["mobile", "desktop"],
  },
  {
    id: "parent-agent-care",
    accountId: PARENT_ACCOUNT_ID,
    route: "/parent/agent?child=c-1&care=1",
    reference: "artifacts/refactor-design-assets/images/ai_powered_parenting_assistant_interface.png",
    viewports: ["mobile"],
  },
  {
    id: "parent-feedback",
    accountId: PARENT_ACCOUNT_ID,
    route: "/parent/agent?child=c-1#feedback",
    reference: "artifacts/refactor-design-assets/images/parent_feedback_app_interface_design.png",
    viewports: ["mobile", "desktop"],
  },
  {
    id: "parent-storybook",
    accountId: PARENT_ACCOUNT_ID,
    route: "/parent/storybook?child=c-1",
    reference: "artifacts/refactor-design-assets/images/parenting_storybook_web_app_dashboard.png",
    viewports: ["mobile", "desktop"],
  },
  {
    id: "teacher-home",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/teacher",
    reference: "artifacts/refactor-design-assets/images/teacher_dashboard_mobile_app_ui_design.png",
    viewports: ["mobile"],
  },
  {
    id: "teacher-agent",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/teacher/agent",
    reference: "artifacts/refactor-design-assets/images/childcare_teacher_dashboard_ui_overview.png",
    viewports: ["mobile"],
  },
  {
    id: "teacher-communication",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/teacher/agent?action=communication",
    reference: "artifacts/refactor-design-assets/images/teacher_parent_communication_dashboard_in_pastel_u.png",
    viewports: ["mobile"],
  },
  {
    id: "teacher-health",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/teacher_app_morning_health_check_dashboard.png",
    viewports: ["mobile"],
  },
  {
    id: "teacher-diet",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/diet",
    reference: "artifacts/refactor-design-assets/images/mobile_app_interface_for_meal_tracking.png",
    viewports: ["mobile"],
  },
  {
    id: "teacher-growth",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/growth",
    reference: "artifacts/refactor-design-assets/images/smartchildcare_growth_story_timeline_dashboard.png",
    viewports: ["mobile"],
  },
  {
    id: "teacher-consultation",
    accountId: TEACHER_ACCOUNT_ID,
    route: "/teacher/high-risk-consultation",
    reference: "artifacts/refactor-design-assets/images/high_risk_child_consultation_dashboard_interface.png",
    viewports: ["mobile"],
  },
  {
    id: "admin-home",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/admin",
    reference: "artifacts/refactor-design-assets/images/daycare_admin_app_dashboard_overview.png",
    viewports: ["tablet", "mobile"],
  },
  {
    id: "admin-agent",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/admin/agent",
    reference: "artifacts/refactor-design-assets/images/ai_powered_childcare_management_dashboard.png",
    viewports: ["tablet", "mobile"],
  },
  {
    id: "admin-weekly",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/admin/agent?action=weekly-report",
    reference: "artifacts/refactor-design-assets/images/childcare_weekly_report_dashboard_interface.png",
    viewports: ["tablet", "mobile"],
  },
  {
    id: "admin-children",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/children",
    reference: "artifacts/refactor-design-assets/images/child_records_management_dashboard_interface.png",
    viewports: ["tablet", "mobile"],
  },
  {
    id: "admin-health",
    accountId: ADMIN_ACCOUNT_ID,
    route: "/health",
    reference: "artifacts/refactor-design-assets/images/child_care_health_management_dashboard_interface.png",
    viewports: ["tablet", "mobile"],
  },
];

test.describe.configure({ mode: "serial" });
test.setTimeout(22 * 60 * 1000);

test("capture round4 parent and mobile visual parity pages", async ({ browser }) => {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const entries: CaptureEntry[] = [];

  for (const [accountId, routes] of groupByAccount(ROUTES)) {
    for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
      const routesForViewport = routes.filter((route) => route.viewports.includes(viewportName));
      if (routesForViewport.length === 0) continue;

      const page = await newPage(browser, viewportName);
      await loginWithDemo(page, accountId);

      for (const route of routesForViewport) {
        await gotoStable(page, route.route);
        await capture(page, route, viewportName, entries);
      }

      await page.context().close();
    }
  }

  await fs.writeFile(path.join(OUTPUT_ROOT, "manifest.json"), JSON.stringify(entries, null, 2), "utf8");
});

function groupByAccount(routes: CaptureRoute[]) {
  const groups = new Map<string, CaptureRoute[]>();
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
  await page.request.post(`${BASE_URL}/api/auth/demo-login`, {
    data: { accountId },
  });
  await settle(page);
}

async function gotoStable(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  if (route.includes("#feedback")) {
    await page.locator("#feedback").scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(300);
  }
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
    id: route.id,
    accountId: route.accountId,
    route: route.route,
    reference: route.reference,
    viewport,
    filename,
    capturedAt: new Date().toISOString(),
  });
}
