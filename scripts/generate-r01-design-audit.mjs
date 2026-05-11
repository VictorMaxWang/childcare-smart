import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const DOC_ROOT = path.join(REPO_ROOT, "docs", "frontend-replica");
const PAGE_SPECS_ROOT = path.join(DOC_ROOT, "PAGE_SPECS");
const RESULTS_ROOT = path.join(DOC_ROOT, "results");
const DESIGN_ROOT =
  process.env.FRONTEND_REPLICA_DESIGN_ROOT ||
  path.resolve(REPO_ROOT, "..", "前端重构");

const INVENTORY_PATH = path.join(DOC_ROOT, "DESIGN_INVENTORY.md");
const ROUTE_MAP_PATH = path.join(DOC_ROOT, "DESIGN_ROUTE_MAP.md");
const VIVO_REFERENCE = "https://aigc.vivo.com.cn/#/document/index?id=1746";

const KNOWN_PATH_FIXES = new Map([
  [
    "teacher_workspace_dashboard_for_daycare绠＄悊.png",
    "teacher_workspace_dashboard_for_daycare管理.png",
  ],
  [
    "鏅烘収鎵樿偛骞冲彴杩愯惀鎶ヨ〃鍒嗘瀽鐣岄潰.png",
    "智慧托育平台运营报表分析界面.png",
  ],
]);

const CANONICAL_ROUTES = new Set([
  "/login",
  "/admin",
  "/admin/agent",
  "/admin/teachers",
  "/teacher",
  "/teacher/agent",
  "/teacher/health-file-bridge",
  "/teacher/high-risk-consultation",
  "/parent",
  "/parent/agent",
  "/parent/storybook",
  "/parent/reminders",
  "/children",
  "/health",
  "/growth",
  "/diet",
]);

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  await fs.mkdir(PAGE_SPECS_ROOT, { recursive: true });
  await fs.mkdir(RESULTS_ROOT, { recursive: true });

  const pngIndex = await buildPngIndex(DESIGN_ROOT);
  const inventory = parseInventory(await fs.readFile(INVENTORY_PATH, "utf8"));
  const routeMap = parseRouteMap(await fs.readFile(ROUTE_MAP_PATH, "utf8"));
  const existingRoutes = await discoverExistingRoutes();

  await removeStaleSpecs();

  const specs = [];
  for (const row of inventory) {
    const mapped = routeMap.get(row.designId);
    const source = resolveSource(row, pngIndex);
    const imageMeta = await readImageMeta(source.absolutePath);
    const normalizedRole = normalizeRole(row.role, mapped?.targetRoute || row.inferredRoute, row.fileName, row.pageModules);
    const routeInfo = parseRoute(mapped?.targetRoute || row.inferredRoute);
    const pageType = buildPageTypes({
      role: normalizedRole,
      viewport: row.viewport,
      hasModalState: row.hasModalState,
      pageModules: row.pageModules,
    });
    const ownerTask = mapped?.nextTask || inferOwnerTask(mapped?.targetRoute || row.inferredRoute, normalizedRole, row.pageModules);

    const spec = {
      ...row,
      ...source,
      imageMeta,
      routeMap: mapped,
      normalizedRole,
      targetRoute: mapped?.targetRoute || row.inferredRoute,
      currentProjectRoute: mapped?.currentProjectRoute || mapped?.targetRoute || row.inferredRoute,
      currentRouteExists: routeExists(mapped?.currentProjectRoute || mapped?.targetRoute || row.inferredRoute, existingRoutes),
      queryState: routeInfo.queryState,
      hashState: routeInfo.hashState,
      routePath: routeInfo.pathname,
      pageType,
      ownerTask,
      visualStructure: inferVisualStructure(row, normalizedRole, routeInfo),
      visualTokens: inferVisualTokens(row, imageMeta),
      functionalGoals: inferFunctionalGoals(row, normalizedRole, routeInfo),
      chartSpec: row.hasCharts ? inferChartSpec(row, normalizedRole, routeInfo, imageMeta) : null,
      assistantSpec: row.hasAiAssistant ? inferAssistantSpec(row, normalizedRole, routeInfo) : null,
      gapSpec: inferGapSpec(row, mapped, normalizedRole, routeInfo),
    };
    specs.push(spec);
    await fs.writeFile(path.join(PAGE_SPECS_ROOT, `${row.designId}.md`), buildPageSpecMarkdown(spec), "utf8");
  }

  const summary = buildSummary(specs);
  await fs.writeFile(path.join(DOC_ROOT, "R01_DESIGN_AUDIT_REPORT.md"), buildDesignAuditReport(specs, summary), "utf8");
  await fs.writeFile(path.join(DOC_ROOT, "R01_CHART_AUDIT.md"), buildChartAudit(specs, summary), "utf8");
  await fs.writeFile(path.join(DOC_ROOT, "R01_AI_ASSISTANT_AUDIT.md"), buildAiAudit(specs, summary), "utf8");

  const result = buildResultJson(summary);
  await fs.writeFile(path.join(RESULTS_ROOT, "R01-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(RESULTS_ROOT, "R01-result.md"), buildResultMarkdown(result, summary), "utf8");

  const validation = await validateOutputs(specs);
  console.log(JSON.stringify(validation, null, 2));
}

function parseInventory(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("| SCFR-"))
    .map((line) => {
      const cols = splitMarkdownRow(line);
      return {
        designId: cols[0],
        imagePath: cols[1],
        fileName: cols[2],
        role: cols[3],
        inferredRoute: cols[4],
        viewport: cols[5],
        pageModules: splitList(cols[6]),
        hasCharts: asBool(cols[7]),
        hasAiAssistant: asBool(cols[8]),
        hasModalState: asBool(cols[9]),
        priority: cols[10],
        notes: cols[11],
      };
    });
}

function parseRouteMap(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/).filter((item) => item.startsWith("| SCFR-"))) {
    const cols = splitMarkdownRow(line);
    map.set(cols[0], {
      designId: cols[0],
      targetRoute: cols[1],
      currentProjectRoute: cols[2],
      hasPage: cols[3],
      missingPage: cols[4],
      functionMissing: cols[5],
      largeUiDiff: cols[6],
      nextTask: cols[7],
    });
  }
  return map;
}

function splitMarkdownRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asBool(value) {
  return String(value || "").trim().toLowerCase() === "yes";
}

