import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type RoleName = "anonymous" | "login" | "teacher" | "admin" | "parent";
type Severity = "P0" | "P1" | "P2" | "P3";
type ViewportName = "desktop" | "mobile";

interface ActiveRoute {
  viewport: ViewportName;
  role: RoleName;
  accountId: string;
  accountName: string;
  route: string;
}

interface SmokeIssue {
  id: string;
  severity: Severity;
  category:
    | "navigation"
    | "auth"
    | "render"
    | "console"
    | "page-error"
    | "network"
    | "image"
    | "mobile"
    | "button"
    | "chain"
    | "visual";
  viewport: ViewportName;
  role: RoleName;
  accountId: string;
  accountName: string;
  route: string;
  message: string;
  finalUrl?: string;
  status?: number;
  screenshot?: string;
  reproSteps: string[];
  suggestedFixPriority: string;
}

interface PageMetrics {
  title: string;
  textLength: number;
  bodyChildCount: number;
  scrollWidth: number;
  clientWidth: number;
  disabledButtons: number;
  totalButtons: number;
  loadingTextPresent: boolean;
  emptyTextPresent: boolean;
  brokenImages: string[];
}

interface PageVisit {
  label: string;
  route: string;
  viewport: ViewportName;
  role: RoleName;
  accountId: string;
  accountName: string;
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  durationMs: number;
  metrics?: PageMetrics;
  screenshot?: string;
}

interface ChainStep {
  id: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
  screenshot?: string;
}

interface OnlineSmokeReport {
  ok: boolean;
  generatedAt: string;
  baseURL: string;
  marker: string;
  artifactRoot: string;
  visits: PageVisit[];
  chain: ChainStep[];
  issues: SmokeIssue[];
  consoleErrors: SmokeIssue[];
  networkErrors: SmokeIssue[];
  screenshots: string[];
  summary: {
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    visits: number;
    chainPassed: number;
    chainFailed: number;
    chainSkipped: number;
  };
}

interface DemoAccount {
  accountId: string;
  accountName: string;
  loginLabels?: string[];
  role: Exclude<RoleName, "anonymous" | "login">;
  homeRoute: string;
}

const ARTIFACT_ROOT = path.join(process.cwd(), "artifacts", "online-smoke");
const SCREENSHOT_ROOT = path.join(ARTIFACT_ROOT, "screenshots");
const REPORT_PATH = path.join(ARTIFACT_ROOT, "online-smoke-report.json");
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const CHILD_ID = "c-1";
const SAFE_TEXT_PREFIX = "线上巡检测试请忽略";

const ACCOUNTS: Record<"admin" | "teacherPrimary" | "teacherFallback" | "parent", DemoAccount> = {
  admin: { accountId: "u-admin", accountName: "陈园长", role: "admin", homeRoute: "/admin" },
  teacherPrimary: { accountId: "u-teacher2", accountName: "周老师", role: "teacher", homeRoute: "/teacher" },
  teacherFallback: { accountId: "u-teacher", accountName: "李老师", role: "teacher", homeRoute: "/teacher" },
  parent: {
    accountId: "u-parent",
    accountName: "林妈妈",
    loginLabels: ["林妈妈", "林小雨妈妈"],
    role: "parent",
    homeRoute: `/parent?child=${CHILD_ID}`,
  },
};

test.describe.configure({ mode: "serial" });

