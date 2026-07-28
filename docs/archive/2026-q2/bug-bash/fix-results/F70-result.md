# F70 修复结果

## 处理 bugId

- `BUG-B20-001`
- `BUG-B20-002`

## 修复摘要

- 新增 `npm run typecheck`，固定为 `tsc --noEmit --pretty false --incremental false`。
- `test:parent-message-mapper` 改为通过 `node:module.register()` 注册现有 TS/path alias loader，Node native test runner 可解析 `@/*` 和 `.ts`。
- 修正 parent message mapper 旧断言，改为当前中文输出标签。
- 修正测试与截图 fixture 的类型漂移，包括当前 union literal、结构化反馈、绘本 provider meta、干预卡、园长首页模型、健康文件桥接、截图 manifest 统计等。
- 对少量生产文件只做类型窄化或缺失 prop 补齐，未改业务流程。
- `bugbash:smoke` 增加 preflight：支持 `BUGBASH_BASE_URL`、`BUGBASH_SKIP_WEBSERVER`、`BUGBASH_PORT`，检测 `.next/dev/lock` 时不抢占启动 dev server，并在服务不可达时输出清晰错误。
- `playwright.bugbash.config.ts` 在显式 `BUGBASH_BASE_URL`、skip webserver 或 dev lock 存在时禁用 `webServer`，否则按 `BUGBASH_PORT || 3330` 启动。

## 检查结果

- `npm run lint`：通过。
- `npm run build`：通过。
- `npx tsc --noEmit`：通过。
- `npx --no-install tsc --noEmit --pretty false --incremental false`：通过。
- `npm run typecheck`：通过。
- `npm run test:parent-message-mapper`：通过，4/4。
- `npm run bugbash:smoke`：未设置 env 时被 preflight 截停；`.next/dev/lock` 存在且 `http://127.0.0.1:3330/login` 不可达，输出了复用已有服务的 PowerShell 示例。这是预期的工具链行为。
- `$env:BUGBASH_BASE_URL='http://127.0.0.1:3000'; npm run bugbash:smoke`：成功复用已有服务并进入 Playwright；最终失败于 B26 smoke 既有非 F70 问题，共 13 条，证据在 `artifacts/bug-bash/B26/b26-smoke-results.json`。

## 状态更新

- `BUG-B20-001`：fixed。
- `BUG-B20-002`：fixed。
- `BUG-B26-001`、`BUG-B26-002`、`BUG-B26-003`：保持 duplicate，本线程未新增 bug、未修改 `BUGS.md` 或 `BUGS.json`。

## 遗留说明

- `bugbash:smoke` 复用模式仍因 B26 业务/运行时残留失败：当前结果包含 parent `/api/ai/suggestions` 500（标注 duplicateOf `BUG-002`）以及 teacher duplicate key 控制台错误。这些不属于 F70 分配范围。
- `.next/dev/lock` 仍存在，说明本机已有 dev server；F70 修复点是避免强抢该 lock，并提供 `BUGBASH_BASE_URL` 复用路径。
