import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outRoot = path.join(root, "artifacts", "demo-materials");
const docsStatusPath = path.join(root, "docs", "status", "DEMO_MATERIALS_V2.md");
const args = new Set(process.argv.slice(2));
const generatedAt = new Date().toISOString();

const projectName = "慧育童行 - SmartChildcare Agent";
const baseUrl = (process.env.DEMO_MATERIALS_BASE_URL || "http://127.0.0.1:3330").replace(/\/$/, "");
const demoAccount = process.env.DEMO_MATERIALS_ACCOUNT || "示例账号入口";
const localOnlyDefault = !process.env.DEMO_MATERIALS_BASE_URL;
const shouldCapture =
  args.has("--capture") ||
  process.env.DEMO_MATERIALS_CAPTURE === "1" ||
  process.env.DEMO_MATERIALS_CAPTURE === "true";
const shouldRunPreflight =
  args.has("--preflight") ||
  process.env.DEMO_MATERIALS_PREFLIGHT === "1" ||
  process.env.DEMO_MATERIALS_PREFLIGHT === "true";
const shouldGenerateSystemTour =
  args.has("--system-tour") ||
  process.env.DEMO_MATERIALS_SYSTEM_TOUR === "1" ||
  process.env.DEMO_MATERIALS_SYSTEM_TOUR === "true";
const storyboardOnly = args.has("--storyboard-only");
const allowNonLocalPreflight = process.env.DEMO_MATERIALS_ALLOW_NONLOCAL_PREFLIGHT === "1";

const materialFiles = [];
const notes = [];
const missingRequiredScenes = [];

const outputDirs = {
  screenshots: path.join(outRoot, "screenshots"),
  systemTour: path.join(outRoot, "system-tour"),
  engineering: path.join(outRoot, "engineering-proof"),
};

