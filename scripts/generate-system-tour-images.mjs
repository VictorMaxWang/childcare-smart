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
const outputDir = path.join(repoRoot, "public", "demo", "system-tour", "v1");
const imageWidth = 1440;
const webpQuality = 82;

function sortByPageNumber(left, right) {
  const leftPage = Number(left.match(/\d+/)?.[0] ?? 0);
  const rightPage = Number(right.match(/\d+/)?.[0] ?? 0);
  return leftPage - rightPage;
}

async function removeExistingImages() {
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^page-\d+\.webp$/i.test(entry.name))
      .map((entry) => fs.rm(path.join(outputDir, entry.name), { force: true })),
  );
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

    let totalBytes = 0;

    for (let index = 0; index < pngFiles.length; index += 1) {
      const page = index + 1;
      const inputPath = path.join(tempDir, pngFiles[index]);
      const outputPath = path.join(outputDir, `page-${String(page).padStart(2, "0")}.webp`);

      await sharp(inputPath)
        .resize({ width: imageWidth, withoutEnlargement: true })
        .webp({ quality: webpQuality })
        .toFile(outputPath);

      totalBytes += (await fs.stat(outputPath)).size;
    }

    console.log(
      JSON.stringify(
        {
          outputDir: path.relative(repoRoot, outputDir).split(path.sep).join("/"),
          pageCount: pngFiles.length,
          totalBytes,
          averageBytes: Math.round(totalBytes / pngFiles.length),
          imageWidth,
          webpQuality,
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
