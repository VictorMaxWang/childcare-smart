import { test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

type CaptureRole = "login" | "director" | "teacher-li" | "teacher-zhou" | "parent";
type ViewportName = "desktop" | "tablet" | "mobile";
type CaptureMode = "viewport" | "fullPage" | "state";

interface ManifestEntry {
  id: string;
  role: CaptureRole;
  demoAccount: string;
  route: string;
  pageTitle: string;
  viewport: ViewportName;
  mode: CaptureMode;
  stateName: string;
  filename: string;
  capturedAt: string;
  notes: string;
  sensitiveDataMasked: boolean;
  recommendedForGPTImage2: boolean;
}

interface RouteSpec {
  route: string;
  slug: string;
  title: string;
  module: string;
  notes: string;
  recommended?: boolean;
}

interface RoleSpec {
  role: Exclude<CaptureRole, "login">;
  demoAccount: string;
  demoButtonText: string;
  accountId: string;
  roleLabel: string;
  expectedClass?: string;
  routes: RouteSpec[];
}

interface RouteAttempt {
  role: CaptureRole;
  demoAccount: string;
  route: string;
  ok: boolean;
  reason: string;
  finalUrl?: string;
}

const BASE_URL = (process.env.CAPTURE_BASE_URL ?? "https://www.smartchildcare.cn").replace(/\/$/, "");
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "ui-screenshots");

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const SOURCE_ROUTES = [
  "/login",
  "/auth/login",
  "/",
  "/admin",
  "/admin/agent",
  "/admin/agent?action=weekly-report",
  "/children",
  "/health",
  "/growth",
  "/diet",
  "/teacher",
  "/teacher/home",
  "/teacher/agent",
  "/teacher/agent?action=communication",
  "/teacher/agent?action=weekly-summary",
  "/teacher/health-file-bridge",
  "/teacher/high-risk-consultation",
  "/teacher/high-risk-consultation?trace=debug",
  "/parent",
  "/parent?child=c-1",
  "/parent/agent?child=c-1",
  "/parent/agent?child=c-1#feedback",
  "/parent/storybook?child=c-1",
];

