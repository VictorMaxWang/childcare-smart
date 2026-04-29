# F10 Fix Login

你现在执行 F10：登录与示例账号修复。

## 必修 bugId

- 无独立非越权登录 bugId。

本线程只做 F00 完成后的登录回归和必要的小范围登录修复。不要处理 F00 的权限核心问题，也不要处理其他角色业务 bug。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/REAL_USER_SCENARIOS.md`
- `docs/bug-bash/BROWSER_USE_GUIDE.md`
- `artifacts/bug-bash/B10/b10-smoke-results.json`
- `package.json`

## 修复范围

- `/login`
- `/auth/login`
- 普通登录表单
- 密码显隐
- 注册弹窗打开/关闭
- 示例账号 UI
- 登录成功后的非越权跳转

## 约束

- 只能在 F00 完成后执行。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- 如果没有代码改动，写 no-op 结果并附验证证据。
- 不要改变角色权限策略，发现权限问题时记录为 F00 依赖或回归。

## 验证

- 用 Browser Use 或 Playwright 覆盖登录页桌面和移动端。
- 验证普通登录错误提示、密码显隐、注册弹窗、四个示例账号入口。
- 验证 F00 后的登录跳转不会破坏正常角色首页。
- 运行必要检查。

## 输出

- 写入 `docs/bug-bash/fix-results/F10-result.md`。
- 写入 `docs/bug-bash/fix-results/F10-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