test("online demo main chain smoke", async ({ browser }, testInfo) => {
  const baseURL = resolveBaseURL(testInfo);
  const marker = `${SAFE_TEXT_PREFIX}-${Date.now()}`;
  const report = createReport(baseURL, marker);
  let desktopContext: BrowserContext | null = null;
  let mobileContext: BrowserContext | null = null;

  try {
    await fs.mkdir(SCREENSHOT_ROOT, { recursive: true });

    desktopContext = await newContext(browser, baseURL, "desktop");
    const page = await desktopContext.newPage();
    const active = createActive("desktop");
    attachCollectors(page, report, active, baseURL);

    await visit(page, report, active, baseURL, "/", {
      label: "home-root",
      role: "anonymous",
      accountId: "none",
      accountName: "anonymous",
    });
    await visit(page, report, active, baseURL, "/login", {
      label: "login-page",
      role: "login",
      accountId: "none",
      accountName: "login",
    });
    await checkLoginPage(page, report);

    const chainState: Record<string, unknown> = {};
    const teacherAccount = await runChainStep(report, page, "teacher-write", "教师记录与会诊写入", async () =>
      createTeacherRecordAndConsultation(page, report, active, baseURL, marker, chainState)
    );

    await runChainStep(report, page, "teacher-route", "教师端指定路径巡检", async () => {
      const account = (teacherAccount as DemoAccount | null) ?? ACCOUNTS.teacherPrimary;
      await loginAs(page, report, active, baseURL, account, account.homeRoute, "teacher-home");
      await visit(page, report, active, baseURL, `/teacher/high-risk-consultation?childId=${CHILD_ID}`, {
        label: "teacher-high-risk-consultation",
        role: "teacher",
        accountId: account.accountId,
        accountName: account.accountName,
        requireProtected: true,
      });
      await tryRunHighRiskConsultation(page, report, active, marker);
      const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
      if (!bodyText.includes(marker)) {
        addIssue(report, active, {
          severity: "P2",
          category: "visual",
          message: "教师端高风险会诊页面未直接展示本次线上巡检 marker；可能只在 API 或下游视图可见。",
          reproSteps: ["登录教师演示账号", `打开 /teacher/high-risk-consultation?childId=${CHILD_ID}`, `查找 ${marker}`],
          suggestedFixPriority: "P2：确保新建会诊/材料在高风险会诊页面有明确的可见反馈或历史入口。",
        });
      }
      return { teacherAccount: account.accountId, pageContainsMarker: bodyText.includes(marker) };
    });

    await runChainStep(report, page, "admin-acceptance", "管理端承接巡检", async () => {
      await loginAs(page, report, active, baseURL, ACCOUNTS.admin, "/admin", "admin-home");
      await visit(page, report, active, baseURL, "/admin/agent", {
        label: "admin-agent",
        role: "admin",
        accountId: ACCOUNTS.admin.accountId,
        accountName: ACCOUNTS.admin.accountName,
        requireProtected: true,
      });
      await visit(page, report, active, baseURL, "/admin", {
        label: "admin-home-after-agent",
        role: "admin",
        accountId: ACCOUNTS.admin.accountId,
        accountName: ACCOUNTS.admin.accountName,
        requireProtected: true,
      });
      const apiVisible = await apiListContainsMarker(page, report, active, "/api/consultations", marker, "admin consultation list");
      const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
      if (!bodyText.includes(marker)) {
        addIssue(report, active, {
          severity: apiVisible ? "P2" : "P1",
          category: "chain",
          message: apiVisible
            ? "管理端 API 能看到本次会诊 marker，但 /admin 页面未直接展示。"
            : "管理端未能通过 UI 或 API 确认本次会诊 marker。",
          reproSteps: ["登录陈园长", "打开 /admin", `查找 ${marker}`, "请求 /api/consultations"],
          suggestedFixPriority: apiVisible
            ? "P2：管理端首页承接区应明确展示最新高风险会诊或提供可追踪入口。"
            : "P1：修复会诊创建后的管理端可见性或账号作用域。",
        });
      }
      return { adminApiContainsMarker: apiVisible, adminPageContainsMarker: bodyText.includes(marker) };
    });

    await runChainStep(report, page, "parent-storybook-action", "家长端绘本与家庭行动巡检", async () => {
      await loginAs(page, report, active, baseURL, ACCOUNTS.parent, `/parent?child=${CHILD_ID}`, "parent-home");
      const parentHomeText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
      const hasFamilyAction = /今晚|家庭|行动|反馈|任务|tonight/i.test(parentHomeText);
      if (!hasFamilyAction) {
        addIssue(report, active, {
          severity: "P2",
          category: "visual",
          message: "家长首页未识别到家庭行动/今晚任务相关文本。",
          reproSteps: ["登录林妈妈", `打开 /parent?child=${CHILD_ID}`, "查找家庭行动或今晚任务区域"],
          suggestedFixPriority: "P2：在家长首页首屏或桥接区保留清晰的家庭行动入口。",
        });
      }
      await visit(page, report, active, baseURL, `/parent/storybook?child=${CHILD_ID}`, {
        label: "parent-storybook",
        role: "parent",
        accountId: ACCOUNTS.parent.accountId,
        accountName: ACCOUNTS.parent.accountName,
        requireProtected: true,
      });
      const storybookVisible = await page.getByTestId("lin-xiaoyu-fixed-storybook").isVisible({ timeout: 20_000 }).catch(() => false);
      if (!storybookVisible) {
        addIssue(report, active, {
          severity: "P1",
          category: "chain",
          message: "家长端绘本主容器未出现。",
          reproSteps: ["登录林妈妈", `打开 /parent/storybook?child=${CHILD_ID}`, "等待 lin-xiaoyu-fixed-storybook"],
          suggestedFixPriority: "P1：修复绘本首屏渲染、素材加载或 child 参数兼容。",
        });
      }
      return { parentHomeHasFamilyAction: hasFamilyAction, storybookVisible };
    });

    await runChainStep(report, page, "parent-feedback-writeback", "家长反馈写回", async () => {
      await loginAs(page, report, active, baseURL, ACCOUNTS.parent, `/parent/agent?child=${CHILD_ID}#feedback`, "parent-agent-feedback");
      const feedbackWritten = await submitParentFeedback(page, report, active, marker);
      const apiVisible = await apiListContainsMarker(page, report, active, `/api/feedback?childId=${CHILD_ID}`, marker, "parent feedback list");
      return { feedbackWritten, parentFeedbackApiContainsMarker: apiVisible };
    });

    await runChainStep(report, page, "writeback-visible", "反馈写回到教师端与管理端", async () => {
      const account = (teacherAccount as DemoAccount | null) ?? ACCOUNTS.teacherPrimary;
      await loginAs(page, report, active, baseURL, account, `/teacher/high-risk-consultation?childId=${CHILD_ID}`, "teacher-writeback-check");
      const setupText = await page.getByTestId("r06-consultation-setup").innerText({ timeout: 20_000 }).catch(() => "");
      const teacherShowsFeedback = setupText.includes(marker) || setupText.includes("家长反馈");
      if (!teacherShowsFeedback) {
        addIssue(report, active, {
          severity: "P1",
          category: "chain",
          message: "教师端高风险会诊输入区未展示家长反馈写回信息。",
          reproSteps: ["提交家长结构化反馈", "登录教师账号", `打开 /teacher/high-risk-consultation?childId=${CHILD_ID}`, "查看会诊输入区"],
          suggestedFixPriority: "P1：修复 parent feedback 到 consultation setup 的写回消费链路。",
        });
      }

      await loginAs(page, report, active, baseURL, ACCOUNTS.admin, "/admin", "admin-writeback-check");
      const adminFeedback = page.getByTestId("admin-family-feedback-writeback");
      const adminFeedbackVisible = await adminFeedback.first().isVisible({ timeout: 30_000 }).catch(() => false);
      const adminText = adminFeedbackVisible ? await adminFeedback.first().innerText().catch(() => "") : "";
      const adminShowsFeedback = adminText.includes(marker) || adminText.includes("已回流") || adminText.includes("家庭执行结果");
      if (!adminShowsFeedback) {
        addIssue(report, active, {
          severity: "P1",
          category: "chain",
          message: "管理端家庭反馈写回区域未展示本次反馈或回流状态。",
          reproSteps: ["提交家长结构化反馈", "登录陈园长", "打开 /admin", "查看 admin-family-feedback-writeback"],
          suggestedFixPriority: "P1：修复管理端家庭反馈回流卡片的数据源或排序。",
        });
      }
      return { teacherShowsFeedback, adminFeedbackVisible, adminShowsFeedback };
    });

    mobileContext = await newContext(browser, baseURL, "mobile");
    await runMobileChecks(mobileContext, report, baseURL);
  } finally {
    if (mobileContext) await mobileContext.close();
    if (desktopContext) await desktopContext.close();
    finalizeSummary(report);
    await writeReport(report);
  }

  const blocking = report.issues.filter((issue) => issue.severity === "P0" || issue.severity === "P1");
  expect(blocking, blocking.map((issue) => `${issue.severity} ${issue.route}: ${issue.message}`).join("\n")).toEqual([]);
});

