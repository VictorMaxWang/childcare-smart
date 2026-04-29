# F70 Fix Tooling Tests TypeScript

你现在执行 F70：测试、脚本、TypeScript、路径别名、自动化工具修复。

## 必修 bugId

- `BUG-B20-001`
- `BUG-B20-002`

只处理 F70 分配 bugId。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/BUGS.md`
- `artifacts/bug-bash/B20/summary.md`
- `artifacts/bug-bash/B20/command-results.json`
- `artifacts/bug-bash/B26/b26-smoke-results.json`
- `playwright.bugbash.config.ts`
- `package.json`
- `tsconfig.json`

## 修复范围

- Direct `tsc --noEmit` drift across tests/capture scripts.
- Node native test runner `@/lib` alias resolution for `npm run test:parent-message-mapper`.
- `bugbash:smoke` stability and documented use of `BUGBASH_BASE_URL`.
- `.next/dev/lock` behavior when a dev server already runs.
- Playwright bugbash config and test command documentation.

## 约束

- 只能在 F00 完成后并行执行。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- Keep test/tooling changes scoped; do not modify product behavior unless required to expose stable test contracts.
- If changing scripts used by other fix threads, record conflict risk and migration notes.

## 验证

- Run `npm run lint`.
- Run `npm run build`.
- Run direct `.\node_modules\.bin\tsc.cmd --noEmit --pretty false --incremental false` or document remaining intentional failures.
- Run `npm run test:parent-message-mapper`.
- Run `BUGBASH_BASE_URL=http://127.0.0.1:3000 npm run bugbash:smoke` when a local server is available; otherwise document why not.

## 输出

- 写入 `docs/bug-bash/fix-results/F70-result.md`。
- 写入 `docs/bug-bash/fix-results/F70-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
