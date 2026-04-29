import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "bug-bash", "fixes", "F60");
const RESULT_PATH = path.join(ARTIFACT_DIR, "f60-responsive-assets-retest.json");
const DEFAULT_PORT = process.env.F60_PORT || "3331";
const BASE_URL = (process.env.BUGBASH_BASE_URL || process.env.F60_BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`).replace(/\/$/, "");
const explicitBaseURL = Boolean(process.env.BUGBASH_BASE_URL || process.env.F60_BASE_URL);

const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

const result = {
  ok: false,
  generatedAt: new Date().toISOString(),
  baseURL: BASE_URL,
  checks: [],
  issues: [],
};

let serverProcess = null;

main()
  .catch((error) => {
    result.issues.push({
      check: "script",
      severity: "P1",
      message: error instanceof Error ? error.message : String(error),
    });
  })
  .finally(async () => {
    result.ok = result.issues.filter((issue) => issue.severity !== "info").length === 0;
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    await fs.writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    stopServer();
    if (!result.ok) process.exitCode = 1;
  });

async function main() {
  if (!(await isReachable(BASE_URL))) {
    if (explicitBaseURL) {
      throw new Error(`${BASE_URL}/login is not reachable.`);
    }
    await startServer();
  }

  const browser = await chromium.launch();
  try {
    await checkMobileLoginPayload(browser);
    await checkRegisterDialog(browser);
    await checkAuthenticatedRoute(browser, {
      name: "parent-home-mobile",
      accountIndex: 3,
      expectedPath: "/parent",
      route: "/parent?child=c-1",
      viewport: "mobile",
    });
    await checkAuthenticatedRoute(browser, {
      name: "parent-storybook-mobile",
      accountIndex: 3,
      expectedPath: "/parent",
      route: "/parent/storybook?child=c-1",
      viewport: "mobile",
      storybook: true,
    });
    await checkAuthenticatedRoute(browser, {
      name: "teacher-workbench-mobile",
      accountIndex: 1,
      expectedPath: "/teacher",
      route: "/teacher",
      viewport: "mobile",
      drawer: true,
      chartWarning: true,
    });
    await checkAuthenticatedRoute(browser, {
      name: "director-home-tablet",
      accountIndex: 0,
      expectedPath: "/admin",
      route: "/admin",
      viewport: "tablet",
      directorClosure: true,
    });
    await checkAuthenticatedRoute(browser, {
      name: "director-home-mobile",
      accountIndex: 0,
      expectedPath: "/admin",
      route: "/admin",
      viewport: "mobile",
      directorClosure: true,
    });
    await checkAuthenticatedRoute(browser, {
      name: "parent-feedback-tablet",
      accountIndex: 3,
      expectedPath: "/parent",
      route: "/parent/agent?child=c-1#feedback",
      viewport: "tablet",
      feedback: true,
    });
  } finally {
    await browser.close();
  }
}

async function startServer() {
  serverProcess =
    process.platform === "win32"
      ? spawn(
          "cmd.exe",
          ["/d", "/s", "/c", `npm run dev -- --hostname 127.0.0.1 --port ${DEFAULT_PORT}`],
          { cwd: process.cwd(), stdio: "ignore", windowsHide: true }
        )
      : spawn(
          "npm",
          ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", DEFAULT_PORT],
          { cwd: process.cwd(), stdio: "ignore" }
        );

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isReachable(BASE_URL)) return;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${BASE_URL}/login.`);
}

function stopServer() {
  if (!serverProcess?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    serverProcess.kill("SIGTERM");
  }
}

async function checkMobileLoginPayload(browser) {
  const page = await newPage(browser, "mobile");
  const requests = [];
  attachCollectors(page, "login-mobile", requests);

  await goto(page, "/login");
  const metrics = await collectMetrics(page);
  const bigReplicaRequests = requests.filter((item) => item.url.includes("login-left-replica"));
  recordCheck("login-mobile", metrics, requests, {
    extra: {
      loginLeftReplicaRequests: bigReplicaRequests.map((item) => item.url),
    },
  });

  if (bigReplicaRequests.length > 0) {
    addIssue("login-mobile", "P2", "mobile still requested login-left-replica desktop image.");
  }
  await page.context().close();
}

async function checkRegisterDialog(browser) {
  const page = await newPage(browser, "mobile");
  const requests = [];
  attachCollectors(page, "login-register-dialog-mobile", requests);

  await goto(page, "/login");
  const registerButton = page.getByRole("button", { name: /注册|机构账号|申请/ }).first();
  if ((await registerButton.count()) === 0) {
    addIssue("login-register-dialog-mobile", "P3", "register button was not found.");
    await page.context().close();
    return;
  }
  await registerButton.click();
  await page.waitForTimeout(300);
  const metrics = await collectMetrics(page);
  const dialogVisible = await page.getByRole("dialog").first().isVisible().catch(() => false);
  recordCheck("login-register-dialog-mobile", metrics, requests, { extra: { dialogVisible } });
  if (!dialogVisible) addIssue("login-register-dialog-mobile", "P3", "register dialog did not open.");
  await page.context().close();
}

