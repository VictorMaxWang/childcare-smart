import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SAFE_HOST_ENV_KEYS = [
  "ALL_PROXY",
  "APPDATA",
  "CI",
  "COLORTERM",
  "COMSPEC",
  "CommonProgramFiles",
  "CommonProgramFiles(x86)",
  "CommonProgramW6432",
  "DriverData",
  "FORCE_COLOR",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "LOGONSERVER",
  "NO_PROXY",
  "NUMBER_OF_PROCESSORS",
  "NUGET_PACKAGES",
  "OS",
  "Path",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "PUBLIC",
  "PYTHONIOENCODING",
  "PYTHONUTF8",
  "RELEASE_GIT_EXECUTABLE",
  "RELEASE_NPM_GLOBAL_CONFIG",
  "RELEASE_NPM_USER_CONFIG",
  "RELEASE_TRUSTED_LAUNCHER_HOME",
  "RELEASE_TRUSTED_POWERSHELL",
  "SSL_CERT_FILE",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USERDOMAIN",
  "USERDOMAIN_ROAMINGPROFILE",
  "USERNAME",
  "USERPROFILE",
  "windir",
];

const FORBIDDEN_ENV_PATTERNS = [
  /^COREPACK_/iu,
  /^GIT_/iu,
  /^NPM_/iu,
  /^PNPM_/iu,
  /^YARN_/iu,
  /^NODE_OPTIONS$/iu,
  /^NODE_PATH$/iu,
  /^NODE_REPL_EXTERNAL_MODULE$/iu,
  /^NODE_CHANNEL_FD$/iu,
  /^BASH_ENV$/iu,
  /^ENV$/iu,
  /^JAVA_TOOL_OPTIONS$/iu,
  /^LD_PRELOAD$/iu,
  /^PERL5OPT$/iu,
  /^PYTHONHOME$/iu,
  /^PYTHONINSPECT$/iu,
  /^PYTHONPATH$/iu,
  /^PYTHONSTARTUP$/iu,
  /^RUBYOPT$/iu,
  /^_JAVA_OPTIONS$/iu,
  /^DYLD_INSERT_LIBRARIES$/iu,
];

function isForbiddenEnvironmentKey(key) {
  return FORBIDDEN_ENV_PATTERNS.some((pattern) =>
    pattern.test(String(key ?? ""))
  );
}

function copySafeHostEnvironment(hostEnv) {
  const safeHostEnv = {};
  for (const key of SAFE_HOST_ENV_KEYS) {
    if (hostEnv?.[key] !== undefined) {
      safeHostEnv[key] = hostEnv[key];
    }
  }
  return safeHostEnv;
}

function pathIsInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function requireEmptyFileInside(rootPath, candidate, label) {
  const rawPath = String(candidate ?? "").trim();
  if (!rawPath || !path.isAbsolute(rawPath)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  const resolvedPath = path.resolve(rawPath);
  if (!pathIsInside(rootPath, resolvedPath)) {
    throw new Error(`${label} must stay inside the trusted launcher directory.`);
  }
  if (!fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} must point to an existing regular file.`);
  }
  if (fs.readFileSync(resolvedPath, "utf8").trim()) {
    throw new Error(`${label} must be empty.`);
  }
  return resolvedPath;
}

export function assertNoReleaseEnvironmentInjection(env) {
  const forbidden = Object.keys(env ?? {})
    .filter((key) => isForbiddenEnvironmentKey(key))
    .sort();
  if (forbidden.length > 0) {
    throw new Error(
      `Formal release environment contains executable injection variables: ${forbidden.join(", ")}`
    );
  }
  return true;
}

/**
 * 正式门禁只继承启动工具所需的系统变量和显式发布配置，避免宿主把执行配置带入子进程。
 */
export function buildReleaseChildEnvironment(
  hostEnv,
  releaseFileEnv,
  overrides = {}
) {
  assertNoReleaseEnvironmentInjection(hostEnv);
  assertNoReleaseEnvironmentInjection(releaseFileEnv);
  assertNoReleaseEnvironmentInjection(overrides);
  const safeHostKeySet = new Set(
    SAFE_HOST_ENV_KEYS.map((key) => key.toLowerCase())
  );
  const hostOverrides = Object.keys(releaseFileEnv ?? {}).filter((key) =>
    safeHostKeySet.has(key.toLowerCase())
  );
  if (hostOverrides.length > 0) {
    throw new Error(
      `Formal release file must not override host execution variables: ${hostOverrides.join(", ")}`
    );
  }
  return {
    ...copySafeHostEnvironment(hostEnv),
    ...releaseFileEnv,
    ...overrides,
  };
}

/**
 * JS 标记仅用于纵深防御；敌对宿主下的权威入口仍是直接执行 PowerShell 启动器。
 */
export function assertTrustedReleaseLauncher(env = process.env) {
  assertNoReleaseEnvironmentInjection(env);
  if (env?.RELEASE_TRUSTED_POWERSHELL !== "1") {
    throw new Error(
      "Formal release must start from scripts/release-formal-gate.ps1. Direct Node or npm startup is not authoritative on a hostile host."
    );
  }
  const rawHome = String(env.RELEASE_TRUSTED_LAUNCHER_HOME ?? "").trim();
  if (!rawHome || !path.isAbsolute(rawHome)) {
    throw new Error(
      "RELEASE_TRUSTED_LAUNCHER_HOME must be an absolute directory created by the PowerShell launcher."
    );
  }
  const launcherHome = path.resolve(rawHome);
  if (!fs.statSync(launcherHome, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("The trusted PowerShell launcher directory is unavailable.");
  }
  return launcherHome;
}

export function resolveTrustedNpmConfigArgs(
  env = process.env,
  { required = false } = {}
) {
  if (env?.RELEASE_TRUSTED_POWERSHELL !== "1") {
    if (!required) return [];
    assertTrustedReleaseLauncher(env);
  }
  const launcherHome = assertTrustedReleaseLauncher(env);
  const userConfig = requireEmptyFileInside(
    launcherHome,
    env.RELEASE_NPM_USER_CONFIG,
    "RELEASE_NPM_USER_CONFIG"
  );
  const globalConfig = requireEmptyFileInside(
    launcherHome,
    env.RELEASE_NPM_GLOBAL_CONFIG,
    "RELEASE_NPM_GLOBAL_CONFIG"
  );
  return [
    `--userconfig=${userConfig}`,
    `--globalconfig=${globalConfig}`,
  ];
}

export function resolveNpmCliPath(nodeExecutable = process.execPath) {
  const nodeDirectory = path.dirname(path.resolve(nodeExecutable));
  const candidates = [
    path.join(
      nodeDirectory,
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
    path.resolve(
      nodeDirectory,
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
  ];
  const npmCliPath = candidates.find((candidate) =>
    fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()
  );
  if (!npmCliPath) {
    throw new Error(
      "Unable to resolve npm-cli.js next to the current Node runtime."
    );
  }
  return npmCliPath;
}

let fallbackGitRoot = "";

function resolveFallbackGitRoot() {
  if (!fallbackGitRoot) {
    fallbackGitRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "childcare-release-git-")
    );
    process.once("exit", () => {
      fs.rmSync(fallbackGitRoot, { recursive: true, force: true });
    });
  }
  return fallbackGitRoot;
}

export function resolveReleaseGitExecutable(env = process.env) {
  const configured = String(env?.RELEASE_GIT_EXECUTABLE ?? "").trim();
  if (!configured) return process.platform === "win32" ? "git.exe" : "git";
  if (!path.isAbsolute(configured)) {
    throw new Error("RELEASE_GIT_EXECUTABLE must be an absolute path.");
  }
  const resolved = path.resolve(configured);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("RELEASE_GIT_EXECUTABLE does not point to a regular file.");
  }
  return resolved;
}

/**
 * Git 只获得净化后的系统环境；受控 GIT_* 值关闭系统配置、交互和外部全局配置。
 */
export function createReleaseGitExecutionContext({
  hostEnv = process.env,
  rootPath,
  hooksPath,
  gitExecutable,
} = {}) {
  const executionRoot = path.resolve(
    rootPath ||
      String(hostEnv?.RELEASE_TRUSTED_LAUNCHER_HOME ?? "").trim() ||
      resolveFallbackGitRoot()
  );
  fs.mkdirSync(executionRoot, { recursive: true });
  const gitHome = path.join(executionRoot, "git-home");
  const emptyHooksPath = path.resolve(
    hooksPath || path.join(executionRoot, "empty-hooks")
  );
  const emptyGlobalConfig = path.join(executionRoot, "empty.gitconfig");
  fs.mkdirSync(gitHome, { recursive: true });
  fs.mkdirSync(emptyHooksPath, { recursive: true });
  if (fs.readdirSync(emptyHooksPath).length > 0) {
    throw new Error("The release Git hooks directory must be empty.");
  }
  fs.writeFileSync(emptyGlobalConfig, "", { encoding: "utf8", flag: "w" });

  return {
    command: gitExecutable || resolveReleaseGitExecutable(hostEnv),
    argsPrefix: [
      "-c",
      `core.hooksPath=${emptyHooksPath}`,
      "-c",
      "core.fsmonitor=false",
    ],
    env: {
      ...copySafeHostEnvironment(hostEnv),
      HOME: gitHome,
      USERPROFILE: gitHome,
      XDG_CONFIG_HOME: gitHome,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: emptyGlobalConfig,
      GIT_TERMINAL_PROMPT: "0",
    },
    rootPath: executionRoot,
    hooksPath: emptyHooksPath,
  };
}

export const releaseEnvironmentProofInternals = {
  isForbiddenEnvironmentKey,
  pathIsInside,
  safeHostEnvKeys: SAFE_HOST_ENV_KEYS,
};