async function buildPngIndex(root) {
  const entries = new Map();
  async function walk(dir) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const absolutePath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(absolutePath);
      } else if (item.isFile() && item.name.toLowerCase().endsWith(".png")) {
        entries.set(item.name, absolutePath);
      }
    }
  }
  await walk(root);
  return entries;
}

function resolveSource(row, pngIndex) {
  const relativePath = row.imagePath.split("/").join(path.sep);
  const directPath = path.join(DESIGN_ROOT, relativePath);
  if (fssync.existsSync(directPath)) {
    return {
      sourcePath: row.imagePath,
      actualSourcePath: row.imagePath,
      absolutePath: directPath,
      sourcePathStatus: "ok",
      sourcePathNote: "Inventory path exists on disk.",
    };
  }

  const fixedFileName = KNOWN_PATH_FIXES.get(row.fileName) || KNOWN_PATH_FIXES.get(path.basename(row.imagePath));
  if (fixedFileName && pngIndex.has(fixedFileName)) {
    const absolutePath = pngIndex.get(fixedFileName);
    return {
      sourcePath: row.imagePath,
      actualSourcePath: toPosix(path.relative(DESIGN_ROOT, absolutePath)),
      absolutePath,
      sourcePathStatus: "corrected",
      sourcePathNote: `Inventory filename corrected from ${row.fileName} to ${fixedFileName}.`,
    };
  }

  if (pngIndex.has(row.fileName)) {
    const absolutePath = pngIndex.get(row.fileName);
    return {
      sourcePath: row.imagePath,
      actualSourcePath: toPosix(path.relative(DESIGN_ROOT, absolutePath)),
      absolutePath,
      sourcePathStatus: "corrected-by-basename",
      sourcePathNote: "Inventory relative path did not exist; resolved by filename index.",
    };
  }

  return {
    sourcePath: row.imagePath,
    actualSourcePath: row.imagePath,
    absolutePath: directPath,
    sourcePathStatus: "missing",
    sourcePathNote: "Source image was not found on disk during R01 generation.",
  };
}

async function readImageMeta(absolutePath) {
  if (!fssync.existsSync(absolutePath)) {
    return {
      width: null,
      height: null,
      sizeLabel: "unknown",
      dominantColors: [],
      backgroundColor: null,
      accentColor: null,
    };
  }

  const metadata = await sharp(absolutePath).metadata();
  const sample = await sharp(absolutePath)
    .resize(36, 36, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = quantizedColors(sample.data, sample.info.channels).slice(0, 8);
  const backgroundColor = colors.find((color) => isLight(color.hex))?.hex || colors[0]?.hex || null;
  const accentColor =
    colors.find((color) => color.saturation > 0.25 && color.lightness > 0.18 && color.lightness < 0.82)?.hex ||
    "#655BFF";

  return {
    width: metadata.width || null,
    height: metadata.height || null,
    sizeLabel: metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : "unknown",
    dominantColors: colors,
    backgroundColor,
    accentColor,
  };
}

function quantizedColors(buffer, channels) {
  const counts = new Map();
  for (let index = 0; index < buffer.length; index += channels) {
    const alpha = channels >= 4 ? buffer[index + 3] : 255;
    if (alpha < 48) continue;
    const r = Math.round(buffer[index] / 16) * 16;
    const g = Math.round(buffer[index + 1] / 16) * 16;
    const b = Math.round(buffer[index + 2] / 16) * 16;
    const hex = rgbToHex(r, g, b);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([hex, count]) => ({ hex, count, ...colorMetrics(hex) }))
    .sort((a, b) => b.count - a.count);
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function colorMetrics(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { lightness: Number(lightness.toFixed(3)), saturation: Number(saturation.toFixed(3)) };
}

function isLight(hex) {
  return colorMetrics(hex).lightness > 0.84;
}

async function discoverExistingRoutes() {
  const routes = new Set();
  const appRoot = path.join(REPO_ROOT, "app");
  async function walk(dir) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const absolutePath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(absolutePath);
      } else if (item.isFile() && item.name === "page.tsx") {
        const relativeDir = path.relative(appRoot, path.dirname(absolutePath));
        const route = relativeDir === "" ? "/" : `/${toPosix(relativeDir)}`;
        routes.add(route);
      }
    }
  }
  await walk(appRoot);
  return routes;
}

function routeExists(route, existingRoutes) {
  const parsed = parseRoute(route);
  if (existingRoutes.has(parsed.pathname)) return "yes";
  if (parsed.pathname === "/login" && existingRoutes.has("/auth/login")) return "yes";
  if (CANONICAL_ROUTES.has(parsed.pathname)) return "expected-but-not-found";
  return "unknown";
}

function parseRoute(route) {
  const raw = String(route || "");
  const hashIndex = raw.indexOf("#");
  const hashState = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
  const noHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = noHash.indexOf("?");
  const pathname = queryIndex >= 0 ? noHash.slice(0, queryIndex) : noHash;
  const query = queryIndex >= 0 ? noHash.slice(queryIndex + 1) : "";
  return {
    pathname: pathname || "/",
    queryState: query || "",
    hashState,
  };
}

function normalizeRole(role, route, fileName, modules) {
  if (role !== "mobile") return role;
  const target = `${route} ${fileName} ${modules.join(" ")}`.toLowerCase();
  if (target.includes("/teacher") || target.includes("teacher")) return "teacher";
  if (target.includes("/parent") || target.includes("parent") || target.includes("parenting") || target.includes("feedback")) return "parent";
  if (target.includes("/login") || target.includes("login") || target.includes("register")) return "login";
  if (target.includes("/admin") || target.includes("management") || target.includes("weekly")) return "director";
  return "shared";
}

function buildPageTypes({ role, viewport, hasModalState, pageModules }) {
  const types = [role];
  if (viewport.includes("mobile")) types.push("mobile");
  if (viewport.includes("tablet")) types.push("tablet");
  if (pageModules.some((module) => module.toLowerCase().includes("auth"))) types.push("login");
  if (hasModalState) types.push("state");
  if (pageModules.some((module) => module.toLowerCase().includes("modal"))) types.push("modal");
  return Array.from(new Set(types));
}

function inferOwnerTask(route, role, modules) {
  const parsed = parseRoute(route);
  if (parsed.pathname === "/login") return "R10";
  if (parsed.pathname.startsWith("/admin")) return "R20";
  if (parsed.pathname.startsWith("/teacher")) return "R30";
  if (parsed.pathname.startsWith("/parent")) return "R40";
  if (["/children", "/health", "/growth", "/diet"].includes(parsed.pathname)) return "R50";
  if (modules.some((item) => item.includes("charts") || item.includes("report"))) return "R05";
  if (role === "teacher") return "R30";
  if (role === "parent") return "R40";
  if (role === "director") return "R20";
  return "R50";
}

