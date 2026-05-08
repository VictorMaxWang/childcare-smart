import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const TASK_ID = "M03-local-ingest";
const repoRoot = process.cwd();
const sourceDir =
  process.env.GPT_IMAGE2_SOURCE_DIR?.trim() ||
  path.join(path.dirname(repoRoot), String.fromCodePoint(0x56fe, 0x7247, 0x5e93));
const publicRoot = path.join(repoRoot, "public");
const mediaRoot = path.join(publicRoot, "demo-media");
const outputRoot = path.join(mediaRoot, "gpt-image2");
const manifestPath = path.join(mediaRoot, "manifest.json");
const m02NamingManifestPath = path.join(
  repoRoot,
  "docs",
  "demo-media",
  "gpt-image2-batches",
  "gpt-image2-file-naming-manifest.json"
);
const artifactsRoot = path.join(repoRoot, "artifacts", "demo-media", TASK_ID);
const rawRoot = path.join(artifactsRoot, "raw");
const extractedRoot = path.join(artifactsRoot, "extracted");
const rejectedRoot = path.join(artifactsRoot, "rejected");
const artifactReportsRoot = path.join(artifactsRoot, "reports");
const docsRoot = path.join(repoRoot, "docs", "demo-media");
const docsResultsRoot = path.join(docsRoot, "results");

const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;
const ZIP_EXT_RE = /\.zip$/i;

const CATEGORY_CONFIG = {
  meals: {
    kind: "meal",
    fallbackKey: "meal",
    fallbackPath: "/demo-media/meals/demo-meal-placeholder.svg",
    prefix: "meal",
    maxEdge: 1200,
    quality: 82,
    targetBytes: 500 * 1024,
    minEdge: 900,
    allowedUse: ["meals"],
    linkedUsage: ["diet", "teacher-diet-records", "parent-meal-gallery"],
  },
  "health-materials": {
    kind: "health-material",
    fallbackKey: "healthMaterial",
    fallbackPath: "/demo-media/health-materials/demo-health-material-placeholder.svg",
    prefix: "health",
    maxEdge: 1600,
    quality: 85,
    targetBytes: 850 * 1024,
    minEdge: 1200,
    allowedUse: ["health"],
    linkedUsage: ["teacher-health-materials", "parent-health-summary"],
  },
  growth: {
    kind: "growth",
    fallbackKey: "growth",
    fallbackPath: "/demo-media/growth/demo-growth-placeholder.svg",
    prefix: "growth",
    maxEdge: 1400,
    quality: 82,
    targetBytes: 500 * 1024,
    minEdge: 950,
    allowedUse: ["growth"],
    linkedUsage: ["growth-records", "parent-growth-gallery"],
  },
  storybooks: {
    kind: "storybook",
    fallbackKey: "storybook",
    fallbackPath: "/demo-media/storybooks/demo-storybook-placeholder.svg",
    prefix: "storybook",
    maxEdge: 1500,
    quality: 85,
    targetBytes: 650 * 1024,
    minEdge: 1050,
    allowedUse: ["storybooks"],
    linkedUsage: ["parent-storybook-cover", "parent-storybook-page"],
  },
};

const M02_CATEGORY_MAP = {
  meal: "meals",
  "health-material": "health-materials",
  growth: "growth",
  storybook: "storybooks",
};