async function newContext(browser: Browser, baseURL: string, viewport: ViewportName) {
  return browser.newContext({
    baseURL,
    viewport: viewport === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT,
    locale: "zh-CN",
    deviceScaleFactor: 1,
  });
}

function createReport(baseURL: string, marker: string): OnlineSmokeReport {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    baseURL,
    marker,
    artifactRoot: toPosix(path.relative(process.cwd(), ARTIFACT_ROOT)),
    visits: [],
    chain: [],
    issues: [],
    consoleErrors: [],
    networkErrors: [],
    screenshots: [],
    summary: {
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      visits: 0,
      chainPassed: 0,
      chainFailed: 0,
      chainSkipped: 0,
    },
  };
}

function createActive(viewport: ViewportName): ActiveRoute {
  return {
    viewport,
    role: "anonymous",
    accountId: "none",
    accountName: "anonymous",
    route: "/",
  };
}

function setActive(active: ActiveRoute, next: Partial<ActiveRoute>) {
  Object.assign(active, next);
}

async function visit(
  page: Page,
  report: OnlineSmokeReport,
  active: ActiveRoute,
  baseURL: string,
  route: string,
  options: {
    label: string;
    role: RoleName;
    accountId: string;
    accountName: string;
    requireProtected?: boolean;
  }
) {
  setActive(active, {
    route,
    role: options.role,
    accountId: options.accountId,
    accountName: options.accountName,
  });

  const startedAt = Date.now();
  const requestedUrl = absoluteUrl(baseURL, route);
  let response: APIResponse | null = null;
  let navigationError: string | null = null;

  try {
    response = (await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: 45_000 })) as APIResponse | null;
    await settle(page);
  } catch (error) {
    navigationError = normalizeError(error);
    addIssue(report, active, {
      severity: "P0",
      category: "navigation",
      message: `页面导航失败：${navigationError}`,
      reproSteps: [`打开 ${route}`],
      suggestedFixPriority: "P0：页面无法稳定访问，优先检查部署、路由或运行时错误。",
    });
  }

  const metrics = await getPageMetrics(page).catch(() => undefined);
  const screenshot = await capture(page, report, `${active.viewport}-${options.label}`);
  const status = response?.status() ?? null;
  const finalUrl = page.url();

  const record: PageVisit = {
    label: options.label,
    route,
    viewport: active.viewport,
    role: options.role,
    accountId: options.accountId,
    accountName: options.accountName,
    requestedUrl,
    finalUrl,
    status,
    durationMs: Date.now() - startedAt,
    metrics,
    screenshot,
  };
  report.visits.push(record);

  if (status !== null && status >= 500) {
    addIssue(report, active, {
      severity: "P0",
      category: "navigation",
      status,
      finalUrl,
      screenshot,
      message: `${route} 返回 HTTP ${status}`,
      reproSteps: [`打开 ${route}`],
      suggestedFixPriority: "P0：修复页面或 API 运行时 5xx。",
    });
  } else if (status !== null && status >= 400) {
    addIssue(report, active, {
      severity: "P1",
      category: "navigation",
      status,
      finalUrl,
      screenshot,
      message: `${route} 返回 HTTP ${status}`,
      reproSteps: [`打开 ${route}`],
      suggestedFixPriority: "P1：修复页面路由、权限或资源缺失。",
    });
  }

  if (options.requireProtected && route !== "/login" && safePathname(finalUrl) === "/login") {
    addIssue(report, active, {
      severity: "P1",
      category: "auth",
      finalUrl,
      screenshot,
      message: `${route} 登录后仍被重定向到 /login`,
      reproSteps: [`登录 ${options.accountName}`, `打开 ${route}`],
      suggestedFixPriority: "P1：检查演示登录 cookie/session 在受保护路由的恢复逻辑。",
    });
  }

  if (metrics) {
    if (metrics.bodyChildCount === 0 || metrics.textLength < 30) {
      addIssue(report, active, {
        severity: "P0",
        category: "render",
        finalUrl,
        screenshot,
        message: `${route} 看起来是空白页：body text length=${metrics.textLength}`,
        reproSteps: [`打开 ${route}`, "等待页面加载完成"],
        suggestedFixPriority: "P0：修复页面渲染异常或加载守卫。",
      });
    }
    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      addIssue(report, active, {
        severity: active.viewport === "mobile" ? "P2" : "P3",
        category: active.viewport === "mobile" ? "mobile" : "visual",
        finalUrl,
        screenshot,
        message: `${route} 存在水平溢出：scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth}`,
        reproSteps: [`设置 ${active.viewport} viewport`, `打开 ${route}`],
        suggestedFixPriority: active.viewport === "mobile"
          ? "P2：移动端固定宽元素、表格或图片需要响应式约束。"
          : "P3：桌面端溢出建议在后续视觉 polish 修复。",
      });
    }
    if (metrics.loadingTextPresent) {
      addIssue(report, active, {
        severity: "P2",
        category: "render",
        finalUrl,
        screenshot,
        message: `${route} settle 后仍检测到加载态文本。`,
        reproSteps: [`打开 ${route}`, "等待 networkidle/settle 后查看页面"],
        suggestedFixPriority: "P2：确认加载态是否卡住，或为慢接口提供清晰完成/失败态。",
      });
    }
    for (const src of metrics.brokenImages) {
      addIssue(report, active, {
        severity: "P2",
        category: "image",
        finalUrl,
        screenshot,
        message: `图片元素加载失败：${src}`,
        reproSteps: [`打开 ${route}`, "检查页面图片 naturalWidth"],
        suggestedFixPriority: "P2：恢复缺失素材或修正图片路径。",
      });
    }
  }

  return record;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(800);
}

