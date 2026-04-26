import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const sourceRoot = path.join(root, "artifacts", "ui-screenshots");
const packageRoot = path.join(root, "artifacts", "gpt-image2-input");
const screenshotsRoot = path.join(packageRoot, "screenshots");
const batchesRoot = path.join(packageRoot, "upload-batches");
const contactSheetsRoot = path.join(packageRoot, "contact-sheets");
const zipRoot = path.join(packageRoot, "zip");

const roleFolderMap = {
  login: "00-login",
  director: "01-director",
  "teacher-li": "02-teacher-li",
  "teacher-zhou": "03-teacher-zhou",
  parent: "04-parent",
};

const batchMeta = {
  "batch-01-login-and-design-system": {
    title: "登录页与整体设计系统",
    role: "登录页 / 全局设计系统",
    goal: "建立智慧托育平台的整体视觉语言、登录页重设计方向和通用组件风格。",
  },
  "batch-02-director-dashboard-and-management": {
    title: "园长端首页、风险看板与管理页",
    role: "园长端 / 陈园长",
    goal: "重设计园长端数据总览、风险优先级、AI 助手、周报和管理列表页。",
  },
  "batch-03-teacher-workbench-and-records": {
    title: "教师端工作台与日常记录",
    role: "教师端 / 李老师、周老师",
    goal: "重设计教师端工作台、晨检、饮食、成长记录、健康材料解析和高风险会诊。",
  },
  "batch-04-parent-home-and-feedback": {
    title: "家长端首页、孩子记录与反馈",
    role: "家长端 / 林妈妈",
    goal: "重设计家长端孩子状态、7 天趋势、AI 干预卡、反馈区和成长绘本。",
  },
  "batch-05-forms-modals-empty-error-states": {
    title: "表单、弹窗、空状态与错误态",
    role: "共享状态",
    goal: "统一表单、确认弹窗、搜索空状态、错误/权限状态和详情/反馈状态。",
  },
  "batch-06-mobile-and-responsive": {
    title: "移动端与平板响应式",
    role: "三端响应式",
    goal: "重设计 mobile/tablet 下的主路径、导航、卡片密度和触控布局。",
  },
};

const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, "manifest.json"), "utf8"));
const existingDocs = await readExistingCoverageDocs();
await ensureDirs();

const packaged = [];
for (const entry of manifest) {
  if (!shouldPackage(entry)) continue;
  const sourceFile = path.join(sourceRoot, entry.filename);
  if (!fssync.existsSync(sourceFile)) continue;
  const batch = resolveBatch(entry);
  const folder = entry.mode === "state" || entry.stateName !== "default" ? "05-shared-states" : roleFolderMap[entry.role] ?? "05-shared-states";
  const safeName = `${entry.id}.png`.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
  const targetRel = path.posix.join("screenshots", folder, safeName);
  const targetAbs = path.join(packageRoot, targetRel);
  await fs.mkdir(path.dirname(targetAbs), { recursive: true });
  await fs.copyFile(sourceFile, targetAbs);

  packaged.push({
    id: entry.id,
    role: entry.role,
    demoAccount: entry.demoAccount,
    sourceRoute: entry.route,
    pageTitle: entry.pageTitle,
    viewport: entry.viewport,
    mode: entry.mode,
    stateName: entry.stateName,
    originalFile: toPosix(path.relative(packageRoot, sourceFile)),
    packagedFile: targetRel,
    uploadBatch: batch,
    uploadPriority: resolvePriority(entry),
    recommendedForGPTImage2: entry.recommendedForGPTImage2,
    sensitiveDataMasked: entry.sensitiveDataMasked,
    redesignFocus: resolveRedesignFocus(entry),
    notes: entry.notes,
  });
}

await writeText("README.md", buildReadme(packaged));
await writeText("00-master-prompt-for-gpt-image-2.md", buildMasterPrompt());
await writeText("01-upload-order.md", buildUploadOrder(packaged));
await writeText("02-design-brief.md", buildDesignBrief());
await writeText("03-screenshot-inventory-for-upload.md", buildUploadInventory(packaged));
await writeText("04-role-and-route-coverage.md", buildCoverageSummary(existingDocs));
await fs.writeFile(path.join(packageRoot, "manifest.gpt-image2.json"), `${JSON.stringify(packaged, null, 2)}\n`, "utf8");
await writeBatchPrompts(packaged);
await createContactSheets(packaged);
await createZip();
await validatePackage(packaged);