function inferVisualStructure(row, role, routeInfo) {
  const viewport = row.viewport.includes("mobile") ? "mobile" : row.viewport.includes("tablet") ? "tablet" : "desktop";
  const modules = new Set(row.pageModules.map((item) => item.toLowerCase()));
  return {
    background: role === "login" ? "Soft pastel gradient or split auth background; avoid using the design image as a page background." : "Very light blue-gray app background with white translucent surfaces.",
    topbar: role === "login" ? "Minimal brand/header area; login form remains primary." : "Role-aware topbar with title, quick actions, identity, and state badges.",
    sidebar: viewport === "desktop" && role !== "login" ? "Left navigation rail/sidebar is expected for admin/shared desktop shells." : "Collapsed, hidden, or replaced by top/bottom navigation at this viewport.",
    bottomNav: viewport === "mobile" && role !== "login" ? "Mobile bottom navigation or compact action rail; must not overlap cards or assistant input." : "Not primary for this viewport.",
    mainContent: describeMainContent(row, role, routeInfo),
    cards: "Rounded white cards with subtle blue-purple shadow; preserve card density and hierarchy from the reference image.",
    charts: row.hasCharts ? "Dedicated chart cards with axis/legend/tooltip states; bind real demo/API/selector data." : "No primary chart target in this reference.",
    aiAssistant: row.hasAiAssistant ? "Assistant entry or full panel must be visible, with prompt suggestions, input, send/voice affordances, and vivo provider status/failure state." : "No primary assistant target in this reference.",
    form: modules.has("auth/login") || role === "login" ? "Login/register/demo account controls are required." : "Only route-specific filters, search, feedback, record, or export forms as shown.",
    modalDrawer: row.hasModalState ? "Modal/drawer/state overlay must be represented as an independent acceptance state." : "No modal/drawer target in this image.",
  };
}

function describeMainContent(row, role, routeInfo) {
  const route = routeInfo.pathname;
  const modules = row.pageModules.join(", ");
  if (role === "login") return "Auth form and demo account selection with optional marketing feature panel.";
  if (route.startsWith("/admin/agent") && routeInfo.queryState.includes("weekly-report")) return "Weekly operation report workspace with KPI summary, charts, report history, export/share controls.";
  if (route.startsWith("/admin/agent")) return "Director AI command workspace with priority list, assistant panel, insight cards, and operation summaries.";
  if (route === "/admin") return "Director dashboard with institution KPIs, risk priorities, attendance/health/feedback summaries, and AI entry.";
  if (route.startsWith("/teacher/agent") && routeInfo.queryState.includes("communication")) return "Teacher communication workflow with message drafts, child context, parent feedback, and AI suggestions.";
  if (route.startsWith("/teacher/agent")) return "Teacher AI workspace with class summary, child focus cards, prompt suggestions, and task handoff.";
  if (route === "/teacher") return "Teacher workbench with class overview, morning-check tasks, records, communication queue, and AI entry.";
  if (route.startsWith("/parent/agent") && routeInfo.hashState === "feedback") return "Parent feedback state with intervention card, submission form, history, and teacher-visible context.";
  if (route.startsWith("/parent/agent")) return "Parent AI assistant with child trend summary, tonight action, recommended prompts, and feedback loop.";
  if (route === "/parent") return "Parent home with child status, today records, trends, reminders, storybook entry, and AI intervention preview.";
  if (route === "/children") return "Child records/profile management with cards, table/list, archive or profile actions.";
  if (route === "/health") return "Health/morning-check dashboard with abnormal status, trend charts, materials, and consultation entry.";
  if (route === "/growth") return "Growth and behavior timeline/dashboard with category trends, review states, and storybook links.";
  if (route === "/diet") return "Diet/meal records dashboard with meal timeline, nutrition trends, AI scoring or evaluation entry.";
  return `Route-specific content for modules: ${modules || "dashboard"}.`;
}

function inferVisualTokens(row, imageMeta) {
  const viewport = row.viewport.includes("mobile") ? "mobile" : row.viewport.includes("tablet") ? "tablet" : "desktop";
  const palette = imageMeta.dominantColors.map((item) => item.hex).slice(0, 6);
  return {
    primary: imageMeta.accentColor || "#655BFF",
    secondary: "#21C6C1 / #38BDF8 for informational accents when present.",
    background: imageMeta.backgroundColor || "#F6F8FC",
    palette,
    gradient: "Soft blue/purple/cyan gradients only where visible in reference hero, assistant, or chart emphasis.",
    shadow: "Soft blue-purple card shadow, low opacity; avoid heavy dark shadow.",
    radius: viewport === "mobile" ? "Cards 18-28px; controls 12-16px; pills full radius." : "Cards 16-24px; controls 10-16px; pills full radius.",
    typography: "Chinese system font; compact dashboard text; bold section titles; no viewport-width font scaling.",
    spacing: viewport === "desktop" ? "Desktop grid gutters 20-32px; card padding 18-28px." : "Mobile/tablet vertical stack gutters 14-24px; card padding 16-22px.",
    iconStyle: "Lucide-like line icons or soft duotone icons; consistent stroke weight; no decorative-only replacement for real controls.",
    tagStyle: "Small rounded pills with semantic color fills/borders for risk, status, AI, and role labels.",
  };
}

