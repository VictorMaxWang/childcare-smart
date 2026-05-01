# D99 Final Functional Regression

你现在执行 D99：最终功能回归。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/*.json`
- `docs/feature-implementation/results/*.md`
- `docs/bug-bash/REAL_USER_SCENARIOS.md`
- `tests/bug-bash/real-user-smoke.spec.ts`
- `package.json`

## 任务范围

- 不再做大规模功能开发。
- 只做阻塞级回归修复和测试补证。
- 验证 D02-D07 业务闭环。

## 必测路径

- 家长消息 -> 教师回复 -> 家长刷新查看。
- 教师晨检/饮食/成长保存 -> 刷新 -> 家长查看。
- 健康材料解析 -> 会诊创建 -> 园长查看 -> 状态处理。
- 园长周报/看板基于当前记录。
- 未授权角色不可见。
- fake-success 失败态。
- mobile 390x844 关键路径无横向溢出。

## 要求

- 可以使用 subagents 做测试执行和结果汇总。
- 运行 `npm run lint`、`npm run build`、`npm run bugbash:smoke`。
- 使用 Playwright 或 Browser Use 复测关键路径。
- 写 `docs/feature-implementation/results/D99-result.json` 和 `D99-result.md`。
- 最终报告不能把失败伪装成通过。

