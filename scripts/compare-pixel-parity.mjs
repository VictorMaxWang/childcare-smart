import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(REPO_ROOT, "artifacts", "pixel-replica");
const requestedPhase = process.env.PIXEL_COMPARE_PHASE || "current";
const PHASE = ["current", "after"].includes(requestedPhase) ? requestedPhase : "current";
const CAPTURE_ROOT = path.join(ARTIFACT_ROOT, PHASE);
const DIFF_ROOT = path.join(ARTIFACT_ROOT, "diff");
const REPORTS_ROOT = path.join(ARTIFACT_ROOT, "reports");
const JSON_REPORT_PATH = path.join(REPORTS_ROOT, "pixel-parity-report.json");
const MD_REPORT_PATH = path.join(REPORTS_ROOT, "pixel-parity-report.md");
const CAPTURE_MANIFEST_PATH = path.join(CAPTURE_ROOT, "manifest.json");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  await fs.mkdir(DIFF_ROOT, { recursive: true });
  await fs.mkdir(REPORTS_ROOT, { recursive: true });

  const report = await compareFromManifest();
  await fs.writeFile(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(MD_REPORT_PATH, buildMarkdownReport(report), "utf8");

  console.log(`Pixel parity comparisons: ${report.summary.compared}`);
  console.log(`Pixel parity skipped: ${report.summary.skipped}`);
  console.log(`JSON report: ${toPosix(path.relative(REPO_ROOT, JSON_REPORT_PATH))}`);
  console.log(`Markdown report: ${toPosix(path.relative(REPO_ROOT, MD_REPORT_PATH))}`);
}

async function compareFromManifest() {
  const comparisons = [];
  const skipped = [];

  if (!fssync.existsSync(CAPTURE_MANIFEST_PATH)) {
    return buildReport(comparisons, [
      {
        id: "capture-manifest",
        reason: `Capture manifest not found: ${toPosix(path.relative(REPO_ROOT, CAPTURE_MANIFEST_PATH))}`,
      },
    ]);
  }

  const manifest = JSON.parse(await fs.readFile(CAPTURE_MANIFEST_PATH, "utf8"));
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

  for (const entry of entries) {
    const currentPath = path.resolve(REPO_ROOT, entry.outputPath || path.join(CAPTURE_ROOT, entry.filename));
    const referencePath = path.resolve(REPO_ROOT, entry.reference || "");

    if (!fssync.existsSync(currentPath)) {
      skipped.push({ id: entry.id, reason: `Current screenshot missing: ${toPosix(path.relative(REPO_ROOT, currentPath))}` });
      continue;
    }

    if (!entry.reference || !fssync.existsSync(referencePath)) {
      skipped.push({ id: entry.id, reason: `Reference image missing: ${entry.reference || "not set"}` });
      continue;
    }

    try {
      const currentMeta = await sharp(currentPath).metadata();
      const width = currentMeta.width;
      const height = currentMeta.height;
      if (!width || !height) {
        skipped.push({ id: entry.id, reason: "Current screenshot dimensions could not be read." });
        continue;
      }

      const currentPng = PNG.sync.read(await sharp(currentPath).ensureAlpha().png().toBuffer());
      const referencePng = PNG.sync.read(
        await sharp(referencePath)
          .resize(width, height, { fit: "cover", position: "centre" })
          .ensureAlpha()
          .png()
          .toBuffer()
      );
      const diffPng = new PNG({ width, height });
      const diffPixels = pixelmatch(currentPng.data, referencePng.data, diffPng.data, width, height, {
        threshold: 0.12,
        includeAA: true,
      });
      const totalPixels = width * height;
      const similarity = totalPixels > 0 ? 1 - diffPixels / totalPixels : 0;
      const diffFilename = `${entry.id}-diff.png`;
      const diffPath = path.join(DIFF_ROOT, diffFilename);
      await fs.writeFile(diffPath, PNG.sync.write(diffPng));

      comparisons.push({
        id: entry.id,
        pageId: entry.pageId,
        label: entry.label,
        route: entry.route,
        viewport: entry.viewport,
        viewportSize: entry.viewportSize,
        current: toPosix(path.relative(REPO_ROOT, currentPath)),
        reference: toPosix(path.relative(REPO_ROOT, referencePath)),
        diff: toPosix(path.relative(REPO_ROOT, diffPath)),
        normalizedSize: { width, height },
        diffPixels,
        totalPixels,
        similarity: Number(similarity.toFixed(6)),
        visualClosenessScore: Number((similarity * 100).toFixed(2)),
      });
    } catch (error) {
      skipped.push({
        id: entry.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const failure of manifest.failures ?? []) {
    skipped.push({ id: failure.id, reason: `Capture failed: ${failure.reason}` });
  }

  return buildReport(comparisons, skipped);
}

function buildReport(comparisons, skipped) {
  const averageScore =
    comparisons.length > 0
      ? comparisons.reduce((sum, item) => sum + item.visualClosenessScore, 0) / comparisons.length
      : null;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    phase: PHASE,
    captureManifest: toPosix(path.relative(REPO_ROOT, CAPTURE_MANIFEST_PATH)),
    diffRoot: toPosix(path.relative(REPO_ROOT, DIFF_ROOT)),
    summary: {
      compared: comparisons.length,
      skipped: skipped.length,
      averageVisualClosenessScore: averageScore === null ? null : Number(averageScore.toFixed(2)),
      note:
        comparisons.length === 0
          ? "No similarity score was calculated because no complete current/reference pairs were available."
          : "Reference images are cover-resized with center crop to the current screenshot viewport before diffing.",
    },
    comparisons,
    skipped,
  };
}

function buildMarkdownReport(report) {
  const lines = [
    "# P01 Pixel Parity Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `- Phase: ${report.phase}`,
    `- Capture manifest: \`${report.captureManifest}\``,
    `- Diff root: \`${report.diffRoot}\``,
    `- Compared: ${report.summary.compared}`,
    `- Skipped: ${report.summary.skipped}`,
    `- Average visual closeness score: ${report.summary.averageVisualClosenessScore ?? "n/a"}`,
    "",
    "## Comparisons",
    "",
  ];

  if (report.comparisons.length) {
    for (const item of report.comparisons) {
      lines.push(
        `- ${item.id}: score=${item.visualClosenessScore}, diffPixels=${item.diffPixels}/${item.totalPixels}, diff=\`${item.diff}\``
      );
    }
  } else {
    lines.push("- None.");
  }

  lines.push("", "## Skipped", "");
  if (report.skipped.length) {
    for (const item of report.skipped) {
      lines.push(`- ${item.id}: ${item.reason}`);
    }
  } else {
    lines.push("- None.");
  }

  return `${lines.join("\n")}\n`;
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
