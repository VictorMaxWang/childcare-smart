import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const FIXED_DESIGN_SOURCE_ROOT = String.raw`C:\Users\12804\Desktop\childcare-smart源代码\前端重构`;
const DESIGN_SOURCE_ROOT = process.env.PIXEL_DESIGN_SOURCE_DIR || FIXED_DESIGN_SOURCE_ROOT;
const ARTIFACT_ROOT = path.join(REPO_ROOT, "artifacts", "pixel-replica");
const SOURCE_INDEX_ROOT = path.join(ARTIFACT_ROOT, "source-index");
const EXTRACTED_ZIPS_ROOT = path.join(SOURCE_INDEX_ROOT, "extracted-zips");
const REFERENCES_ROOT = path.join(ARTIFACT_ROOT, "references");
const REPORTS_ROOT = path.join(ARTIFACT_ROOT, "reports");
const ASSET_ROOT = path.join(REPO_ROOT, "public", "pixel-replica");
const MANIFEST_PATH = path.join(ASSET_ROOT, "manifest.json");
const SOURCE_SCAN_PATH = path.join(SOURCE_INDEX_ROOT, "source-scan.json");
const REPORT_PATH = path.join(REPORTS_ROOT, "extract-pixel-assets-report.md");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const TRACKED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ".json", ".md", ".txt", ".zip"]);
const REQUIRED_ASSET_DIRS = [
  "crops",
  "backgrounds",
  "illustrations",
  "icons",
  "storybook",
  "empty-states",
  "charts",
  "visual-cards",
];

const CANONICAL_REFERENCE_NAMES = [
  { route: "/login", outputBase: "login-reference" },
  { route: "/admin", outputBase: "director-dashboard-reference" },
  { route: "/teacher", outputBase: "teacher-workbench-reference" },
  { route: "/parent", outputBase: "parent-home-reference" },
  { route: "app/layout.tsx", outputBase: "shell-navigation-reference" },
];

