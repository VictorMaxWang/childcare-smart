import { test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type RoleName = "director" | "teacher" | "parent" | "login";
type Severity = "P0" | "P1" | "P2" | "P3" | "P4";
type ViewportName = "desktop" | "mobile";

interface DemoAccountSpec {
  accountId: string;
  expectedName: string;
  fallbackLabels: string[];
  role: Exclude<RoleName, "login">;
  expectedHomePath: string;
  menuPath: string;
  demoButtonIndex: number;
}

interface SmokeIssue {
  kind:
    | "login-page"
    | "demo-account"
    | "white-screen"
    | "menu"
    | "refresh"
    | "console-error"
    | "page-error"
    | "server-error"
    | "image-404"
    | "broken-image"
    | "horizontal-overflow";
  severity: Severity;
  role: RoleName;
  accountId: string;
  accountName: string;
  route: string;
  message: string;
  url?: string;
  status?: number;
  screenshot?: string;
  sourceFilesSuspected: string[];
  likelyCause: string;
  suggestedFix: string;
  duplicateOf?: string;
}

interface ScenarioResult {
  accountId: string;
  accountName: string;
  role: RoleName;
  expectedHomePath: string;
  menuPath: string;
  finalUrl: string;
  demoButtonVisibleByName: boolean;
  demoButtonClicked: boolean;
  homeNonBlank: boolean;
  menuOpened: boolean;
  homeRefreshNonBlank: boolean;
  menuRefreshNonBlank: boolean;
  issues: SmokeIssue[];
}

interface SmokeReport {
  ok: boolean;
  generatedAt: string;
  baseURL: string;
  artifactRoot: string;
  scenarios: ScenarioResult[];
  mobileChecks: Array<{
    route: string;
    role: RoleName;
    ok: boolean;
    scrollWidth: number;
    clientWidth: number;
    issues: SmokeIssue[];
  }>;
  issues: SmokeIssue[];
}

interface PageMetrics {
  textLength: number;
  bodyChildCount: number;
  title: string;
  scrollWidth: number;
  clientWidth: number;
  brokenImages: string[];
}

const ARTIFACT_ROOT = path.join(process.cwd(), "artifacts", "bug-bash", "B26");
const FAILURES_DIR = path.join(ARTIFACT_ROOT, "failures");
const RESULTS_PATH = path.join(ARTIFACT_ROOT, "b26-smoke-results.json");
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  {
    accountId: "u-admin",
    expectedName: "陈园长",
    fallbackLabels: ["闄堝洯闀"],
    role: "director",
    expectedHomePath: "/admin",
    menuPath: "/admin/agent",
    demoButtonIndex: 0,
  },
  {
    accountId: "u-teacher",
    expectedName: "李老师",
    fallbackLabels: ["鏉庤€佸笀"],
    role: "teacher",
    expectedHomePath: "/teacher",
    menuPath: "/teacher/agent",
    demoButtonIndex: 1,
  },
  {
    accountId: "u-teacher2",
    expectedName: "周老师",
    fallbackLabels: ["鍛ㄨ€佸笀"],
    role: "teacher",
    expectedHomePath: "/teacher",
    menuPath: "/teacher/agent",
    demoButtonIndex: 2,
  },
  {
    accountId: "u-parent",
    expectedName: "林妈妈",
    fallbackLabels: ["鏋楀濡"],
    role: "parent",
    expectedHomePath: "/parent",
    menuPath: "/parent/storybook?child=c-1",
    demoButtonIndex: 3,
  },
];

test.describe.configure({ mode: "serial" });

