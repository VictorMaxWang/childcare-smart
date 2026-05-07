import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const mediaRoot = path.join(repoRoot, "public", "demo-media");
const gptImageRoot = path.join(mediaRoot, "gpt-image2");
const manifestPath = path.join(mediaRoot, "manifest.json");

const KIND_BY_FOLDER = new Map([
  ["meals", "meal"],
  ["health-materials", "health-material"],
  ["growth", "growth"],
  ["storybooks", "storybook"],
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function readManifest() {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    if (!/\.(png|jpe?g|webp|svg)$/i.test(entry.name)) return [];
    return [full];
  });
}

function assetKindFromPath(filePath) {
  const relative = path.relative(gptImageRoot, filePath);
  const [folder] = relative.split(path.sep);
  return KIND_BY_FOLDER.get(folder) ?? "other";
}

function allowedUseForKind(kind) {
  if (kind === "meal") return ["meals"];
  if (kind === "health-material") return ["health"];
  if (kind === "growth") return ["growth"];
  if (kind === "storybook") return ["storybooks"];
  return ["demo"];
}

function fallbackForKind(manifest, kind) {
  if (kind === "meal") return manifest.fallbacks.meal;
  if (kind === "health-material") return manifest.fallbacks.healthMaterial;
  if (kind === "growth") return manifest.fallbacks.growth;
  if (kind === "storybook") return manifest.fallbacks.storybook;
  return manifest.fallbacks.default;
}

function main() {
  const manifest = readManifest();
  const existingIds = new Set(
    (manifest.assets ?? [])
      .filter((asset) => !String(asset.id).startsWith("gpt-image2-"))
      .map((asset) => asset.id)
  );
  const generatedAssets = listFiles(gptImageRoot)
    .sort()
    .map((filePath) => {
      const relativePath = toPosix(path.relative(path.join(repoRoot, "public"), filePath));
      const kind = assetKindFromPath(filePath);
      const id = `gpt-image2-${relativePath.replace(/^demo-media\/gpt-image2\//, "").replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
      if (existingIds.has(id)) return null;
      return {
        id,
        kind,
        path: `/${relativePath}`,
        fallbackPath: fallbackForKind(manifest, kind),
        allowedUse: allowedUseForKind(kind),
        seedRefs: [],
        demoLabelRequired: kind === "health-material",
        source: "gpt-image2-synthetic",
      };
    })
    .filter(Boolean);

  manifest.assets = [
    ...(manifest.assets ?? []).filter((asset) => !String(asset.id).startsWith("gpt-image2-")),
    ...generatedAssets,
  ];
  manifest.generatedAt = new Date().toISOString();

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Updated ${path.relative(repoRoot, manifestPath)} with ${generatedAssets.length} GPT Image 2 assets.`);
}

main();