function shouldPackage(entry) {
  if (!entry.filename || entry.recommendedForGPTImage2) return true;
  if (entry.viewport === "mobile" || entry.viewport === "tablet") return true;
  if (entry.mode === "state") return true;
  return false;
}

function resolveBatch(entry) {
  if (entry.mode === "state" || /form|modal|empty|error|confirm|feedback|search|denied/i.test(entry.stateName)) {
    return "batch-05-forms-modals-empty-error-states";
  }
  if (entry.viewport === "mobile" || entry.viewport === "tablet") return "batch-06-mobile-and-responsive";
  if (entry.role === "login") return "batch-01-login-and-design-system";
  if (entry.role === "director") return "batch-02-director-dashboard-and-management";
  if (entry.role === "teacher-li" || entry.role === "teacher-zhou") return "batch-03-teacher-workbench-and-records";
  if (entry.role === "parent") return "batch-04-parent-home-and-feedback";
  return "batch-05-forms-modals-empty-error-states";
}

function resolvePriority(entry) {
  if (entry.role === "login" && entry.viewport === "desktop") return "high";
  if (/home|workbench|首页|工作台|园所首页|家长首页|教师工作台|高风险|风险|children|health|diet|growth/i.test(`${entry.id} ${entry.pageTitle}`)) {
    return entry.mode === "fullPage" ? "medium" : "high";
  }
  if (entry.viewport === "mobile") return "high";
  if (entry.viewport === "tablet") return "medium";
  return "low";
}

function resolveRedesignFocus(entry) {
  if (entry.role === "login") return "登录页布局、示例账号入口、普通账号表单、中文品牌表达和响应式适配。";
  if (entry.role === "director") return "园长端数据密度、风险优先级、管理列表、AI 决策辅助和周报复盘。";
  if (entry.role === "teacher-li" || entry.role === "teacher-zhou") return "教师端班级运营、晨检/饮食/成长记录、快捷操作、会诊与家园沟通。";
  if (entry.role === "parent") return "家长端孩子状态、7 天趋势、干预卡、反馈闭环和低数字熟练度可读性。";
  return "共享状态、表单、弹窗、空状态、错误态与响应式行为。";
}

async function ensureDirs() {
  const dirs = [
    packageRoot,
    screenshotsRoot,
    batchesRoot,
    contactSheetsRoot,
    zipRoot,
    ...Object.values(roleFolderMap).map((dir) => path.join(screenshotsRoot, dir)),
    path.join(screenshotsRoot, "05-shared-states"),
  ];
  for (const dir of dirs) await fs.mkdir(dir, { recursive: true });
}

async function readExistingCoverageDocs() {
  const read = async (file) => {
    try {
      return await fs.readFile(path.join(sourceRoot, file), "utf8");
    } catch {
      return "";
    }
  };
  return {
    inventory: await read("screenshot-inventory.md"),
    roleCoverage: await read("role-coverage.md"),
    routeCoverage: await read("route-coverage.md"),
  };
}

