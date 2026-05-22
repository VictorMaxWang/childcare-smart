import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const pdfPath = path.join(repoRoot, "public", "demo", "huiyu-tongxing.pdf");
const outputRoot = path.join(repoRoot, "public", "demo", "system-tour", "v2");

const variants = [
  {
    key: "previewAvif",
    dir: "preview",
    extension: "avif",
    width: 560,
    encode: (pipeline) => pipeline.avif({ quality: 32, effort: 4 }),
  },
  {
    key: "previewWebp",
    dir: "preview",
    extension: "webp",
    width: 560,
    encode: (pipeline) => pipeline.webp({ quality: 60 }),
  },
  {
    key: "fullWebp",
    dir: "full",
    extension: "webp",
    width: 1200,
    encode: (pipeline) => pipeline.webp({ quality: 78 }),
  },
];

const sizeBudgets = {
  previewWebpFirstPageBytes: 40 * 1024,
  previewWebpTotalBytes: 750 * 1024,
  previewAvifTotalBytes: 450 * 1024,
};

function sortByPageNumber(left, right) {
  const leftPage = Number(left.match(/\d+/)?.[0] ?? 0);
  const rightPage = Number(right.match(/\d+/)?.[0] ?? 0);
  return leftPage - rightPage;
}

async function removeExistingImages() {
  await fs.mkdir(outputRoot, { recursive: true });

  for (const variant of variants) {
    const outputDir = path.join(outputRoot, variant.dir);
    await fs.mkdir(outputDir, { recursive: true });

    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^page-\d+\.(?:avif|webp)$/i.test(entry.name))
        .map((entry) => fs.rm(path.join(outputDir, entry.name), { force: true })),
    );
  }
}

async function renderPdfToPngs(tempDir) {
  const prefix = path.join(tempDir, "page");
  try {
    await execFileAsync("pdftoppm", ["-r", "144", "-png", pdfPath, prefix], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run pdftoppm. Install Poppler or MiKTeX pdftoppm and retry. ${detail}`);
  }
}

async function writeVariantPage(inputPath, variant, page) {
  const outputDir = path.join(outputRoot, variant.dir);
  const outputPath = path.join(outputDir, `page-${String(page).padStart(2, "0")}.${variant.extension}`);
  const pipeline = sharp(inputPath).resize({ width: variant.width, withoutEnlargement: true });

  await variant.encode(pipeline).toFile(outputPath);

  return (await fs.stat(outputPath)).size;
}

function assertSizeBudgets(stats) {
  const failures = [];

  if (stats.previewWebp.firstPageBytes > sizeBudgets.previewWebpFirstPageBytes) {
    failures.push(
      `preview/page-01.webp is ${stats.previewWebp.firstPageBytes} bytes; budget is ${sizeBudgets.previewWebpFirstPageBytes}.`,
    );
  }

  if (stats.previewWebp.totalBytes > sizeBudgets.previewWebpTotalBytes) {
    failures.push(
      `preview WebP total is ${stats.previewWebp.totalBytes} bytes; budget is ${sizeBudgets.previewWebpTotalBytes}.`,
    );
  }

  if (stats.previewAvif.totalBytes > sizeBudgets.previewAvifTotalBytes) {
    failures.push(
      `preview AVIF total is ${stats.previewAvif.totalBytes} bytes; budget is ${sizeBudgets.previewAvifTotalBytes}.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`System tour image size budget failed:\n${failures.join("\n")}`);
  }
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "childcare-system-tour-"));

  try {
    await removeExistingImages();
    await renderPdfToPngs(tempDir);

    const pngFiles = (await fs.readdir(tempDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort(sortByPageNumber);

    if (pngFiles.length === 0) {
      throw new Error("pdftoppm did not produce any PNG pages.");
    }

    const stats = Object.fromEntries(
      variants.map((variant) => [
        variant.key,
        {
          outputDir: path.relative(repoRoot, path.join(outputRoot, variant.dir)).split(path.sep).join("/"),
          pageCount: pngFiles.length,
          width: variant.width,
          extension: variant.extension,
          totalBytes: 0,
          averageBytes: 0,
          firstPageBytes: 0,
        },
      ]),
    );

    for (let index = 0; index < pngFiles.length; index += 1) {
      const page = index + 1;
      const inputPath = path.join(tempDir, pngFiles[index]);

      for (const variant of variants) {
        const bytes = await writeVariantPage(inputPath, variant, page);
        const variantStats = stats[variant.key];
        variantStats.totalBytes += bytes;
        if (page === 1) variantStats.firstPageBytes = bytes;
      }
    }

    for (const variantStats of Object.values(stats)) {
      variantStats.averageBytes = Math.round(variantStats.totalBytes / variantStats.pageCount);
    }

    assertSizeBudgets(stats);

    console.log(
      JSON.stringify(
        {
          outputRoot: path.relative(repoRoot, outputRoot).split(path.sep).join("/"),
          budgets: sizeBudgets,
          variants: stats,
        },
        null,
        2,
      ),
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