async function getPageMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText ?? "";
    const brokenImages = Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src)
      .filter(Boolean);
    return {
      title: document.title,
      textLength: bodyText.trim().length,
      bodyChildCount: document.body?.children.length ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      disabledButtons: Array.from(document.querySelectorAll("button")).filter((button) => button.disabled).length,
      totalButtons: document.querySelectorAll("button").length,
      loadingTextPresent: /加载中|正在加载|Loading|loading/i.test(bodyText),
      emptyTextPresent: /暂无|无数据|empty/i.test(bodyText),
      brokenImages,
    };
  });
}

async function checkLoginPage(page: Page, report: OnlineSmokeReport) {
  const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  const loginScreenshot = report.visits.find((visit) => visit.label === "login-page")?.screenshot;
  const demoAccounts: DemoAccount[] = [ACCOUNTS.admin, ACCOUNTS.teacherFallback, ACCOUNTS.teacherPrimary, ACCOUNTS.parent];
  for (const account of demoAccounts) {
    const labels = account.loginLabels ?? [account.accountName];
    if (!labels.some((label) => bodyText.includes(label))) {
      addIssue(report, createActive("desktop"), {
        severity: "P1",
        category: "auth",
        role: "login",
        accountId: account.accountId,
        accountName: account.accountName,
        route: "/login",
        screenshot: loginScreenshot,
        message: `登录页未发现演示账号入口：${labels.join(" / ")}`,
        reproSteps: ["打开 /login", `查找 ${labels.join(" / ")} 演示账号入口`],
        suggestedFixPriority: "P1：恢复登录页演示账号入口，保障评审可直接进入三端。",
      });
    }
  }
}