const KEYWORDS = {
  meals: [
    "meal",
    "breakfast",
    "lunch",
    "snack",
    "food",
    "tray",
    "cafeteria",
    "porridge",
    "rice",
  ],
  "health-materials": [
    "health",
    "medical",
    "report",
    "observation",
    "vaccination",
    "allergy",
    "fever",
    "cough",
    "dental",
    "vision",
    "hearing",
    "nutrition",
    "follow",
    "care",
    "medication",
    "blood",
    "screening",
  ],
  growth: [
    "growth",
    "activity",
    "painting",
    "gardening",
    "balance",
    "music",
    "clay",
    "blocks",
    "obstacle",
    "reading",
    "playtime",
    "playground",
    "playroom",
    "parachute",
    "tidying",
  ],
  storybooks: ["storybook", "cover", "page", "tale", "garden", "bridge", "bedtime", "storytime"],
};

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${parent}: ${child}`);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function publicSrc(filePath) {
  return `/${toPosix(path.relative(publicRoot, filePath))}`;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function sanitizeName(value) {
  return value
    .replace(/\.[^.]+$/u, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
}

function uniqueName(base, usedNames) {
  let name = base;
  let index = 2;
  while (usedNames.has(`${name}.webp`)) {
    name = `${base}-${String(index).padStart(2, "0")}`;
    index += 1;
  }
  usedNames.add(`${name}.webp`);
  return `${name}.webp`;
}

function sourceRelative(filePath) {
  if (fs.existsSync(sourceDir)) {
    const fromSource = path.relative(sourceDir, filePath);
    if (!fromSource.startsWith("..") && !path.isAbsolute(fromSource)) {
      return toPosix(fromSource);
    }
  }
  const fromExtracted = path.relative(extractedRoot, filePath);
  if (!fromExtracted.startsWith("..") && !path.isAbsolute(fromExtracted)) {
    return `extracted/${toPosix(fromExtracted)}`;
  }
  return toPosix(path.relative(repoRoot, filePath));
}

function m02Category(value) {
  return M02_CATEGORY_MAP[value] ?? value;
}

function loadM02NamingByBasename() {
  const manifest = readJson(m02NamingManifestPath, { assets: [] });
  const byBasename = new Map();
  const counts = {};
  for (const asset of manifest.assets ?? []) {
    if (!asset?.targetFilename) continue;
    const basename = path.posix.basename(asset.targetFilename).toLowerCase();
    const category = m02Category(asset.category);
    byBasename.set(basename, {
      ...asset,
      category,
      targetFilename: asset.targetFilename,
    });
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return { byBasename, counts };
}

function loadLocalPackageManifestBySha(jsonFiles) {
  const bySha = new Map();
  for (const jsonFile of jsonFiles) {
    const value = readJson(jsonFile, null);
    if (!Array.isArray(value?.files)) continue;
    for (const file of value.files) {
      if (!file?.sha256) continue;
      const current = bySha.get(file.sha256) ?? [];
      current.push({
        archivePath: file.archivePath,
        relativeSource: file.relativeSource,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
      });
      bySha.set(file.sha256, current);
    }
  }
  return bySha;
}

function extractZip(zipPath, index) {
  const zipBase = sanitizeName(path.basename(zipPath)) || `zip-${index + 1}`;
  const dest = path.join(extractedRoot, zipBase);
  assertInside(extractedRoot, dest);
  ensureDir(dest);
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        zipPath,
        dest,
      ],
      { stdio: "pipe" }
    );
  } else {
    execFileSync("tar", ["-xf", zipPath, "-C", dest], { stdio: "pipe" });
  }
  return dest;
}

function isExcludedByPath(relativePath) {
  const normalized = relativePath.toLowerCase();
  const base = path.posix.basename(normalized);
  if (base === "imagegen.png" || base === "image.png") return "generic imagegen/image filename";
  if (/(^|\/)user[-_][^/]+/iu.test(normalized)) return "internal user display directory";
  if (/collage|grid|contact[-_ ]?sheet/iu.test(normalized)) return "collage/contact sheet";
  if (/preview|cache|prompt[-_ ]?screenshot|readme[-_ ]?screenshot/iu.test(normalized)) return "preview/cache/screenshot";
  return "";
}

function scoreKeywords(normalizedPath) {
  const scores = {};
  for (const [category, words] of Object.entries(KEYWORDS)) {
    scores[category] = words.reduce((sum, word) => {
      const pattern = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^a-z0-9]|$)`, "iu");
      return sum + (pattern.test(normalizedPath) ? 1 : 0);
    }, 0);
  }
  return scores;
}