const sceneDefinitions = [
  {
    scene: "01-login",
    outputName: "01-login.png",
    title: "登录页：示例账号入口",
    route: "/login",
    role: "login",
    suggestedUse: "PPT 开场页、现场演示入口、视频片头",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) => item.route === "/login" && item.viewport === "desktop" && item.mode === "viewport",
        (item) => item.route === "/login" && item.viewport === "desktop",
        (item) => item.route === "/login",
      ]),
  },
  {
    scene: "02-teacher-home",
    outputName: "02-teacher-home.png",
    title: "教师端首页：教师工作台",
    route: "/teacher",
    role: "teacher",
    suggestedUse: "教师端能力介绍、低成本记录入口、三端闭环起点",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          item.route === "/teacher" &&
          item.role === "teacher-li" &&
          item.viewport === "desktop" &&
          item.mode === "viewport",
        (item) => item.route === "/teacher" && item.viewport === "desktop" && item.mode === "viewport",
        (item) => item.route === "/teacher" && item.viewport === "desktop",
        (item) => item.route === "/teacher",
      ]),
  },
  {
    scene: "03-consultation-setup",
    outputName: "03-consultation-setup.png",
    title: "高风险会诊 setup：发起与证据锁定",
    route: "/teacher/high-risk-consultation",
    role: "teacher",
    suggestedUse: "展示会诊入口、阶段流程、会诊对象与前置信息",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          samePath(item.route, "/teacher/high-risk-consultation") &&
          item.role === "teacher-li" &&
          item.viewport === "desktop" &&
          item.mode === "viewport",
        (item) =>
          samePath(item.route, "/teacher/high-risk-consultation") &&
          item.viewport === "desktop" &&
          item.mode === "viewport",
        (item) => samePath(item.route, "/teacher/high-risk-consultation") && item.viewport === "desktop",
      ]),
  },
  {
    scene: "04-consultation-result",
    outputName: "04-consultation-result.png",
    title: "高风险会诊 result：证据链与干预建议",
    route: "/teacher/high-risk-consultation",
    role: "teacher",
    suggestedUse: "展示会诊输出、trace timeline、长期策略与本周建议",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          samePath(item.route, "/teacher/high-risk-consultation") &&
          item.role === "teacher-li" &&
          item.viewport === "desktop" &&
          item.mode === "fullPage",
        (item) =>
          samePath(item.route, "/teacher/high-risk-consultation") &&
          item.viewport === "desktop" &&
          item.mode === "fullPage",
        (item) => samePath(item.route, "/teacher/high-risk-consultation") && item.mode === "fullPage",
      ]),
  },
  {
    scene: "05-admin-risk-priority",
    outputName: "05-admin-risk-priority.png",
    title: "管理端风险优先级：园长工作台",
    route: "/admin",
    role: "admin",
    suggestedUse: "管理端风险优先级、会诊承接、机构治理说明",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          item.route === "/admin" &&
          item.role === "director" &&
          item.viewport === "desktop" &&
          item.mode === "viewport" &&
          item.filename?.includes("director-home"),
        (item) => item.route === "/admin" && item.viewport === "desktop" && item.mode === "viewport",
        (item) => item.route === "/admin" && item.viewport === "desktop",
        (item) => item.route === "/admin",
      ]),
  },
  {
    scene: "06-parent-home",
    outputName: "06-parent-home.png",
    title: "家长首页：今晚行动与反馈入口",
    route: "/parent?child=c-1",
    role: "parent",
    suggestedUse: "家长端首页、今晚行动、趋势追问和反馈闭环入口",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          samePath(item.route, "/parent") &&
          item.role === "parent" &&
          item.viewport === "desktop" &&
          item.mode === "viewport" &&
          item.filename?.includes("parent-home"),
        (item) => samePath(item.route, "/parent") && item.viewport === "desktop" && item.mode === "viewport",
        (item) => samePath(item.route, "/parent") && item.viewport === "desktop",
        (item) => samePath(item.route, "/parent"),
      ]),
  },
  {
    scene: "07-storybook-cover",
    outputName: "07-storybook-cover.png",
    title: "个性化绘本封面：成长绘本总览",
    route: "/parent/storybook?child=c-1",
    role: "parent",
    suggestedUse: "绘本能力总览、封面/故事入口、情感化表达展示",
    allowUnmasked: true,
    reviewNote: "绘本截图包含 demo 儿童占位姓名，使用前保留人工复核标记。",
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          samePath(item.route, "/parent/storybook") &&
          item.viewport === "desktop" &&
          item.mode === "viewport",
        (item) => samePath(item.route, "/parent/storybook") && item.viewport === "desktop",
        (item) => samePath(item.route, "/parent/storybook"),
      ]),
  },
  {
    scene: "08-storybook-page",
    outputName: "08-storybook-page.png",
    title: "个性化绘本内页：故事页面与家庭任务",
    route: "/parent/storybook?child=c-1",
    role: "parent",
    suggestedUse: "绘本内页、个性化生成、家庭共读任务说明",
    allowUnmasked: true,
    reviewNote: "绘本截图包含 demo 儿童占位姓名，使用前保留人工复核标记。",
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          samePath(item.route, "/parent/storybook") &&
          item.viewport === "desktop" &&
          item.mode === "fullPage",
        (item) => samePath(item.route, "/parent/storybook") && item.mode === "fullPage",
        (item) => samePath(item.route, "/parent/storybook") && item.viewport === "desktop",
      ]),
  },
  {
    scene: "09-feedback-submit",
    outputName: "09-feedback-submit.png",
    title: "反馈提交页：结构化家庭反馈",
    route: "/parent/agent?child=c-1#feedback",
    role: "parent",
    suggestedUse: "展示家长执行结果回流、结构化反馈提交与闭环",
    allowUnmasked: false,
    pick: (items) =>
      firstByPreference(items, [
        (item) =>
          samePath(item.route, "/parent/agent") &&
          item.stateName === "feedback-section" &&
          item.viewport === "desktop",
        (item) =>
          samePath(item.route, "/parent/agent") &&
          item.viewport === "desktop" &&
          item.mode === "viewport" &&
          item.filename?.includes("feedback"),
        (item) => samePath(item.route, "/parent/agent") && item.viewport === "desktop",
        (item) => samePath(item.route, "/parent/agent"),
      ]),
  },
];

const systemStatusScene = {
  scene: "10-system-ai-status",
  outputName: "10-system-ai-status.png",
  title: "系统完成度 / AI Provider Status",
  route: "/api/ai/provider-status",
  role: "system",
  suggestedUse: "工程证明、答辩附录、现场说明 AI provider 与系统完成度",
};

const systemTourPages = [
  { page: 1, name: "01-cover.webp", title: "系统导览封面", suggestedUse: "PPT 封面或项目介绍" },
  { page: 2, name: "02-project-name.webp", title: "项目命名页", suggestedUse: "项目命名和品牌说明" },
  { page: 8, name: "08-three-roles.webp", title: "三端能力页", suggestedUse: "教师、园长、家长三端协同说明" },
  { page: 22, name: "22-summary.webp", title: "系统导览总结页", suggestedUse: "路演收束页或报告附录" },
];