async function loginAs(
  page: Page,
  report: OnlineSmokeReport,
  active: ActiveRoute,
  baseURL: string,
  account: DemoAccount,
  route: string,
  label: string
) {
  setActive(active, {
    role: account.role,
    accountId: account.accountId,
    accountName: account.accountName,
    route: "/api/auth/demo-login",
  });
  const response = await page.request.post(absoluteUrl(baseURL, "/api/auth/demo-login"), {
    data: { accountId: account.accountId },
  });
  if (response.status() !== 200) {
    addIssue(report, active, {
      severity: "P0",
      category: "auth",
      status: response.status(),
      message: `${account.accountName} 演示登录失败：HTTP ${response.status()} ${await response.text().catch(() => "")}`,
      reproSteps: [`POST /api/auth/demo-login { accountId: "${account.accountId}" }`],
      suggestedFixPriority: "P0：修复演示账号登录接口或线上 cookie/session 配置。",
    });
    return false;
  }
  await visit(page, report, active, baseURL, route, {
    label,
    role: account.role,
    accountId: account.accountId,
    accountName: account.accountName,
    requireProtected: true,
  });
  return true;
}

async function createTeacherRecordAndConsultation(
  page: Page,
  report: OnlineSmokeReport,
  active: ActiveRoute,
  baseURL: string,
  marker: string,
  chainState: Record<string, unknown>
) {
  const candidates = [ACCOUNTS.teacherPrimary, ACCOUNTS.teacherFallback];
  let lastError = "";

  for (const account of candidates) {
    const startedAt = Date.now();
    const loggedIn = await loginAs(page, report, active, baseURL, account, "/teacher", `teacher-home-${account.accountId}`);
    if (!loggedIn) continue;

    const recordResponse = await postJson(page, report, active, baseURL, "/api/records", {
      type: "growth",
      childId: CHILD_ID,
      category: "线上巡检",
      tags: ["线上巡检", "主链 smoke"],
      description: `${marker} 教师观察记录：孩子今天分离焦虑明显，需要高风险会诊承接。`,
      needsAttention: true,
      followUpAction: `${marker} 需要园所与家庭今晚同步一个小步行动。`,
    });

    if (![200, 201].includes(recordResponse.status)) {
      lastError = `teacher record failed with ${recordResponse.status}`;
      continue;
    }

    const materialResponse = await postJson(page, report, active, baseURL, "/api/health-materials", {
      childId: CHILD_ID,
      filename: `online-smoke-${Date.now()}.txt`,
      fileType: "text/plain",
      description: `${marker} 健康/行为材料：午睡过渡困难，建议会诊。`,
      parseResult: {
        source: "online-smoke",
        fallback: true,
        summary: marker,
        risks: ["separation-anxiety", "sleep-transition"],
      },
    });

    if (![200, 201].includes(materialResponse.status)) {
      lastError = `health material failed with ${materialResponse.status}`;
      continue;
    }

    const materialId = readNestedString(materialResponse.body, ["data", "materialId"]) || readNestedString(materialResponse.body, ["materialId"]);
    const consultationResponse = await postJson(page, report, active, baseURL, "/api/consultations", {
      childId: CHILD_ID,
      sourceMaterialId: materialId,
      riskLevel: "high",
      summary: `${marker} 高风险会诊：分离焦虑与午睡过渡需要园家共同行动。`,
      notes: `${marker} 教师补充：连续两天午睡前哭闹，需要家长端今晚反馈执行结果。`,
    });

    if (![200, 201].includes(consultationResponse.status)) {
      lastError = `consultation failed with ${consultationResponse.status}`;
      continue;
    }

    const consultationId =
      readNestedString(consultationResponse.body, ["data", "consultationId"]) ||
      readNestedString(consultationResponse.body, ["consultationId"]);

    if (consultationId) {
      await postJson(page, report, active, baseURL, `/api/consultations/${consultationId}/notes`, {
        note: `${marker} 教师会诊备注：请管理端承接并在家长端形成今晚行动。`,
      });
    }

    chainState.teacherAccount = account.accountId;
    chainState.materialId = materialId;
    chainState.consultationId = consultationId;
    chainState.teacherRecordStatus = recordResponse.status;
    chainState.durationMs = Date.now() - startedAt;
    return account;
  }

  throw new Error(lastError || "No teacher account could create the online smoke record/consultation.");
}

