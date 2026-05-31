import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outRoot = path.join(root, "artifacts", "demo-materials");
const args = new Set(process.argv.slice(2));
const generatedAt = new Date().toISOString();

const projectName = "慧育童行 - SmartChildcare Agent";
const baseUrl = process.env.DEMO_MATERIALS_BASE_URL || "https://www.smartchildcare.cn";
const demoAccount = process.env.DEMO_MATERIALS_ACCOUNT || "示例账号入口";
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

const materialFiles = [];
const notes = [];

const outputDirs = {
  screenshots: path.join(outRoot, "screenshots"),
  systemTour: path.join(outRoot, "system-tour"),
  engineering: path.join(outRoot, "engineering-proof"),
};

const routePlan = [
  { route: "/login", label: "登录页：品牌首屏、示例账号入口、系统导览入口" },
  { route: "/teacher", label: "Teacher：教师工作台、语音 / 草稿入口" },
  { route: "/teacher/high-risk-consultation", label: "Teacher：高风险会诊过程、证据链、干预卡" },
  { route: "/admin", label: "Admin：风险优先级、会诊承接、治理区、周报预览" },
  { route: "/parent", label: "Parent：首页今晚行动、趋势入口、结构化反馈入口" },
  { route: "/parent/storybook?child=c-1", label: "Parent：成长微绘本" },
  { route: "/parent/agent?child=c-1", label: "Parent：趋势追问与结构化反馈" },
];

const systemTourPages = [
  { page: 1, name: "01-cover.webp", label: "系统导览封面" },
  { page: 2, name: "02-project-name.webp", label: "项目命名页" },
  { page: 8, name: "08-three-roles.webp", label: "三端能力页" },
  { page: 22, name: "22-summary.webp", label: "总结页" },
];

function rel(file) {
  return path.relative(outRoot, file).replace(/\\/g, "/");
}

function sourceRel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