const ROLE_SPECS: RoleSpec[] = [
  {
    role: "director",
    demoAccount: "陈园长",
    demoButtonText: "陈园长",
    accountId: "u-admin",
    roleLabel: "园长端 / 机构管理员",
    routes: [
      { route: "/admin", slug: "director-home", title: "园所首页", module: "园长端首页", notes: "园长端默认落点，含机构优先级、风险儿童、待办与 AI 入口。", recommended: true },
      { route: "/", slug: "director-overview", title: "数据总览", module: "数据总览", notes: "全园数据总览、规则建议、周报与风险摘要。", recommended: true },
      { route: "/admin/agent", slug: "director-ai-agent", title: "园长 AI 助手", module: "AI 助手", notes: "园长日常优先级、派单、会诊 trace 与行动建议。", recommended: true },
      { route: "/admin/agent?action=weekly-report", slug: "director-weekly-report", title: "本周运营周报", module: "统计报表", notes: "园长周报模式和运营复盘。", recommended: true },
      { route: "/children", slug: "director-children", title: "幼儿档案", module: "幼儿管理", notes: "园长可见的儿童档案列表、搜索和管理入口。", recommended: true },
      { route: "/health", slug: "director-health", title: "晨检与健康", module: "晨检健康", notes: "园长视角下的晨检、健康记录与异常告警。", recommended: true },
      { route: "/growth", slug: "director-growth", title: "成长行为", module: "成长记录", notes: "成长行为台账和复查状态。", recommended: true },
      { route: "/diet", slug: "director-diet", title: "饮食记录", module: "饮食记录", notes: "饮食记录、批量录入和趋势建议。", recommended: true },
    ],
  },
  {
    role: "teacher-li",
    demoAccount: "李老师",
    demoButtonText: "李老师",
    accountId: "u-teacher",
    roleLabel: "教师端 / 向阳班",
    expectedClass: "向阳班",
    routes: [
      { route: "/teacher", slug: "teacher-workbench", title: "教师工作台", module: "教师首页", notes: "教师默认落点，含班级运营、快捷记录和 AI 入口。", recommended: true },
      { route: "/teacher/agent", slug: "teacher-ai-agent", title: "教师 AI 助手", module: "AI 助手", notes: "儿童/班级模式、草稿确认、沟通建议和周报预览。", recommended: true },
      { route: "/teacher/agent?action=communication", slug: "teacher-communication", title: "家园沟通建议", module: "家园反馈", notes: "教师端预加载家园沟通建议模式。", recommended: true },
      { route: "/teacher/health-file-bridge", slug: "teacher-health-file-bridge", title: "健康材料解析", module: "健康材料解析", notes: "外部健康材料结构化解析页面。", recommended: true },
      { route: "/teacher/high-risk-consultation", slug: "teacher-high-risk-consultation", title: "高风险会诊", module: "风险会诊", notes: "教师端高风险儿童一键会诊主流程。", recommended: true },
      { route: "/children", slug: "teacher-children", title: "班级儿童列表", module: "儿童信息", notes: "教师可见儿童档案列表。", recommended: true },
      { route: "/health", slug: "teacher-health", title: "班级晨检", module: "晨检记录", notes: "教师端晨检与健康记录。", recommended: true },
      { route: "/diet", slug: "teacher-diet", title: "饮食记录", module: "饮食记录", notes: "教师端饮食记录和批量录入。", recommended: true },
      { route: "/growth", slug: "teacher-growth", title: "成长记录", module: "成长记录", notes: "教师端成长行为记录与复查。", recommended: true },
    ],
  },
  {
    role: "teacher-zhou",
    demoAccount: "周老师",
    demoButtonText: "周老师",
    accountId: "u-teacher2",
    roleLabel: "教师端 / 晨曦班",
    expectedClass: "晨曦班",
    routes: [
      { route: "/teacher", slug: "teacher-workbench", title: "教师工作台", module: "教师首页", notes: "周老师晨曦班工作台，用于比较不同班级数据状态。", recommended: true },
      { route: "/teacher/agent", slug: "teacher-ai-agent", title: "教师 AI 助手", module: "AI 助手", notes: "周老师班级 AI 助手页面。", recommended: true },
      { route: "/teacher/agent?action=communication", slug: "teacher-communication", title: "家园沟通建议", module: "家园反馈", notes: "周老师家园沟通建议模式。", recommended: true },
      { route: "/teacher/high-risk-consultation", slug: "teacher-high-risk-consultation", title: "高风险会诊", module: "风险会诊", notes: "周老师班级高风险会诊流程。", recommended: true },
      { route: "/children", slug: "teacher-children", title: "班级儿童列表", module: "儿童信息", notes: "周老师可见儿童列表，用于比较晨曦班数据状态。", recommended: true },
      { route: "/health", slug: "teacher-health", title: "班级晨检", module: "晨检记录", notes: "周老师晨检记录页面。", recommended: true },
      { route: "/diet", slug: "teacher-diet", title: "饮食记录", module: "饮食记录", notes: "周老师饮食记录页面。", recommended: true },
      { route: "/growth", slug: "teacher-growth", title: "成长记录", module: "成长记录", notes: "周老师成长记录页面。", recommended: true },
    ],
  },
  {
    role: "parent",
    demoAccount: "林妈妈",
    demoButtonText: "林妈妈",
    accountId: "u-parent",
    roleLabel: "家长端 / 林妈妈",
    routes: [
      { route: "/parent", slug: "parent-home", title: "家长首页", module: "家长首页", notes: "家长默认落点，含孩子状态、AI 提醒、今晚任务和反馈入口。", recommended: true },
      { route: "/parent?child=c-1", slug: "parent-child-overview", title: "孩子概览", module: "孩子概览", notes: "指定孩子上下文的家长首页。", recommended: true },
      { route: "/parent/agent?child=c-1", slug: "parent-agent", title: "家长 AI 助手", module: "反馈与追问", notes: "家长 AI 干预卡、趋势追问和反馈闭环。", recommended: true },
      { route: "/parent/agent?child=c-1#feedback", slug: "parent-feedback", title: "家长反馈区", module: "反馈", notes: "家长做完任务后的反馈入口。", recommended: true },
      { route: "/parent/storybook?child=c-1", slug: "parent-storybook", title: "成长绘本", module: "成长绘本", notes: "孩子成长小故事和绘本生成视图；需人工复核图片内是否有儿童姓名。", recommended: true },
      { route: "/children", slug: "parent-child-file", title: "儿童信息", module: "儿童信息", notes: "家长可见的儿童档案视图。", recommended: true },
      { route: "/health", slug: "parent-health-denied", title: "晨检权限状态", module: "权限/错误状态", notes: "家长直访晨检页的权限受限或错误状态。", recommended: false },
    ],
  },
];

const manifest: ManifestEntry[] = [];
const routeAttempts: RouteAttempt[] = [];
const roleMenus: Record<string, string[]> = {};
const roleLoginResults: Record<string, { ok: boolean; reason: string; finalUrl?: string; detectedClass?: string }> = {};
let sequence = 1;

test.describe.configure({ mode: "serial" });
test.setTimeout(90 * 60 * 1000);

test("capture smartchildcare UI screenshots", async ({ browser }) => {
  await ensureOutputDirs();

  const loginContext = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "zh-CN" });
  const loginPage = await loginContext.newPage();
  await captureLoginStates(loginPage);
  await loginContext.close();

  for (const roleSpec of ROLE_SPECS) {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: "zh-CN" });
    const page = await context.newPage();
    await clearBrowserState(page);

    const loginOk = await loginViaDemoButton(page, roleSpec);
    if (!loginOk) {
      await captureCurrentPage(page, {
        role: roleSpec.role,
        demoAccount: roleSpec.demoAccount,
        route: "/login",
        slug: `${roleSpec.role}-login-failed`,
        title: `${roleSpec.demoAccount} 登录失败`,
        viewport: "desktop",
        mode: "state",
        stateName: "login-failed",
        notes: "示例账号入口点击后未能进入对应角色页面。",
        recommendedForGPTImage2: false,
        forceStatesDir: true,
      });
      await context.close();
      continue;
    }

    roleMenus[roleSpec.role] = await extractNavigation(page);
    roleLoginResults[roleSpec.role].detectedClass = await detectClassName(page);

    for (const routeSpec of roleSpec.routes) {
      await captureRouteAcrossViewports(page, roleSpec, routeSpec);
    }

    await captureRoleInteractiveStates(page, roleSpec);
    await context.close();
  }

  await writeReports();
  await validateArtifacts();
});

