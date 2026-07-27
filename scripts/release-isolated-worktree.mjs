import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { normalizeCommitSha } from "./release-commit-proof.mjs";
import { createReleaseGitExecutionContext } from "./release-environment-proof.mjs";

function runGit(args, cwd, gitContext) {
  const fullArgs = [...gitContext.argsPrefix, ...args];
  const result = spawnSync(gitContext.command, fullArgs, {
    cwd,
    env: gitContext.env,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr ?? "").trim() ||
        `Git command failed: ${gitContext.command} ${fullArgs.join(" ")}`
    );
  }
  return String(result.stdout ?? "");
}

function normalizePathList(output) {
  return String(output ?? "")
    .split(/\r?\n/u)
    .map((value) => value.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

/**
 * checkout 完成后同时检查 tracked、untracked 和 ignored 文件，防止 hook 写入 .env.local 等隐蔽输入。
 */
export function readIsolatedCheckoutPollution(worktreePath, gitContext) {
  const tracked = runGit(
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", "HEAD", "--"],
    worktreePath,
    gitContext
  );
  const untracked = runGit(
    ["ls-files", "--others", "--exclude-standard"],
    worktreePath,
    gitContext
  );
  const ignored = runGit(
    ["ls-files", "--others", "--ignored", "--exclude-standard"],
    worktreePath,
    gitContext
  );
  return Array.from(
    new Set([
      ...normalizePathList(tracked),
      ...normalizePathList(untracked),
      ...normalizePathList(ignored),
    ])
  ).sort();
}

export function assertIsolatedCheckoutClean(worktreePath, gitContext) {
  const pollution = readIsolatedCheckoutPollution(worktreePath, gitContext);
  if (pollution.length > 0) {
    const preview = pollution.slice(0, 10).join(", ");
    const remainder =
      pollution.length > 10 ? ` (+${pollution.length - 10} more)` : "";
    throw new Error(
      `Isolated release checkout contains post-checkout pollution: ${preview}${remainder}`
    );
  }
  return true;
}

/**
 * 正式门禁只在指定提交的独立 worktree 中执行，并在 npm ci 前证明 checkout 没有外部文件。
 */
export function createIsolatedReleaseWorktree({
  repoRoot,
  commitSha,
  hostEnv = process.env,
}) {
  const normalizedCommitSha = normalizeCommitSha(commitSha);
  if (!normalizedCommitSha) {
    throw new Error("A full commit SHA is required for an isolated worktree.");
  }
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-release-worktree-")
  );
  const worktreePath = path.join(tempRoot, "source");
  const gitContext = createReleaseGitExecutionContext({
    hostEnv,
    rootPath: path.join(tempRoot, "git-runtime"),
    hooksPath: path.join(tempRoot, "empty-hooks"),
  });
  let worktreeRegistered = false;

  const cleanup = () => {
    if (worktreeRegistered) {
      try {
        runGit(["worktree", "remove", "--force", worktreePath], repoRoot, gitContext);
      } catch {
        // 受限临时目录最终仍由下方 rmSync 清理。
      }
      worktreeRegistered = false;
    }
    const resolvedTempRoot = path.resolve(tempRoot);
    if (
      resolvedTempRoot.startsWith(path.resolve(os.tmpdir())) &&
      path.basename(resolvedTempRoot).startsWith(
        "childcare-release-worktree-"
      )
    ) {
      fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
    }
  };

  try {
    runGit(
      ["worktree", "add", "--detach", worktreePath, normalizedCommitSha],
      repoRoot,
      gitContext
    );
    worktreeRegistered = true;
    const checkedOutCommit = normalizeCommitSha(
      runGit(["rev-parse", "HEAD"], worktreePath, gitContext)
    );
    if (checkedOutCommit !== normalizedCommitSha) {
      throw new Error(
        "The isolated release checkout does not match the selected commit."
      );
    }
    assertIsolatedCheckoutClean(worktreePath, gitContext);
    return {
      commitSha: normalizedCommitSha,
      worktreePath,
      checkoutPollutionChecked: true,
      assertCheckoutClean: () =>
        assertIsolatedCheckoutClean(worktreePath, gitContext),
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
