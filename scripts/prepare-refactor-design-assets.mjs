import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const index = arg.indexOf("=");
      return [arg.slice(2, index), arg.slice(index + 1)];
    })
);

const defaultZipPath = path.resolve(root, "..", "前端重构.zip");
const zipPath = path.resolve(args.get("zip") ?? defaultZipPath);
const outputRoot = path.join(root, "artifacts", "refactor-design-assets");
const imageRoot = path.join(outputRoot, "images");
const manifestRoot = path.join(outputRoot, "manifests");
const tmpRoot = path.join(outputRoot, ".tmp");
const docsRoot = path.join(root, "docs", "refactor");
const docsIndexPath = path.join(docsRoot, "DESIGN_ASSET_INDEX.md");
const jsonIndexPath = path.join(outputRoot, "design-images.index.json");

if (!fssync.existsSync(zipPath)) {
  console.error(`Design ZIP not found: ${zipPath}`);
  process.exit(2);
}

await fs.rm(tmpRoot, { recursive: true, force: true });
await fs.rm(imageRoot, { recursive: true, force: true });
await fs.rm(manifestRoot, { recursive: true, force: true });
await fs.mkdir(tmpRoot, { recursive: true });
await fs.mkdir(imageRoot, { recursive: true });
await fs.mkdir(manifestRoot, { recursive: true });
await fs.mkdir(docsRoot, { recursive: true });

const outerRoot = path.join(tmpRoot, "outer");
await fs.mkdir(outerRoot, { recursive: true });
expandArchive(zipPath, outerRoot);

const outerZipFiles = (await listFiles(outerRoot)).filter((file) => file.toLowerCase().endsWith(".zip"));
const outerPngFiles = (await listFiles(outerRoot)).filter((file) => file.toLowerCase().endsWith(".png"));
const extractedRoots = [];

for (const nestedZip of outerZipFiles) {
  const part = guessSourcePart(nestedZip);
  const target = path.join(tmpRoot, "nested", part);
  await fs.mkdir(target, { recursive: true });
  expandArchive(nestedZip, target);
  extractedRoots.push({ sourcePart: part, root: target, zipFile: nestedZip });
}

if (outerPngFiles.length > 0) {
  extractedRoots.push({ sourcePart: "outer", root: outerRoot, zipFile: zipPath });
}

const manifestEntries = [];
const metaByFilename = new Map();
const metaByPartAndFilename = new Map();

for (const extracted of extractedRoots) {
  const files = await listFiles(extracted.root);
  const manifests = files.filter((file) => /manifest.*\.json$/i.test(path.basename(file)));

  for (const manifestPath of manifests) {
    const manifestName = `${extracted.sourcePart}-${path.basename(manifestPath)}`;
    const targetPath = path.join(manifestRoot, manifestName);
    await fs.copyFile(manifestPath, targetPath);
    manifestEntries.push({
      sourcePart: extracted.sourcePart,
      originalPath: toPosix(path.relative(root, manifestPath)),
      localPath: toPosix(path.relative(root, targetPath)),
    });

    const raw = await fs.readFile(manifestPath, "utf8");
    const json = JSON.parse(raw);
    const items = Array.isArray(json) ? json : json.images ?? json.items ?? [];

    for (const item of items) {
      if (!item?.filename) continue;
      const normalized = normalizeFilename(item.filename);
      const meta = {
        globalIndex: item.globalIndex ?? item.global_index ?? null,
        filename: item.filename,
        sizeBytes: item.sizeBytes ?? item.size_bytes ?? null,
        sha256: item.sha256 ?? null,
        sourcePart: item.partIndex
          ? `part_${String(item.partIndex).padStart(2, "0")}`
          : item.part_index
            ? `part_${String(item.part_index).padStart(2, "0")}_of_08`
            : extracted.sourcePart,
      };
      metaByFilename.set(normalized, { ...(metaByFilename.get(normalized) ?? {}), ...meta });
      metaByPartAndFilename.set(`${extracted.sourcePart}::${normalized}`, {
        ...(metaByPartAndFilename.get(`${extracted.sourcePart}::${normalized}`) ?? {}),
        ...meta,
        sourcePart: extracted.sourcePart,
      });
    }
  }
}

const imageEntries = [];
const usedTargetNames = new Set();