function inferFunctionalGoals(row, role, routeInfo) {
  const route = routeInfo.pathname;
  const buttons = [];
  const data = [];
  const interactions = [];

  if (role === "login") {
    data.push("demo account cards", "login/register form fields", "role entry descriptions");
    buttons.push("login", "register", "demo account selection");
    interactions.push("submit credentials", "switch auth mode", "enter role home after successful demo login");
  }
  if (route.startsWith("/admin")) {
    data.push("institution KPIs", "risk priorities", "attendance/health/feedback summaries");
    buttons.push("open AI assistant", "view weekly report", "dispatch or follow up actions");
  }
  if (route.startsWith("/teacher")) {
    data.push("class children", "morning checks", "growth records", "parent communication queue");
    buttons.push("add record", "open AI suggestion", "send or save communication draft");
  }
  if (route.startsWith("/parent")) {
    data.push("selected child status", "7-day trend", "tonight action", "feedback history");
    buttons.push("ask AI", "submit feedback", "open storybook/reminders");
  }
  if (route === "/children") {
    data.push("child profiles", "record summaries", "archive/delete state");
    buttons.push("create/edit child", "archive/restore", "open profile details");
  }
  if (route === "/health") {
    data.push("temperature/mood trend", "abnormal records", "health materials");
    buttons.push("parse material", "open consultation", "filter by child/class/date");
  }
  if (route === "/growth") {
    data.push("growth timeline", "category trend", "review status");
    buttons.push("add observation", "mark review", "open storybook");
  }
  if (route === "/diet") {
    data.push("meal records", "nutrition trend", "hydration/vegetable/protein indicators");
    buttons.push("add meal record", "run AI diet evaluation", "filter date/child/class");
  }
  if (row.hasCharts) interactions.push("chart hover tooltip", "legend scan", "loading/empty/error state handling");
  if (row.hasAiAssistant) interactions.push("prompt suggestion click", "message input", "send", "streaming response", "voice entry when available");
  if (row.hasModalState) interactions.push("open/close modal or drawer", "confirm/cancel state", "keyboard/overlay dismissal");

  return {
    displayedData: Array.from(new Set(data)),
    clickableControls: Array.from(new Set(buttons)),
    requiredInteractions: Array.from(new Set(interactions)),
  };
}

function inferChartSpec(row, role, routeInfo, imageMeta) {
  const route = routeInfo.pathname;
  const lowerName = row.fileName.toLowerCase();
  const types = [];
  if (lowerName.includes("weekly") || routeInfo.queryState.includes("weekly-report")) types.push("KPI cards", "line chart", "bar chart", "donut/pie chart", "ranking table");
  else if (route === "/health") types.push("line chart", "donut/pie chart", "KPI cards");
  else if (route === "/growth" || lowerName.includes("growth")) types.push("line chart", "bar chart", "timeline/chart hybrid");
  else if (route === "/diet" || lowerName.includes("meal") || lowerName.includes("nutrition")) types.push("bar chart", "line chart", "nutrition score/KPI");
  else if (route.startsWith("/parent")) types.push("7-day trend line", "status KPI cards");
  else if (route.startsWith("/teacher")) types.push("class KPI cards", "bar/list summary");
  else types.push("KPI cards", "trend chart", "distribution chart");

  const metrics = inferChartMetrics(row, role, routeInfo);
  return {
    chartTypes: Array.from(new Set(types)),
    title: inferChartTitle(row, routeInfo),
    metrics,
    colors: [imageMeta.accentColor || "#655BFF", "#21C6C1", "#F59E0B", "#EF4444", "#10B981"],
    axes: "Use compact labels, light grid lines, and avoid clipped axis text across desktop/mobile/tablet.",
    legend: "Show only when multiple series/distributions are present; match design pill/dot style.",
    tooltip: "Hover/tap tooltip must show metric label, value, time/category, and semantic status where useful.",
    emptyState: "Show route-specific empty copy and preserve chart card height.",
    loadingState: "Use skeleton or muted loading state; do not flash fake final values.",
    dataSource: inferDataSource(routeInfo),
    currentApiOrSelector: inferApiSelector(routeInfo),
  };
}

function inferChartMetrics(row, role, routeInfo) {
  const route = routeInfo.pathname;
  if (route.startsWith("/admin/agent") && routeInfo.queryState.includes("weekly-report")) return ["attendance rate", "health anomalies", "growth review count", "feedback completion", "class comparison"];
  if (route.startsWith("/admin")) return ["children count", "attendance", "risk children", "feedback count", "pending actions"];
  if (route.startsWith("/teacher")) return ["visible children", "morning-check completion", "pending reviews", "parent messages", "class activity"];
  if (route.startsWith("/parent")) return ["diet", "health", "growth", "hydration", "feedback completion"];
  if (route === "/health") return ["temperature", "mood", "hand/mouth/eye abnormal", "health material status"];
  if (route === "/growth") return ["category count", "attention records", "review status", "timeline activity"];
  if (route === "/diet") return ["meal count", "balanced rate", "hydration", "vegetable days", "protein days"];
  if (route === "/children") return ["child profile count", "record count", "risk/status distribution"];
  return row.pageModules;
}

function inferChartTitle(row, routeInfo) {
  if (routeInfo.queryState.includes("weekly-report")) return "Weekly operation report / 运营报表";
  if (routeInfo.pathname === "/health") return "Health and morning-check trends / 健康晨检趋势";
  if (routeInfo.pathname === "/growth") return "Growth and behavior trends / 成长行为趋势";
  if (routeInfo.pathname === "/diet") return "Diet and nutrition trends / 饮食营养趋势";
  if (routeInfo.pathname.startsWith("/parent")) return "Child 7-day trend / 孩子近 7 天趋势";
  if (routeInfo.pathname.startsWith("/teacher")) return "Class workbench summary / 班级工作台概览";
  if (routeInfo.pathname.startsWith("/admin")) return "Director dashboard metrics / 园长运营指标";
  return "Dashboard metrics";
}

function inferDataSource(routeInfo) {
  const route = routeInfo.pathname;
  if (route.startsWith("/admin/agent") && routeInfo.queryState.includes("weekly-report")) return "Weekly report API plus admin snapshot payload.";
  if (route.startsWith("/admin")) return "Admin analytics API and role-home view model from demo/app state.";
  if (route.startsWith("/teacher")) return "Teacher workbench API/selectors scoped by class and teacher session.";
  if (route.startsWith("/parent")) return "Parent home/trend API scoped by child and parent session.";
  if (route === "/health" || route === "/growth" || route === "/diet" || route === "/children") return "Shared app store/demo selectors and route-specific API handlers.";
  return "Existing demo data selectors or API aggregate.";
}

