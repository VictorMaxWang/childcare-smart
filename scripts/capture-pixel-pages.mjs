import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const REPO_ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(REPO_ROOT, "artifacts", "pixel-replica");
const REPORTS_ROOT = path.join(ARTIFACT_ROOT, "reports");
const requestedPhase = process.env.PIXEL_CAPTURE_PHASE || "current";
const PHASE = ["current", "after"].includes(requestedPhase) ? requestedPhase : "current";
const OUTPUT_ROOT = path.join(ARTIFACT_ROOT, PHASE);
const DEFAULT_BASE_URL = "http://127.0.0.1:3230";
const BASE_URL = (process.env.CAPTURE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const SERVER_LOG_PATH = path.join(REPORTS_ROOT, "capture-pixel-pages-server.log");
const REPORT_PATH = path.join(REPORTS_ROOT, "capture-pixel-pages-report.md");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const CAPTURE_CASES = [
  {
    id: "login",
    label: "登录页",
    route: "/login",
    accountId: null,
    reference: "artifacts/pixel-replica/references/login-reference.png",
  },
  {
    id: "director-dashboard",
    label: "园长首页",
    route: "/admin",
    accountId: "u-admin",
    reference: "artifacts/pixel-replica/references/director-dashboard-reference.png",
  },
  {
    id: "teacher-workbench",
    label: "教师工作台",
    route: "/teacher",
    accountId: "u-teacher",
    reference: "artifacts/pixel-replica/references/teacher-workbench-reference.png",
  },
  {
    id: "parent-home",
    label: "家长首页",
    route: "/parent?child=c-1",
    accountId: "u-parent",
    reference: "artifacts/pixel-replica/references/parent-home-reference.png",
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.mkdir(REPORTS_ROOT, { recursive: true });
  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const server = await ensureServer();
  const entries = [];
  const failures = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      for (const captureCase of CAPTURE_CASES) {
        const context = await browser.newContext({
          viewport,
          locale: "zh-CN",
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(25_000);

        try {
          if (captureCase.accountId) {
            await loginWithDemo(page, captureCase.accountId);
          } else {
            await context.clearCookies();
          }

          await gotoStable(page, captureCase.route);
          const filename = `${captureCase.id}-${viewportName}.png`;
          const screenshotPath = path.join(OUTPUT_ROOT, filename);
          await page.screenshot({
            path: screenshotPath,
            fullPage: false,
            animations: "disabled",
          });

          entries.push({
            id: `${captureCase.id}-${viewportName}`,
            pageId: captureCase.id,
            label: captureCase.label,
            route: captureCase.route,
            accountId: captureCase.accountId,
            viewport: viewportName,
            viewportSize: viewport,
            filename,
            outputPath: toPosix(path.relative(REPO_ROOT, screenshotPath)),
            reference: captureCase.reference,
            capturedAt: new Date().toISOString(),
            ok: true,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push({
            id: `${captureCase.id}-${viewportName}`,
            pageId: captureCase.id,
            label: captureCase.label,
            route: captureCase.route,
            accountId: captureCase.accountId,
            viewport: viewportName,
            reason,
          });
          console.warn(`[pixel:capture] ${captureCase.id}/${viewportName} failed: ${reason}`);
        } finally {
          await context.close().catch(() => undefined);
        }
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await stopServer(server);
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    phase: PHASE,
    outputRoot: toPosix(path.relative(REPO_ROOT, OUTPUT_ROOT)),
    startedLocalServer: server.started,
    entries,
    failures,
    ok: failures.length === 0,
  };
  await fs.writeFile(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_PATH, buildReport(manifest), "utf8");

  console.log(`Pixel screenshots captured: ${entries.length}`);
  console.log(`Capture failures: ${failures.length}`);
  console.log(`Manifest: ${toPosix(path.relative(REPO_ROOT, path.join(OUTPUT_ROOT, "manifest.json")))}`);
  console.log(`Report: ${toPosix(path.relative(REPO_ROOT, REPORT_PATH))}`);

  if (failures.length > 0) process.exitCode = 1;
}

async function ensureServer() {
  if (await canReachBaseUrl()) {
    return { started: false, process: null };
  }

  if (process.env.CAPTURE_BASE_URL) {
    throw new Error(`CAPTURE_BASE_URL is not reachable: ${BASE_URL}`);
  }

  await fs.writeFile(SERVER_LOG_PATH, "", "utf8");
  const serverCommand =
    process.platform === "win32"
      ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npm run dev -- --hostname 127.0.0.1 --port 3230"] }
      : { command: "npm", args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3230"] };

  const child = spawn(serverCommand.command, serverCommand.args, {
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => appendServerLog(chunk));
  child.stderr?.on("data", (chunk) => appendServerLog(chunk));

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const log = await readServerLog();
      throw new Error(`Local Next dev server exited before capture started.\n${log}`);
    }
    if (await canReachBaseUrl()) {
      await delay(1200);
      return { started: true, process: child };
    }
    await delay(1000);
  }

  const log = await readServerLog();
  await stopServer({ started: true, process: child });
  throw new Error(`Timed out waiting for local Next dev server at ${BASE_URL}.\n${log}`);
}

async function loginWithDemo(page, accountId) {
  const response = await page.request.post(`${BASE_URL}/api/auth/demo-login`, {
    data: { accountId },
  });

  if (!response.ok()) {
    throw new Error(`Demo login failed for ${accountId}: ${response.status()} ${await response.text()}`);
  }

  const setCookie = response.headers()["set-cookie"];
  const sessionCookie = setCookie?.match(/ccs_session=([^;]+)/)?.[1];
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
}

async function gotoStable(page, route) {
  const url = new URL(route, BASE_URL).toString();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 4500 }).catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(900);

  const current = new URL(page.url());
  if (route !== "/login" && current.pathname === "/login") {
    throw new Error(`Route ${route} redirected to /login during capture.`);
  }
}

async function canReachBaseUrl() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${BASE_URL}/login`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function stopServer(server) {
  if (!server?.started || !server.process) return;
  const pid = server.process.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    server.process.kill("SIGTERM");
  }
}

function appendServerLog(chunk) {
  fssync.appendFileSync(SERVER_LOG_PATH, chunk);
}

async function readServerLog() {
  return fssync.existsSync(SERVER_LOG_PATH) ? await fs.readFile(SERVER_LOG_PATH, "utf8") : "";
}

function buildReport(manifest) {
  const lines = [
    "# P01 Pixel Page Capture Report",
    "",
    `Generated: ${manifest.generatedAt}`,
    "",
    `- Base URL: ${manifest.baseUrl}`,
    `- Phase: ${manifest.phase}`,
    `- Output root: \`${manifest.outputRoot}\``,
    `- Started local server: ${manifest.startedLocalServer ? "yes" : "no"}`,
    `- Screenshots captured: ${manifest.entries.length}`,
    `- Failures: ${manifest.failures.length}`,
    "",
    "## Screenshots",
    "",
  ];

  if (manifest.entries.length) {
    for (const entry of manifest.entries) {
      lines.push(`- ${entry.id}: \`${entry.outputPath}\`, reference=\`${entry.reference}\``);
    }
  } else {
    lines.push("- None.");
  }

  lines.push("", "## Failures", "");
  if (manifest.failures.length) {
    for (const failure of manifest.failures) {
      lines.push(`- ${failure.id}: ${failure.reason}`);
    }
  } else {
    lines.push("- None.");
  }

  return `${lines.join("\n")}\n`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