test("B26 real user smoke", async ({ browser }, testInfo) => {
  await fs.mkdir(FAILURES_DIR, { recursive: true });
  const baseURL = resolveBaseURL(testInfo);
  const scenarios: ScenarioResult[] = [];
  const mobileChecks: SmokeReport["mobileChecks"] = [];
  const issues: SmokeIssue[] = [];

  const loginContext = await newContext(browser, "desktop");
  const loginPage = await loginContext.newPage();
  const loginIssues = await checkLoginPage(loginPage, baseURL);
  issues.push(...loginIssues);
  await loginContext.close();

  for (const account of DEMO_ACCOUNTS) {
    const context = await newContext(browser, "desktop");
    const page = await context.newPage();
    const scenario = await runAccountScenario(page, baseURL, account);
    scenarios.push(scenario);
    issues.push(...scenario.issues);
    await context.close();
  }

  const mobileLoginContext = await newContext(browser, "mobile");
  const mobileLoginPage = await mobileLoginContext.newPage();
  const mobileLoginCollectedIssues: SmokeIssue[] = [];
  attachCollectors(mobileLoginPage, baseURL, "login", "none", "login", mobileLoginCollectedIssues);
  const mobileLoginIssues = await checkMobileRouteOverflow(
    mobileLoginPage,
    baseURL,
    "/login",
    "login",
    "none",
    "login",
    mobileLoginCollectedIssues
  );
  mobileChecks.push({
    route: "/login",
    role: "login",
    ok: mobileLoginIssues.issues.length === 0,
    scrollWidth: mobileLoginIssues.scrollWidth,
    clientWidth: mobileLoginIssues.clientWidth,
    issues: mobileLoginIssues.issues,
  });
  issues.push(...mobileLoginIssues.issues);
  await mobileLoginContext.close();

  const mobileParentContext = await newContext(browser, "mobile");
  const mobileParentPage = await mobileParentContext.newPage();
  const mobileParentScenarioIssues: SmokeIssue[] = [];
  attachCollectors(mobileParentPage, baseURL, "parent", "u-parent", "林妈妈", mobileParentScenarioIssues);
  await gotoStable(mobileParentPage, baseURL, "/login");
  await clickDemoAccount(mobileParentPage, DEMO_ACCOUNTS[3], mobileParentScenarioIssues);
  await waitForPath(mobileParentPage, "/parent");
  await gotoStable(mobileParentPage, baseURL, "/parent?child=c-1");
  const mobileParentOverflow = await checkMobileRouteOverflow(
    mobileParentPage,
    baseURL,
    "/parent?child=c-1",
    "parent",
    "u-parent",
    "林妈妈",
    mobileParentScenarioIssues
  );
  mobileChecks.push({
    route: "/parent?child=c-1",
    role: "parent",
    ok: mobileParentOverflow.issues.length === 0,
    scrollWidth: mobileParentOverflow.scrollWidth,
    clientWidth: mobileParentOverflow.clientWidth,
    issues: mobileParentOverflow.issues,
  });
  issues.push(...mobileParentOverflow.issues);
  await mobileParentContext.close();

  const report: SmokeReport = {
    ok: issues.length === 0,
    generatedAt: new Date().toISOString(),
    baseURL,
    artifactRoot: toPosix(path.relative(process.cwd(), ARTIFACT_ROOT)),
    scenarios,
    mobileChecks,
    issues,
  };

  await fs.writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (issues.length > 0) {
    throw new Error(`B26 smoke found ${issues.length} issue(s). See ${toPosix(path.relative(process.cwd(), RESULTS_PATH))}.`);
  }
});

async function newContext(browser: Browser, viewport: ViewportName): Promise<BrowserContext> {
  return browser.newContext({
    viewport: viewport === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT,
    locale: "zh-CN",
    deviceScaleFactor: 1,
  });
}

async function checkLoginPage(page: Page, baseURL: string) {
  const issues: SmokeIssue[] = [];
  attachCollectors(page, baseURL, "login", "none", "login", issues);
  await gotoStable(page, baseURL, "/login");
  const metrics = await getPageMetrics(page);

  if (isBlank(metrics)) {
    issues.push(
      buildIssue({
        kind: "login-page",
        severity: "P0",
        role: "login",
        accountId: "none",
        accountName: "login",
        route: "/login",
        message: `Login page appears blank; body text length=${metrics.textLength}.`,
        sourceFilesSuspected: ["app/login/page.tsx"],
        likelyCause: "The login page failed to render meaningful body content.",
        suggestedFix: "Inspect login page render errors and ensure demo/login content mounts before auth redirect logic runs.",
      })
    );
  }

  for (const account of DEMO_ACCOUNTS) {
    const button = await findDemoButton(page, account);
    if (!(await button.isVisible().catch(() => false))) {
      issues.push(
        buildIssue({
          kind: "demo-account",
          severity: "P1",
          role: account.role,
          accountId: account.accountId,
          accountName: account.expectedName,
          route: "/login",
          message: `Demo account button is not visible by name: ${account.expectedName}.`,
          sourceFilesSuspected: ["app/login/page.tsx", "lib/auth/accounts.ts"],
          likelyCause: "The demo account card is missing, hidden, or rendered with unexpected text.",
          suggestedFix: "Restore a visible clickable demo account card with the expected user-facing name.",
        })
      );
    }
  }

  await addScreenshot(page, issues, "login-page");
  return issues;
}