async function checkAuthenticatedRoute(browser, options) {
  const page = await newPage(browser, "desktop");
  const requests = [];
  attachCollectors(page, options.name, requests);

  await loginAs(page, options.accountIndex, options.expectedPath);
  await page.setViewportSize(viewports[options.viewport]);
  await goto(page, options.route);

  if (options.feedback) {
    await page.waitForTimeout(700);
  }

  if (options.drawer) {
    const openButton = page.getByRole("button", { name: "打开导航菜单" });
    if ((await openButton.count()) > 0) {
      await openButton.click();
      await page.waitForTimeout(250);
    }
  }

  const metrics = await collectMetrics(page);
  const extra = {};

  if (options.storybook) {
    extra.storybookImages = await page.evaluate(() =>
      Array.from(document.images).map((image) => ({
        src: image.currentSrc || image.src,
        loading: image.loading,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      }))
    );
    if (!extra.storybookImages.some((image) => image.loading === "lazy")) {
      addIssue(options.name, "P3", "storybook images did not expose any lazy-loading image elements.");
    }
  }

  if (options.drawer) {
    extra.drawerVisible = await page.getByLabel("移动端主导航").isVisible().catch(() => false);
    if (!extra.drawerVisible) addIssue(options.name, "P3", "mobile drawer did not open.");
  }

  if (options.directorClosure) {
    extra.visibleTables = await page.evaluate(() =>
      Array.from(document.querySelectorAll("table")).filter((table) => {
        const style = window.getComputedStyle(table);
        const rect = table.getBoundingClientRect();
        return style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).length
    );
    if (options.viewport === "mobile" && extra.visibleTables > 0) {
      addIssue(options.name, "P2", "director closure table is still visible on mobile.");
    }
  }

  if (options.feedback) {
    extra.feedbackButton = await page.evaluate(() => {
      const feedback = document.getElementById("feedback");
      const button = feedback?.querySelector("button");
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        coveredByBottomNav: rect.bottom > window.innerHeight - 88,
      };
    });
    if (extra.feedbackButton?.coveredByBottomNav) {
      addIssue(options.name, "P2", "feedback action button is covered by the fixed bottom navigation.");
    }
  }

  recordCheck(options.name, metrics, requests, { extra });
  await page.context().close();
}

async function loginAs(page, accountIndex, expectedPath) {
  await page.setViewportSize(viewports.desktop);
  await goto(page, "/login");
  const demoButtons = page.locator('section[aria-label="示例账号快速进入"] button');
  const count = await demoButtons.count();
  if (count <= accountIndex) {
    throw new Error(`Demo account button index ${accountIndex} not found; only ${count} buttons.`);
  }
  await demoButtons.nth(accountIndex).click();
  await page.waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout: 20_000 });
}

async function newPage(browser, viewportName) {
  const context = await browser.newContext({
    viewport: viewports[viewportName],
    locale: "zh-CN",
  });
  return context.newPage();
}

function attachCollectors(page, checkName, requests) {
  page.on("requestfinished", (request) => {
    requests.push({
      type: "request",
      resourceType: request.resourceType(),
      url: request.url(),
    });
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.resourceType() === "image" && response.status() >= 400) {
      addIssue(checkName, "P2", `image returned ${response.status()}: ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    const text = message.text();
    if (/width\(-1\)|height\(-1\)|The width\(-1\)/.test(text)) {
      addIssue(checkName, "P3", `Recharts warning: ${text}`);
    }
  });
}

async function goto(page, route) {
  await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const brokenImages = Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
    return {
      url: window.location.href,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyTextLength: document.body.innerText.trim().length,
      brokenImages,
    };
  });
}

function recordCheck(name, metrics, requests, options = {}) {
  const horizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 2;
  const brokenImages = metrics.brokenImages.length > 0;
  if (horizontalOverflow) {
    addIssue(name, "P2", `horizontal overflow: scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth}`);
  }
  if (brokenImages) {
    addIssue(name, "P2", `broken images: ${metrics.brokenImages.join(", ")}`);
  }
  result.checks.push({
    name,
    ok: !horizontalOverflow && !brokenImages,
    metrics,
    imageRequestCount: requests.filter((item) => item.resourceType === "image").length,
    ...options.extra,
  });
}

function addIssue(check, severity, message) {
  result.issues.push({ check, severity, message });
}

async function isReachable(baseURL) {
  try {
    const response = await fetch(new URL("/login", baseURL), { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