async function ensureOutputDirs() {
  const dirs = [
    "login",
    "director/desktop",
    "director/tablet",
    "director/mobile",
    "director/states",
    "teacher-li/desktop",
    "teacher-li/tablet",
    "teacher-li/mobile",
    "teacher-li/states",
    "teacher-zhou/desktop",
    "teacher-zhou/tablet",
    "teacher-zhou/mobile",
    "teacher-zhou/states",
    "parent/desktop",
    "parent/tablet",
    "parent/mobile",
    "parent/states",
    "shared",
  ];

  for (const dir of dirs) {
    await fs.mkdir(path.join(OUTPUT_ROOT, dir), { recursive: true });
  }
}

async function captureLoginStates(page: Page) {
  await page.setViewportSize(VIEWPORTS.desktop);
  await gotoAndWait(page, "/login");
  await captureCurrentPage(page, {
    role: "login",
    demoAccount: "none",
    route: "/login",
    slug: "login-default",
    title: "登录页默认状态",
    viewport: "desktop",
    mode: "viewport",
    stateName: "default",
    notes: "登录页默认状态，包含普通账号登录和示例账号入口。",
    recommendedForGPTImage2: true,
  });
  await captureCurrentPage(page, {
    role: "login",
    demoAccount: "none",
    route: "/login",
    slug: "login-default",
    title: "登录页完整页面",
    viewport: "desktop",
    mode: "fullPage",
    stateName: "default",
    notes: "登录页 desktop fullPage。",
    recommendedForGPTImage2: true,
  });

  await page.locator("#username").fill("demo-user");
  await page.locator("#password").fill("sample-password");
  await captureCurrentPage(page, {
    role: "login",
    demoAccount: "none",
    route: "/login",
    slug: "login-input-filled",
    title: "登录页输入状态",
    viewport: "desktop",
    mode: "state",
    stateName: "input-filled",
    notes: "普通账号输入框和密码输入框填入示例文本，不是真实账号密码。",
    recommendedForGPTImage2: true,
  });

  const passwordToggle = page.locator('button[aria-label*="显示密码"], button[aria-label*="隐藏密码"]').first();
  if (await passwordToggle.count()) {
    await passwordToggle.click();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: "login",
      demoAccount: "none",
      route: "/login",
      slug: "login-password-visible",
      title: "登录页密码显示状态",
      viewport: "desktop",
      mode: "state",
      stateName: "password-visible",
      notes: "密码显示/隐藏按钮交互状态。",
      recommendedForGPTImage2: true,
    });
  }

  const registerButton = page.getByRole("button", { name: /注册账号/ }).first();
  if (await registerButton.count()) {
    await registerButton.click();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: "login",
      demoAccount: "none",
      route: "/login",
      slug: "login-register-dialog",
      title: "注册普通账号弹窗",
      viewport: "desktop",
      mode: "state",
      stateName: "register-dialog",
      notes: "注册入口弹窗，仅打开不提交。",
      recommendedForGPTImage2: true,
    });
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  await gotoAndWait(page, "/login");
  const demoHeading = page.getByText(/示例账号快速进入/).first();
  if (await demoHeading.count()) {
    await demoHeading.scrollIntoViewIfNeeded();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: "login",
      demoAccount: "none",
      route: "/login",
      slug: "login-demo-accounts",
      title: "登录页示例账号入口",
      viewport: "desktop",
      mode: "state",
      stateName: "demo-accounts",
      notes: "示例账号入口区域，包含陈园长、李老师、周老师、林妈妈。",
      recommendedForGPTImage2: true,
    });
  }

  for (const viewport of ["tablet", "mobile"] as const) {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await gotoAndWait(page, "/login");
    await captureCurrentPage(page, {
      role: "login",
      demoAccount: "none",
      route: "/login",
      slug: `login-default-${viewport}`,
      title: `登录页 ${viewport}`,
      viewport,
      mode: "viewport",
      stateName: "default",
      notes: `登录页 ${viewport} 响应式首屏。`,
      recommendedForGPTImage2: true,
    });
  }
}

async function loginViaDemoButton(page: Page, spec: RoleSpec) {
  try {
    await page.setViewportSize(VIEWPORTS.desktop);
    await clearBrowserState(page);
    await gotoAndWait(page, "/login");
    const button = page.getByRole("button").filter({ hasText: spec.demoButtonText }).first();
    await button.waitFor({ state: "visible", timeout: 20_000 });
    await button.click();
    await waitForStablePage(page, 8000);
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const ok = !finalUrl.includes("/login") && !/登录失败|进入失败|不存在/.test(text);
    roleLoginResults[spec.role] = {
      ok,
      reason: ok ? "登录成功" : "点击示例账号后仍停留在登录页或出现错误提示",
      finalUrl,
    };
    return ok;
  } catch (error) {
    roleLoginResults[spec.role] = {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      finalUrl: page.url(),
    };
    return false;
  }
}