async function runAccountScenario(page: Page, baseURL: string, account: DemoAccountSpec): Promise<ScenarioResult> {
  const scenarioIssues: SmokeIssue[] = [];
  attachCollectors(page, baseURL, account.role, account.accountId, account.expectedName, scenarioIssues);

  await gotoStable(page, baseURL, "/login");
  const demoButton = await findDemoButton(page, account);
  const demoButtonVisibleByName = await demoButton.isVisible().catch(() => false);
  const demoButtonClicked = await clickDemoAccount(page, account, scenarioIssues);

  await waitForPath(page, account.expectedHomePath);
  await settle(page);
  const homeMetrics = await getPageMetrics(page);
  const homeNonBlank = !isBlank(homeMetrics);
  if (!homeNonBlank) {
    scenarioIssues.push(
      buildIssue({
        kind: "white-screen",
        severity: "P0",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: account.expectedHomePath,
        message: `Home page appears blank after login; body text length=${homeMetrics.textLength}.`,
        sourceFilesSuspected: sourceFilesForRoute(account.expectedHomePath),
        likelyCause: "The role home page failed to render meaningful body content after demo login.",
        suggestedFix: "Inspect page render errors and route auth hydration for the affected role home.",
      })
    );
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  const homeRefreshMetrics = await getPageMetrics(page);
  const homeRefreshNonBlank = !isBlank(homeRefreshMetrics);
  if (!homeRefreshNonBlank) {
    scenarioIssues.push(
      buildIssue({
        kind: "refresh",
        severity: "P0",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: account.expectedHomePath,
        message: `Home route is blank after browser refresh; body text length=${homeRefreshMetrics.textLength}.`,
        sourceFilesSuspected: sourceFilesForRoute(account.expectedHomePath),
        likelyCause: "The route cannot recover session/auth state after a hard refresh.",
        suggestedFix: "Ensure session restoration completes before rendering protected page content or redirecting.",
      })
    );
  }

  const menuOpened = await openMainMenu(page, baseURL, account, scenarioIssues);
  const menuMetrics = await getPageMetrics(page);
  if (isBlank(menuMetrics)) {
    scenarioIssues.push(
      buildIssue({
        kind: "white-screen",
        severity: "P0",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: account.menuPath,
        message: `Main menu route appears blank; body text length=${menuMetrics.textLength}.`,
        sourceFilesSuspected: sourceFilesForRoute(account.menuPath),
        likelyCause: "The route opened from the main menu failed to render meaningful body content.",
        suggestedFix: "Inspect the target route component and its data-loading guards.",
      })
    );
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  const menuRefreshMetrics = await getPageMetrics(page);
  const menuRefreshNonBlank = !isBlank(menuRefreshMetrics);
  if (!menuRefreshNonBlank) {
    scenarioIssues.push(
      buildIssue({
        kind: "refresh",
        severity: "P0",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: account.menuPath,
        message: `Main menu route is blank after browser refresh; body text length=${menuRefreshMetrics.textLength}.`,
        sourceFilesSuspected: sourceFilesForRoute(account.menuPath),
        likelyCause: "The target route cannot recover session/auth or data state after refresh.",
        suggestedFix: "Ensure protected route refreshes restore auth state and render a stable fallback while data loads.",
      })
    );
  }

  await checkBrokenImages(page, account.role, account.accountId, account.expectedName, account.menuPath, scenarioIssues);
  if (scenarioIssues.length > 0) {
    await addScreenshot(page, scenarioIssues, `${account.accountId}-scenario-final`);
  }

  return {
    accountId: account.accountId,
    accountName: account.expectedName,
    role: account.role,
    expectedHomePath: account.expectedHomePath,
    menuPath: account.menuPath,
    finalUrl: page.url(),
    demoButtonVisibleByName,
    demoButtonClicked,
    homeNonBlank,
    menuOpened,
    homeRefreshNonBlank,
    menuRefreshNonBlank,
    issues: scenarioIssues,
  };
}

async function clickDemoAccount(page: Page, account: DemoAccountSpec, issues: SmokeIssue[]) {
  const namedButton = await findDemoButton(page, account);
  const namedVisible = await namedButton.isVisible().catch(() => false);
  const button = namedVisible ? namedButton : page.locator('button[class*="demoCard"]').nth(account.demoButtonIndex);

  if (!(await button.isVisible().catch(() => false))) {
    issues.push(
      buildIssue({
        kind: "demo-account",
        severity: "P1",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: "/login",
        message: `Demo account button could not be clicked: ${account.expectedName}.`,
        sourceFilesSuspected: ["app/login/page.tsx", "lib/auth/accounts.ts"],
        likelyCause: "The demo account card is not present or not visible in the login page.",
        suggestedFix: "Restore the demo account card and verify its button remains clickable in desktop and mobile layouts.",
      })
    );
    return false;
  }

  await button.click();
  return true;
}

async function findDemoButton(page: Page, account: DemoAccountSpec) {
  let button = page.getByRole("button").filter({ hasText: account.expectedName }).first();
  if ((await button.count().catch(() => 0)) > 0) return button;

  for (const label of account.fallbackLabels) {
    button = page.getByRole("button").filter({ hasText: label }).first();
    if ((await button.count().catch(() => 0)) > 0) return button;
  }

  return page.locator("__missing-demo-button__");
}

async function openMainMenu(page: Page, baseURL: string, account: DemoAccountSpec, issues: SmokeIssue[]) {
  const targetPath = new URL(account.menuPath, baseURL).pathname;
  const link =
    (await firstVisible(page.locator(`a[href="${account.menuPath}"]`))) ??
    (await firstVisible(page.locator(`a[href^="${targetPath}"]`)));

  if (!link) {
    issues.push(
      buildIssue({
        kind: "menu",
        severity: "P1",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: account.expectedHomePath,
        message: `Could not find a visible main menu link for ${account.menuPath}.`,
        sourceFilesSuspected: ["components/Navbar.tsx", "lib/navigation/primary-nav.ts"],
        likelyCause: "The role main navigation does not expose the expected target link.",
        suggestedFix: "Restore a visible role-appropriate navigation item for the expected main route.",
      })
    );
    await gotoStable(page, baseURL, account.menuPath);
    return false;
  }

  await link.click();
  await waitForPath(page, targetPath);
  await settle(page);

  const opened = new URL(page.url()).pathname === targetPath;
  if (!opened) {
    issues.push(
      buildIssue({
        kind: "menu",
        severity: "P1",
        role: account.role,
        accountId: account.accountId,
        accountName: account.expectedName,
        route: account.menuPath,
        message: `Main menu click did not land on ${account.menuPath}; final URL is ${page.url()}.`,
        sourceFilesSuspected: ["components/Navbar.tsx", "lib/navigation/primary-nav.ts"],
        likelyCause: "Navigation link target, active route, or auth redirect handling is incorrect.",
        suggestedFix: "Verify the menu href and route guard for the affected role route.",
      })
    );
  }
  return opened;
}

async function firstVisible(locator: ReturnType<Page["locator"]>) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index++) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function checkMobileRouteOverflow(
  page: Page,
  baseURL: string,
  route: string,
  role: RoleName,
  accountId: string,
  accountName: string,
  issues: SmokeIssue[] = []
) {
  await gotoStable(page, baseURL, route);
  const metrics = await getPageMetrics(page);
  const overflows = metrics.scrollWidth > metrics.clientWidth + 2;

  if (overflows) {
    issues.push(
      buildIssue({
        kind: "horizontal-overflow",
        severity: "P2",
        role,
        accountId,
        accountName,
        route,
        message: `Mobile route horizontally overflows: scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth}.`,
        sourceFilesSuspected: sourceFilesForRoute(route),
        likelyCause: "A fixed-width element, table, image, or shell container exceeds the mobile viewport.",
        suggestedFix: "Constrain the overflowing element with responsive widths, wrapping, or horizontal scroll on the local component.",
      })
    );
  }

  if (isBlank(metrics)) {
    issues.push(
      buildIssue({
        kind: "white-screen",
        severity: "P0",
        role,
        accountId,
        accountName,
        route,
        message: `Mobile route appears blank; body text length=${metrics.textLength}.`,
        sourceFilesSuspected: sourceFilesForRoute(route),
        likelyCause: "The mobile route did not render meaningful body content.",
        suggestedFix: "Inspect responsive render guards and route data loading for this viewport.",
      })
    );
  }

  await checkBrokenImages(page, role, accountId, accountName, route, issues);
  if (issues.length > 0) {
    await addScreenshot(page, issues, `mobile-${slugify(route)}-failure`);
  }

  return { scrollWidth: metrics.scrollWidth, clientWidth: metrics.clientWidth, issues };
}

function attachCollectors(
  page: Page,
  baseURL: string,
  role: RoleName,
  accountId: string,
  accountName: string,
  issues: SmokeIssue[]
) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (isAllowedConsoleNoise(text)) return;
    issues.push(
      buildIssue({
        kind: "console-error",
        severity: "P2",
        role,
        accountId,
        accountName,
        route: currentRoute(page, baseURL),
        message: text,
        sourceFilesSuspected: ["app route/component for current page", "browser console producer"],
        likelyCause: "A runtime error or failed browser resource request surfaced as console.error.",
        suggestedFix: "Inspect the console error stack or matching network request and handle the failure path cleanly.",
      })
    );
  });

  page.on("pageerror", (error) => {
    issues.push(
      buildIssue({
        kind: "page-error",
        severity: "P0",
        role,
        accountId,
        accountName,
        route: currentRoute(page, baseURL),
        message: error.message,
        sourceFilesSuspected: ["app route/component for current page"],
        likelyCause: "An unhandled browser-side exception was thrown during real-user navigation.",
        suggestedFix: "Fix the thrown exception and add a regression test for the affected route.",
      })
    );
  });

  page.on("response", (response) => {
    const request = response.request();
    const url = response.url();
    const status = response.status();
    if (!isSameOrigin(url, baseURL)) return;
    if (isAllowedNetworkNoise(url, status)) return;

    if (request.resourceType() === "image" && status === 404) {
      issues.push(
        buildIssue({
          kind: "image-404",
          severity: "P2",
          role,
          accountId,
          accountName,
          route: currentRoute(page, baseURL),
          message: `Image request returned 404: ${url}`,
          url,
          status,
          sourceFilesSuspected: sourceFilesForRoute(currentRoute(page, baseURL)),
          likelyCause: "The page references an image asset path that is missing from the app or public assets.",
          suggestedFix: "Restore the missing asset or update the image src to an existing file.",
        })
      );
      return;
    }

    if (status >= 500) {
      issues.push(
        buildIssue({
          kind: "server-error",
          severity: "P2",
          role,
          accountId,
          accountName,
          route: currentRoute(page, baseURL),
          message: `Same-origin request returned ${status}: ${url}`,
          url,
          status,
          sourceFilesSuspected: sourceFilesForRoute(currentRoute(page, baseURL)),
          likelyCause: "A route or API dependency failed during normal demo navigation.",
          suggestedFix: "Return a stable demo-safe fallback or handle the failed API state without surfacing a 5xx.",
          duplicateOf: duplicateForUrl(url, status),
        })
      );
    }
  });
}