async function tryRunHighRiskConsultation(page: Page, report: OnlineSmokeReport, active: ActiveRoute, marker: string) {
  const startButton = page.getByTestId("r06-consultation-start-button");
  const visible = await startButton.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!visible) {
    const screenshot = await capture(page, report, "desktop-teacher-high-risk-start-missing");
    addIssue(report, active, {
      severity: "P2",
      category: "button",
      role: "teacher",
      accountId: "u-teacher2/u-teacher",
      accountName: "teacher",
      route: "/teacher/high-risk-consultation",
      screenshot,
      message: "未找到高风险会诊开始按钮 r06-consultation-start-button。",
      reproSteps: [`打开 /teacher/high-risk-consultation?childId=${CHILD_ID}`, "查找开始会诊按钮"],
      suggestedFixPriority: "P2：保持高风险会诊主按钮的稳定 test id 和可见状态。",
    });
    return false;
  }
  if (!(await startButton.isEnabled().catch(() => false))) {
    const screenshot = await capture(page, report, "desktop-teacher-high-risk-start-disabled");
    addIssue(report, active, {
      severity: "P2",
      category: "button",
      role: "teacher",
      accountId: "u-teacher2/u-teacher",
      accountName: "teacher",
      route: "/teacher/high-risk-consultation",
      screenshot,
      message: "高风险会诊开始按钮不可点击。",
      reproSteps: [`打开 /teacher/high-risk-consultation?childId=${CHILD_ID}`, "检查开始会诊按钮状态"],
      suggestedFixPriority: "P2：按钮禁用时应给出明确原因，或在演示链路中保证可执行。",
    });
    return false;
  }
  await startButton.click();
  const result = page.locator("#consultation-result");
  const shown = await result.isVisible({ timeout: 75_000 }).catch(() => false);
  if (!shown) {
    const screenshot = await capture(page, report, "desktop-teacher-high-risk-result-timeout");
    addIssue(report, active, {
      severity: "P1",
      category: "chain",
      role: "teacher",
      accountId: "u-teacher2/u-teacher",
      accountName: "teacher",
      route: "/teacher/high-risk-consultation",
      screenshot,
      message: "点击开始会诊后，结果区在 75 秒内未出现。",
      reproSteps: [`打开 /teacher/high-risk-consultation?childId=${CHILD_ID}`, "点击开始会诊", "等待 #consultation-result"],
      suggestedFixPriority: "P1：修复会诊 API、stream fallback 或页面结果态。",
    });
    return false;
  }
  const text = await result.innerText().catch(() => "");
  if (!text.includes(marker) && !/家庭|行动|复查|干预/.test(text)) {
    const screenshot = await capture(page, report, "desktop-teacher-high-risk-result-content");
    addIssue(report, active, {
      severity: "P2",
      category: "chain",
      role: "teacher",
      accountId: "u-teacher2/u-teacher",
      accountName: "teacher",
      route: "/teacher/high-risk-consultation",
      screenshot,
      message: "会诊结果出现，但未识别到本次 marker 或家庭行动/复查语义。",
      reproSteps: [`打开 /teacher/high-risk-consultation?childId=${CHILD_ID}`, "点击开始会诊", "查看结果卡片内容"],
      suggestedFixPriority: "P2：确认会诊结果是否消费最新教师记录和家庭闭环语义。",
    });
  }
  return true;
}

async function submitParentFeedback(page: Page, report: OnlineSmokeReport, active: ActiveRoute, marker: string) {
  const section = page.getByTestId("r07-parent-agent-feedback-section").first();
  if (!(await section.isVisible({ timeout: 45_000 }).catch(() => false))) {
    addIssue(report, active, {
      severity: "P1",
      category: "chain",
      message: "家长反馈区域 r07-parent-agent-feedback-section 未出现。",
      reproSteps: ["登录林妈妈", `打开 /parent/agent?child=${CHILD_ID}#feedback`, "等待反馈区域"],
      suggestedFixPriority: "P1：修复家长端反馈入口或 child 参数下的行动卡加载。",
    });
    return false;
  }

  await section.scrollIntoViewIfNeeded();
  const submit = page.getByTestId("parent-submit-structured-feedback");
  const feedbackNote = `${marker} 家长反馈：今晚已完成共读绘本和门口小步尝试，孩子愿意复述一次，明早继续观察。`;

  await section.getByTestId("feedback-execution-completed").click({ timeout: 20_000 }).catch(() => undefined);
  await section.getByTestId("feedback-reaction-improved-4").click({ timeout: 20_000 }).catch(() => undefined);
  await section.getByTestId("feedback-improvement-clear_improvement-4").click({ timeout: 20_000 }).catch(() => undefined);
  await section.locator("textarea").first().fill(feedbackNote, { timeout: 20_000 }).catch(async () => {
    await section.getByRole("textbox").first().fill(feedbackNote, { timeout: 20_000 });
  });

  if (!(await submit.isEnabled({ timeout: 20_000 }).catch(() => false))) {
    addIssue(report, active, {
      severity: "P1",
      category: "button",
      message: "填写家长反馈后，提交按钮 parent-submit-structured-feedback 仍不可点击。",
      reproSteps: ["登录林妈妈", `打开 /parent/agent?child=${CHILD_ID}#feedback`, "选择执行状态/孩子反应/改善情况", "填写备注", "查看提交按钮"],
      suggestedFixPriority: "P1：修复结构化反馈表单校验或行动卡绑定条件。",
    });
    return false;
  }

  await submit.click();
  const bodyContainsMarker = await page
    .locator("body")
    .filter({ hasText: marker })
    .first()
    .isVisible({ timeout: 30_000 })
    .catch(() => false);
  if (!bodyContainsMarker) {
    addIssue(report, active, {
      severity: "P2",
      category: "chain",
      message: "提交家长反馈后，页面未直接显示本次 marker；将继续通过 API 验证写入。",
      reproSteps: ["提交结构化反馈", `查找 ${marker}`],
      suggestedFixPriority: "P2：提交成功后应展示可辨识的最新反馈或成功状态。",
    });
  }
  await capture(page, report, "desktop-parent-feedback-submitted");
  return true;
}