const ASSET_CROP_PLANS = [
  {
    id: "login-left-illustration",
    category: "illustrations",
    filename: "smart_childcare_platform_login_page_design.png",
    route: "/login",
    crop: { left: 0, top: 0, width: 0.58, height: 1 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Heuristic crop of the login page decorative/illustration side; verify before direct UI use.",
  },
  {
    id: "login-gradient-accent",
    category: "backgrounds",
    filename: "modern_childcare_platform_login_ui_design.png",
    route: "/login",
    crop: { left: 0, top: 0, width: 0.5, height: 0.72 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Background gradient/light accent candidate from login reference.",
  },
  {
    id: "director-dashboard-card-cluster",
    category: "visual-cards",
    filename: "childcare_management_platform_dashboard_ui.png",
    route: "/admin",
    crop: { left: 0.58, top: 0.1, width: 0.36, height: 0.54 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Director dashboard non-interactive card/decorative cluster candidate.",
  },
  {
    id: "director-ai-decoration-card",
    category: "visual-cards",
    filename: "ai_powered_childcare_management_dashboard.png",
    route: "/admin/agent",
    crop: { left: 0.6, top: 0.12, width: 0.34, height: 0.5 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "AI assistant decorative card candidate for director pages.",
  },
  {
    id: "teacher-workbench-card-cluster",
    category: "visual-cards",
    filename: "teacher_dashboard_with_class_overview_and_tasks.png",
    route: "/teacher",
    crop: { left: 0.55, top: 0.12, width: 0.38, height: 0.5 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Teacher workbench card cluster candidate.",
  },
  {
    id: "parent-home-card-cluster",
    category: "visual-cards",
    filename: "soft_pastel_parenting_dashboard_ui_design.png",
    route: "/parent",
    crop: { left: 0.08, top: 0.18, width: 0.84, height: 0.36 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Parent home non-interactive summary card candidate.",
  },
  {
    id: "storybook-illustration-panel",
    category: "storybook",
    filename: "parenting_storybook_web_app_dashboard.png",
    route: "/parent/storybook?child=c-1",
    crop: { left: 0.15, top: 0.14, width: 0.7, height: 0.48 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Growth storybook illustration candidate; inspect for embedded personal names before use.",
  },
  {
    id: "empty-state-locked-content",
    category: "empty-states",
    filename: "child_friendly_app_interface_with_locked_content.png",
    route: "shared-empty-state",
    crop: { left: 0.18, top: 0.22, width: 0.64, height: 0.42 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Empty/locked state illustration candidate.",
  },
  {
    id: "weekly-report-chart-decoration",
    category: "charts",
    filename: "smart_childcare_platform_weekly_report_dashboard.png",
    route: "/admin/agent?action=weekly-report",
    crop: { left: 0.52, top: 0.22, width: 0.38, height: 0.42 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Chart background/decorative candidate from weekly report reference.",
  },
  {
    id: "design-system-icon-candidate-set",
    category: "icons",
    filename: "design_system_for_childcare_platform.png",
    route: "components/Navbar.tsx",
    crop: { left: 0.05, top: 0.62, width: 0.38, height: 0.24 },
    decorative: true,
    visualOnly: true,
    safeForProductionRuntime: true,
    needsManualCrop: true,
    notes: "Icon/style candidate crop from design system reference.",
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  if (!fssync.existsSync(DESIGN_SOURCE_ROOT)) {
    console.error(`Design source directory not found: ${DESIGN_SOURCE_ROOT}`);
    process.exit(2);
  }

  await prepareOutputDirectories();

  const originalFiles = await listFiles(DESIGN_SOURCE_ROOT);
  const zipExtractions = await extractZipFiles(originalFiles.filter((file) => extname(file) === ".zip"));
  const extractedFiles = fssync.existsSync(EXTRACTED_ZIPS_ROOT) ? await listFiles(EXTRACTED_ZIPS_ROOT) : [];
  const allFiles = [...originalFiles, ...extractedFiles];
  const sourceIndex = await buildSourceIndex(allFiles, zipExtractions);
  await fs.writeFile(SOURCE_SCAN_PATH, `${JSON.stringify(sourceIndex, null, 2)}\n`, "utf8");

  const imageByBasename = new Map();
  for (const image of sourceIndex.images) {
    const key = image.filename.toLowerCase();
    if (!imageByBasename.has(key)) imageByBasename.set(key, image);
  }

  const referenceRows = await parseRouteMapReferences();
  const references = await copyReferences(referenceRows, imageByBasename);
  const assets = await createAssetCrops(imageByBasename);

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: DESIGN_SOURCE_ROOT,
    assetRoot: "public/pixel-replica",
    publicBasePath: "/pixel-replica",
    sourceIndexPath: toPosix(path.relative(REPO_ROOT, SOURCE_SCAN_PATH)),
    pathPolicy:
      "Original design files are read only from the fixed sibling source directory; runtime assets are copied into public/pixel-replica.",
    categories: REQUIRED_ASSET_DIRS,
    summary: {
      sourceImageCount: sourceIndex.images.length,
      trackedFileCount: sourceIndex.summary.trackedFileCount,
      unsupportedFileCount: sourceIndex.unsupportedFiles.length,
      zipFileCount: sourceIndex.summary.byExtension[".zip"] ?? 0,
      referencesCopied: references.filter((item) => item.copied).length,
      unresolvedReferences: references.filter((item) => !item.copied).length,
      assetsGenerated: assets.length,
      needsManualCrop: assets.filter((item) => item.needsManualCrop).length,
    },
    references,
    assets,
    unsupportedFiles: sourceIndex.unsupportedFiles,
    zipExtractions,
  };

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_PATH, buildReport(manifest, sourceIndex), "utf8");

  console.log(`Pixel assets extracted from: ${DESIGN_SOURCE_ROOT}`);
  console.log(`References copied: ${manifest.summary.referencesCopied}`);
  console.log(`Assets generated: ${manifest.summary.assetsGenerated}`);
  console.log(`Manifest: ${toPosix(path.relative(REPO_ROOT, MANIFEST_PATH))}`);
  console.log(`Report: ${toPosix(path.relative(REPO_ROOT, REPORT_PATH))}`);
}

async function prepareOutputDirectories() {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.rm(REFERENCES_ROOT, { recursive: true, force: true });
  await fs.rm(ASSET_ROOT, { recursive: true, force: true });
  await fs.rm(EXTRACTED_ZIPS_ROOT, { recursive: true, force: true });

  for (const dir of [SOURCE_INDEX_ROOT, REFERENCES_ROOT, REPORTS_ROOT, EXTRACTED_ZIPS_ROOT]) {
    await fs.mkdir(dir, { recursive: true });
  }

  for (const dir of ["current", "after", "diff"]) {
    await fs.mkdir(path.join(ARTIFACT_ROOT, dir), { recursive: true });
  }

  for (const dir of REQUIRED_ASSET_DIRS) {
    await fs.mkdir(path.join(ASSET_ROOT, dir), { recursive: true });
  }
}

async function listFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      results.push(absolute);
    }
  }
  return results;
}

async function extractZipFiles(zipFiles) {
  const extractions = [];
  const queue = [...zipFiles];
  const seen = new Set(queue.map((file) => path.resolve(file).toLowerCase()));

  while (queue.length) {
    const zipFile = queue.shift();
    const targetDir = path.join(EXTRACTED_ZIPS_ROOT, `${slugify(path.basename(zipFile, path.extname(zipFile)))}-${extractions.length + 1}`);
    await fs.mkdir(targetDir, { recursive: true });
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath ${psQuote(zipFile)} -DestinationPath ${psQuote(targetDir)} -Force`,
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const extraction = {
      sourceZipAbsolutePath: zipFile,
      sourceZipRelativePath: sourceRelativePath(zipFile),
      outputPath: toPosix(path.relative(REPO_ROOT, targetDir)),
      ok: result.status === 0,
      error: result.status === 0 ? null : result.stderr || result.stdout || "Expand-Archive failed",
    };
    extractions.push(extraction);

    if (extraction.ok) {
      const nestedFiles = await listFiles(targetDir);
      for (const nestedZip of nestedFiles.filter((file) => extname(file) === ".zip")) {
        const key = path.resolve(nestedZip).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(nestedZip);
        }
      }
    }
  }

  return extractions;
}

async function buildSourceIndex(files, zipExtractions) {
  const images = [];
  const trackedNonImages = [];
  const unsupportedFiles = [];
  const byExtension = {};

  for (const file of files) {
    const extension = extname(file);
    byExtension[extension] = (byExtension[extension] ?? 0) + 1;

    if (IMAGE_EXTENSIONS.has(extension)) {
      const stats = await fs.stat(file);
      const buffer = await fs.readFile(file);
      const metadata = await sharp(file).metadata();
      images.push({
        filename: path.basename(file),
        absolutePath: file,
        relativePathFromDesignSource: sourceRelativePath(file),
        sourceDirectory: path.dirname(file),
        extension,
        sizeBytes: stats.size,
        imageWidth: metadata.width ?? null,
        imageHeight: metadata.height ?? null,
        format: metadata.format ?? null,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        guessedRole: guessRole(file),
        guessedPageType: guessPageType(file),
        visualPriority: guessVisualPriority(file),
      });
      continue;
    }

    if (TRACKED_EXTENSIONS.has(extension)) {
      const stats = await fs.stat(file);
      const buffer = await fs.readFile(file);
      trackedNonImages.push({
        filename: path.basename(file),
        absolutePath: file,
        relativePathFromDesignSource: sourceRelativePath(file),
        sourceDirectory: path.dirname(file),
        extension,
        sizeBytes: stats.size,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      });
      continue;
    }

    if (extension === ".csv") {
      const stats = await fs.stat(file);
      unsupportedFiles.push({
        filename: path.basename(file),
        absolutePath: file,
        relativePathFromDesignSource: sourceRelativePath(file),
        extension,
        sizeBytes: stats.size,
        reason: "CSV manifests are present in the design source but are not part of the required P01 input set.",
      });
    }
  }

  images.sort((left, right) => left.relativePathFromDesignSource.localeCompare(right.relativePathFromDesignSource));
  trackedNonImages.sort((left, right) => left.relativePathFromDesignSource.localeCompare(right.relativePathFromDesignSource));
  unsupportedFiles.sort((left, right) => left.relativePathFromDesignSource.localeCompare(right.relativePathFromDesignSource));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: DESIGN_SOURCE_ROOT,
    extractedZipsRoot: toPosix(path.relative(REPO_ROOT, EXTRACTED_ZIPS_ROOT)),
    summary: {
      trackedFileCount: images.length + trackedNonImages.length,
      imageCount: images.length,
      nonImageTrackedCount: trackedNonImages.length,
      unsupportedFileCount: unsupportedFiles.length,
      byExtension,
    },
    images,
    nonImageFiles: trackedNonImages,
    unsupportedFiles,
    zipExtractions,
  };
}

async function parseRouteMapReferences() {
  const mapPath = path.join(REPO_ROOT, "docs", "pixel-replica", "DESIGN_TO_ROUTE_MAP.md");
  const raw = await fs.readFile(mapPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  const headerLine = lines.find((line) => line.includes("primaryDesignRef") && line.includes("replicaPriority"));
  if (!headerLine) return [];

  const headers = splitMarkdownRow(headerLine);
  const rows = [];
  for (const line of lines) {
    if (line === headerLine || /^\|\s*-+/.test(line)) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length !== headers.length) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const priority = row.replicaPriority?.trim();
    if (!["critical", "high"].includes(priority)) continue;

    const primary = extractImageBasenames(row.primaryDesignRef);
    const secondary = extractImageBasenames(row.secondaryDesignRefs);
    rows.push({
      route: stripBackticks(row.route),
      pageName: stripBackticks(row.pageName),
      role: row.role,
      priority,
      references: [...primary, ...secondary].slice(0, 3).map((filename, index) => ({
        filename,
        primary: index === 0,
      })),
    });
  }

  return rows;
}

async function copyReferences(referenceRows, imageByBasename) {
  const references = [];
  const usedOutputNames = new Set();

  for (const row of referenceRows) {
    const canonical = CANONICAL_REFERENCE_NAMES.find((item) => item.route === row.route);
    const slug = canonical?.outputBase.replace(/-reference$/, "") || slugify(row.route || row.pageName || "reference");

    for (let index = 0; index < row.references.length; index += 1) {
      const ref = row.references[index];
      const source = imageByBasename.get(ref.filename.toLowerCase());
      const outputBase =
        canonical && index === 0
          ? canonical.outputBase
          : `${slug}-reference${index === 0 ? "" : `-${index + 1}`}`;
      const outputName = makeUniqueName(`${outputBase}.png`, usedOutputNames);
      const destination = path.join(REFERENCES_ROOT, outputName);
      const entry = {
        route: row.route,
        pageName: row.pageName,
        role: row.role,
        priority: row.priority,
        primary: ref.primary,
        sourceFilename: ref.filename,
        sourceAbsolutePath: source?.absolutePath ?? null,
        sourceRelativePathFromDesignSource: source?.relativePathFromDesignSource ?? null,
        outputPath: toPosix(path.relative(REPO_ROOT, destination)),
        copied: Boolean(source),
        error: source ? null : "Source image filename was not found under the fixed design source directory.",
      };

      if (source) await fs.copyFile(source.absolutePath, destination);
      references.push(entry);
    }
  }

  return references;
}

async function createAssetCrops(imageByBasename) {
  const assets = [];
  for (const plan of ASSET_CROP_PLANS) {
    const source = imageByBasename.get(plan.filename.toLowerCase());
    if (!source) {
      assets.push({
        id: plan.id,
        category: plan.category,
        outputPath: null,
        publicPath: null,
        sourceFilename: plan.filename,
        sourceAbsolutePath: null,
        sourceRelativePathFromDesignSource: null,
        cropRect: null,
        intendedRoute: plan.route,
        decorative: plan.decorative,
        visualOnly: plan.visualOnly,
        safeForProductionRuntime: false,
        needsManualCrop: true,
        generated: false,
        notes: `${plan.notes} Source image was not found.`,
      });
      continue;
    }

    const metadata = await sharp(source.absolutePath).metadata();
    const cropRect = resolveCropRect(metadata, plan.crop);
    const outputPath = path.join(ASSET_ROOT, plan.category, `${plan.id}.png`);

    await sharp(source.absolutePath)
      .extract(cropRect)
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    assets.push({
      id: plan.id,
      category: plan.category,
      outputPath: toPosix(path.relative(REPO_ROOT, outputPath)),
      publicPath: `/pixel-replica/${plan.category}/${plan.id}.png`,
      sourceFilename: plan.filename,
      sourceAbsolutePath: source.absolutePath,
      sourceRelativePathFromDesignSource: source.relativePathFromDesignSource,
      sourceImageDimensions: {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
      },
      cropRect,
      intendedRoute: plan.route,
      decorative: plan.decorative,
      visualOnly: plan.visualOnly,
      safeForProductionRuntime: plan.safeForProductionRuntime,
      needsManualCrop: plan.needsManualCrop,
      generated: true,
      notes: plan.notes,
    });
  }
  return assets;
}

function resolveCropRect(metadata, crop) {
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(imageWidth * crop.left)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(imageHeight * crop.top)));
  const width = Math.max(1, Math.min(imageWidth - left, Math.round(imageWidth * crop.width)));
  const height = Math.max(1, Math.min(imageHeight - top, Math.round(imageHeight * crop.height)));
  return { left, top, width, height };
}

function buildReport(manifest, sourceIndex) {
  const lines = [
    "# P01 Pixel Asset Extraction Report",
    "",
    `Generated: ${manifest.generatedAt}`,
    "",
    "## Source",
    "",
    `- Source directory found: yes`,
    `- Source directory: \`${DESIGN_SOURCE_ROOT}\``,
    `- Runtime asset root: \`${manifest.assetRoot}\``,
    `- Source scan: \`${manifest.sourceIndexPath}\``,
    "",
    "## Summary",
    "",
    `- Tracked files: ${manifest.summary.trackedFileCount}`,
    `- Source images: ${manifest.summary.sourceImageCount}`,
    `- References copied: ${manifest.summary.referencesCopied}`,
    `- Reusable assets generated: ${manifest.summary.assetsGenerated}`,
    `- Needs manual crop review: ${manifest.summary.needsManualCrop}`,
    `- Unsupported files: ${manifest.summary.unsupportedFileCount}`,
    "",
    "## Copied References",
    "",
  ];

  for (const reference of manifest.references.filter((item) => item.copied)) {
    lines.push(
      `- ${reference.primary ? "primary" : "secondary"} ${reference.route}: \`${reference.outputPath}\` <- \`${reference.sourceRelativePathFromDesignSource}\``
    );
  }

  const unresolved = manifest.references.filter((item) => !item.copied);
  lines.push("", "## Unresolved References", "");
  if (unresolved.length) {
    for (const reference of unresolved) {
      lines.push(`- ${reference.route}: ${reference.sourceFilename} (${reference.error})`);
    }
  } else {
    lines.push("- None.");
  }

  lines.push("", "## Assets", "");
  for (const asset of manifest.assets) {
    lines.push(
      `- ${asset.id}: \`${asset.outputPath ?? "not generated"}\`, category=${asset.category}, needsManualCrop=${asset.needsManualCrop}`
    );
  }

  lines.push("", "## Unsupported Files", "");
  if (sourceIndex.unsupportedFiles.length) {
    for (const file of sourceIndex.unsupportedFiles) {
      lines.push(`- \`${file.relativePathFromDesignSource}\` (${file.reason})`);
    }
  } else {
    lines.push("- None.");
  }

  lines.push("", "## Zip Handling", "");
  if (manifest.zipExtractions.length) {
    for (const zip of manifest.zipExtractions) {
      lines.push(`- ${zip.ok ? "ok" : "failed"} \`${zip.sourceZipRelativePath}\` -> \`${zip.outputPath}\``);
    }
  } else {
    lines.push("- No ZIP files were found under the fixed source directory.");
  }

  return `${lines.join("\n")}\n`;
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function extractImageBasenames(value) {
  const matches = String(value).match(/[^`|;]+?\.(?:png|jpg|jpeg|webp)/gi) ?? [];
  return matches
    .map((item) => stripBackticks(item).split(/[\\/]/).pop()?.trim())
    .filter(Boolean);
}

function stripBackticks(value) {
  return String(value).replace(/`/g, "").trim();
}

function sourceRelativePath(file) {
  const resolved = path.resolve(file);
  const sourceRoot = path.resolve(DESIGN_SOURCE_ROOT);
  if (resolved.toLowerCase().startsWith(sourceRoot.toLowerCase())) {
    return toPosix(path.relative(DESIGN_SOURCE_ROOT, file));
  }
  return toPosix(path.relative(REPO_ROOT, file));
}

function extname(file) {
  return path.extname(file).toLowerCase();
}

function makeUniqueName(filename, usedNames) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${parsed.name}-${suffix}${parsed.ext}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[?#].*$/, "")
    .replace(/\.tsx?$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "reference";
}

function guessRole(file) {
  const name = path.basename(file).toLowerCase();
  if (/login|register|registration|auth|sign[-_ ]?in/.test(name)) return "login";
  if (/teacher|workbench|classroom|class[-_ ]?overview/.test(name)) return "teacher";
  if (/parent|family|guardian|feedback|storybook|story[-_ ]?book|parenting/.test(name)) return "parent";
  if (/director|admin|management|manager|dashboard|weekly|report|operation|analytics/.test(name)) return "director";
  if (/modal|dialog|empty|error|permission|confirmation|confirm|denied|shared|common/.test(name)) return "shared";
  return "unknown";
}

function guessPageType(file) {
  const name = path.basename(file).toLowerCase();
  if (/design[-_ ]?system|style[-_ ]?guide|component[-_ ]?library/.test(name)) return "design-system";
  if (/login|register|registration|auth|sign[-_ ]?in/.test(name)) return "login";
  if (/modal|dialog|confirmation|confirm|popup/.test(name)) return "modal";
  if (/empty|error|permission|denied|locked|forbidden|not[-_ ]?found/.test(name)) return "empty-state";
  if (/ai|assistant|copilot|agent/.test(name)) return "ai-assistant";
  if (/weekly|report|operation[-_ ]?report/.test(name)) return "weekly-report";
  if (/health|morning|check|medical|consultation|stethoscope/.test(name)) return "health";
  if (/growth|observation|journey|timeline/.test(name)) return "growth";
  if (/diet|meal|nutrition|food|feeding/.test(name)) return "diet";
  if (/feedback|communication|message|collaboration/.test(name)) return "feedback";
  if (/storybook|story[-_ ]?book|story/.test(name)) return "storybook";
  if (/chart|analytics|statistics|trend|analysis/.test(name)) return "chart";
  if (/dashboard|overview|home|workbench|interface|platform/.test(name)) return "dashboard";
  return "unknown";
}

function guessVisualPriority(file) {
  const name = path.basename(file).toLowerCase();
  if (/login|weekly|ai|assistant|teacher[-_ ]?dashboard|parent[-_ ]?home|director|admin|design[-_ ]?system/.test(name)) {
    return "high";
  }
  if (/dashboard|health|growth|diet|feedback|storybook/.test(name)) return "medium";
  return "low";
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