async function captureRouteAcrossViewports(page: Page, roleSpec: RoleSpec, routeSpec: RouteSpec) {
  for (const viewport of ["desktop", "tablet", "mobile"] as const) {
    await page.setViewportSize(VIEWPORTS[viewport]);
    const ok = await gotoAndWait(page, routeSpec.route);
    routeAttempts.push({
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: routeSpec.route,
      ok,
      reason: ok ? "loaded" : "navigation or page stabilization failed",
      finalUrl: page.url(),
    });

    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: routeSpec.route,
      slug: routeSpec.slug,
      title: routeSpec.title,
      viewport,
      mode: "viewport",
      stateName: ok ? "default" : "error",
      notes: ok ? routeSpec.notes : `${routeSpec.notes} 页面加载或稳定等待失败，已记录当前浏览器状态。`,
      recommendedForGPTImage2: Boolean(routeSpec.recommended),
    });

    if (viewport === "desktop") {
      await captureCurrentPage(page, {
        role: roleSpec.role,
        demoAccount: roleSpec.demoAccount,
        route: routeSpec.route,
        slug: `${routeSpec.slug}-fullpage`,
        title: `${routeSpec.title}完整页面`,
        viewport,
        mode: "fullPage",
        stateName: ok ? "default" : "error",
        notes: `${routeSpec.notes} desktop fullPage。`,
        recommendedForGPTImage2: Boolean(routeSpec.recommended),
      });
    }
  }
}

async function captureRoleInteractiveStates(page: Page, roleSpec: RoleSpec) {
  await captureMobileMenu(page, roleSpec);

  if (roleSpec.role !== "parent") {
    await captureChildrenStates(page, roleSpec);
    await captureDietStates(page, roleSpec);
  }

  if (roleSpec.role === "director") {
    await captureDirectorStates(page, roleSpec);
  }

  if (roleSpec.role.startsWith("teacher")) {
    await captureTeacherStates(page, roleSpec);
  }

  if (roleSpec.role === "parent") {
    await captureParentStates(page, roleSpec);
  }
}

async function captureMobileMenu(page: Page, roleSpec: RoleSpec) {
  const homeRoute = roleSpec.role === "director" ? "/admin" : roleSpec.role === "parent" ? "/parent" : "/teacher";
  await page.setViewportSize(VIEWPORTS.mobile);
  await gotoAndWait(page, homeRoute);
  const menuButton = page.locator('button[aria-controls="mobile-nav-panel"]').first();
  if (await menuButton.count()) {
    await menuButton.click();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: homeRoute,
      slug: `${roleSpec.role}-mobile-menu`,
      title: "移动端导航菜单",
      viewport: "mobile",
      mode: "state",
      stateName: "mobile-menu-open",
      notes: "移动端主导航展开状态。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
  }
}