async function apiListContainsMarker(
  page: Page,
  report: OnlineSmokeReport,
  active: ActiveRoute,
  route: string,
  marker: string,
  label: string
) {
  const response = await page.request.get(route);
  const body = await readJson(response);
  if (response.status() >= 400) {
    addIssue(report, active, {
      severity: response.status() >= 500 ? "P1" : "P2",
      category: "network",
      status: response.status(),
      message: `${label} 请求失败：HTTP ${response.status()}`,
      reproSteps: [`GET ${route}`],
      suggestedFixPriority: response.status() >= 500
        ? "P1：修复主链查询 API 运行时错误。"
        : "P2：检查演示账号权限、child 作用域或 API 参数。",
    });
    return false;
  }
  return JSON.stringify(body).includes(marker);
}

async function postJson(
  page: Page,
  report: OnlineSmokeReport,
  active: ActiveRoute,
  baseURL: string,
  route: string,
  data: Record<string, unknown>
) {
  setActive(active, { route });
  const response = await page.request.post(absoluteUrl(baseURL, route), { data });
  const body = await readJson(response);
  if (response.status() >= 400) {
    addIssue(report, active, {
      severity: response.status() >= 500 ? "P1" : "P2",
      category: "network",
      status: response.status(),
      message: `主链写入接口 ${route} 返回 HTTP ${response.status()}：${JSON.stringify(body).slice(0, 500)}`,
      reproSteps: [`POST ${route}`, `payload: ${JSON.stringify(data).slice(0, 500)}`],
      suggestedFixPriority: response.status() >= 500
        ? "P1：修复主链写入 API 运行时错误。"
        : "P2：检查演示账号权限、请求 schema 或 child 作用域。",
    });
  }
  return { status: response.status(), body };
}

async function runChainStep<T>(
  report: OnlineSmokeReport,
  page: Page,
  id: string,
  title: string,
  fn: () => Promise<T>
) {
  const startedAt = Date.now();
  const step: ChainStep = {
    id,
    title,
    status: "passed",
    durationMs: 0,
  };
  try {
    const details = await fn();
    step.details = asRecord(details);
    step.screenshot = await capture(page, report, `chain-${id}`);
    return details;
  } catch (error) {
    step.status = "failed";
    step.error = normalizeError(error);
    step.screenshot = await capture(page, report, `chain-${id}-failure`);
    report.issues.push({
      id: nextIssueId(report),
      severity: "P1",
      category: "chain",
      viewport: "desktop",
      role: "anonymous",
      accountId: "unknown",
      accountName: "unknown",
      route: id,
      message: `${title} 失败：${step.error}`,
      screenshot: step.screenshot,
      reproSteps: [`执行链路步骤：${title}`],
      suggestedFixPriority: "P1：主链步骤失败，按报告中的具体页面/API 错误优先修复。",
    });
    return null as T;
  } finally {
    step.durationMs = Date.now() - startedAt;
    report.chain.push(step);
  }
}

async function runMobileChecks(context: BrowserContext, report: OnlineSmokeReport, baseURL: string) {
  const page = await context.newPage();
  const active = createActive("mobile");
  attachCollectors(page, report, active, baseURL);

  await visit(page, report, active, baseURL, "/login", {
    label: "mobile-login",
    role: "login",
    accountId: "none",
    accountName: "login",
  });

  await loginAs(page, report, active, baseURL, ACCOUNTS.teacherPrimary, "/teacher", "mobile-teacher-home");
  await visit(page, report, active, baseURL, `/teacher/high-risk-consultation?childId=${CHILD_ID}`, {
    label: "mobile-teacher-high-risk",
    role: "teacher",
    accountId: ACCOUNTS.teacherPrimary.accountId,
    accountName: ACCOUNTS.teacherPrimary.accountName,
    requireProtected: true,
  });

  await loginAs(page, report, active, baseURL, ACCOUNTS.admin, "/admin", "mobile-admin-home");
  await loginAs(page, report, active, baseURL, ACCOUNTS.parent, `/parent?child=${CHILD_ID}`, "mobile-parent-home");
  await visit(page, report, active, baseURL, `/parent/storybook?child=${CHILD_ID}`, {
    label: "mobile-parent-storybook",
    role: "parent",
    accountId: ACCOUNTS.parent.accountId,
    accountName: ACCOUNTS.parent.accountName,
    requireProtected: true,
  });
  await visit(page, report, active, baseURL, `/parent/agent?child=${CHILD_ID}#feedback`, {
    label: "mobile-parent-agent",
    role: "parent",
    accountId: ACCOUNTS.parent.accountId,
    accountName: ACCOUNTS.parent.accountName,
    requireProtected: true,
  });
}

