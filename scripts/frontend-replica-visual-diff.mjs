import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const DESIGN_ROOT = process.env.FRONTEND_REPLICA_DESIGN_DIR || path.resolve(REPO_ROOT, "..", "前端重构");
const ARTIFACT_ROOT = path.join(REPO_ROOT, "artifacts", "frontend-replica");
const CURRENT_ROOT = path.join(ARTIFACT_ROOT, "current");
const TARGET_ROOT = path.join(ARTIFACT_ROOT, "targets");
const DIFF_ROOT = path.join(ARTIFACT_ROOT, "diff");
const MANIFEST_PATH = path.join(CURRENT_ROOT, "manifest.json");
const REPORT_PATH = path.join(REPO_ROOT, "docs", "frontend-replica", "VISUAL_DIFF_REPORT.md");
const JSON_REPORT_PATH = path.join(DIFF_ROOT, "visual-diff-report.json");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  if (!fssync.existsSync(MANIFEST_PATH)) {
    throw new Error(`Current capture manifest not found: ${toPosix(path.relative(REPO_ROOT, MANIFEST_PATH))}`);
  }

  if (!fssync.existsSync(DESIGN_ROOT)) {
    throw new Error(`Design source directory not found: ${DESIGN_ROOT}`);
  }

  await fs.rm(TARGET_ROOT, { recursive: true, force: true });
  await fs.rm(DIFF_ROOT, { recursive: true, force: true });
  await fs.mkdir(TARGET_ROOT, { recursive: true });
  await fs.mkdir(DIFF_ROOT, { recursive: true });

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const report = await compareEntries(manifest.entries ?? [], manifest.failures ?? []);
  await fs.writeFile(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_PATH, buildMarkdown(report), "utf8");

  console.log(`Frontend replica visual comparisons: ${report.summary.compared}`);
  console.log(`Frontend replica visual skipped: ${report.summary.skipped}`);
  console.log(`Average visual closeness score: ${report.summary.averageVisualClosenessScore ?? "n/a"}`);
  console.log(`Markdown report: ${toPosix(path.relative(REPO_ROOT, REPORT_PATH))}`);
  console.log(`JSON report: ${toPosix(path.relative(REPO_ROOT, JSON_REPORT_PATH))}`);

  if (report.summary.compared === 0) process.exitCode = 1;
}