function inferApiSelector(routeInfo) {
  const route = routeInfo.pathname;
  if (route.startsWith("/admin/agent") && routeInfo.queryState.includes("weekly-report")) return "app/api/ai/weekly-report/route.ts, app/api/weekly-reports/*, lib/agent/weekly-report-client.ts";
  if (route.startsWith("/admin")) return "app/api/analytics/admin/summary/route.ts, lib/api/analytics.ts, lib/view-models/role-home.ts";
  if (route.startsWith("/teacher")) return "app/api/analytics/teacher-workbench/route.ts, lib/demo-data/selectors.ts, lib/agent/teacher-agent.ts";
  if (route.startsWith("/parent")) return "app/api/analytics/parent-home/route.ts, app/api/children/[childId]/trend/route.ts, components/parent/useParentD01Data.ts";
  if (route === "/health") return "app/health/page.tsx, app/api/health-materials/*, lib/store.tsx";
  if (route === "/growth") return "app/growth/page.tsx, app/api/storybooks/*, lib/store.tsx";
  if (route === "/diet") return "app/diet/page.tsx, app/api/ai/diet-evaluation/route.ts, lib/store.tsx";
  if (route === "/children") return "app/children/page.tsx, app/api/children/*, app/api/records/*";
  return "Route page plus lib/store.tsx selectors.";
}

function inferAssistantSpec(row, role, routeInfo) {
  return {
    entryPosition: inferAssistantEntry(routeInfo, row.viewport),
    panelLayout: inferAssistantPanel(routeInfo),
    recommendedPrompts: inferPrompts(role),
    input: "Text input must be visible when assistant panel is active; disabled/unavailable state must be explicit.",
    sendButton: "Primary icon/text send control with loading/streaming state.",
    streamingOutput: "Use incremental response UI or explicit loading state; no fake success copy when vivo is unavailable.",
    suggestionCards: "Role-specific prompt/action cards; cards must be clickable and scoped.",
    voiceEntry: "Show voice entry where the role surface supports VoiceOrb/ASR; do not expose credentials client-side.",
    roleDifferences: inferRoleAiDifference(role),
    vivoProviderRequirement: `All AI capability must call server-side vivo provider or show explicit unavailable/degraded state. Reference: ${VIVO_REFERENCE}`,
    currentProjectGap: "Existing Next/backend vivo provider inventory exists; R06 must verify every assistant action keeps server/client boundary, scope guard, fallback provenance, and error UI.",
  };
}

function inferAssistantEntry(routeInfo, viewport) {
  if (viewport.includes("mobile")) return "Top summary card, floating assistant entry, or bottom-safe input area depending on design image.";
  if (routeInfo.pathname.includes("/agent")) return "Main assistant workspace or right-side assistant panel.";
  return "Dashboard card/rail entry that deep-links into the role assistant route.";
}

function inferAssistantPanel(routeInfo) {
  if (routeInfo.queryState.includes("weekly-report")) return "Report-generation assistant plus KPI/chart report preview and export/share controls.";
  if (routeInfo.queryState.includes("communication") || routeInfo.hashState === "feedback") return "Conversation/feedback assistant with draft cards, child context, and confirmation controls.";
  return "Prompt suggestions, conversation stream, insight/action cards, input bar, provider status, and retry/error state.";
}

function inferPrompts(role) {
  if (role === "director") return ["生成本周运营周报", "查看今日高风险儿童", "给班级老师派发跟进动作"];
  if (role === "teacher") return ["生成家园沟通建议", "汇总班级今日重点", "识别需要复查的儿童"];
  if (role === "parent") return ["今晚我该怎么做", "解释近 7 天趋势", "提交完成后的反馈"];
  return ["总结当前页面", "解释风险指标", "生成下一步建议"];
}

function inferRoleAiDifference(role) {
  if (role === "director") return "Focus on institution operations, risk priority, weekly reports, dispatch, and cross-class decisions.";
  if (role === "teacher") return "Focus on class operations, child-specific guidance, draft communication, task execution, and voice understanding.";
  if (role === "parent") return "Focus on child status explanation, tonight action, parent feedback loop, and teacher-visible context.";
  return "Shared AI surfaces must inherit role/session scope from the current route.";
}

function inferGapSpec(row, mapped, role, routeInfo) {
  const implemented = [];
  const partial = [];
  const missing = [];
  const uiMismatch = [];
  const functionalMismatch = [];

  if (mapped?.hasPage === "yes" || mapped?.missingPage === "no") implemented.push("Canonical route exists in current project map.");
  else partial.push("Route existence requires follow-up verification.");

  if (String(mapped?.largeUiDiff || "").toLowerCase() === "yes" || row.priority === "P0") {
    uiMismatch.push("Large UI parity gap must be closed against this reference before visual acceptance.");
  } else if (String(mapped?.largeUiDiff || "").toLowerCase() === "likely") {
    uiMismatch.push("Likely UI parity gap; verify against screenshot in R90.");
  }

  if (row.role === "mobile") partial.push("Inventory role normalized from mobile viewport to business role; verify manually.");
  if (row.sourcePathStatus !== "ok") partial.push(row.sourcePathNote);
  if (routeInfo.queryState || routeInfo.hashState || row.hasModalState) partial.push("Independent query/hash/modal state needs direct capture and acceptance.");
  if (row.hasCharts) partial.push("Chart visual and data binding require R05 verification.");
  if (row.hasAiAssistant) partial.push("AI assistant requires R06 vivo provider/server-boundary verification.");
  if (routeInfo.pathname === "/admin/teachers" || routeInfo.pathname === "/parent/reminders") partial.push("Route is existing but underdocumented in R00/R01 source notes.");
  if (!row.hasCharts && !row.hasAiAssistant && !row.hasModalState && row.priority === "P2") implemented.push("Low-priority shared/mobile reference can follow after P0/P1 shells are stable.");

  if (row.hasCharts && !routeInfo.pathname) missing.push("Chart target lacks canonical route.");
  if (row.hasAiAssistant) functionalMismatch.push("No AI fake-success behavior is allowed; unavailable vivo must be explicit.");
  if (row.hasCharts) functionalMismatch.push("Static hardcoded chart values are not acceptable; bind demo/API/selector data.");

  return { implemented, partial, missing, uiMismatch, functionalMismatch };
}