function classifyCandidate(relativePath, basename, m02ByBasename) {
  const normalized = relativePath.toLowerCase().replace(/\\/gu, "/");
  const lowerBase = basename.toLowerCase();
  const excludedReason = isExcludedByPath(normalized);
  if (excludedReason) return { category: null, confidence: "rejected", reason: excludedReason };

  const m02 = m02ByBasename.get(lowerBase);
  if (m02?.category && CATEGORY_CONFIG[m02.category]) {
    return { category: m02.category, confidence: "m02-manifest", reason: "matched M02 filename manifest", m02 };
  }

  if (/^demo-meal-/iu.test(lowerBase)) return { category: "meals", confidence: "project-name", reason: "project meal filename" };
  if (/^demo-health-/iu.test(lowerBase)) return { category: "health-materials", confidence: "project-name", reason: "project health filename" };
  if (/^demo-growth-/iu.test(lowerBase)) return { category: "growth", confidence: "project-name", reason: "project growth filename" };
  if (/^demo-storybook-/iu.test(lowerBase)) return { category: "storybooks", confidence: "project-name", reason: "project storybook filename" };
  if (/batch0?[67][-_]meal[_-]\d+/iu.test(lowerBase)) return { category: "meals", confidence: "structured-name", reason: "structured meal batch" };
  if (/batch[-_]next[-_]storybook[-_]cover/iu.test(lowerBase)) return { category: "storybooks", confidence: "structured-name", reason: "structured storybook cover batch" };
  if (/next[-_]batch[-_]storybook[-_]pages|round_0\d+_storybooks/iu.test(normalized)) {
    return { category: "storybooks", confidence: "structured-path", reason: "structured storybook directory" };
  }

  const scores = scoreKeywords(normalized);
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [topCategory, topScore] = ranked[0];
  const tied = ranked.filter(([, score]) => score === topScore);
  if (topScore > 0 && tied.length === 1) {
    return { category: topCategory, confidence: "keyword", reason: `keyword score ${topScore}` };
  }
  if (topScore > 0) {
    return { category: null, confidence: "rejected", reason: `ambiguous category: ${tied.map(([category]) => category).join(", ")}` };
  }
  return { category: null, confidence: "rejected", reason: "category uncertain" };
}

function candidatePriority(candidate) {
  let score = 0;
  if (candidate.category) score += 20;
  if (candidate.confidence === "project-name") score += 120;
  if (candidate.confidence === "m02-manifest") score += 110;
  if (candidate.confidence === "structured-name") score += 100;
  if (candidate.confidence === "structured-path") score += 90;
  if (candidate.confidence === "keyword") score += 50;
  if (candidate.relativePath.includes("/structured/") || candidate.relativePath.includes("\\structured\\")) score += 25;
  if (!candidate.relativePath.includes("root-generated")) score += 10;
  score -= Math.min(candidate.relativePath.length / 1000, 1);
  return score;
}

function pickDuplicateKeeper(group) {
  return [...group].sort((left, right) => candidatePriority(right) - candidatePriority(left))[0];
}

function buildOutputBase(candidate, counters) {
  const rawBase = sanitizeName(path.basename(candidate.filePath));
  const projectish =
    /^demo-(meal|health|growth|storybook)-/iu.test(path.basename(candidate.filePath)) ||
    /^batch0?[67]-?meal/iu.test(rawBase) ||
    /^batch-next-storybook-cover/iu.test(rawBase);
  if (projectish) return rawBase;
  counters[candidate.category] = (counters[candidate.category] ?? 0) + 1;
  return `demo-${CATEGORY_CONFIG[candidate.category].prefix}-auto-${String(counters[candidate.category]).padStart(3, "0")}`;
}