function attachCollectors(page: Page, report: OnlineSmokeReport, active: ActiveRoute, baseURL: string) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (isAllowedConsoleNoise(text)) return;
    const issue = addIssue(report, active, {
      severity: "P2",
      category: "console",
      message: text,
      reproSteps: [`打开 ${active.route}`, "查看浏览器 console.error"],
      suggestedFixPriority: "P2：修复运行时 console error，或对预期失败降级为清晰 UI 状态。",
    });
    report.consoleErrors.push(issue);
  });

  page.on("pageerror", (error) => {
    addIssue(report, active, {
      severity: "P0",
      category: "page-error",
      message: error.message,
      reproSteps: [`打开 ${active.route}`, "观察未捕获浏览器异常"],
      suggestedFixPriority: "P0：修复未捕获前端异常。",
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (!isSameOrigin(url, baseURL)) return;
    if (isAllowedNetworkNoise(url, status)) return;
    const issue = addIssue(report, active, {
      severity: status >= 500 ? "P1" : "P3",
      category: "network",
      status,
      finalUrl: url,
      message: `同源请求返回 HTTP ${status}: ${url}`,
      reproSteps: [`打开 ${active.route}`, `观察请求 ${url}`],
      suggestedFixPriority: status >= 500
        ? "P1：修复线上同源 API/资源 5xx。"
        : "P3：确认 4xx 是否为预期权限/探测请求，否则补齐资源或参数。",
    });
    report.networkErrors.push(issue);
  });
}

function addIssue(
  report: OnlineSmokeReport,
  active: ActiveRoute,
  input: Omit<Partial<SmokeIssue>, "id" | "viewport"> & {
    severity: Severity;
    category: SmokeIssue["category"];
    message: string;
    reproSteps: string[];
    suggestedFixPriority: string;
  }
) {
  const issue: SmokeIssue = {
    id: nextIssueId(report),
    severity: input.severity,
    category: input.category,
    viewport: active.viewport,
    role: input.role ?? active.role,
    accountId: input.accountId ?? active.accountId,
    accountName: input.accountName ?? active.accountName,
    route: input.route ?? active.route,
    message: input.message,
    finalUrl: input.finalUrl,
    status: input.status,
    screenshot: input.screenshot,
    reproSteps: input.reproSteps,
    suggestedFixPriority: input.suggestedFixPriority,
  };
  report.issues.push(issue);
  return issue;
}

async function capture(page: Page, report: OnlineSmokeReport, slug: string) {
  await fs.mkdir(SCREENSHOT_ROOT, { recursive: true });
  const filePath = path.join(SCREENSHOT_ROOT, `${slugify(slug)}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true, animations: "disabled" }).catch(() => undefined);
  const relativePath = toPosix(path.relative(process.cwd(), filePath));
  report.screenshots.push(relativePath);
  return relativePath;
}

async function readJson(response: APIResponse) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { nonJsonText: text.slice(0, 500) };
  }
}

function readNestedString(value: unknown, pathParts: string[]) {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !(part in current)) return "";
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : "";
}

function finalizeSummary(report: OnlineSmokeReport) {
  report.summary = {
    p0: report.issues.filter((issue) => issue.severity === "P0").length,
    p1: report.issues.filter((issue) => issue.severity === "P1").length,
    p2: report.issues.filter((issue) => issue.severity === "P2").length,
    p3: report.issues.filter((issue) => issue.severity === "P3").length,
    visits: report.visits.length,
    chainPassed: report.chain.filter((step) => step.status === "passed").length,
    chainFailed: report.chain.filter((step) => step.status === "failed").length,
    chainSkipped: report.chain.filter((step) => step.status === "skipped").length,
  };
  report.ok = report.summary.p0 === 0 && report.summary.p1 === 0;
}

async function writeReport(report: OnlineSmokeReport) {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function resolveBaseURL(testInfo: TestInfo) {
  return String(testInfo.project.use.baseURL ?? process.env.ONLINE_SMOKE_BASE_URL ?? "https://www.smartchildcare.cn").replace(/\/$/, "");
}

function absoluteUrl(baseURL: string, route: string) {
  return route.startsWith("http") ? route : new URL(route, `${baseURL}/`).toString();
}

function safePathname(rawUrl: string) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
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
    text.includes("ERR_ABORTED") ||
    text.includes("ResizeObserver loop") ||
    text.includes("va.vercel-scripts.com") ||
    text.includes("net::ERR_BLOCKED_BY_ORB")
  );
}

function isAllowedNetworkNoise(url: string, status: number) {
  return (
    (url.includes("/api/auth/session") && status === 401) ||
    url.includes("_next/webpack-hmr") ||
    url.includes("__nextjs_original-stack-frame") ||
    url.includes("favicon.ico")
  );
}

function nextIssueId(report: OnlineSmokeReport) {
  return `ONLINE-${String(report.issues.length + 1).padStart(3, "0")}`;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function slugify(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "capture";
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