async function checkBrokenImages(
  page: Page,
  role: RoleName,
  accountId: string,
  accountName: string,
  route: string,
  issues: SmokeIssue[]
) {
  const metrics = await getPageMetrics(page);
  for (const src of metrics.brokenImages) {
    issues.push(
      buildIssue({
        kind: "broken-image",
        severity: "P2",
        role,
        accountId,
        accountName,
        route,
        message: `Image element is complete but has naturalWidth=0: ${src}`,
        url: src,
        sourceFilesSuspected: sourceFilesForRoute(route),
        likelyCause: "The image element references a missing, blocked, or unreadable asset.",
        suggestedFix: "Verify the asset exists and that Next/Image or plain img can load it under the current route.",
      })
    );
  }
}

async function gotoStable(page: Page, baseURL: string, route: string) {
  await page.goto(new URL(route, baseURL).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(600);
}

async function waitForPath(page: Page, expectedPath: string) {
  await page
    .waitForURL((url) => url.pathname === expectedPath || url.pathname.startsWith(`${expectedPath}/`), {
      timeout: 20_000,
    })
    .catch(() => undefined);
}

async function getPageMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    const brokenImages = Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src)
      .filter(Boolean);
    return {
      textLength: (document.body?.innerText ?? "").trim().length,
      bodyChildCount: document.body?.children.length ?? 0,
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      brokenImages,
    };
  });
}