async function compareEntries(entries, captureFailures) {
  const comparisons = [];
  const skipped = [];

  for (const entry of entries) {
    const currentPath = path.resolve(REPO_ROOT, entry.outputPath);
    const sourceRelativePath = normalizeDesignRelativePath(entry.sourceRelativePath);
    const targetSourcePath = path.resolve(DESIGN_ROOT, sourceRelativePath);

    if (!fssync.existsSync(currentPath)) {
      skipped.push({ id: entry.id, route: entry.route, reason: `Current screenshot missing: ${entry.outputPath}` });
      continue;
    }

    if (!sourceRelativePath || !fssync.existsSync(targetSourcePath)) {
      skipped.push({
        id: entry.id,
        route: entry.route,
        reason: `Target design image missing: ${entry.sourceRelativePath || "not set"}`,
      });
      continue;
    }

    try {
      const currentMeta = await sharp(currentPath).metadata();
      const width = currentMeta.width;
      const height = currentMeta.height;
      if (!width || !height) {
        skipped.push({ id: entry.id, route: entry.route, reason: "Current screenshot dimensions could not be read." });
        continue;
      }

      const targetPath = path.join(TARGET_ROOT, `${entry.id}.png`);
      const diffPath = path.join(DIFF_ROOT, `${entry.id}-diff.png`);

      const targetBuffer = await sharp(targetSourcePath, { limitInputPixels: false })
        .resize(width, height, { fit: "cover", position: "top" })
        .png()
        .toBuffer();
      await fs.writeFile(targetPath, targetBuffer);

      const currentPng = PNG.sync.read(await sharp(currentPath).ensureAlpha().png().toBuffer());
      const targetPng = PNG.sync.read(await sharp(targetBuffer).ensureAlpha().png().toBuffer());
      const diffPng = new PNG({ width, height });
      const diffPixels = pixelmatch(currentPng.data, targetPng.data, diffPng.data, width, height, {
        threshold: 0.12,
        includeAA: true,
      });
      await fs.writeFile(diffPath, PNG.sync.write(diffPng));

      const totalPixels = width * height;
      const similarity = totalPixels ? 1 - diffPixels / totalPixels : 0;
      comparisons.push({
        id: entry.id,
        route: entry.route,
        targetRoute: entry.targetRoute,
        role: entry.role,
        priority: entry.priority,
        viewport: entry.viewportName,
        viewportLabel: entry.viewportLabel,
        imageSize: entry.imageSize,
        current: toPosix(path.relative(REPO_ROOT, currentPath)),
        target: toPosix(path.relative(REPO_ROOT, targetPath)),
        diff: toPosix(path.relative(REPO_ROOT, diffPath)),
        sourceRelativePath,
        normalizedSize: { width, height },
        diffPixels,
        totalPixels,
        diffRatio: Number((diffPixels / totalPixels).toFixed(6)),
        visualClosenessScore: Number((similarity * 100).toFixed(2)),
        visualCategory: classifyVisualCategory(entry),
      });
    } catch (error) {
      skipped.push({
        id: entry.id,
        route: entry.route,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const failure of captureFailures) {
    skipped.push({ id: failure.id, route: failure.route, reason: `Capture failed: ${failure.reason}` });
  }

  comparisons.sort((left, right) => left.visualClosenessScore - right.visualClosenessScore);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    designRoot: DESIGN_ROOT,
    currentManifest: toPosix(path.relative(REPO_ROOT, MANIFEST_PATH)),
    currentRoot: toPosix(path.relative(REPO_ROOT, CURRENT_ROOT)),
    targetRoot: toPosix(path.relative(REPO_ROOT, TARGET_ROOT)),
    diffRoot: toPosix(path.relative(REPO_ROOT, DIFF_ROOT)),
    summary: {
      compared: comparisons.length,
      skipped: skipped.length,
      averageVisualClosenessScore: averageScore(comparisons),
      byPriority: summarizeGroup(comparisons, "priority"),
      byRoute: summarizeGroup(comparisons, "route"),
      byViewport: summarizeGroup(comparisons, "viewport"),
      byRole: summarizeGroup(comparisons, "role"),
      byVisualCategory: summarizeGroup(comparisons, "visualCategory"),
    },
    worstComparisons: comparisons.slice(0, 30),
    comparisons,
    skipped,
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Frontend Replica Visual Diff Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Design root: \`${report.designRoot}\``,
    `- Current manifest: \`${report.currentManifest}\``,
    `- Current screenshots: \`${report.currentRoot}\``,
    `- Target screenshots: \`${report.targetRoot}\``,
    `- Diff screenshots: \`${report.diffRoot}\``,
    `- Compared pages: ${report.summary.compared}`,
    `- Skipped pages: ${report.summary.skipped}`,
    `- Average visual closeness score: ${report.summary.averageVisualClosenessScore ?? "n/a"}`,
    "",
    "## Priority Counts",
    "",
    table(["Priority", "Count", "Average", "Worst"], summaryRows(report.summary.byPriority)),
    "",
    "## Viewport Counts",
    "",
    table(["Viewport", "Count", "Average", "Worst"], summaryRows(report.summary.byViewport)),
    "",
    "## Route Counts",
    "",
    table(["Route", "Count", "Average", "Worst"], summaryRows(report.summary.byRoute)),
    "",
    "## Visual Repair Priority",
    "",
    "- Layout structure: inspect the lowest-scoring P0 route groups first, especially pages where shell/sidebar/topbar geometry differs.",
    "- Spacing: prioritize repeated route/viewport groups with medium scores after layout fixes.",
    "- Color: use target palette from PAGE_SPECS and adjust shared tokens before page-specific colors.",
    "- Typography: keep fixed responsive sizes and avoid viewport-width scaling.",
    "- Cards: tune shared radius, border, and shadow tokens before editing individual cards.",
    "- Charts: compare chart-card density, grid lines, legends, and tooltip affordances.",
    "- AI assistant panel: compare prompt chips, conversation column, status badge, input bar, and right insight panels.",
    "- Mobile: check bottom nav, voice entry, sticky inputs, and first-viewport content clipping.",
    "",
    "## Worst Comparisons",
    "",
    table(
      ["ID", "Route", "Viewport", "Priority", "Score", "Diff"],
      report.worstComparisons.map((item) => [
        item.id,
        item.route,
        item.viewport,
        item.priority,
        item.visualClosenessScore,
        `\`${item.diff}\``,
      ])
    ),
    "",
    "## Skipped",
    "",
  ];

  if (report.skipped.length) {
    for (const item of report.skipped) {
      lines.push(`- ${item.id}: ${item.reason}`);
    }
  } else {
    lines.push("- None.");
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function classifyVisualCategory(entry) {
  const id = String(entry.id).toLowerCase();
  const route = String(entry.route).toLowerCase();
  if (/login|auth/.test(id) || route.startsWith("/login")) return "login";
  if (/ai-assistant|agent/.test(id) || route.includes("/agent")) return "ai-assistant";
  if (/charts|reports|weekly/.test(id) || route.includes("weekly-report")) return "charts-reports";
  if (/storybook/.test(id) || route.includes("/storybook")) return "storybook";
  if (entry.viewportName === "mobile") return "mobile";
  if (entry.viewportName === "tablet") return "tablet";
  return "dashboard";
}

function summarizeGroup(items, key) {
  const groups = new Map();
  for (const item of items) {
    const value = String(item[key] ?? "unknown");
    const current = groups.get(value) ?? [];
    current.push(item);
    groups.set(value, current);
  }
  return [...groups.entries()]
    .map(([name, groupItems]) => ({
      name,
      count: groupItems.length,
      averageVisualClosenessScore: averageScore(groupItems),
      worstVisualClosenessScore: groupItems.reduce(
        (worst, item) => Math.min(worst, item.visualClosenessScore),
        Number.POSITIVE_INFINITY
      ),
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function summaryRows(items) {
  return items.map((item) => [
    item.name,
    item.count,
    item.averageVisualClosenessScore ?? "n/a",
    Number.isFinite(item.worstVisualClosenessScore) ? Number(item.worstVisualClosenessScore.toFixed(2)) : "n/a",
  ]);
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

function averageScore(items) {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + item.visualClosenessScore, 0);
  return Number((total / items.length).toFixed(2));
}

function normalizeDesignRelativePath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
