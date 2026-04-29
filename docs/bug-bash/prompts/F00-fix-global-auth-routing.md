# F00 Fix Global Auth Routing

你现在执行 F00：全局 P0/P1、权限、路由安全、越权修复。

## 必修 bugId

- `BUG-011`
- `BUG-012`
- `BUG-013`
- `BUG-B23-001`
- `BUG-B23-002`

只处理 `docs/bug-bash/BUG_FIX_PLAN.md` 分配给 F00 的 bugId。不要顺手修复其他问题。

## 读取

- `docs/bug-bash/BUGS.md`
- `docs/bug-bash/BUGS.json`
- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `artifacts/bug-bash/B15/b15-run-results.json`
- `artifacts/bug-bash/B23/routing-auth-permission-scan.md`
- `package.json`

## 修复范围

- 为 `/admin`、`/teacher`、`/parent` 及其角色子路径增加一致的角色边界。
- 修复 director/teacher/parent 直接访问其他角色工作台的问题。
- 修复 `/login?next=...`、demo login、普通 login、register 后跳转到越权页面的问题。
- 修复 teacher 菜单或根路径进入全园数据视图的权限问题。
- 未授权访问应重定向到当前用户角色首页，或展示一致的权限拒绝态；选择一种并保持全站一致。

## 约束

- 本线程必须单独执行，完成后才能启动 F10/F20/F30/F40/F70。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；修复结果交给 F90 合并。
- 如果需要修改共享 auth/navigation 文件，记录所有潜在冲突风险。
- 不要改变与权限无关的 UI、文案或业务逻辑。

## 验证

- 运行必要的 lint/build 或更小范围检查。
- 用 Browser Use 或 Playwright 覆盖四个示例账号：
  - director 不能打开 `/teacher`、`/parent`。
  - teacher 不能打开 `/admin`、`/parent`。
  - parent 不能打开 `/admin`、`/teacher`。
  - `/login?next=/admin`、`/login?next=/teacher`、`/login?next=/parent` 不会把错误角色送入越权页面。
- 记录截图、trace 或命令输出路径。

## 输出

- 写入 `docs/bug-bash/fix-results/F00-result.md`。
- 写入 `docs/bug-bash/fix-results/F00-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
- 无法修复的 bug 必须写明原因、已验证证据和替代方案。
