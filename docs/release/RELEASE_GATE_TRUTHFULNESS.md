# 发布门禁真实性

## 结论口径

发布结论只认 `npm run release:go:all`。该命令现在等价于正式门禁，
必须同时拿到以下非跳过证据后才以 `0` 退出：

1. 本地 lint、类型检查、构建、Node/Python 测试与 release Playwright 套件通过。
2. 两个 normal-session 关键规格实际执行，没有 `skip`、`flaky` 或失败。
3. 远端部署健康、提交 SHA、受保护会话、状态数据和 provider 状态通过。
4. 生产站现有三账号和新建三账号两条链路都执行，允许写入且要求 live AI。
5. 严格 `npm run db:check` 在本次正式门禁中重新执行，并生成通过的新鲜 SQL 证据。

任一报告缺失、过期、目标 URL 不一致或关键测试被跳过，正式门禁都以非零退出。

## 命令分层

| 命令 | 用途 | 允许真实账号测试跳过 | 可作为生产发布证据 |
| --- | --- | --- | --- |
| `npm run test:browser:release` | 严格浏览器回归 | 否 | 仅作为正式门禁的一部分 |
| `npm run test:browser:release:local` | 无数据库凭据的本地开发回归 | 显式允许 | 否 |
| `npm run release:gate:local` | 本地开发门禁 | 显式允许 | 否 |
| `npm run release:gate:strict` | 严格本地门禁 | 否 | 仅作为正式门禁的一部分 |
| `npm run release:go:remote` | 远端健康和受保护 API 检查 | 不包含三账号 smoke | 否 |
| `npm run release:gate:real` | 正式生产三账号 smoke | 否 | 仅作为正式门禁的一部分 |
| `npm run release:go:all` | 完整正式发布门禁 | 否 | 是 |

本地 opt-out 成功时，控制台会打印 `[LOCAL-ONLY]`，报告中的
`productionValidated` 必须为 `false`。这表示本地可继续开发，不表示生产闭环通过。

## 正式环境

先执行 `npm run release:env:init` 创建未提交的 `.env.release`，再填写真实值。
正式门禁除远端检查变量外，还要求：

- `REAL_SMOKE_BASE_URL` 与 `RELEASE_BASE_URL` 指向同一部署。
- `REAL_SMOKE_ALLOW_WRITES=1`。
- `REAL_SMOKE_MODE=all`。
- `REAL_SMOKE_REQUIRE_LIVE_AI=1`。
- 三个现有 normal 账号各自的手机号和密码。

使用 `npm run release:env:check:formal` 做只读预检。脚本只输出变量名和错误原因，
不会输出密码、cookie 或 API Key 的值。

## 证据文件

- `artifacts/release-browser/policy-strict.json`
- `artifacts/release-gate.strict.json`
- `artifacts/release-report.remote.json`
- `artifacts/real-smoke/formal-report.json`
- `artifacts/release-sql-check.json`
- `artifacts/release-gate.formal.json`

`npm run release:status` 和 `npm run release:ready` 默认只读取上述正式证据。
旧版 local 报告或仅部分 smoke 的通过结果不会被提升为 `GO`。
手工创建或复用旧版 `release-sql-check.json` 同样不会被正式门禁接受。

## 可重复的脚本级验证

`npm run test:release-scripts` 使用合成 Playwright JSON 验证以下规则：

- 正式模式遇到关键测试 `skip` 必须失败。
- 本地显式 opt-out 可以通过，但不能标记为生产已验证。
- 关键测试缺失、失败或 flaky 时，即使 opt-out 也必须失败。
- 正式生产环境必须启用写入、live AI、`mode=all`，并使用相同目标 URL。

本地与正式 Playwright 门禁会占用产品测试配置的 `3330` 端口，不应并行运行。