async function optimizeImage(inputPath, outputPath, category) {
  const config = CATEGORY_CONFIG[category];
  let maxEdge = config.maxEdge;
  let quality = config.quality;
  let buffer = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    buffer = await sharp(inputPath, { limitInputPixels: false })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();

    if (buffer.length <= config.targetBytes) break;
    if (quality > 66) {
      quality -= 5;
      continue;
    }
    if (maxEdge > config.minEdge) {
      maxEdge = Math.max(config.minEdge, Math.round(maxEdge * 0.9));
      quality = Math.max(66, config.quality - 8);
      continue;
    }
    break;
  }

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, buffer);
  const metadata = await sharp(outputPath).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    sizeBytes: buffer.length,
    sha256: sha256File(outputPath),
  };
}

function fallbackFor(manifest, category) {
  const config = CATEGORY_CONFIG[category];
  return manifest.fallbacks?.[config.fallbackKey] ?? config.fallbackPath;
}

function manifestAssetFor(record, manifest, index) {
  const config = CATEGORY_CONFIG[record.category];
  const src = publicSrc(record.outputPath);
  const optimizedFilename = path.basename(record.outputPath);
  const id = `gpt-image2-${record.category}-${sanitizeName(optimizedFilename)}`;
  const fallbackPath = fallbackFor(manifest, record.category);
  return {
    id,
    kind: config.kind,
    category: record.category,
    src,
    path: src,
    fallbackPath,
    originalFilename: path.basename(record.originalPath),
    originalRelativePath: record.relativePath,
    optimizedFilename,
    width: record.width,
    height: record.height,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    originalSha256: record.originalSha256,
    syntheticDemo: true,
    safetyStatus: "accepted",
    linkedUsage: config.linkedUsage,
    fallbackOf: fallbackPath,
    allowedUse: config.allowedUse,
    seedRefs: record.seedRefs,
    demoLabelRequired: record.category === "health-materials",
    source: "gpt-image2-synthetic",
    ingestionTaskId: TASK_ID,
    ingestionIndex: index + 1,
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/gu, "\\|")).join(" | ")} |`),
  ].join("\n");
}

function formatBytes(value) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function buildReports(summary, acceptedRecords, rejectedRecords, duplicateRecords, expectedByCategory) {
  const byCategoryRows = Object.keys(CATEGORY_CONFIG).map((category) => [
    category,
    summary.byCategory[category] ?? 0,
    expectedByCategory[category] ?? 0,
  ]);
  const rejectedRows = rejectedRecords.map((record) => [record.relativePath, record.reason]);
  const duplicateRows = duplicateRecords.map((record) => [
    record.duplicateRelativePath,
    record.keptRelativePath,
    record.sha256.slice(0, 12),
  ]);

  const localReport = `# GPT Image 2 Local Ingest Report