function buildPageSpecMarkdown(spec) {
  const lines = [
    `# ${spec.designId}`,
    "",
    "## Source",
    `- Design file: \`${spec.sourcePath}\``,
    `- Actual file: \`${spec.actualSourcePath}\``,
    `- Source status: ${spec.sourcePathStatus} (${spec.sourcePathNote})`,
    `- File name: \`${spec.fileName}\``,
    `- Priority: ${spec.priority}`,
    `- Original role: ${spec.role}`,
    `- Normalized role: ${spec.normalizedRole}`,
    `- Page type: ${spec.pageType.join(", ")}`,
    `- Target route: \`${spec.targetRoute}\``,
    `- Current project route: \`${spec.currentProjectRoute}\``,
    `- Route exists: ${spec.currentRouteExists}`,
    `- Query state: ${spec.queryState ? `\`${spec.queryState}\`` : "none"}`,
    `- Hash state: ${spec.hashState ? `\`${spec.hashState}\`` : "none"}`,
    `- Viewport: ${spec.viewport}`,
    `- Image size: ${spec.imageMeta.sizeLabel}`,
    `- Owner task: ${spec.ownerTask}`,
    "",
    "## Visual Structure",
    `- Background: ${spec.visualStructure.background}`,
    `- Top bar: ${spec.visualStructure.topbar}`,
    `- Sidebar: ${spec.visualStructure.sidebar}`,
    `- Bottom nav: ${spec.visualStructure.bottomNav}`,
    `- Main content: ${spec.visualStructure.mainContent}`,
    `- Card layout: ${spec.visualStructure.cards}`,
    `- Chart area: ${spec.visualStructure.charts}`,
    `- AI assistant area: ${spec.visualStructure.aiAssistant}`,
    `- Forms: ${spec.visualStructure.form}`,
    `- Modal/drawer/state: ${spec.visualStructure.modalDrawer}`,
    "",
    "## Visual Tokens",
    `- Primary color: ${spec.visualTokens.primary}`,
    `- Secondary colors: ${spec.visualTokens.secondary}`,
    `- Background color: ${spec.visualTokens.background}`,
    `- Extracted palette: ${spec.visualTokens.palette.map((item) => `\`${item}\``).join(", ") || "not available"}`,
    `- Gradient: ${spec.visualTokens.gradient}`,
    `- Shadow: ${spec.visualTokens.shadow}`,
    `- Radius: ${spec.visualTokens.radius}`,
    `- Typography: ${spec.visualTokens.typography}`,
    `- Spacing: ${spec.visualTokens.spacing}`,
    `- Icon style: ${spec.visualTokens.iconStyle}`,
    `- Tag style: ${spec.visualTokens.tagStyle}`,
    "",
    "## Functional Goals",
    `- Data to show: ${listText(spec.functionalGoals.displayedData)}`,
    `- Clickable controls: ${listText(spec.functionalGoals.clickableControls)}`,
    `- Required interactions: ${listText(spec.functionalGoals.requiredInteractions)}`,
    "",
  ];

  if (spec.chartSpec) {
    lines.push(
      "## Chart Target",
      `- Chart types: ${spec.chartSpec.chartTypes.join(", ")}`,
      `- Title: ${spec.chartSpec.title}`,
      `- Metrics: ${spec.chartSpec.metrics.join(", ")}`,
      `- Colors: ${spec.chartSpec.colors.join(", ")}`,
      `- Axes: ${spec.chartSpec.axes}`,
      `- Legend: ${spec.chartSpec.legend}`,
      `- Tooltip: ${spec.chartSpec.tooltip}`,
      `- Empty state: ${spec.chartSpec.emptyState}`,
      `- Loading state: ${spec.chartSpec.loadingState}`,
      `- Data source: ${spec.chartSpec.dataSource}`,
      `- Current API/selector: ${spec.chartSpec.currentApiOrSelector}`,
      ""
    );
  }

  if (spec.assistantSpec) {
    lines.push(
      "## AI Assistant Target",
      `- Entry position: ${spec.assistantSpec.entryPosition}`,
      `- Panel layout: ${spec.assistantSpec.panelLayout}`,
      `- Recommended prompts: ${spec.assistantSpec.recommendedPrompts.join(" / ")}`,
      `- Input: ${spec.assistantSpec.input}`,
      `- Send button: ${spec.assistantSpec.sendButton}`,
      `- Streaming output: ${spec.assistantSpec.streamingOutput}`,
      `- Suggestion cards: ${spec.assistantSpec.suggestionCards}`,
      `- Voice entry: ${spec.assistantSpec.voiceEntry}`,
      `- Role differences: ${spec.assistantSpec.roleDifferences}`,
      `- vivo provider requirement: ${spec.assistantSpec.vivoProviderRequirement}`,
      `- Current project gap: ${spec.assistantSpec.currentProjectGap}`,
      ""
    );
  }

  lines.push(
    "## Current Project Gap",
    `- Implemented: ${listText(spec.gapSpec.implemented)}`,
    `- Partially implemented / needs audit: ${listText(spec.gapSpec.partial)}`,
    `- Not implemented: ${listText(spec.gapSpec.missing)}`,
    `- UI mismatch: ${listText(spec.gapSpec.uiMismatch)}`,
    `- Functional mismatch: ${listText(spec.gapSpec.functionalMismatch)}`,
    "",
    "## Acceptance Notes",
    "- This is an R01 documentation spec only; no UI source is changed here.",
    "- Later implementation must use real DOM/components and must not use the full design PNG as a page background.",
    "- Later visual QA must capture the exact route/query/hash/modal state named above.",
    ""
  );

  return `${lines.join("\n")}`;
}

function listText(values) {
  const compactValues = values.map((value) => String(value || "").trim()).filter(Boolean);
  return compactValues.length ? compactValues.join("; ") : "none";
}

function buildSummary(specs) {
  const byPriority = countBy(specs, (spec) => spec.priority);
  const byRole = countBy(specs, (spec) => spec.normalizedRole);
  const byOriginalRole = countBy(specs, (spec) => spec.role);
  const byViewport = countBy(specs, (spec) => spec.viewport);
  const byRoute = countBy(specs, (spec) => spec.routePath);
  const byOwnerTask = countBy(specs, (spec) => spec.ownerTask);
  const chartTargets = specs.filter((spec) => spec.hasCharts);
  const aiTargets = specs.filter((spec) => spec.hasAiAssistant);
  const modalTargets = specs.filter((spec) => spec.hasModalState);
  const correctedPaths = specs.filter((spec) => spec.sourcePathStatus !== "ok");
  const knownPathRisks = buildKnownPathRisks(specs);
  const p0Gaps = specs.filter((spec) => spec.priority === "P0" && spec.gapSpec.uiMismatch.length);
  const p1Gaps = specs.filter((spec) => spec.priority === "P1" && (spec.gapSpec.uiMismatch.length || spec.gapSpec.partial.length));

  return {
    total: specs.length,
    pageSpecsGenerated: specs.length,
    chartTargets: chartTargets.length,
    aiTargets: aiTargets.length,
    modalTargets: modalTargets.length,
    byPriority,
    byRole,
    byOriginalRole,
    byViewport,
    byRoute,
    byOwnerTask,
    correctedPaths,
    knownPathRisks,
    chartTargetsList: chartTargets,
    aiTargetsList: aiTargets,
    modalTargetsList: modalTargets,
    p0Gaps,
    p1Gaps,
  };
}

function buildKnownPathRisks(specs) {
  const teacherWorkspace = specs.find((spec) => spec.designId === "SCFR-244-teacher-dashboard-desktop");
  const weeklyChinese = specs.find((spec) => spec.designId === "SCFR-247-director-charts-reports-tablet-portrait");
  return [
    {
      risk: "teacher_workspace_dashboard_for_daycare绠＄悊.png should resolve to teacher_workspace_dashboard_for_daycare管理.png",
      designId: teacherWorkspace?.designId || "SCFR-244-teacher-dashboard-desktop",
      verifiedActualPath: teacherWorkspace?.actualSourcePath || "not found",
      status: teacherWorkspace?.sourcePathStatus === "missing" ? "missing" : "verified",
    },
    {
      risk: "鏅烘収...png should resolve to 智慧托育平台运营报表分析界面.png",
      designId: weeklyChinese?.designId || "SCFR-247-director-charts-reports-tablet-portrait",
      verifiedActualPath: weeklyChinese?.actualSourcePath || "not found",
      status: weeklyChinese?.sourcePathStatus === "missing" ? "missing" : "verified",
    },
  ];
}

function countBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    const key = getter(item) || "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function buildDesignAuditReport(specs, summary) {
  return [
    "# R01 Design Audit Report",
    "",
    "## Summary",
    `- Task: FRONTEND-REPLICA-R01`,
    `- Status: done`,
    `- Design files audited: ${summary.total}`,
    `- Page specs generated: ${summary.pageSpecsGenerated}`,
    `- Chart targets: ${summary.chartTargets}`,
    `- AI assistant targets: ${summary.aiTargets}`,
    `- Modal/drawer/state targets: ${summary.modalTargets}`,
    `- Design root: \`${toPosix(path.relative(REPO_ROOT, DESIGN_ROOT)) || DESIGN_ROOT}\``,
    "",
    "## Coverage",
    "",
    "### By Priority",
    table(["Priority", "Count"], summary.byPriority),
    "",
    "### By Normalized Role",
    table(["Role", "Count"], summary.byRole),
    "",
    "### By Original Role",
    table(["Original role", "Count"], summary.byOriginalRole),
    "",
    "### By Viewport",
    table(["Viewport", "Count"], summary.byViewport),
    "",
    "### By Owner Task",
    table(["Task", "Count"], summary.byOwnerTask),
    "",
    "### By Route",
    table(["Route", "Count"], summary.byRoute),
    "",
    "## High Priority Gaps",
    "- P0 route/query/hash states must be audited independently, especially weekly-report, communication, feedback, modal, permission, locked, empty, and loading states.",
    "- P0 visual shell/layout/card/chart/assistant gaps remain across admin, teacher, parent, and shared routes.",
    "- AI assistant surfaces must call server-side vivo provider or show explicit unavailable/degraded state; no fake success.",
    "- Charts must bind existing demo/API/selector data and include tooltip, legend, empty, loading, and error states.",
    "- Mobile/tablet viewport specs need separate acceptance from desktop; 941x1672 and 1086x1448 references are not routes.",
    "",
    "## Corrected Source Paths",
    correctedPathTable(summary.correctedPaths),
    "",
    "## Known Path Risk Verification",
    markdownTable(
      ["Risk", "Design ID", "Verified actual path", "Status"],
      summary.knownPathRisks.map((item) => [item.risk, item.designId, item.verifiedActualPath, item.status])
    ),
    "",
    "## Page Spec Index",
    "",
    specIndexTable(specs),
    "",
  ].join("\n");
}