async function ensureDirs() {
  await fs.mkdir(outRoot, { recursive: true });
  await Promise.all(Object.values(outputDirs).map((dir) => fs.mkdir(dir, { recursive: true })));
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

async function copyIfExists(source, target, group, label) {
  if (!fssync.existsSync(source)) {
    notes.push(`missing: ${sourceRel(source)}`);
    return false;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
  const stat = await fs.stat(target);
  materialFiles.push({
    group,
    label,
    path: rel(target),
    source: sourceRel(source),
    sizeBytes: stat.isFile() ? stat.size : null,
  });
  return true;
}

async function readJsonIfExists(file) {
  if (!fssync.existsSync(file)) return null;
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function isRouteMatch(route, target) {
  const normalizedRoute = route.split("?")[0];
  const normalizedTarget = target.split("?")[0];
  return normalizedRoute === normalizedTarget;
}

function pickScreenshots(items) {
  const selected = [];
  const seen = new Set();

  for (const routeItem of routePlan) {
    const routeItems = items
      .filter((item) => item.sensitiveDataMasked !== false)
      .filter((item) => isRouteMatch(item.route ?? "", routeItem.route))
      .sort((a, b) => {
        const viewportScore = (item) => (item.viewport === "desktop" ? 0 : item.viewport === "mobile" ? 1 : 2);
        const modeScore = (item) => (item.mode === "viewport" ? 0 : item.mode === "fullPage" ? 1 : 2);
        return viewportScore(a) - viewportScore(b) || modeScore(a) - modeScore(b);
      });

    for (const item of routeItems.slice(0, 3)) {
      if (!item.filename || seen.has(item.filename)) continue;
      selected.push({ ...item, defenseLabel: routeItem.label });
      seen.add(item.filename);
    }
  }

  return selected;
}

async function packageUiScreenshots() {
  const sourceRoot = path.join(root, "artifacts", "ui-screenshots");
  const manifestPath = path.join(sourceRoot, "manifest.json");
  const manifest = await readJsonIfExists(manifestPath);
  if (!manifest) {
    notes.push("missing: artifacts/ui-screenshots/manifest.json");
    return [];
  }

  const items = Array.isArray(manifest) ? manifest : manifest.value ?? [];
  const selected = pickScreenshots(items);

  for (const item of selected) {
    await copyIfExists(
      path.join(sourceRoot, item.filename),
      path.join(outputDirs.screenshots, item.filename),
      "screenshots",
      `${item.defenseLabel} (${item.viewport}/${item.mode})`,
    );
  }

  await copyIfExists(manifestPath, path.join(outputDirs.engineering, "ui-screenshots-manifest.json"), "engineering", "UI 截图 manifest");
  await copyIfExists(
    path.join(sourceRoot, "screenshot-inventory.md"),
    path.join(outputDirs.engineering, "ui-screenshot-inventory.md"),
    "engineering",
    "UI 截图素材清单",
  );
  await copyIfExists(
    path.join(sourceRoot, "route-coverage.md"),
    path.join(outputDirs.engineering, "ui-route-coverage.md"),
    "engineering",
    "UI 路由覆盖说明",
  );

  return selected;
}

async function packageSystemTour() {
  await copyIfExists(
    path.join(root, "public", "demo", "huiyu-tongxing.pdf"),
    path.join(outputDirs.systemTour, "huiyu-tongxing.pdf"),
    "system-tour",
    "系统导览 PDF",
  );

  for (const page of systemTourPages) {
    const pageName = `page-${String(page.page).padStart(2, "0")}.webp`;
    await copyIfExists(
      path.join(root, "public", "demo", "system-tour", "v3", "display", pageName),
      path.join(outputDirs.systemTour, page.name),
      "system-tour",
      page.label,
    );
  }
}

async function packageEngineeringProof() {
  await copyIfExists(
    path.join(root, "docs", "assets", "readme-system-architecture.png"),
    path.join(outputDirs.engineering, "readme-system-architecture.png"),
    "engineering",
    "系统架构 PNG",
  );
  await copyIfExists(
    path.join(root, "artifacts", "demo-preflight-report.json"),
    path.join(outputDirs.engineering, "demo-preflight-report.json"),
    "engineering",
    "demo preflight 报告",
  );
  await copyIfExists(
    path.join(root, "docs", "competition-message-guide.md"),
    path.join(outputDirs.engineering, "competition-message-guide.md"),
    "engineering",
    "比赛统一口径指南",
  );

  const demoPreflightDir = path.join(root, "artifacts", "demo-preflight");
  if (fssync.existsSync(demoPreflightDir)) {
    await copyIfExists(
      demoPreflightDir,
      path.join(outputDirs.engineering, "demo-preflight"),
      "engineering",
      "demo preflight 附件目录",
    );
  }
}

function buildChecklist(selectedScreenshots) {
  const screenshotLines = selectedScreenshots.length
    ? selectedScreenshots
        .map((item) => `- [ ] ${item.defenseLabel} - \`${item.filename}\``)
        .join("\n")
    : "- [ ] 先运行 `npm run demo:materials:capture` 或 `DEMO_MATERIALS_CAPTURE=1 npm run demo:materials` 生成截图。";

  return `# 下一阶段答辩截图清单

项目：${projectName}
生成时间：${generatedAt}
Base URL：${baseUrl}

## 必备截图

- [ ] 登录页：品牌首屏、示例账号入口、系统导览入口。
- [ ] 系统导览：封面、项目命名页、三端六能力页、总结页。
- [ ] Teacher：教师工作台、语音 / 草稿入口、高风险会诊过程、会诊证据链结果。
- [ ] Admin：园长首页风险优先级、会诊承接详情、周报 / 治理区、派单 / 跟进动作。
- [ ] Parent：家长首页今晚行动、成长绘本、趋势追问、结构化反馈提交。
- [ ] 工程证明：\`/api/ai/provider-status\`、demo preflight 报告、截图 manifest、系统架构 PNG。

## 当前已打包截图

${screenshotLines}
`;
}

function buildStoryboard() {
  return `# 演示视频素材分镜表

项目：${projectName}
Base URL：${baseUrl}
演示账号：${demoAccount}

## 建议时长

3 分钟答辩版：登录与导览 20 秒，Teacher 50 秒，Admin 35 秒，Parent 55 秒，工程证明 20 秒。

## 分镜

1. 登录页
   - 画面：\`/login\` 品牌首屏、示例账号、系统导览入口。
   - 讲法：慧育童行是面向托育场景的 SmartChildcare Agent。

2. 系统导览
   - 画面：封面、项目命名页、三端六能力页、总结页。
   - 讲法：中文展示名是慧育童行，英文名 / 技术系统名是 SmartChildcare Agent。

3. Teacher 工作台
   - 画面：\`/teacher\` 今日任务、语音 / 草稿入口、儿童状态。
   - 讲法：教师低成本记录现场观察，系统组织成结构化草稿。

4. 高风险会诊
   - 画面：\`/teacher/high-risk-consultation\` 阶段流、证据链、干预卡。
   - 讲法：多 Agent 会诊输出教师动作、家长今夜任务和园长承接信息。

5. Admin 承接
   - 画面：\`/admin\` 风险优先级、会诊承接、治理区、周报预览。
   - 讲法：园长从个体事件进入机构级优先级和派单跟进。

6. Parent 行动
   - 画面：\`/parent\` 今晚行动、趋势入口、反馈入口。
   - 讲法：家长先看懂今晚做什么，再把执行结果回流。

7. 成长微绘本
   - 画面：\`/parent/storybook?child=c-1\`。
   - 讲法：微绘本提升家长理解和情感连接，素材按 demo-safe illustration 表述。

8. 趋势追问与反馈
   - 画面：\`/parent/agent?child=c-1\` 趋势追问、结构化反馈。
   - 讲法：反馈进入下一轮趋势、会诊和周报。

9. 工程证明
   - 画面：\`/api/ai/provider-status\`、demo preflight 报告、截图 manifest、系统架构 PNG。
   - 讲法：vivo 能力已具代码接入、smoke/test 与受控演示验证；真实机构生产化仍按边界说明。

## 禁用话术

- 不说完整生产化。
- 不说真实机构已全量生产上线。
- 不说完整生产化闭环已完成。
- 不说所有上游能力已长期稳定运行。
`;
}

function buildReadme() {
  const fileLines = materialFiles
    .map((file) => `- \`${file.path}\` - ${file.label}`)
    .join("\n");
  const noteLines = notes.length ? notes.map((note) => `- ${note}`).join("\n") : "- 无。";

  return `# 演示素材包

项目：${projectName}
生成时间：${generatedAt}
Base URL：${baseUrl}

## 内容

- \`screenshots/\`：答辩截图候选。
- \`system-tour/\`：系统导览 PDF 与关键页面图片。
- \`engineering-proof/\`：preflight、截图 manifest、架构图和口径指南。
- \`defense-screenshot-checklist.md\`：下一阶段答辩截图清单。
- \`video-storyboard.md\`：可录屏分镜表。
- \`manifest.json\`：素材来源与生成配置。

## 重新生成

\`\`\`powershell
npm run demo:materials
npm run demo:materials:capture
npm run demo:video-storyboard
\`\`\`

默认不会重新采集页面截图。需要重新跑截图和 preflight 时使用 \`demo:materials:capture\`，或分别设置 \`DEMO_MATERIALS_CAPTURE=1\`、\`DEMO_MATERIALS_PREFLIGHT=1\`、\`DEMO_MATERIALS_SYSTEM_TOUR=1\`。

## 已打包文件

${fileLines || "- 尚未找到可打包文件。"}

## 注意事项

${noteLines}
`;
}

async function writeText(file, content) {
  await fs.writeFile(path.join(outRoot, file), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

async function main() {
  await ensureDirs();

  if (storyboardOnly) {
    await writeText("video-storyboard.md", buildStoryboard());
    console.log(`Demo video storyboard generated at ${sourceRel(path.join(outRoot, "video-storyboard.md"))}`);
    return;
  }

  if (!storyboardOnly) {
    if (shouldGenerateSystemTour) runNpmScript("system-tour:images");
    if (shouldCapture) runNpmScript("capture:ui");
    if (shouldRunPreflight || shouldCapture) {
      runNpmScript("demo:preflight", { DEMO_PREFLIGHT_SCREENSHOTS: "1" });
    }
  }

  const selectedScreenshots = await packageUiScreenshots();
  await packageSystemTour();
  await packageEngineeringProof();

  await writeText("README.md", buildReadme());
  await writeText("defense-screenshot-checklist.md", buildChecklist(selectedScreenshots));
  await writeText("video-storyboard.md", buildStoryboard());
  await writeText(
    "manifest.json",
    JSON.stringify(
      {
        projectName,
        generatedAt,
        baseUrl,
        demoAccount,
        storyboardOnly,
        scripts: {
          default: "npm run demo:materials",
          capture: "npm run demo:materials:capture",
          storyboard: "npm run demo:video-storyboard",
        },
        routePlan,
        files: materialFiles,
        notes,
      },
      null,
      2,
    ),
  );

  console.log(`Demo materials generated at ${sourceRel(outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