function isBlank(metrics: PageMetrics) {
  return metrics.bodyChildCount === 0 || metrics.textLength < 20;
}

async function addScreenshot(page: Page, issues: SmokeIssue[], slug: string) {
  if (issues.length === 0) return;
  const filename = `${slugify(slug)}-${Date.now()}.png`;
  const absolutePath = path.join(FAILURES_DIR, filename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await page.screenshot({ path: absolutePath, fullPage: false, animations: "disabled" }).catch(() => undefined);
  const relativePath = toPosix(path.relative(process.cwd(), absolutePath));
  for (const issue of issues) {
    if (!issue.screenshot) issue.screenshot = relativePath;
  }
}

function buildIssue(issue: SmokeIssue): SmokeIssue {
  return issue;
}

function currentRoute(page: Page, baseURL: string) {
  try {
    const url = new URL(page.url());
    const base = new URL(baseURL);
    if (url.origin !== base.origin) return page.url();
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return page.url();
  }
}

function isSameOrigin(rawUrl: string, baseURL: string) {
  try {
    return new URL(rawUrl).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
}

function isAllowedConsoleNoise(text: string) {
  return (
    text.includes("/api/auth/session") ||
    text.includes("401") ||
    text.includes("ERR_ABORTED") ||
    text.includes("va.vercel-scripts.com") ||
    text.includes("net::ERR_BLOCKED_BY_ORB")
  );
}

function isAllowedNetworkNoise(url: string, status: number) {
  return (
    (url.includes("/api/auth/session") && status === 401) ||
    url.includes("_next/webpack-hmr") ||
    url.includes("__nextjs_original-stack-frame")
  );
}

function duplicateForUrl(url: string, status: number) {
  if (url.includes("/api/admin/notification-events") && status === 503) return "BUG-001";
  if (url.includes("/api/ai/suggestions") && status === 500) return "BUG-002";
  if (url.includes("/api/ai/parent-storybook") && status === 503) return "BUG-003";
  return undefined;
}

function sourceFilesForRoute(route: string) {
  if (route.startsWith("/login")) return ["app/login/page.tsx"];
  if (route.startsWith("/admin/agent")) return ["app/admin/agent/page.tsx", "components/admin/pixel-replica/*"];
  if (route.startsWith("/admin")) return ["app/admin/page.tsx", "app/api/admin/notification-events/route.ts"];
  if (route.startsWith("/teacher/agent")) return ["app/teacher/agent/page.tsx", "components/teacher/*"];
  if (route.startsWith("/teacher")) return ["app/teacher/page.tsx", "components/teacher/TeacherWorkbenchPage.tsx"];
  if (route.startsWith("/parent/storybook")) return [
    "app/parent/storybook/page.tsx",
    "components/parent/StoryBookViewer.tsx",
    "app/api/ai/parent-storybook/route.ts",
  ];
  if (route.startsWith("/parent/agent")) return ["app/parent/agent/page.tsx", "components/parent/*"];
  if (route.startsWith("/parent")) return ["app/parent/page.tsx", "components/parent/*", "app/api/ai/suggestions/route.ts"];
  return ["app route/component for current page"];
}

function resolveBaseURL(testInfo: TestInfo) {
  return String(testInfo.project.use.baseURL ?? process.env.BUGBASH_BASE_URL ?? "http://127.0.0.1:3330").replace(/\/$/, "");
}

function slugify(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "capture";
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}