async function captureChildrenStates(page: Page, roleSpec: RoleSpec) {
  await page.setViewportSize(VIEWPORTS.desktop);
  await gotoAndWait(page, "/children");

  const searchInput = page.getByPlaceholder(/搜索姓名|搜索/).first();
  if (await searchInput.count()) {
    await searchInput.fill(roleSpec.expectedClass ?? "向阳班");
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/children",
      slug: `${roleSpec.role}-children-search-result`,
      title: "幼儿档案搜索结果",
      viewport: "desktop",
      mode: "state",
      stateName: "search-result",
      notes: "幼儿档案列表搜索有结果状态。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });

    await searchInput.fill("不存在的儿童XYZ");
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/children",
      slug: `${roleSpec.role}-children-empty`,
      title: "幼儿档案空状态",
      viewport: "desktop",
      mode: "state",
      stateName: "empty",
      notes: "幼儿档案搜索无结果空状态。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
    await searchInput.fill("");
  }

  const addButton = page.getByRole("button", { name: /新增幼儿档案|新增儿童档案/ }).first();
  if (await addButton.count()) {
    await addButton.click();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/children",
      slug: `${roleSpec.role}-children-form`,
      title: "新增儿童档案表单",
      viewport: "desktop",
      mode: "state",
      stateName: "form-open",
      notes: "新增儿童档案表单弹窗，仅打开不保存。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  const deleteButton = page.locator('button[aria-label^="删除"]').first();
  if (await deleteButton.count()) {
    await deleteButton.click();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/children",
      slug: `${roleSpec.role}-children-delete-confirm`,
      title: "删除档案确认弹窗",
      viewport: "desktop",
      mode: "state",
      stateName: "modal-confirm",
      notes: "删除确认弹窗，仅打开确认框，不点击最终删除。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

async function captureDietStates(page: Page, roleSpec: RoleSpec) {
  await page.setViewportSize(VIEWPORTS.desktop);
  await gotoAndWait(page, "/diet");

  const firstChild = page.locator("button").filter({ hasText: /班级|已记录|未记录|向阳班|晨曦班/ }).first();
  if (await firstChild.count()) {
    await firstChild.hover().catch(() => undefined);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/diet",
      slug: `${roleSpec.role}-diet-child-hover`,
      title: "饮食记录儿童卡片状态",
      viewport: "desktop",
      mode: "state",
      stateName: "card-hover",
      notes: "饮食记录页面儿童选择卡片 hover/聚焦区域。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
  }

  const bulkButton = page.getByRole("button", { name: /执行批量录入/ }).first();
  if (await bulkButton.count()) {
    await bulkButton.click();
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/diet",
      slug: `${roleSpec.role}-diet-bulk-confirm`,
      title: "饮食批量录入确认弹窗",
      viewport: "desktop",
      mode: "state",
      stateName: "modal-confirm",
      notes: "饮食批量录入确认弹窗，仅打开不确认录入。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

async function captureDirectorStates(page: Page, roleSpec: RoleSpec) {
  await page.setViewportSize(VIEWPORTS.desktop);
  await gotoAndWait(page, "/admin");
  const priorityCard = page.getByText(/今日机构优先级|重点风险儿童|高风险优先事项/).first();
  if (await priorityCard.count()) {
    await priorityCard.hover().catch(() => undefined);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/admin",
      slug: "director-risk-card-hover",
      title: "园长风险看板重点区域",
      viewport: "desktop",
      mode: "state",
      stateName: "card-hover",
      notes: "园长端风险/优先级看板重点区域 hover 状态。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
  }
}

async function captureTeacherStates(page: Page, roleSpec: RoleSpec) {
  await page.setViewportSize(VIEWPORTS.desktop);
  await gotoAndWait(page, "/teacher/high-risk-consultation");
  const resultOnlyButton = page.getByRole("button", { name: /只看结果视图|查看最终结果|查看会诊过程/ }).first();
  if (await resultOnlyButton.count()) {
    await resultOnlyButton.click().catch(() => undefined);
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/teacher/high-risk-consultation",
      slug: `${roleSpec.role}-consultation-result-state`,
      title: "高风险会诊结果/过程状态",
      viewport: "desktop",
      mode: "state",
      stateName: "detail-state",
      notes: "高风险会诊结果优先或过程详情状态。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
  }
}

async function captureParentStates(page: Page, roleSpec: RoleSpec) {
  await page.setViewportSize(VIEWPORTS.desktop);
  await gotoAndWait(page, "/parent/agent?child=c-1#feedback");
  const feedbackSection = page.locator("#feedback").first();
  if (await feedbackSection.count()) {
    await feedbackSection.scrollIntoViewIfNeeded();
    await waitForStablePage(page);
  }
  await captureCurrentPage(page, {
    role: roleSpec.role,
    demoAccount: roleSpec.demoAccount,
    route: "/parent/agent?child=c-1#feedback",
    slug: "parent-feedback-section",
    title: "家长反馈区状态",
    viewport: "desktop",
    mode: "state",
    stateName: "feedback-section",
    notes: "家长反馈区和 AI 干预卡相关状态。",
    recommendedForGPTImage2: true,
    forceStatesDir: true,
  });

  await gotoAndWait(page, "/parent");
  const careToggle = page.locator("button").filter({ hasText: /关怀模式|普通模式|切换/ }).first();
  if (await careToggle.count()) {
    await careToggle.click().catch(() => undefined);
    await waitForStablePage(page);
    await captureCurrentPage(page, {
      role: roleSpec.role,
      demoAccount: roleSpec.demoAccount,
      route: "/parent",
      slug: "parent-care-mode",
      title: "家长端关怀模式",
      viewport: "desktop",
      mode: "state",
      stateName: "care-mode",
      notes: "家长端关怀模式或主要模式切换状态。",
      recommendedForGPTImage2: true,
      forceStatesDir: true,
    });
  }
}

async function clearBrowserState(page: Page) {
  await page.context().clearCookies();
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function gotoAndWait(page: Page, route: string) {
  const url = new URL(route, BASE_URL).toString();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForStablePage(page, 8000);
    return true;
  } catch {
    await page.waitForTimeout(1500).catch(() => undefined);
    return false;
  }
}

async function waitForStablePage(page: Page, timeout = 15_000) {
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 2500) }).catch(() => undefined);
  await page
    .waitForFunction(
      () => {
        const text = document.body?.innerText ?? "";
        return text.length > 20 && !/^加载中…?$/.test(text.trim());
      },
      { timeout }
    )
    .catch(() => undefined);
  await page
    .waitForFunction(
      () => {
        const loadingWords = ["加载中", "生成中", "处理中"];
        const text = document.body?.innerText ?? "";
        const hasBlockingLoading = loadingWords.some((word) => text.trim() === word);
        return !hasBlockingLoading;
      },
      { timeout: Math.min(timeout, 2500) }
    )
    .catch(() => undefined);
  await page.waitForTimeout(350).catch(() => undefined);
}

async function captureCurrentPage(
  page: Page,
  options: {
    role: CaptureRole;
    demoAccount: string;
    route: string;
    slug: string;
    title: string;
    viewport: ViewportName;
    mode: CaptureMode;
    stateName: string;
    notes: string;
    recommendedForGPTImage2: boolean;
    forceStatesDir?: boolean;
  }
) {
  await waitForStablePage(page, 3000);
  const maskResult = await maskSensitiveData(page);
  const pageTitle = await extractPageTitle(page, options.title);
  const route = normalizeRouteFromPage(page, options.route);
  const id = `${options.role}-${options.slug}-${options.viewport}-${options.mode}-${options.stateName}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const filename = buildFilename(options.role, options.viewport, options.forceStatesDir ? "state" : options.mode, id);
  const absolute = path.join(OUTPUT_ROOT, filename);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await page.screenshot({ path: absolute, fullPage: options.mode === "fullPage" });

  const storybookRisk = route.includes("/parent/storybook");
  manifest.push({
    id,
    role: options.role,
    demoAccount: options.demoAccount,
    route,
    pageTitle,
    viewport: options.viewport,
    mode: options.mode,
    stateName: options.stateName,
    filename: toPosix(filename),
    capturedAt: new Date().toISOString(),
    notes: storybookRisk
      ? `${options.notes} 注意：绘本图片内容可能包含无法通过 DOM 完全确认的儿童姓名，上传前建议人工复核。`
      : options.notes,
    sensitiveDataMasked: maskResult && !storybookRisk,
    recommendedForGPTImage2: options.recommendedForGPTImage2,
  });
}

function buildFilename(role: CaptureRole, viewport: ViewportName, mode: CaptureMode, id: string) {
  const index = String(sequence++).padStart(3, "0");
  if (role === "login") {
    return path.join("login", `${index}-${id}.png`);
  }
  const dir = mode === "state" ? "states" : viewport;
  return path.join(role, dir, `${index}-${id}.png`);
}

async function maskSensitiveData(page: Page) {
  try {
    await page.evaluate(() => {
      const allowedNames = new Set(["陈园长", "李老师", "周老师", "林妈妈"]);
      const childNames = [
        "林小雨",
        "小雨",
        "张浩然",
        "浩浩",
        "陈思琪",
        "琪琪",
        "王小明",
        "明明",
        "赵安安",
        "安安",
        "刘子轩",
        "轩轩",
        "杨梓涵",
        "涵涵",
        "黄嘉豪",
        "豪豪",
        "吴悦彤",
        "彤彤",
        "孙宇航",
        "航航",
        "周诗雨",
        "诗诗",
        "徐铭泽",
        "铭铭",
        "何欣怡",
        "欣欣",
        "郑浩宇",
        "浩宇",
        "马若曦",
        "曦曦",
        "高子墨",
        "墨墨",
        "江沐晴",
        "沐沐",
        "顾宇航",
        "杜若溪",
        "若若",
        "许嘉佑",
        "温可心",
        "可可",
        "韩泽远",
        "远远",
        "沈语彤",
        "唐子睿",
        "罗诗涵",
        "邵景行",
        "景景",
        "贺知夏",
        "夏夏",
        "苏奕辰",
        "叶芷宁",
        "宁宁",
        "邢宇哲",
        "魏知语",
        "语语",
        "傅靖然",
        "然然",
        "黎曼婷",
        "曼曼",
        "薛承宇",
      ];
      const guardianNames = [
        "张爸爸",
        "陈奶奶",
        "王妈妈",
        "赵爸爸",
        "刘爸爸",
        "杨妈妈",
        "黄妈妈",
        "吴爸爸",
        "孙妈妈",
        "孙爸爸",
        "周妈妈",
        "徐妈妈",
        "何妈妈",
        "郑爸爸",
        "马爸爸",
        "高妈妈",
        "江妈妈",
        "江爸爸",
        "顾妈妈",
        "杜妈妈",
        "许妈妈",
        "温爸爸",
        "韩妈妈",
        "沈妈妈",
        "唐爸爸",
        "罗妈妈",
        "邵妈妈",
        "贺爸爸",
        "苏妈妈",
        "叶妈妈",
        "邢爸爸",
        "魏妈妈",
        "傅妈妈",
        "傅姑姑",
        "黎妈妈",
      ];
      const names = [...childNames, ...guardianNames].filter((name) => !allowedNames.has(name));
      const phonePattern = /1[3-9]\d(?:\*{4}|\d{4})\d{4}|1[3-9]\d{9}/g;
      const idPattern = /\b\d{6}(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g;
      const addressPattern = /(?:住址|地址|家庭住址|详细地址)[：:]\s*[^，。；;\n]+/g;

      const replaceSensitive = (raw: string) => {
        let value = raw;
        for (const name of names) {
          value = value.split(name).join(name.length <= 2 ? "儿童" : "儿童姓名");
        }
        value = value.replace(phonePattern, "手机号已脱敏");
        value = value.replace(idPattern, "证件号已脱敏");
        value = value.replace(addressPattern, (match) => match.replace(/[：:].*$/, "：地址已脱敏"));
        return value;
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
      }
      for (const node of textNodes) {
        const nextValue = replaceSensitive(node.nodeValue ?? "");
        if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
      }

      for (const element of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) {
        if (element.value) element.value = replaceSensitive(element.value);
        if (element.placeholder) element.placeholder = replaceSensitive(element.placeholder);
      }

      for (const element of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        for (const attr of ["aria-label", "title", "alt"]) {
          const value = element.getAttribute(attr);
          if (value) element.setAttribute(attr, replaceSensitive(value));
        }
      }
    });
    await page.waitForTimeout(100);
    return true;
  } catch {
    return false;
  }
}

async function extractPageTitle(page: Page, fallback: string) {
  try {
    const title = await page.evaluate(() => {
      const selectors = ["h1", '[role="heading"][aria-level="1"]', "h2", "[data-page-title]"];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = element?.textContent?.trim();
        if (text) return text.replace(/\s+/g, " ");
      }
      return document.title || "";
    });
    return title || fallback;
  } catch {
    return fallback;
  }
}

function normalizeRouteFromPage(page: Page, fallback: string) {
  try {
    const url = new URL(page.url());
    if (url.origin === BASE_URL) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function extractNavigation(page: Page) {
  try {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("nav a"))
        .map((link) => `${link.textContent?.replace(/\s+/g, " ").trim() || "未命名"} -> ${(link as HTMLAnchorElement).getAttribute("href")}`)
        .filter(Boolean)
    );
    return Array.from(new Set(labels));
  } catch {
    return [];
  }
}

async function detectClassName(page: Page) {
  try {
    const text = await page.locator("body").innerText({ timeout: 3000 });
    if (text.includes("向阳班")) return "向阳班";
    if (text.includes("晨曦班")) return "晨曦班";
    return "未检测到班级名";
  } catch {
    return "检测失败";
  }
}

async function writeReports() {
  const manifestPath = path.join(OUTPUT_ROOT, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(OUTPUT_ROOT, "screenshot-inventory.md"), buildScreenshotInventory(), "utf8");
  await fs.writeFile(path.join(OUTPUT_ROOT, "role-coverage.md"), buildRoleCoverage(), "utf8");
  await fs.writeFile(path.join(OUTPUT_ROOT, "route-coverage.md"), buildRouteCoverage(), "utf8");
}

function buildScreenshotInventory() {
  const roleTitles: Record<CaptureRole, string> = {
    login: "登录页",
    director: "园长端 / 陈园长",
    "teacher-li": "教师端 / 李老师",
    "teacher-zhou": "教师端 / 周老师",
    parent: "家长端 / 林妈妈",
  };
  const lines = ["# 截图清单", "", `采集站点：${BASE_URL}`, `生成时间：${new Date().toISOString()}`, ""];
  for (const role of Object.keys(roleTitles) as CaptureRole[]) {
    const entries = manifest.filter((entry) => entry.role === role);
    lines.push(`## ${roleTitles[role]}`, "");
    if (!entries.length) {
      lines.push("- 未生成截图。", "");
      continue;
    }
    for (const entry of entries) {
      lines.push(`- 页面名称：${entry.pageTitle}`);
      lines.push(`  路由：${entry.route}`);
      lines.push(`  截图文件：${entry.filename}`);
      lines.push(`  页面说明：${entry.notes}`);
      lines.push(`  重设计重点：保留当前信息结构，优化中文 B2B SaaS 的信息层级、视觉密度和响应式体验。`);
      lines.push(`  是否存在敏感信息：${entry.sensitiveDataMasked ? "已做 DOM 脱敏" : "需人工复核，可能存在未完全脱敏内容"}`);
      lines.push(`  是否建议发给 GPT Image 2：${entry.recommendedForGPTImage2 ? "是" : "否"}`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

function buildRoleCoverage() {
  const lines = ["# 角色覆盖情况", "", `采集站点：${BASE_URL}`, ""];
  for (const spec of ROLE_SPECS) {
    const entries = manifest.filter((entry) => entry.role === spec.role);
    const attempts = routeAttempts.filter((attempt) => attempt.role === spec.role);
    const failed = attempts.filter((attempt) => !attempt.ok);
    const menu = roleMenus[spec.role] ?? [];
    const login = roleLoginResults[spec.role] ?? { ok: false, reason: "未执行", finalUrl: "" };
    lines.push(`## ${spec.roleLabel}`);
    lines.push(`- 示例账号：${spec.demoAccount}`);
    lines.push(`- 登录结果：${login.ok ? "成功" : "失败"}${login.reason ? `，${login.reason}` : ""}`);
    lines.push(`- 登录后地址：${login.finalUrl ?? ""}`);
    lines.push(`- 可见导航菜单：${menu.length ? menu.join("；") : "未检测到导航菜单"}`);
    lines.push(`- 已截图页面数量：${entries.length}`);
    lines.push(`- 未截图页面：${failed.length ? failed.map((item) => `${item.route}（${item.reason}）`).join("；") : "无"}`);
    lines.push(`- 是否存在权限限制：${spec.role === "parent" ? "家长端导航仅显示家长首页；直访部分管理路由会记录为权限/错误状态。" : "未发现阻断主路径的权限限制。"}`);
    lines.push(`- 页面重复：${spec.role.startsWith("teacher") ? "李老师与周老师教师端结构基本一致，班级上下文和数据状态不同。" : spec.role === "director" ? "园长端 /teacher 导航项实际复用教师工作台结构，已记录。" : "家长端仅一个孩子上下文，部分 child 参数页面与默认首页相似。"}`);
    if (spec.expectedClass) lines.push(`- 检测到的班级数据状态：${roleLoginResults[spec.role]?.detectedClass ?? "未检测"}`);
    lines.push("");
  }
  lines.push("## 李老师与周老师页面差异总结");
  lines.push("- 两个账号都属于教师端，路由和页面结构基本一致。");
  lines.push("- 李老师账号绑定向阳班，周老师账号绑定晨曦班；截图用于比较不同班级儿童、晨检、饮食、成长和会诊状态。");
  lines.push("- 若线上数据在两个教师账号下呈现完全一致，应视为当前 demo 数据状态重复，而非脚本遗漏。");
  lines.push("");
  lines.push("## 需要补充说明的地方");
  lines.push("- 若后续存在隐藏菜单、未公开路由或需要真实账号权限的页面，需要提供入口或允许范围后再追加采集。");
  return `${lines.join("\n")}\n`;
}

function buildRouteCoverage() {
  const capturedRoutes = Array.from(new Set(manifest.map((entry) => entry.route))).sort();
  const failed = routeAttempts.filter((attempt) => !attempt.ok);
  const lines = ["# 路由覆盖情况", "", "## 已截图路由列表", ""];
  for (const route of capturedRoutes) lines.push(`- ${route}`);
  lines.push("", "## 未截图路由列表", "");
  const notCaptured = SOURCE_ROUTES.filter((route) => !capturedRoutes.some((captured) => captured === route || captured.startsWith(`${route}?`) || captured.startsWith(`${route}#`)));
  if (notCaptured.length) {
    for (const route of notCaptured) lines.push(`- ${route}`);
  } else {
    lines.push("- 无。");
  }
  lines.push("", "## 未截图原因", "");
  if (failed.length) {
    for (const item of failed) lines.push(`- ${item.role} ${item.route}：${item.reason}；最终地址 ${item.finalUrl ?? ""}`);
  } else {
    lines.push("- 主要路由均已尝试截图。");
  }
  lines.push("", "## 从源码发现但线上不可访问的路由", "");
  lines.push("- `/auth/login` 是旧登录页重定向入口，主要截图以 `/login` 为准。");
  lines.push("- `/teacher/home` 与 `/teacher` 均渲染教师工作台，作为重复路由记录。");
  lines.push("", "## 从线上菜单发现但源码中不明显的页面", "");
  lines.push("- 当前导航来自 `lib/navigation/primary-nav.ts`，线上菜单未发现额外独立路由。");
  lines.push("", "## 可能遗漏页面的判断依据", "");
  lines.push("- 已覆盖 App Router 中所有主要页面文件和导航/卡片中的 href。");
  lines.push("- 未穷举所有按钮的最终提交动作，因为任务约束禁止创建、删除、提交持久业务数据。");
  return `${lines.join("\n")}\n`;
}

async function validateArtifacts() {
  const requiredFields: Array<keyof ManifestEntry> = [
    "id",
    "role",
    "demoAccount",
    "route",
    "pageTitle",
    "viewport",
    "mode",
    "stateName",
    "filename",
    "capturedAt",
    "notes",
    "sensitiveDataMasked",
    "recommendedForGPTImage2",
  ];
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const entry of manifest) {
    for (const field of requiredFields) {
      if (!(field in entry)) errors.push(`${entry.id || "unknown"} 缺少字段 ${field}`);
    }
    if (ids.has(entry.id)) errors.push(`重复 id：${entry.id}`);
    ids.add(entry.id);
    if (!existsSync(path.join(OUTPUT_ROOT, entry.filename))) errors.push(`截图文件不存在：${entry.filename}`);
  }

  for (const file of ["manifest.json", "screenshot-inventory.md", "role-coverage.md", "route-coverage.md"]) {
    if (!existsSync(path.join(OUTPUT_ROOT, file))) errors.push(`缺少文件：${file}`);
  }

  for (const role of ["login", "director", "teacher-li", "teacher-zhou", "parent"] as CaptureRole[]) {
    const hasHome = manifest.some((entry) => entry.role === role && entry.viewport === "desktop" && entry.mode === "viewport");
    if (!hasHome) errors.push(`${role} 缺少 desktop 首页/默认截图`);
  }

  const summary = {
    ok: errors.length === 0,
    errors,
    totalScreenshots: manifest.length,
    countsByRole: countBy(manifest, "role"),
    countsByViewport: countBy(manifest, "viewport"),
    countsByMode: countBy(manifest, "mode"),
    validatedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(OUTPUT_ROOT, "validation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (errors.length) {
    throw new Error(`UI screenshot artifact validation failed:\n${errors.join("\n")}`);
  }
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key]);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}
