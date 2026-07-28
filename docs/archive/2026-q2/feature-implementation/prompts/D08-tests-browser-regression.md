# D08 Tests Browser Regression

你现在执行 D08：测试。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D02-result.json`
- `docs/feature-implementation/results/D03-result.json`
- `docs/feature-implementation/results/D04-result.json`
- `docs/feature-implementation/results/D05-result.json`
- `docs/feature-implementation/results/D06-result.json`
- `docs/feature-implementation/results/D07-result.json`
- `docs/feature-audit/findings/C23-tests-coverage.*`
- `tests/bug-bash/real-user-smoke.spec.ts`
- `playwright.bugbash.config.ts`
- `package.json`

## 任务范围

只处理 D08-G01 到 D08-G03。

补齐自动化：

- 消息闭环测试。
- 记录持久化测试。
- child 参数测试。
- fake-success 回归测试。
- 空状态和权限测试。
- Browser Use 或 Playwright 关键路径复测。

## 要求

- 可以先创建测试框架，D02-D06 完成后补业务断言。
- 可以使用 subagents 做只读定位。
- 实际修改代码和测试。
- 如需改 `package.json`，说明原因。
- 不直接修改 `IMPLEMENTATION_STATUS.md`。
- 写 `results/D08-result.json` 和 `results/D08-result.md`。
- 运行 `npm run lint`、`npm run build`、相关 Playwright 测试。
- 如 `npm run bugbash:smoke` 被 `.next/dev/lock` 阻塞，记录阻塞，不伪装通过。