function buildChartAudit(specs, summary) {
  const rows = summary.chartTargetsList.map((spec) => [
    spec.designId,
    spec.targetRoute,
    spec.viewport,
    spec.chartSpec.chartTypes.join(" + "),
    spec.chartSpec.title,
    spec.chartSpec.metrics.join(", "),
    spec.chartSpec.currentApiOrSelector,
    `PAGE_SPECS/${spec.designId}.md`,
  ]);
  return [
    "# R01 Chart Audit",
    "",
    "## Summary",
    `- Chart target images: ${summary.chartTargets}`,
    "- Chart implementation must use real demo data, existing APIs, selectors, or view models.",
    "- Static values copied from design images are not acceptable.",
    "",
    "## Shared Chart Contract",
    "- Types: KPI cards, line charts, bar charts, donut/pie charts, combo charts, ranking/table summaries.",
    "- Colors: use role/design palette while preserving semantic green/orange/red/blue status colors.",
    "- Axes: compact labels, light grid lines, no clipped labels at mobile/tablet widths.",
    "- Legend: visible only for multi-series/distribution charts; match dot/pill style.",
    "- Tooltip: show label, value, period/category, and status where useful.",
    "- Empty/loading/error: preserve chart card dimensions and avoid fake final values.",
    "",
    "## Target Matrix",
    "",
    markdownTable(
      ["Design ID", "Route", "Viewport", "Chart Type", "Title", "Metrics", "API/Selector", "Spec"],
      rows
    ),
    "",
  ].join("\n");
}

function buildAiAudit(specs, summary) {
  const rows = summary.aiTargetsList.map((spec) => [
    spec.designId,
    spec.normalizedRole,
    spec.targetRoute,
    spec.viewport,
    spec.assistantSpec.entryPosition,
    spec.assistantSpec.recommendedPrompts.join(" / "),
    `PAGE_SPECS/${spec.designId}.md`,
  ]);
  return [
    "# R01 AI Assistant Audit",
    "",
    "## Summary",
    `- AI assistant target images: ${summary.aiTargets}`,
    `- Official vivo reference: ${VIVO_REFERENCE}`,
    "- All AI capability must call a server-side vivo provider or show explicit unavailable/degraded state.",
    "- Browser UI must call local Next API/backend proxy only; never expose vivo keys, signatures, tokens, or `NEXT_PUBLIC_VIVO_*`.",
    "",
    "## Existing Provider Inventory",
    "- Next vivo adapters: `lib/providers/vivo/*`.",
    "- Next provider wrappers: `lib/ai/providers/*`.",
    "- Backend providers: `backend/app/providers/*`.",
    "- AI routes and guards: `app/api/ai/*`, `lib/server/ai-route-guard.ts`, `lib/server/scope.ts`.",
    "",
    "## Role Requirements",
    "- Director: operations insight, risk priority, weekly report, dispatch, and decision Q&A.",
    "- Teacher: class summary, focus children, communication drafts, execution tasks, voice understanding.",
    "- Parent: tonight action, trend explanation, feedback completion, teacher-visible context.",
    "",
    "## Failure Requirements",
    "- vivo not configured: show unavailable/degraded copy and disable/send retry appropriately.",
    "- Upstream failure: preserve error state and retry affordance; do not swallow or convert to success.",
    "- Write/dispatch/archive actions: require command bus, permission, and confirmation boundaries.",
    "",
    "## Target Matrix",
    "",
    markdownTable(
      ["Design ID", "Role", "Route", "Viewport", "Entry", "Prompts", "Spec"],
      rows
    ),
    "",
  ].join("\n");
}

