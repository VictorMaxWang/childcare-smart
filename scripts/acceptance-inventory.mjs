import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const slash = value => value.replaceAll("\\", "/");
async function filesBelow(directory) {
  const items = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(items.map(item => item.isDirectory() ? filesBelow(path.join(directory, item.name)) : [path.join(directory, item.name)]));
  return nested.flat().sort();
}
async function exists(file) { try { return (await stat(file)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

/** 只列源码公开入口；测试文件的存在绝不被转译成测试通过或普通账号真实验收。 */
export async function sourceInventory(root = ROOT) {
  const appFiles = await filesBelow(path.join(root, "app")), pages = [], routes = [];
  for (const absolute of appFiles) {
    const file = slash(path.relative(root, absolute));
    if (file.endsWith("/page.tsx")) pages.push({ path: file.slice(3, -9) || "/", sourceFile: file, formalBrowserStatus: "not-established-by-this-static-inventory" });
    if (!file.startsWith("app/api/") || !file.endsWith("/route.ts")) continue;
    const source = await readFile(absolute, "utf8");
    const methods = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gmu)].map(match => match[1]);
    assert.ok(methods.length && methods.every(method => METHODS.includes(method)), `${file} 未识别HTTP方法，需人工审查导出约定。`);
    assert.equal(new Set(methods).size, methods.length, `${file} 存在重复方法定义。`);
    routes.push({ path: file.slice(3, -9), methods, sourceFile: file,
      siblingUnitTest: await exists(absolute.replace(/\.ts$/u, ".test.ts")) ? file.replace(/\.ts$/u, ".test.ts") : null,
      executionStatus: "not-established-by-source-or-test-file-presence" });
  }
  assert.equal(new Set(pages.map(item => item.path)).size, pages.length);
  assert.equal(new Set(routes.map(item => item.path)).size, routes.length);
  return { generatedAt: new Date().toISOString(), staticEvidenceOnly: true,
    counts: { pages: pages.length, apiRoutes: routes.length, apiMethodOperations: routes.reduce((sum, item) => sum + item.methods.length, 0), apiRoutesWithSiblingUnitTest: routes.filter(item => item.siblingUnitTest).length },
    limitations: ["源码入口清单不证明已执行HTTP、模型或浏览器测试。", "API路径按Next动态参数模板保留；各方法及分支需分别验收。", "正式通过需关联当前发布SHA、普通账号、场景、实际结果与证据。", "单元/集成和旧生产证据的适用边界见docs/acceptance-coverage-inventory.md。"], pages, routes };
}

async function main() {
  const outputArg = process.argv.find(value => value.startsWith("--output="));
  const output = path.resolve(ROOT, outputArg?.slice(9) || "artifacts/implementation-20261031/acceptance-source-inventory.json");
  const relative = path.relative(path.join(ROOT, "artifacts"), output);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "生成清单只能输出到忽略的artifacts目录。");
  const inventory = await sourceInventory();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(inventory, null, 2));
  console.log(JSON.stringify({ mode: "source-only-no-network", ...inventory.counts, output }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