- Task: ${TASK_ID}
- Status: ${summary.status}
- Source directory: \`${summary.sourceDir}\`
- Scanned files: ${summary.scannedFiles}
- Candidate images: ${summary.candidateImages}
- Accepted images: ${summary.acceptedImages}
- Rejected images: ${summary.rejectedImages}
- Duplicate images: ${summary.duplicateImages}
- Optimized images: ${summary.optimizedImages}
- Total optimized size: ${formatBytes(summary.totalOptimizedSizeBytes)}
- Manifest updated: ${summary.manifestUpdated ? "yes" : "no"}
- Fallback preserved: ${summary.fallbackPreserved ? "yes" : "no"}

## Category Coverage

${markdownTable(["Category", "Accepted", "M02 expected"], byCategoryRows)}

## Notes

All accepted assets are treated as synthetic demo media from the local GPT Image 2 package. Rejected and duplicate source files remain outside committed public assets.
`;

  const coverageReport = `# GPT Image 2 Asset Coverage

${markdownTable(["Category", "Accepted assets", "M02 expected prompts"], byCategoryRows)}

## Public Asset Root

\`public/demo-media/gpt-image2/\`

## Fallback Policy

If a category has fewer assets than seeded records, deterministic reuse is allowed. If no accepted asset exists for a category, the existing SVG fallback remains in use.
`;

  const rejectedReport = `# GPT Image 2 Rejected Assets

Rejected source files are not referenced by \`public/demo-media/manifest.json\`.

${rejectedRows.length ? markdownTable(["Source", "Reason"], rejectedRows) : "No rejected assets."}
`;

  const duplicateReport = `# GPT Image 2 Duplicate Assets

Duplicate detection uses sha256 of the original source image. The kept file favors project naming and structured package paths.

${duplicateRows.length ? markdownTable(["Duplicate", "Kept", "sha256"], duplicateRows) : "No duplicate assets."}
`;

  const resultMd = `# M03 Local Ingest Result

- Status: ${summary.status}
- Source: \`${summary.sourceDir}\`
- Scanned files: ${summary.scannedFiles}
- Extracted zip files: ${summary.extractedZipFiles}
- Candidate images: ${summary.candidateImages}
- Accepted images: ${summary.acceptedImages}
- Rejected images: ${summary.rejectedImages}
- Duplicate images: ${summary.duplicateImages}
- Optimized images: ${summary.optimizedImages}
- Total optimized size: ${formatBytes(summary.totalOptimizedSizeBytes)}
- Manifest updated: ${summary.manifestUpdated}
- Fallback preserved: ${summary.fallbackPreserved}

${markdownTable(["Category", "Count"], Object.entries(summary.byCategory))}
`;

  ensureDir(docsResultsRoot);
  fs.writeFileSync(path.join(docsRoot, "GPT_IMAGE2_LOCAL_INGEST_REPORT.md"), localReport, "utf8");
  fs.writeFileSync(path.join(docsRoot, "GPT_IMAGE2_ASSET_COVERAGE.md"), coverageReport, "utf8");
  fs.writeFileSync(path.join(docsRoot, "GPT_IMAGE2_REJECTED_ASSETS.md"), rejectedReport, "utf8");
  fs.writeFileSync(path.join(docsRoot, "GPT_IMAGE2_DUPLICATE_ASSETS.md"), duplicateReport, "utf8");
  fs.writeFileSync(path.join(docsResultsRoot, "M03-local-ingest-result.md"), resultMd, "utf8");
  writeJson(path.join(docsResultsRoot, "M03-local-ingest-result.json"), summary);

  writeJson(path.join(artifactReportsRoot, "accepted-assets.json"), acceptedRecords);
  writeJson(path.join(artifactReportsRoot, "rejected-assets.json"), rejectedRecords);
  writeJson(path.join(artifactReportsRoot, "duplicate-assets.json"), duplicateRecords);
}