for (const extracted of extractedRoots) {
  const files = await listFiles(extracted.root);
  const pngs = files.filter((file) => file.toLowerCase().endsWith(".png"));

  for (const pngPath of pngs) {
    const originalFilename = path.basename(pngPath);
    const normalized = normalizeFilename(originalFilename);
    const meta =
      metaByPartAndFilename.get(`${extracted.sourcePart}::${normalized}`) ??
      metaByFilename.get(normalized) ??
      {};
    const globalIndex = Number(meta.globalIndex ?? imageEntries.length + 1);
    const targetFilename = makeUniqueTargetName(originalFilename, globalIndex, usedTargetNames);
    const targetPath = path.join(imageRoot, targetFilename);
    await fs.copyFile(pngPath, targetPath);

    const buffer = await fs.readFile(targetPath);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const sizeBytes = buffer.byteLength;
    const dimensions = readPngDimensions(buffer);
    const guessedRole = guessRole(originalFilename);
    const guessedPageType = guessPageType(originalFilename, dimensions);
    const visualPriority = guessVisualPriority(originalFilename, guessedRole, guessedPageType, dimensions);
    const manifestSha = meta.sha256 ?? null;

    imageEntries.push({
      globalIndex,
      filename: originalFilename,
      localPath: toPosix(path.relative(root, targetPath)),
      sourcePart: extracted.sourcePart,
      sizeBytes,
      sha256,
      guessedRole,
      guessedPageType,
      visualPriority,
      notes: buildNotes(originalFilename, guessedRole, guessedPageType, manifestSha, sha256, dimensions),
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      sha256Verified: manifestSha ? manifestSha === sha256 : null,
    });
  }
}

imageEntries.sort((left, right) => left.globalIndex - right.globalIndex || left.filename.localeCompare(right.filename));

const index = {
  generatedAt: new Date().toISOString(),
  sourceZip: toPosix(zipPath),
  imageCount: imageEntries.length,
  manifestCount: manifestEntries.length,
  outputRoot: toPosix(path.relative(root, outputRoot)),
  images: imageEntries,
  manifests: manifestEntries,
};

