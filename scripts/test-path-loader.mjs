import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const loaderDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(loaderDir, "..");

function resolveFileTarget(targetPath) {
  const candidates = [
    targetPath,
    `${targetPath}.ts`,
    `${targetPath}.tsx`,
    `${targetPath}.js`,
    `${targetPath}.mjs`,
    path.join(targetPath, "index.ts"),
    path.join(targetPath, "index.tsx"),
    path.join(targetPath, "index.js"),
    path.join(targetPath, "index.mjs"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveAliasTarget(specifier) {
  return resolveFileTarget(path.resolve(projectRoot, specifier.slice(2)));
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolvedPath = resolveAliasTarget(specifier);
    if (resolvedPath) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href,
      };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolvedPath = resolveFileTarget(path.resolve(parentDir, specifier));
    if (resolvedPath) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href,
      };
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      !specifier.startsWith("node:") &&
      !path.extname(specifier)
    ) {
      for (const candidate of [`${specifier}.js`, `${specifier}.mjs`, `${specifier}/index.js`]) {
        try {
          return await nextResolve(candidate, context);
        } catch {
          // Keep trying the next candidate.
        }
      }
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const filename = fileURLToPath(url);
    const source = await readFile(filename, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        allowImportingTsExtensions: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        resolveJsonModule: true,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });

    return {
      format: "module",
      shortCircuit: true,
      source: transpiled.outputText,
    };
  }

  if (url.endsWith(".json")) {
    const filename = fileURLToPath(url);
    const source = await readFile(filename, "utf8");

    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${source};`,
    };
  }

  return nextLoad(url, context);
}