function rel(file) {
  return path.relative(outRoot, file).replace(/\\/g, "/");
}

function sourceRel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function samePath(route, target) {
  const routePath = String(route ?? "").split("#")[0].split("?")[0];
  const targetPath = String(target ?? "").split("#")[0].split("?")[0];
  return routePath === targetPath;
}

function firstByPreference(items, predicates) {
  for (const predicate of predicates) {
    const item = items.find(predicate);
    if (item) return item;
  }
  return null;
}

function isLocalBaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function ensureNonLocalPreflightAllowed() {
  if (!shouldRunPreflight && !shouldCapture) return;
  if (isLocalBaseUrl(baseUrl) || allowNonLocalPreflight) return;
  throw new Error(
    [
      `Refusing to run demo preflight against non-local base URL: ${baseUrl}`,
      "Set DEMO_MATERIALS_ALLOW_NONLOCAL_PREFLIGHT=1 only when you intentionally want write-like checks against that URL.",
    ].join("\n"),
  );
}

async function ensureDirs({ clean = false } = {}) {
  if (clean && fssync.existsSync(outRoot)) {
    await fs.rm(outRoot, { recursive: true, force: true });
  }
  await fs.mkdir(outRoot, { recursive: true });
  await Promise.all(Object.values(outputDirs).map((dir) => fs.mkdir(dir, { recursive: true })));
  await fs.mkdir(path.dirname(docsStatusPath), { recursive: true });
}