function changedFilesFor(acceptedRecords) {
  return [
    "scripts/ingest-gpt-image2-local-assets.mjs",
    "public/demo-media/manifest.json",
    ...acceptedRecords.map((record) => toPosix(path.relative(repoRoot, record.outputPath))),
    "docs/demo-media/GPT_IMAGE2_LOCAL_INGEST_REPORT.md",
    "docs/demo-media/GPT_IMAGE2_ASSET_COVERAGE.md",
    "docs/demo-media/GPT_IMAGE2_REJECTED_ASSETS.md",
    "docs/demo-media/GPT_IMAGE2_DUPLICATE_ASSETS.md",
    "docs/demo-media/results/M03-local-ingest-result.md",
    "docs/demo-media/results/M03-local-ingest-result.json",
    "package.json",
    "lib/demo-media/assets.ts",
    "lib/demo-data/seed.ts",
    "lib/store.tsx",
    "tests/product-completion/demo-media-ingest.spec.ts",
    "tests/product-completion/demo-data-consistency.spec.ts",
  ];
}

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  for (const dir of [rawRoot, extractedRoot, rejectedRoot, artifactReportsRoot, docsResultsRoot]) {
    ensureDir(dir);
  }

  const sourceFilesInitial = listFiles(sourceDir);
  const zipFiles = sourceFilesInitial.filter((filePath) => ZIP_EXT_RE.test(filePath));
  const extractedDirs = [];
  for (const [index, zipFile] of zipFiles.entries()) {
    extractedDirs.push(extractZip(zipFile, index));
  }

  const extractedFiles = extractedDirs.flatMap(listFiles);
  const scannedFilesList = [...sourceFilesInitial, ...extractedFiles];
  const jsonFiles = scannedFilesList.filter((filePath) => /\.json$/i.test(filePath));
  const imageFiles = scannedFilesList.filter((filePath) => IMAGE_EXT_RE.test(filePath));
  const { byBasename: m02ByBasename, counts: expectedByCategory } = loadM02NamingByBasename();
  const localManifestBySha = loadLocalPackageManifestBySha(jsonFiles);

  writeJson(path.join(rawRoot, "scanned-files.json"), scannedFilesList.map((filePath) => sourceRelative(filePath)));

  const rawCandidates = [];
  for (const filePath of imageFiles) {
    const relativePath = sourceRelative(filePath);
    const basename = path.basename(filePath);
    const originalSha256 = sha256File(filePath);
    const classification = classifyCandidate(relativePath, basename, m02ByBasename);
    let metadata = {};
    try {
      metadata = await sharp(filePath).metadata();
    } catch (error) {
      rawCandidates.push({
        filePath,
        relativePath,
        originalSha256,
        category: null,
        confidence: "rejected",
        reason: `sharp metadata failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const packageMetadata = localManifestBySha.get(originalSha256) ?? [];
    rawCandidates.push({
      filePath,
      relativePath,
      originalPath: filePath,
      originalFilename: basename,
      originalSizeBytes: fs.statSync(filePath).size,
      originalWidth: metadata.width ?? 0,
      originalHeight: metadata.height ?? 0,
      originalFormat: metadata.format ?? path.extname(filePath).replace(".", ""),
      originalSha256,
      category: classification.category,
      confidence: classification.confidence,
      reason: classification.reason,
      m02: classification.m02,
      packageMetadata,
      seedRefs: classification.m02?.linkedSeedIds ?? [],
    });
  }

  const byHash = new Map();
  for (const candidate of rawCandidates) {
    const group = byHash.get(candidate.originalSha256) ?? [];
    group.push(candidate);
    byHash.set(candidate.originalSha256, group);
  }

  const duplicateRecords = [];
  const dedupedCandidates = [];
  for (const group of byHash.values()) {
    const keeper = pickDuplicateKeeper(group);
    dedupedCandidates.push(keeper);
    for (const duplicate of group) {
      if (duplicate === keeper) continue;
      duplicateRecords.push({
        sha256: duplicate.originalSha256,
        duplicateRelativePath: duplicate.relativePath,
        keptRelativePath: keeper.relativePath,
        reason: "sha256 duplicate",
      });
    }
  }

  const acceptedCandidates = dedupedCandidates
    .filter((candidate) => candidate.category && CATEGORY_CONFIG[candidate.category])
    .sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category);
      if (categoryCompare !== 0) return categoryCompare;
      return left.relativePath.localeCompare(right.relativePath);
    });
  const rejectedCandidates = dedupedCandidates
    .filter((candidate) => !candidate.category || !CATEGORY_CONFIG[candidate.category])
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  assertInside(mediaRoot, outputRoot);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  ensureDir(outputRoot);

  const usedNamesByCategory = Object.fromEntries(Object.keys(CATEGORY_CONFIG).map((category) => [category, new Set()]));
  const outputCounters = {};
  const acceptedRecords = [];
  for (const candidate of acceptedCandidates) {
    const categoryOutputDir = path.join(outputRoot, candidate.category);
    const outputBase = buildOutputBase(candidate, outputCounters);
    const optimizedFilename = uniqueName(outputBase, usedNamesByCategory[candidate.category]);
    const outputPath = path.join(categoryOutputDir, optimizedFilename);
    assertInside(outputRoot, outputPath);
    const optimized = await optimizeImage(candidate.filePath, outputPath, candidate.category);
    acceptedRecords.push({
      ...candidate,
      outputPath,
      optimizedFilename,
      width: optimized.width,
      height: optimized.height,
      sizeBytes: optimized.sizeBytes,
      sha256: optimized.sha256,
    });
  }

  const rejectedUsedNames = new Set();
  for (const rejected of rejectedCandidates) {
    const rejectedBase = sanitizeName(path.basename(rejected.filePath)) || "rejected";
    const rejectedExt = path.extname(rejected.filePath).toLowerCase() || ".png";
    let rejectedName = `${rejectedBase}${rejectedExt}`;
    let rejectedIndex = 2;
    while (rejectedUsedNames.has(rejectedName)) {
      rejectedName = `${rejectedBase}-${String(rejectedIndex).padStart(2, "0")}${rejectedExt}`;
      rejectedIndex += 1;
    }
    rejectedUsedNames.add(rejectedName);
    const rejectedPath = path.join(rejectedRoot, rejectedName);
    assertInside(rejectedRoot, rejectedPath);
    try {
      fs.copyFileSync(rejected.filePath, rejectedPath);
    } catch {
      // Rejected copies are diagnostic only.
    }
  }

  const manifest = readJson(manifestPath, null);
  if (!manifest) throw new Error(`Unable to read ${manifestPath}`);
  const generatedAssets = acceptedRecords.map((record, index) => manifestAssetFor(record, manifest, index));
  manifest.assets = [
    ...(manifest.assets ?? []).filter((asset) => !String(asset.id ?? "").startsWith("gpt-image2-")),
    ...generatedAssets,
  ];
  manifest.generatedAt = new Date().toISOString();
  manifest.notice =
    "All bundled GPT Image 2 assets under public/demo-media/gpt-image2 are synthetic demo media. SVG fallbacks remain available for missing media.";
  writeJson(manifestPath, manifest);

  const byCategory = Object.fromEntries(Object.keys(CATEGORY_CONFIG).map((category) => [category, 0]));
  for (const record of acceptedRecords) byCategory[record.category] += 1;
  const totalOptimizedSizeBytes = acceptedRecords.reduce((sum, record) => sum + record.sizeBytes, 0);
  const status = acceptedRecords.length > 0 && Object.values(byCategory).every((count) => count > 0) ? "done" : "partial";
  const summary = {
    taskId: TASK_ID,
    status,
    sourceDir,
    scannedFiles: scannedFilesList.length,
    extractedZipFiles: zipFiles.length,
    candidateImages: imageFiles.length,
    acceptedImages: acceptedRecords.length,
    rejectedImages: rejectedCandidates.length,
    duplicateImages: duplicateRecords.length,
    optimizedImages: acceptedRecords.length,
    byCategory,
    totalOptimizedSizeBytes,
    manifestUpdated: true,
    fallbackPreserved: true,
    changedFiles: changedFilesFor(acceptedRecords),
    checks: {
      lint: "",
      build: "",
      productSmoke: "",
      productApi: "",
      productAi: "",
      productVoice: "",
      productJourney: "",
      featureSmoke: "",
      bugbashSmoke: "",
      tsc: "",
      demoMediaTest: "",
    },
    risks:
      status === "done"
        ? []
        : ["One or more categories have no accepted GPT Image 2 assets; fallback remains active."],
    notes:
      "Image safety was enforced through filename/package filtering and synthetic GPT Image 2 source provenance; rejected and duplicate source files are not included in public assets.",
  };

  const rejectedRecords = rejectedCandidates.map((candidate) => ({
    relativePath: candidate.relativePath,
    reason: candidate.reason,
    originalSha256: candidate.originalSha256,
  }));
  buildReports(summary, acceptedRecords, rejectedRecords, duplicateRecords, expectedByCategory);

  console.log(
    `M03 local ingest ${status}: accepted=${acceptedRecords.length}, rejected=${rejectedCandidates.length}, duplicates=${duplicateRecords.length}, optimized=${formatBytes(totalOptimizedSizeBytes)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