await fs.writeFile(jsonIndexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
await fs.writeFile(docsIndexPath, buildMarkdownIndex(index), "utf8");
await fs.rm(tmpRoot, { recursive: true, force: true });

console.log(`Prepared ${imageEntries.length} design images.`);
console.log(`JSON index: ${toPosix(path.relative(root, jsonIndexPath))}`);
console.log(`Markdown index: ${toPosix(path.relative(root, docsIndexPath))}`);

function expandArchive(source, destination) {
  const command = `Expand-Archive -LiteralPath ${psQuote(source)} -DestinationPath ${psQuote(destination)} -Force`;
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(`Expand-Archive failed for ${source}\n${result.stderr || result.stdout}`);
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function listFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizeFilename(filename) {
  return path.basename(filename).toLowerCase();
}

function makeUniqueTargetName(filename, globalIndex, usedNames) {
  let candidate = filename;
  if (usedNames.has(candidate.toLowerCase())) {
    candidate = `${String(globalIndex).padStart(3, "0")}-${filename}`;
  }
  let suffix = 2;
  const parsed = path.parse(candidate);
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${parsed.name}-${suffix}${parsed.ext}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function guessSourcePart(filePath) {
  const normalized = toPosix(filePath);
  const match = normalized.match(/part[_-](\d+)[_-]of[_-](\d+)/i);
  if (!match) return path.basename(filePath, path.extname(filePath));
  return `part_${match[1].padStart(2, "0")}_of_${match[2].padStart(2, "0")}`;
}

function readPngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function guessRole(filename) {
  const name = filename.toLowerCase();
  if (/(login|register|registration|auth|sign[-_ ]?in)/i.test(name)) return "login";
  if (/(teacher|workbench|classroom|class[-_ ]?overview)/i.test(name)) return "teacher";
  if (/(parent|family|guardian|feedback|storybook|story[-_ ]?book|parenting)/i.test(name)) return "parent";
  if (/(director|admin|management|manager|dashboard|weekly|report|operation|analytics)/i.test(name)) return "director";
  if (/(modal|dialog|empty|error|permission|confirmation|confirm|denied|shared|common)/i.test(name)) return "shared";
  return "unknown";
}

function guessPageType(filename, dimensions) {
  const name = filename.toLowerCase();
  if (/(design[-_ ]?system|style[-_ ]?guide|component[-_ ]?library)/i.test(name)) return "design-system";
  if (/(login|register|registration|auth|sign[-_ ]?in)/i.test(name)) return "login";
  if (/(modal|dialog|confirmation|confirm|popup)/i.test(name)) return "modal";
  if (/(empty|error|permission|denied|locked|forbidden|not[-_ ]?found)/i.test(name)) return "unknown";
  if (/(ai|assistant|copilot|agent)/i.test(name)) return "ai-assistant";
  if (/(weekly|report|operation[-_ ]?report)/i.test(name)) return "weekly-report";
  if (/(health|morning|check|medical|consultation|stethoscope)/i.test(name)) return "health";
  if (/(growth|observation|journey|timeline)/i.test(name)) return "growth";
  if (/(diet|meal|nutrition|food|feeding)/i.test(name)) return "diet";
  if (/(feedback|communication|message|collaboration)/i.test(name)) return "feedback";
  if (/(storybook|story[-_ ]?book|story)/i.test(name)) return "storybook";
  if (/(table|grid)/i.test(name)) return "table";
  if (/(chart|analytics|statistics|trend|analysis)/i.test(name)) return "chart";
  if (/(list|archive|records|management)/i.test(name)) return "list";
  if (/(form|entry|input|upload|request|profile)/i.test(name)) return "form";
  if (/(detail|details|profile|file)/i.test(name)) return "detail";
  if (/(mobile|app)/i.test(name) || (dimensions && dimensions.height > dimensions.width * 1.35)) return "mobile";
  if (/(dashboard|overview|home|workbench|interface|platform)/i.test(name)) return "dashboard";
  return "unknown";
}

function guessVisualPriority(filename, role, pageType, dimensions) {
  const name = filename.toLowerCase();
  if (/(design[-_ ]?system|login|weekly|ai|assistant|teacher[-_ ]?dashboard|parent[-_ ]?home|director|admin)/i.test(name)) {
    return "high";
  }
  if (["design-system", "login", "dashboard", "ai-assistant", "weekly-report", "health", "growth", "diet", "feedback", "storybook"].includes(pageType)) {
    return "high";
  }
  if (role !== "unknown" || (dimensions && dimensions.height > dimensions.width * 1.35)) return "medium";
  return "low";
}

function buildNotes(filename, role, pageType, manifestSha, sha256, dimensions) {
  const notes = [];
  if (manifestSha) notes.push(manifestSha === sha256 ? "sha256 matches manifest" : "sha256 differs from manifest; verify source package");
  if (dimensions) notes.push(`${dimensions.width}x${dimensions.height}`);
  if (role === "unknown" || pageType === "unknown") notes.push("classification needs human review");
  if (/permission|denied|error|empty|confirm|modal/i.test(filename)) notes.push("shared state reference");
  return notes.join("; ");
}

function buildMarkdownIndex(index) {
  const byRole = countBy(index.images, "guessedRole");
  const byPage = countBy(index.images, "guessedPageType");
  const byPriority = countBy(index.images, "visualPriority");
  const rows = index.images
    .map((item) => {
      const imgRel = toPosix(path.relative(docsRoot, path.join(root, item.localPath)));
      return [
        item.globalIndex,
        `![${escapeMd(item.filename)}](${imgRel})`,
        `[${escapeMd(item.filename)}](${imgRel})`,
        item.guessedRole,
        item.guessedPageType,
        item.visualPriority,
        item.sourcePart,
        item.width && item.height ? `${item.width}x${item.height}` : "-",
        item.sha256.slice(0, 12),
        escapeMd(item.notes || "-"),
      ].join(" | ");
    })
    .join("\n");

  return `# Design Asset Index

Generated at: ${index.generatedAt}

Source ZIP: \`${index.sourceZip}\`

Total images: ${index.imageCount}

Total manifests: ${index.manifestCount}

## Summary

### By Role

${formatCounts(byRole)}

### By Page Type

${formatCounts(byPage)}

### By Priority

${formatCounts(byPriority)}

## Usage Rules

- These PNG files are visual references only. Production UI must not depend on them as page content.
- Business fields, routes, permissions, and data flow must come from the current codebase.
- Use the role/page/priority fields to find relevant references before starting each refactor task.
- If an item is marked \`unknown\`, inspect it manually before using it as a key reference.

## Image Index

| # | Preview | File | Role | Page Type | Priority | Source | Size | SHA | Notes |
|---:|---|---|---|---|---|---|---|---|---|
${rows}
`;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] ?? 0) + 1;
    return acc;
  }, {});
}

function formatCounts(counts) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `- ${name}: ${count}`)
    .join("\n");
}

function escapeMd(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