function runNpmScript(scriptName, env = {}) {
  const result = spawnSync("npm", ["run", scriptName], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function addMaterialFile({
  source,
  target,
  group,
  title,
  route = null,
  role = "all",
  scene = null,
  suggestedUse = "",
  extra = {},
}) {
  if (!fssync.existsSync(source)) {
    notes.push(`missing: ${sourceRel(source)}`);
    return false;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
  const stat = await fs.stat(target);
  materialFiles.push({
    group,
    title,
    route,
    role,
    scene,
    suggestedUse,
    path: rel(target),
    source: sourceRel(source),
    sizeBytes: stat.isFile() ? stat.size : null,
    ...extra,
  });
  return true;
}

async function addGeneratedMaterialFile({
  target,
  source,
  group,
  title,
  route = null,
  role = "all",
  scene = null,
  suggestedUse = "",
  extra = {},
}) {
  const stat = await fs.stat(target);
  materialFiles.push({
    group,
    title,
    route,
    role,
    scene,
    suggestedUse,
    path: rel(target),
    source,
    sizeBytes: stat.isFile() ? stat.size : null,
    ...extra,
  });
}

async function readJsonIfExists(file) {
  if (!fssync.existsSync(file)) return null;
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function filterEligibleItems(items, scene) {
  return items.filter((item) => scene.allowUnmasked || item.sensitiveDataMasked !== false);
}

async function packageUiScreenshots() {
  const sourceRoot = path.join(root, "artifacts", "ui-screenshots");
  const manifestPath = path.join(sourceRoot, "manifest.json");
  const manifest = await readJsonIfExists(manifestPath);
  if (!manifest) {
    notes.push("missing: artifacts/ui-screenshots/manifest.json");
    for (const scene of sceneDefinitions) missingRequiredScenes.push(scene.scene);
    return [];
  }

  const items = Array.isArray(manifest) ? manifest : manifest.value ?? [];
  const selected = [];

  for (const scene of sceneDefinitions) {
    const item = scene.pick(filterEligibleItems(items, scene));
    if (!item?.filename) {
      missingRequiredScenes.push(scene.scene);
      continue;
    }

    const copied = await addMaterialFile({
      source: path.join(sourceRoot, item.filename),
      target: path.join(outputDirs.screenshots, scene.outputName),
      group: "screenshots",
      title: scene.title,
      route: scene.route,
      role: scene.role,
      scene: scene.scene,
      suggestedUse: scene.suggestedUse,
      extra: {
        sourceScreenshot: item.filename,
        viewport: item.viewport ?? null,
        mode: item.mode ?? null,
        stateName: item.stateName ?? null,
        sourceRole: item.role ?? null,
        sourcePageTitle: item.pageTitle ?? null,
        sensitiveDataMasked: item.sensitiveDataMasked ?? null,
        reviewRequired: item.sensitiveDataMasked === false,
        reviewNote: scene.reviewNote ?? null,
      },
    });

    if (copied) selected.push({ scene, item });
    else missingRequiredScenes.push(scene.scene);
  }

  await addMaterialFile({
    source: manifestPath,
    target: path.join(outputDirs.engineering, "ui-screenshots-manifest.json"),
    group: "engineering",
    title: "UI 截图 manifest",
    route: null,
    role: "all",
    scene: "engineering-ui-manifest",
    suggestedUse: "工程证明：截图来源、角色、路由和脱敏状态",
  });
  await addMaterialFile({
    source: path.join(sourceRoot, "screenshot-inventory.md"),
    target: path.join(outputDirs.engineering, "ui-screenshot-inventory.md"),
    group: "engineering",
    title: "UI 截图素材清单",
    route: null,
    role: "all",
    scene: "engineering-ui-inventory",
    suggestedUse: "工程证明：截图库存与人工复核清单",
  });
  await addMaterialFile({
    source: path.join(sourceRoot, "route-coverage.md"),
    target: path.join(outputDirs.engineering, "ui-route-coverage.md"),
    group: "engineering",
    title: "UI 路由覆盖说明",
    route: null,
    role: "all",
    scene: "engineering-route-coverage",
    suggestedUse: "工程证明：核心演示路由覆盖情况",
  });
  await addMaterialFile({
    source: path.join(sourceRoot, "validation-summary.json"),
    target: path.join(outputDirs.engineering, "ui-validation-summary.json"),
    group: "engineering",
    title: "UI 截图校验摘要",
    route: null,
    role: "all",
    scene: "engineering-ui-validation",
    suggestedUse: "工程证明：截图生成校验结果",
  });

  return selected;
}

async function packageSystemTour() {
  await addMaterialFile({
    source: path.join(root, "public", "demo", "huiyu-tongxing.pdf"),
    target: path.join(outputDirs.systemTour, "huiyu-tongxing.pdf"),
    group: "system-tour",
    title: "系统导览 PDF",
    route: null,
    role: "all",
    scene: "system-tour-pdf",
    suggestedUse: "项目报告、查新附件、答辩补充材料",
  });

  for (const page of systemTourPages) {
    const pageName = `page-${String(page.page).padStart(2, "0")}.webp`;
    await addMaterialFile({
      source: path.join(root, "public", "demo", "system-tour", "v3", "display", pageName),
      target: path.join(outputDirs.systemTour, page.name),
      group: "system-tour",
      title: page.title,
      route: null,
      role: "all",
      scene: `system-tour-page-${String(page.page).padStart(2, "0")}`,
      suggestedUse: page.suggestedUse,
    });
  }
}

async function packageEngineeringProof() {
  await addMaterialFile({
    source: path.join(root, "docs", "assets", "readme-system-architecture.png"),
    target: path.join(outputDirs.engineering, "readme-system-architecture.png"),
    group: "engineering",
    title: "系统架构 PNG",
    route: null,
    role: "all",
    scene: "engineering-architecture",
    suggestedUse: "项目报告、查新材料、工程能力附录",
  });
  await addMaterialFile({
    source: path.join(root, "artifacts", "demo-preflight-report.json"),
    target: path.join(outputDirs.engineering, "demo-preflight-report.json"),
    group: "engineering",
    title: "demo preflight 报告",
    route: null,
    role: "all",
    scene: "engineering-demo-preflight",
    suggestedUse: "工程证明：演示链路自动验收结果",
  });
  await addMaterialFile({
    source: path.join(root, "docs", "competition-message-guide.md"),
    target: path.join(outputDirs.engineering, "competition-message-guide.md"),
    group: "engineering",
    title: "比赛统一口径指南",
    route: null,
    role: "all",
    scene: "engineering-message-guide",
    suggestedUse: "答辩话术、禁用表述、材料口径统一",
  });

  const demoPreflightDir = path.join(root, "artifacts", "demo-preflight");
  if (fssync.existsSync(demoPreflightDir)) {
    await addMaterialFile({
      source: demoPreflightDir,
      target: path.join(outputDirs.engineering, "demo-preflight"),
      group: "engineering",
      title: "demo preflight 附件目录",
      route: null,
      role: "all",
      scene: "engineering-demo-preflight-artifacts",
      suggestedUse: "工程证明：Playwright 输出、失败排查与截图附件",
    });
  }
}

function getPreflightStatus() {
  const reportPath = path.join(root, "artifacts", "demo-preflight-report.json");
  if (!fssync.existsSync(reportPath)) return null;
  const report = JSON.parse(fssync.readFileSync(reportPath, "utf8"));
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const providerStatus = checks.find((check) => check.id === "provider-status");
  const aiFallback = checks.find((check) => check.id === "ai-fallback");
  const fixture = checks.find((check) => check.id === "demo-fixture");
  return {
    report,
    providerStatus,
    aiFallback,
    fixture,
  };
}

async function packageSystemAiStatus() {
  const status = getPreflightStatus();
  if (!status?.providerStatus) {
    notes.push("missing: provider-status check in artifacts/demo-preflight-report.json");
    missingRequiredScenes.push(systemStatusScene.scene);
    return;
  }

  const statusJsonPath = path.join(outputDirs.engineering, "system-ai-status.json");
  const statusMdPath = path.join(outputDirs.engineering, "system-ai-status.md");
  const statusCardPath = path.join(outputDirs.screenshots, systemStatusScene.outputName);
  await fs.mkdir(outputDirs.engineering, { recursive: true });
  await fs.mkdir(outputDirs.screenshots, { recursive: true });

  const payload = {
    generatedAt,
    baseUrl,
    providerStatus: status.providerStatus,
    aiFallback: status.aiFallback ?? null,
    fixture: status.fixture ?? null,
    summary: status.report.summary ?? null,
  };
  await fs.writeFile(statusJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(statusMdPath, buildSystemAiStatusMarkdown(payload), "utf8");
  await writeStatusCardPng(statusCardPath, payload);

  await addGeneratedMaterialFile({
    target: statusCardPath,
    source: sourceRel(path.join(root, "artifacts", "demo-preflight-report.json")),
    group: "screenshots",
    title: systemStatusScene.title,
    route: systemStatusScene.route,
    role: systemStatusScene.role,
    scene: systemStatusScene.scene,
    suggestedUse: systemStatusScene.suggestedUse,
    extra: {
      generatedFrom: "artifacts/demo-preflight-report.json",
      providerStatus: status.providerStatus.status,
      missing: status.providerStatus.missing ?? [],
    },
  });
  await addGeneratedMaterialFile({
    target: statusJsonPath,
    source: sourceRel(path.join(root, "artifacts", "demo-preflight-report.json")),
    group: "engineering",
    title: "系统完成度 / AI Provider Status JSON",
    route: systemStatusScene.route,
    role: systemStatusScene.role,
    scene: "engineering-system-ai-status-json",
    suggestedUse: "工程证明：provider status 原始摘要",
  });
  await addGeneratedMaterialFile({
    target: statusMdPath,
    source: sourceRel(path.join(root, "artifacts", "demo-preflight-report.json")),
    group: "engineering",
    title: "系统完成度 / AI Provider Status 说明",
    route: systemStatusScene.route,
    role: systemStatusScene.role,
    scene: "engineering-system-ai-status-md",
    suggestedUse: "答辩附录：AI provider 与 preflight 说明",
  });
}

function buildSystemAiStatusMarkdown(payload) {
  const diagnostics = payload.providerStatus?.diagnostics ?? {};
  const missing = payload.providerStatus?.missing ?? [];
  return `# 系统完成度 / AI Provider Status

生成时间：${generatedAt}
Base URL：${baseUrl}

## Provider Status

- chat：${diagnostics.chat ?? "unknown"}
- ocr：${diagnostics.ocr ?? "unknown"}
- asr：${diagnostics.asr ?? "unknown"}
- tts：${diagnostics.tts ?? "unknown"}
- fallbackText：${diagnostics.fallbackText ?? "unknown"}
- missing：${missing.length ? missing.join(", ") : "0"}

## Preflight Summary

- passed：${payload.summary?.passed ?? "unknown"}
- failed：${payload.summary?.failed ?? "unknown"}
- skipped：${payload.summary?.skipped ?? "unknown"}

## 使用说明

该文件由 \`artifacts/demo-preflight-report.json\` 生成，用于答辩材料中的工程完成度与 AI provider 可读性证明。
`;
}

async function writeStatusCardPng(target, payload) {
  const svg = buildStatusCardSvg(payload);
  const { default: sharp } = await import("sharp");
  await sharp(Buffer.from(svg)).png().toFile(target);
}

function buildStatusCardSvg(payload) {
  const diagnostics = payload.providerStatus?.diagnostics ?? {};
  const summary = payload.summary ?? {};
  const capabilities = [
    ["Chat", diagnostics.chat],
    ["OCR", diagnostics.ocr],
    ["ASR", diagnostics.asr],
    ["TTS", diagnostics.tts],
  ];
  const missing = payload.providerStatus?.missing ?? [];
  const capabilityText = capabilities
    .map(([name, value], index) => {
      const x = 110 + index * 305;
      const color = value === "ready" ? "#047857" : value ? "#b45309" : "#991b1b";
      const bg = value === "ready" ? "#ecfdf5" : value ? "#fff7ed" : "#fef2f2";
      return `
        <rect x="${x}" y="360" width="250" height="132" rx="24" fill="${bg}" stroke="#dbe5f2"/>
        <text x="${x + 28}" y="410" font-size="32" font-weight="800" fill="#0f172a">${escapeXml(name)}</text>
        <text x="${x + 28}" y="456" font-size="28" font-weight="700" fill="${color}">${escapeXml(value ?? "unknown")}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
    <rect width="1440" height="900" fill="#f6f8fb"/>
    <rect x="64" y="64" width="1312" height="772" rx="36" fill="#ffffff" stroke="#d9e2ef"/>
    <text x="110" y="150" font-size="48" font-weight="900" fill="#0f172a">系统完成度 / AI Provider Status</text>
    <text x="110" y="204" font-size="24" fill="#475569">SmartChildcare Agent 演示工程证明</text>
    <text x="110" y="252" font-size="22" fill="#64748b">Base URL: ${escapeXml(baseUrl)}</text>
    <text x="110" y="292" font-size="22" fill="#64748b">Generated: ${escapeXml(generatedAt)}</text>

    <rect x="985" y="128" width="306" height="150" rx="24" fill="#eff6ff" stroke="#bfdbfe"/>
    <text x="1025" y="184" font-size="28" font-weight="800" fill="#1d4ed8">Preflight</text>
    <text x="1025" y="230" font-size="26" fill="#0f172a">Passed ${escapeXml(summary.passed ?? "unknown")} / Failed ${escapeXml(summary.failed ?? "unknown")}</text>

    ${capabilityText}

    <rect x="110" y="548" width="1220" height="116" rx="24" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="148" y="598" font-size="28" font-weight="800" fill="#0f172a">Fallback</text>
    <text x="148" y="640" font-size="24" fill="#334155">${escapeXml(diagnostics.fallbackText ?? "unknown")}</text>

    <rect x="110" y="700" width="1220" height="72" rx="20" fill="${missing.length ? "#fff7ed" : "#ecfdf5"}" stroke="#dbe5f2"/>
    <text x="148" y="746" font-size="24" font-weight="700" fill="${missing.length ? "#b45309" : "#047857"}">Missing fields: ${escapeXml(missing.length ? missing.join(", ") : "0")}</text>
  </svg>`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildChecklist() {
  const byScene = new Map(materialFiles.filter((file) => file.group === "screenshots").map((file) => [file.scene, file]));
  const lines = [...sceneDefinitions, systemStatusScene].map((scene) => {
    const item = byScene.get(scene.scene);
    return `- [${item ? "x" : " "}] ${scene.scene} - ${scene.title}${item ? ` - \`${item.path}\`` : ""}`;
  });

  return `# 答辩截图清单 V2

项目：${projectName}
生成时间：${generatedAt}
Base URL：${baseUrl}
缺失必备场景：${missingRequiredScenes.length}

## PPT-ready 截图

${lines.join("\n")}

## 复核提示

- 绘本截图使用 demo 占位姓名，放入公开材料前保留人工复核流程。
- 默认素材生成不写线上数据；preflight 仅默认面向本地 URL。
`;
}

function buildStoryboard() {
  return `# 演示视频录屏分镜 V2

项目：${projectName}
Base URL：${baseUrl}
演示账号：${demoAccount}

## 90 秒答辩精剪版

| 时间 | 画面 | 讲法 |
| --- | --- | --- |
| 0-8s | \`01-login\` | 慧育童行是面向托育场景的 SmartChildcare Agent，三端围绕同一儿童上下文协作。 |
| 8-22s | \`02-teacher-home\` | 教师从首页进入低成本记录和 AI 助手，把现场观察沉淀成结构化线索。 |
| 22-40s | \`03-consultation-setup\` + \`04-consultation-result\` | 高风险会诊把健康、成长、家园反馈合并成证据链，并输出教师、家长、园长动作。 |
| 40-55s | \`05-admin-risk-priority\` | 园长按 P1/P2 风险优先级承接，看到机构协作、复查和回流状态。 |
| 55-73s | \`06-parent-home\` + \`09-feedback-submit\` | 家长看到今晚行动，完成后用结构化反馈回流下一轮判断。 |
| 73-85s | \`07-storybook-cover\` + \`08-storybook-page\` | 个性化绘本把干预动作转成家庭能理解、愿意执行的共读场景。 |
| 85-90s | \`10-system-ai-status\` | 最后补充工程证明：provider status、preflight 和本地演示边界清晰。 |

## 3 分钟标准演示版

| 时间 | 画面 | 讲法 |
| --- | --- | --- |
| 0-18s | \`01-login\` | 说明项目定位、三类示例账号和本地演示环境。 |
| 18-40s | \`02-teacher-home\` | 展示教师首页的今日任务、儿童状态、AI/语音入口。 |
| 40-70s | \`03-consultation-setup\` | 进入高风险会诊 setup，讲清会诊对象、阶段流程、证据来源和参与人员。 |
| 70-100s | \`04-consultation-result\` | 展示 result：trace timeline、AI 助诊建议、长期策略、本周说明和家庭任务。 |
| 100-125s | \`05-admin-risk-priority\` | 展示管理端风险优先级、会诊承接、48 小时复查、家庭反馈回流。 |
| 125-145s | \`06-parent-home\` | 展示家长首页：今晚行动、提醒、趋势入口。 |
| 145-158s | \`09-feedback-submit\` | 展示结构化反馈提交，不演示真实线上写入。 |
| 158-172s | \`07-storybook-cover\` + \`08-storybook-page\` | 展示绘本封面、内页、真实媒体/兜底标记和家庭任务。 |
| 172-180s | \`10-system-ai-status\` | 收束到系统完成度、provider status、preflight 通过和缺失项为 0。 |

## 5 分钟完整路演版

| 时间 | 画面 | 讲法 |
| --- | --- | --- |
| 0-30s | \`01-login\` | 先交代边界：本地默认演示，可通过 baseURL 配置；公开材料不写真实线上数据。 |
| 30-70s | \`02-teacher-home\` | 讲教师工作台：观察记录、健康材料、班级儿童状态、AI 助手入口。 |
| 70-120s | \`03-consultation-setup\` | 讲会诊 setup：从重点儿童进入，锁定证据、参与人员、会诊阶段与下一步行动。 |
| 120-175s | \`04-consultation-result\` | 讲 result：证据链、长期策略、最近会诊、本周说明、顺序视角和可执行家庭任务。 |
| 175-225s | \`05-admin-risk-priority\` | 讲园长端：P1/P2 风险队列、机构协作、质量驾驶舱和会诊承接。 |
| 225-255s | \`06-parent-home\` | 讲家长首页：今晚行动、孩子状态、提醒与趋势追问。 |
| 255-280s | \`09-feedback-submit\` | 讲反馈提交如何回流到教师、园长和后续会诊，不展示线上真实写入。 |
| 280-330s | \`07-storybook-cover\` + \`08-storybook-page\` | 讲个性化绘本：封面/总览、内页、音频、家庭任务和 demo-safe 复核。 |
| 330-360s | \`10-system-ai-status\` | 讲工程证据：AI provider status、preflight、截图 manifest、系统架构与材料完整性。 |

## 禁用话术

- 不说“完整生产化已上线”。
- 不说“真实机构已全量生产运行”。
- 不说“所有上游能力长期稳定运行”。
- 不把 demo-safe 绘本图片描述成未经复核的真实儿童材料。
`;
}

function buildReadme() {
  const fileLines = materialFiles
    .map((file) => `- \`${file.path}\` - ${file.title}（${file.scene ?? "no-scene"}）`)
    .join("\n");
  const noteLines = notes.length ? notes.map((note) => `- ${note}`).join("\n") : "- 无。";

  return `# 演示素材包 V2

项目：${projectName}
生成时间：${generatedAt}
Base URL：${baseUrl}
缺失必备场景：${missingRequiredScenes.length}

## 内容

- \`screenshots/\`：PPT-ready 稳定命名截图与状态卡片。
- \`system-tour/\`：系统导览 PDF 与关键页面图片。
- \`engineering-proof/\`：preflight、截图 manifest、架构图、provider status 和口径指南。
- \`defense-screenshot-checklist.md\`：答辩截图核对清单。
- \`video-storyboard.md\`：90 秒、3 分钟、5 分钟录屏分镜。
- \`manifest.json\`：素材来源、场景、用途和缺失项。

## 重新生成

\`\`\`powershell
npm run demo:materials
npm run demo:materials:capture
npm run demo:video-storyboard
\`\`\`

默认不重新采集页面截图，也不写线上数据。需要重跑截图和 preflight 时使用 \`demo:materials:capture\`，默认 base URL 为本地 \`${baseUrl}\`。远程 preflight 需要显式设置 \`DEMO_MATERIALS_ALLOW_NONLOCAL_PREFLIGHT=1\`。

## 已打包文件

${fileLines || "- 尚未找到可打包文件。"}

## 注意事项

${noteLines}
`;
}

function buildStatusDoc() {
  const sceneRows = [...sceneDefinitions, systemStatusScene]
    .map((scene) => {
      const file = materialFiles.find((item) => item.scene === scene.scene);
      return `| ${scene.scene} | ${scene.title} | ${file ? `\`${file.path}\`` : "缺失"} | ${scene.suggestedUse} |`;
    })
    .join("\n");

  return `# DEMO_MATERIALS_V2

生成时间：${generatedAt}
Base URL：${baseUrl}
缺失必备场景：${missingRequiredScenes.length}

## 状态

- \`npm run demo:materials\`：生成 V2 素材包、manifest、截图清单、storyboard 和本状态文档。
- \`npm run demo:materials:capture\`：在本地 base URL 上重跑截图、系统导览和 preflight 后再打包。
- \`npm run demo:video-storyboard\`：只刷新 \`artifacts/demo-materials/video-storyboard.md\`。

## 必备场景

| Scene | Title | Output | Suggested use |
| --- | --- | --- | --- |
${sceneRows}

## 本地/远程安全规则

- 默认 base URL 是 \`http://127.0.0.1:3330\`。
- 可通过 \`DEMO_MATERIALS_BASE_URL\` 覆盖。
- preflight 属于可能写入演示状态的验收流程；非 localhost/127.0.0.1 目标默认拒绝运行。
- 需要远程 preflight 时，必须显式设置 \`DEMO_MATERIALS_ALLOW_NONLOCAL_PREFLIGHT=1\`。

## 验收

- manifest JSON 可解析。
- \`missingRequiredSceneCount\` 为 \`${missingRequiredScenes.length}\`。
- PPT-ready 截图集中在 \`artifacts/demo-materials/screenshots/\`。
- AI provider status 已从 \`artifacts/demo-preflight-report.json\` 打包为状态卡片和工程证明。
`;
}

async function writeText(file, content) {
  await fs.writeFile(path.join(outRoot, file), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

async function writeStatusDoc() {
  await fs.writeFile(docsStatusPath, buildStatusDoc(), "utf8");
}

async function writeManifest() {
  const requiredScenes = [...sceneDefinitions.map((scene) => scene.scene), systemStatusScene.scene];
  await writeText(
    "manifest.json",
    JSON.stringify(
      {
        projectName,
        generatedAt,
        baseUrl,
        localOnlyDefault,
        demoAccount,
        storyboardOnly,
        requiredScenes,
        missingRequiredScenes,
        missingRequiredSceneCount: missingRequiredScenes.length,
        scripts: {
          default: "npm run demo:materials",
          capture: "npm run demo:materials:capture",
          storyboard: "npm run demo:video-storyboard",
        },
        scenePlan: [...sceneDefinitions, systemStatusScene].map((scene) => ({
          scene: scene.scene,
          title: scene.title,
          route: scene.route,
          role: scene.role,
          suggestedUse: scene.suggestedUse,
          outputName: scene.outputName,
        })),
        files: materialFiles,
        notes,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (storyboardOnly) {
    await ensureDirs();
    await writeText("video-storyboard.md", buildStoryboard());
    console.log(`Demo video storyboard generated at ${sourceRel(path.join(outRoot, "video-storyboard.md"))}`);
    return;
  }

  await ensureDirs({ clean: true });
  ensureNonLocalPreflightAllowed();

  if (shouldGenerateSystemTour) runNpmScript("system-tour:images");
  if (shouldCapture) runNpmScript("capture:ui", { CAPTURE_BASE_URL: baseUrl });
  if (shouldRunPreflight || shouldCapture) {
    runNpmScript("demo:preflight", {
      DEMO_PREFLIGHT_SCREENSHOTS: "1",
      DEMO_PREFLIGHT_BASE_URL: baseUrl,
    });
  }

  await packageUiScreenshots();
  await packageSystemTour();
  await packageEngineeringProof();
  await packageSystemAiStatus();

  await writeText("README.md", buildReadme());
  await writeText("defense-screenshot-checklist.md", buildChecklist());
  await writeText("video-storyboard.md", buildStoryboard());
  await writeManifest();
  await writeStatusDoc();

  if (missingRequiredScenes.length > 0) {
    throw new Error(`Missing required demo material scenes: ${missingRequiredScenes.join(", ")}`);
  }

  console.log(`Demo materials generated at ${sourceRel(outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
