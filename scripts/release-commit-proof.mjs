import { spawnSync } from "node:child_process";

import { createReleaseGitExecutionContext } from "./release-environment-proof.mjs";

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/iu;
const DEPLOYMENT_ID_PATTERN = /^[a-z0-9._:-]{3,256}$/iu;
const RELEASE_RUN_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const IGNORED_RELEASE_SOURCE_PREFIXES = ["artifacts/", "docs/"];

export function normalizeCommitSha(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return COMMIT_SHA_PATTERN.test(normalized) ? normalized : "";
}

export function commitMatches(left, right) {
  const normalizedLeft = normalizeCommitSha(left);
  const normalizedRight = normalizeCommitSha(right);
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

export function normalizeDeploymentId(value) {
  const normalized = String(value ?? "").trim();
  return DEPLOYMENT_ID_PATTERN.test(normalized) ? normalized : "";
}

export function normalizeDeploymentUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:" || !url.hostname) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function normalizeReleaseRunId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return RELEASE_RUN_ID_PATTERN.test(normalized) ? normalized : "";
}

let gitExecutionContext;

function runGit(args, cwd) {
  gitExecutionContext ??= createReleaseGitExecutionContext({
    hostEnv: process.env,
  });
  const fullArgs = [...gitExecutionContext.argsPrefix, ...args];
  const result = spawnSync(gitExecutionContext.command, fullArgs, {
    cwd,
    env: gitExecutionContext.env,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr ?? "").trim() ||
        `Git command failed: ${gitExecutionContext.command} ${fullArgs.join(" ")}`
    );
  }
  return String(result.stdout ?? "");
}

/**
 * 发布证据必须绑定当前检出的完整提交，不能把旧部署与新工作区拼成一次通过。
 */
export function readLocalCommitSha(cwd = process.cwd()) {
  const commitSha = normalizeCommitSha(runGit(["rev-parse", "HEAD"], cwd));
  if (!commitSha) {
    throw new Error("Unable to resolve the current full Git commit.");
  }
  return commitSha;
}

export function isReleaseSourcePathIgnored(filePath) {
  const normalized = String(filePath ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/u, "");
  return (
    !normalized ||
    IGNORED_RELEASE_SOURCE_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix)
    )
  );
}

/**
 * 文档和生成报告不会改变运行时，其余已跟踪或未跟踪变更都必须先提交。
 */
export function readReleaseSourceChanges(cwd = process.cwd()) {
  const tracked = runGit(
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", "HEAD", "--"],
    cwd
  );
  const untracked = runGit(
    ["ls-files", "--others", "--exclude-standard"],
    cwd
  );
  return Array.from(
    new Set(
      `${tracked}\n${untracked}`
        .split(/\r?\n/u)
        .map((value) => value.trim().replaceAll("\\", "/"))
        .filter((value) => value && !isReleaseSourcePathIgnored(value))
    )
  ).sort();
}

export function assertReleaseSourceClean(cwd = process.cwd()) {
  const changes = readReleaseSourceChanges(cwd);
  if (changes.length > 0) {
    const preview = changes.slice(0, 10).join(", ");
    const remainder =
      changes.length > 10 ? ` (+${changes.length - 10} more)` : "";
    throw new Error(
      `Release-relevant source has uncommitted changes: ${preview}${remainder}`
    );
  }
  return true;
}

export async function fetchDeploymentProof(
  baseUrl,
  { timeoutMs = 30_000, signal } = {}
) {
  const normalizedBaseUrl = normalizeDeploymentUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error(
      "Release base URL must be an absolute HTTPS origin for deployment proof."
    );
  }
  const healthUrl = new URL("/api/health", `${normalizedBaseUrl}/`);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(healthUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { accept: "application/json" },
    signal: requestSignal,
  });
  if (response.redirected) {
    throw new Error("Deployment health check must not follow redirects.");
  }
  let finalUrl;
  try {
    finalUrl = new URL(response.url);
  } catch {
    throw new Error("Deployment health check did not expose its final URL.");
  }
  if (finalUrl.href !== healthUrl.href) {
    throw new Error(
      `Deployment health check escaped the requested URL: ${finalUrl.href}`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Deployment health check returned HTTP ${response.status}.`
    );
  }
  const payload = await response.json();
  const commitSha = normalizeCommitSha(payload?.deployment?.commitSha);
  const deploymentId = normalizeDeploymentId(payload?.deployment?.deploymentId);
  const deploymentUrl = normalizeDeploymentUrl(
    payload?.deployment?.deploymentUrl
  );
  if (!commitSha) {
    throw new Error("Deployment health payload is missing a full commitSha.");
  }
  if (!deploymentId) {
    throw new Error("Deployment health payload is missing deploymentId.");
  }
  if (!deploymentUrl) {
    throw new Error("Deployment health payload is missing deploymentUrl.");
  }
  return { commitSha, deploymentId, deploymentUrl };
}

export async function fetchDeploymentCommitSha(baseUrl, options) {
  const proof = await fetchDeploymentProof(baseUrl, options);
  return proof.commitSha;
}