function buildResultJson(summary) {
  return {
    taskId: "FRONTEND-REPLICA-R01",
    status: summary.total === 247 && summary.pageSpecsGenerated === 247 ? "done" : "partial",
    designFilesAudited: summary.total,
    pageSpecsGenerated: summary.pageSpecsGenerated,
    chartTargets: summary.chartTargets,
    aiAssistantTargets: summary.aiTargets,
    modalDrawerStateTargets: summary.modalTargets,
    highPriorityGaps: [
      "P0 route/query/hash states must be audited independently",
      "P0 visual shell/layout/card/chart/assistant gaps remain across admin, teacher, parent routes",
      "AI assistant must use server-side vivo provider or explicit unavailable state",
      "Charts must bind real demo/API/selector data, not static fake values",
      "Mobile/tablet viewport specs need separate acceptance from desktop",
    ],
    p0GapCount: summary.p0Gaps.length,
    p1GapCount: summary.p1Gaps.length,
    pathRiskNotes: summary.knownPathRisks,
    nextRecommendedTasks: [
      "R02 design system / route-state mapping",
      "R03 chart contract and data binding audit",
      "R04 AI assistant provider and UI contract audit",
      "R05-R07 role page implementation slices",
      "R90 visual QA after implementation",
    ],
  };
}

function buildResultMarkdown(result, summary) {
  return [
    "# R01 Result",
    "",
    "## Status",
    `- Task: ${result.taskId}`,
    `- Status: ${result.status}`,
    `- Design files audited: ${result.designFilesAudited}`,
    `- Page specs generated: ${result.pageSpecsGenerated}`,
    `- Chart targets: ${result.chartTargets}`,
    `- AI assistant targets: ${result.aiAssistantTargets}`,
    `- Modal/drawer/state targets: ${result.modalDrawerStateTargets}`,
    "",
    "## P0 Gaps",
    ...result.highPriorityGaps.map((item) => `- ${item}`),
    "",
    "## P1 Gaps",
    "- Token-level differences remain for colors, radius, shadows, typography, icon style, tag style, and responsive spacing.",
    "- Secondary chart details such as legends, tooltip formatting, empty/loading/error copy, and axis clipping need R05/R90 verification.",
    "- Modal/drawer overlays, permission states, and underdocumented routes need direct state captures.",
    "",
    "## Next Recommended Tasks",
    ...result.nextRecommendedTasks.map((item) => `- ${item}`),
    "",
    "## Generated Files",
    "- `docs/frontend-replica/PAGE_SPECS/*.md`",
    "- `docs/frontend-replica/R01_DESIGN_AUDIT_REPORT.md`",
    "- `docs/frontend-replica/R01_CHART_AUDIT.md`",
    "- `docs/frontend-replica/R01_AI_ASSISTANT_AUDIT.md`",
    "- `docs/frontend-replica/results/R01-result.json`",
    "",
    "## Route Coverage",
    table(["Route", "Count"], summary.byRoute),
    "",
  ].join("\n");
}

function correctedPathTable(items) {
  if (!items.length) return "- None.";
  return markdownTable(
    ["Design ID", "Inventory path", "Actual path", "Status"],
    items.map((spec) => [spec.designId, spec.sourcePath, spec.actualSourcePath, spec.sourcePathStatus])
  );
}

function specIndexTable(specs) {
  return markdownTable(
    ["Design ID", "Role", "Route", "Viewport", "Charts", "AI", "State", "Spec"],
    specs.map((spec) => [
      spec.designId,
      spec.normalizedRole,
      spec.targetRoute,
      spec.viewport,
      spec.hasCharts ? "yes" : "no",
      spec.hasAiAssistant ? "yes" : "no",
      spec.hasModalState ? "yes" : "no",
      `PAGE_SPECS/${spec.designId}.md`,
    ])
  );
}

function table(headers, rows) {
  return markdownTable(headers, rows.map(([left, right]) => [left, String(right)]));
}

function markdownTable(headers, rows) {
  const escapedHeaders = headers.map(escapeCell);
  const lines = [
    `| ${escapedHeaders.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map((cell) => escapeCell(String(cell ?? ""))).join(" | ")} |`);
  }
  return lines.join("\n");
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function removeStaleSpecs() {
  const entries = await fs.readdir(PAGE_SPECS_ROOT, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^SCFR-\d+-.+\.md$/.test(entry.name))
      .map((entry) => fs.unlink(path.join(PAGE_SPECS_ROOT, entry.name)))
  );
}

async function validateOutputs(specs) {
  const specFiles = (await fs.readdir(PAGE_SPECS_ROOT)).filter((name) => /^SCFR-\d+-.+\.md$/.test(name));
  const resultJson = JSON.parse(await fs.readFile(path.join(RESULTS_ROOT, "R01-result.json"), "utf8"));
  const missingSpecs = specs
    .map((spec) => `${spec.designId}.md`)
    .filter((name) => !specFiles.includes(name));
  return {
    ok:
      specs.length === 247 &&
      specFiles.length === 247 &&
      missingSpecs.length === 0 &&
      resultJson.designFilesAudited === 247 &&
      resultJson.pageSpecsGenerated === 247,
    inventoryRows: specs.length,
    specFiles: specFiles.length,
    missingSpecs,
    resultStatus: resultJson.status,
    chartTargets: resultJson.chartTargets,
    aiAssistantTargets: resultJson.aiAssistantTargets,
  };
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