async function writeText(file, content) {
  await fs.writeFile(path.join(packageRoot, file), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function buildReadme(items) {
  const risky = items.filter((item) => !item.sensitiveDataMasked);
  const byBatch = groupBy(items, "uploadBatch");
  return `# GPT Image 2 输入包

这个文件夹用于把智慧托育平台 / 普惠托育智慧管理平台的现有界面截图、页面清单、覆盖说明和重设计提示词统一交给 GPT Image 2。

## 如何使用

1. 先阅读 \`00-master-prompt-for-gpt-image-2.md\` 和 \`02-design-brief.md\`，理解整体设计目标。
2. 按 \`01-upload-order.md\` 分批上传 \`screenshots/\` 下的图片。
3. 每批上传时，同时复制 \`upload-batches/\` 中对应的 batch prompt。
4. 如果一次可上传图片数量有限，优先选择 \`manifest.gpt-image2.json\` 中 \`uploadPriority: "high"\` 的图片。
5. 完整交付可直接使用 \`zip/smartchildcare-gpt-image2-input.zip\`。

## 建议上传顺序

- 第 1 批：登录页 + 设计系统参考，使用 \`batch-01-login-and-design-system.md\`。
- 第 2 批：园长端首页、风险看板、管理列表页，使用 \`batch-02-director-dashboard-and-management.md\`。
- 第 3 批：教师端工作台、晨检、饮食、成长记录，使用 \`batch-03-teacher-workbench-and-records.md\`。
- 第 4 批：家长端首页、孩子记录、反馈，使用 \`batch-04-parent-home-and-feedback.md\`。
- 第 5 批：表单、详情、弹窗、空状态、错误状态，使用 \`batch-05-forms-modals-empty-error-states.md\`。
- 第 6 批：tablet/mobile 响应式截图，使用 \`batch-06-mobile-and-responsive.md\`。

## 批次数量

${Object.entries(batchMeta)
  .map(([key, meta]) => `- ${meta.title}：${byBatch[key]?.length ?? 0} 张`)
  .join("\n")}

## 优先上传图片

${items
  .filter((item) => item.uploadPriority === "high")
  .slice(0, 40)
  .map((item) => `- ${item.packagedFile}（${item.pageTitle}，${item.viewport}/${item.mode}）`)
  .join("\n")}

## 脱敏与风险

- 示例账号名保留：陈园长、李老师、周老师、林妈妈。
- 脚本已对 DOM 文本中的儿童姓名、昵称、监护人姓名、手机号、证件号和地址做打码。
- 以下截图需要人工复核，通常是因为绘本或图片内容可能包含无法通过 DOM 完全确认的文本：
${risky.length ? risky.map((item) => `  - ${item.packagedFile}：${item.notes}`).join("\n") : "  - 无。"}

## 失败或未覆盖

详见 \`04-role-and-route-coverage.md\`。如果某些页面没有截图，通常是权限限制、重复路由、线上入口未暴露或任务约束禁止点击最终提交/删除动作。
`;
}

function buildMasterPrompt() {
  return `# GPT Image 2 总提示词

你是资深中文 B2B SaaS 产品视觉设计师。请基于我上传的智慧托育平台截图，重新设计一套更专业、可信、温和、有亲和力的界面方案。

## 项目

- 产品名称：智慧托育平台 / 普惠托育智慧管理平台
- 业务场景：托育机构运营、儿童照护记录、教师日常协作、园长风险管理、家园反馈闭环
- 目标用户：园长、教师、家长
- 输出语言：简体中文

## 三类角色

- 园长端 / 陈园长：管理与数据视角，关注全园总览、风险看板、管理列表、AI 决策辅助、运营周报。
- 教师端 / 李老师、周老师：班级运营与日常记录，关注工作台、晨检、饮食、成长记录、健康材料解析、高风险会诊、家园沟通。
- 家长端 / 林妈妈：孩子状态查看与反馈，关注孩子今日状态、近 7 天饮食/晨检/成长趋势、AI 干预卡、反馈闭环、成长绘本。

## 设计方向

- 中文 B2B SaaS，不要做成官网宣传页。
- 专业、可信、温和、有亲和力，适合托育、儿童照护、机构运营、家园反馈。
- 信息密度要适合后台和工作台，不要过度卡通，不要营销化大 hero。
- 可以提升版式、颜色、层级、图表、表单、列表、弹窗、移动端导航和响应式体验。
- 保留核心业务字段、角色差异和当前流程，不要删除重要字段。
- 不要生成无意义英文；中文文案要自然、准确、可读。
- 不要使用真实敏感信息；截图中的儿童、家长、电话等均按脱敏理解。

## 输出目标

请分批产出：

1. 设计系统总览图：颜色、字体、卡片、按钮、表格、表单、标签、状态、图表、导航。
2. 登录页重设计：普通账号登录、示例账号入口、注册入口、desktop/tablet/mobile。
3. 园长端首页/数据看板：全园总览、风险看板、管理入口、AI 决策、周报。
4. 教师端工作台：班级概览、晨检、饮食、成长记录、健康材料解析、高风险会诊。
5. 家长端首页：孩子状态、近 7 天趋势、AI 干预卡、反馈、成长绘本。
6. 典型列表页：幼儿档案、晨检记录、饮食记录、成长记录。
7. 典型表单页：新增/编辑/记录表单。
8. 典型详情页：儿童详情、反馈详情、会诊详情、AI 建议详情。
9. 弹窗、抽屉、空状态、错误态、确认框。
10. mobile/tablet 响应式版本。

## 禁止事项

- 不要改变业务流程。
- 不要删除角色、菜单、字段、记录状态、反馈状态、风险状态。
- 不要把后台做成宣传官网。
- 不要做过度幼稚或过度卡通的儿童风。
- 不要保留或生成真实姓名、手机号、证件号、详细住址等敏感信息。
`;
}

function buildUploadOrder(items) {
  const byBatch = groupBy(items, "uploadBatch");
  const lines = ["# 上传顺序", ""];
  for (const [key, meta] of Object.entries(batchMeta)) {
    const batchItems = byBatch[key] ?? [];
    lines.push(`## ${meta.title}`);
    lines.push(`- 对应 prompt：upload-batches/${key}.md`);
    lines.push(`- 希望产出：${meta.goal}`);
    lines.push("- 建议上传图片：");
    if (!batchItems.length) {
      lines.push("  - 本批暂无图片。");
    } else {
      for (const item of batchItems.sort(sortPackaged).slice(0, 80)) {
        lines.push(`  - ${item.packagedFile}（${item.pageTitle}，${item.viewport}/${item.mode}，优先级：${item.uploadPriority}）`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildDesignBrief() {
  return `# 设计 Brief

## 平台定位

智慧托育平台是面向普惠托育机构的多角色管理与协同系统，覆盖园长管理、教师日常记录、家长查看与反馈。它不是宣传站，而是高频使用的运营型 SaaS。

## 用户角色

- 园长：看全园数据、风险优先级、班级和儿童管理、教师协同、运营周报。
- 教师：看班级今日任务，完成晨检、饮食、成长记录，处理高风险会诊和家园沟通。
- 家长：看孩子状态、近 7 天趋势、今晚任务、AI 干预卡，提交反馈。

## 当前界面特点

- 已有完整的多角色信息结构和中文业务字段。
- 页面以卡片、列表、图表、表单、AI 建议区为主。
- 部分页面信息密度高，视觉层级和响应式一致性仍有提升空间。

## 重设计重点

- 建立统一设计系统：颜色、字体、间距、卡片、表格、表单、标签、状态、图表。
- 提升园长端的管理效率和风险优先级表达。
- 提升教师端记录效率，减少表单压迫感，突出今日任务。
- 提升家长端可读性，让低数字熟练度用户也能快速理解。
- 加强 mobile/tablet 响应式和触控操作。

## 保留的信息结构

保留三类角色、导航结构、核心业务字段、记录状态、AI 建议、风险等级、反馈闭环、周报/趋势/会诊等模块。

## 不要改变的业务流程

不要改变登录示例账号入口、晨检/饮食/成长记录、儿童档案管理、AI 助手、会诊、家长反馈和成长绘本的核心流程。

## 视觉建议

使用可信的浅色 SaaS 基调，辅以温和的儿童照护色彩。图标和插画可轻量使用，但不能压过业务信息。卡片、表格、表单和图表要清晰、克制、可扫描。

## 风格禁忌

不要过度卡通，不要满屏渐变，不要营销页 hero，不要英文占位，不要低对比度，不要删除字段，不要生成真实敏感信息。
`;
}

function buildUploadInventory(items) {
  const lines = ["# GPT Image 2 上传截图清单", ""];
  for (const role of ["login", "director", "teacher-li", "teacher-zhou", "parent"]) {
    const roleItems = items.filter((item) => item.role === role);
    lines.push(`## ${role}`);
    if (!roleItems.length) {
      lines.push("- 暂无截图。", "");
      continue;
    }
    for (const item of roleItems.sort(sortPackaged)) {
      lines.push(`- 页面名称：${item.pageTitle}`);
      lines.push(`  角色：${item.role} / ${item.demoAccount}`);
      lines.push(`  路由：${item.sourceRoute}`);
      lines.push(`  截图文件：${item.packagedFile}`);
      lines.push(`  是否推荐上传：${item.recommendedForGPTImage2 ? "是" : "否"}`);
      lines.push(`  重设计重点：${item.redesignFocus}`);
      lines.push(`  敏感信息风险：${item.sensitiveDataMasked ? "低，已做 DOM 脱敏" : "需人工复核"}`);
      lines.push(`  备注：${item.notes}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildCoverageSummary(docs) {
  return [
    "# 角色与路由覆盖摘要",
    "",
    "## 角色覆盖",
    "",
    extractSection(docs.roleCoverage) || "详见原始 role-coverage.md。",
    "",
    "## 路由覆盖",
    "",
    extractSection(docs.routeCoverage) || "详见原始 route-coverage.md。",
    "",
    "## 优先发给 GPT Image 2 的截图",
    "",
    "- 登录页 desktop 默认、输入、注册弹窗、mobile。",
    "- 园长端 /admin、/、/admin/agent、/admin/agent?action=weekly-report、/children、/health、/diet。",
    "- 教师端 /teacher、/teacher/agent、/teacher/high-risk-consultation、/health、/diet、/growth。",
    "- 家长端 /parent、/parent/agent?child=c-1、/parent/agent?child=c-1#feedback、/parent/storybook?child=c-1。",
    "- 所有 mobile/tablet 截图用于响应式重设计。",
    "",
  ].join("\n");
}

async function writeBatchPrompts(items) {
  const byBatch = groupBy(items, "uploadBatch");
  for (const [key, meta] of Object.entries(batchMeta)) {
    const batchItems = (byBatch[key] ?? []).sort(sortPackaged);
    const content = `# ${meta.title}

## 本批上传图片列表

${batchItems.length ? batchItems.map((item) => `- ${item.packagedFile}（${item.pageTitle}，${item.role}，${item.viewport}/${item.mode}）`).join("\n") : "- 本批暂无图片。"}

## 本批对应角色

${meta.role}

## 本批设计目标

${meta.goal}

## 必须保留的信息

- 当前页面的角色定位、业务字段、数据状态、导航结构和主要操作。
- 中文字段和中文状态表达，不要用无意义英文替换。
- 风险、反馈、记录、周报、趋势、会诊等业务语义。

## 可以优化的地方

- 版式层级、卡片密度、表格可读性、表单分组、状态标签、图表表达。
- mobile/tablet 下的导航、触控按钮、折叠策略和首屏重点。
- 登录页和三端首页的信息组织与视觉可信度。

## 禁止改变的地方

- 不要删除核心业务字段。
- 不要改变业务流程。
- 不要把后台做成官网宣传页。
- 不要过度卡通。
- 不要生成真实姓名、手机号、证件号、详细地址。

## 期望输出

请输出可直接用于前端重构参考的高保真界面设计图，并给出主要组件规范。中文文案自然、准确、可读。

## 脱敏要求

截图中的儿童姓名、家长姓名、手机号等按脱敏数据处理；新设计中只使用“儿童姓名”“家长姓名”“手机号已脱敏”等占位，不生成真实个人信息。
`;
    await fs.writeFile(path.join(batchesRoot, `${key}.md`), content, "utf8");
  }
}

async function createContactSheets(items) {
  const groups = {
    "login-contact-sheet.png": items.filter((item) => item.role === "login"),
    "director-contact-sheet.png": items.filter((item) => item.role === "director"),
    "teacher-li-contact-sheet.png": items.filter((item) => item.role === "teacher-li"),
    "teacher-zhou-contact-sheet.png": items.filter((item) => item.role === "teacher-zhou"),
    "parent-contact-sheet.png": items.filter((item) => item.role === "parent"),
    "mobile-contact-sheet.png": items.filter((item) => item.viewport === "mobile" || item.viewport === "tablet"),
  };

  let browser;
  try {
    browser = await chromium.launch();
    for (const [file, group] of Object.entries(groups)) {
      if (!group.length) continue;
      const htmlPath = path.join(contactSheetsRoot, `${file}.html`);
      await fs.writeFile(htmlPath, buildContactSheetHtml(group.slice(0, 80), file), "utf8");
      const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
      await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "load" });
      await page.screenshot({ path: path.join(contactSheetsRoot, file), fullPage: true });
      await page.close();
    }
  } catch (error) {
    await fs.writeFile(path.join(contactSheetsRoot, "CONTACT_SHEETS_FAILED.txt"), error instanceof Error ? error.stack ?? error.message : String(error), "utf8");
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function buildContactSheetHtml(items, title) {
  const cards = items
    .map((item) => {
      const abs = path.join(packageRoot, item.packagedFile);
      return `<figure>
        <img src="${pathToFileURL(abs)}" />
        <figcaption>
          <strong>${escapeHtml(path.basename(item.packagedFile))}</strong>
          <span>${escapeHtml(item.role)} / ${escapeHtml(item.pageTitle)}</span>
          <span>${escapeHtml(item.sourceRoute)}</span>
          <span>${escapeHtml(item.viewport)} / ${escapeHtml(item.mode)} / ${escapeHtml(item.stateName)}</span>
        </figcaption>
      </figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; padding: 28px; font-family: Arial, "Microsoft YaHei", sans-serif; color: #172033; background: #f5f7fb; }
h1 { font-size: 24px; margin: 0 0 20px; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
figure { margin: 0; padding: 12px; background: #fff; border: 1px solid #dde3ee; border-radius: 10px; box-shadow: 0 6px 18px rgba(15, 23, 42, .06); }
img { width: 100%; height: 180px; object-fit: contain; background: #eef2f7; border-radius: 6px; border: 1px solid #edf1f7; }
figcaption { margin-top: 10px; display: grid; gap: 4px; font-size: 11px; line-height: 1.35; color: #475569; overflow-wrap: anywhere; }
figcaption strong { color: #0f172a; font-size: 12px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="grid">${cards}</div>
</body>
</html>`;
}

async function createZip() {
  const zipPath = path.join(zipRoot, "smartchildcare-gpt-image2-input.zip");
  const command = `
$root = ${psString(packageRoot)}
$zip = ${psString(zipPath)}
$items = Get-ChildItem -LiteralPath $root | Where-Object { $_.Name -ne 'zip' } | Select-Object -ExpandProperty FullName
Compress-Archive -LiteralPath $items -DestinationPath $zip -Force
`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Compress-Archive failed: ${result.stderr || result.stdout}`);
  }
}

async function validatePackage(items) {
  const errors = [];
  for (const file of [
    "README.md",
    "00-master-prompt-for-gpt-image-2.md",
    "01-upload-order.md",
    "02-design-brief.md",
    "03-screenshot-inventory-for-upload.md",
    "04-role-and-route-coverage.md",
    "manifest.gpt-image2.json",
  ]) {
    if (!fssync.existsSync(path.join(packageRoot, file))) errors.push(`missing ${file}`);
  }
  for (const item of items) {
    if (!fssync.existsSync(path.join(packageRoot, item.packagedFile))) errors.push(`missing screenshot ${item.packagedFile}`);
  }
  for (const key of Object.keys(batchMeta)) {
    if (!fssync.existsSync(path.join(batchesRoot, `${key}.md`))) errors.push(`missing batch ${key}.md`);
  }
  const zipPath = path.join(zipRoot, "smartchildcare-gpt-image2-input.zip");
  if (!fssync.existsSync(zipPath)) errors.push("missing zip");
  await fs.writeFile(
    path.join(packageRoot, "package-validation-summary.json"),
    `${JSON.stringify({ ok: errors.length === 0, errors, packagedScreenshots: items.length, validatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  if (errors.length) throw new Error(errors.join("\n"));
}

function extractSection(text) {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("# "))
    .slice(0, 140)
    .join("\n")
    .trim();
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] ??= [];
    acc[value].push(item);
    return acc;
  }, {});
}

function sortPackaged(a, b) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return (
    (priorityOrder[a.uploadPriority] ?? 9) - (priorityOrder[b.uploadPriority] ?? 9) ||
    a.role.localeCompare(b.role) ||
    a.packagedFile.localeCompare(b.packagedFile)
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function psString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
