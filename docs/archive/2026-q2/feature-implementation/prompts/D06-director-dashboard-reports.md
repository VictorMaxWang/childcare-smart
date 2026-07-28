# D06 Director Dashboard Reports

你现在执行 D06：园长端。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D01-result.json`
- `docs/feature-audit/findings/C12-director.*`
- `docs/feature-audit/findings/C13-chat-communication.*`
- `docs/feature-audit/findings/C14-health-materials.*`
- `docs/feature-audit/findings/C15-persistence-submit.*`
- `docs/feature-audit/findings/C20-api-mock-visual-only.*`
- `app/admin/page.tsx`
- `app/admin/agent/page.tsx`
- `components/admin/*`
- `components/weekly-report/*`

## 任务范围

只处理 D06-G01 到 D06-G03。

补齐：

- 看板数据使用当前 snapshot 聚合。
- AI 助手建议基于当前数据，fallback 可追踪。
- 周报/报表基于记录生成。
- 家长反馈处理状态保存。
- 风险项处理状态保存。

## 要求

- 必须调用 D01 公共数据 API。
- 可以使用 subagents 做只读定位。
- 实际修改代码。
- 不直接修改 `IMPLEMENTATION_STATUS.md`。
- 写 `results/D06-result.json` 和 `results/D06-result.md`。
- 运行 `npm run lint`、`npm run build`。
- 使用 Playwright 或 Browser Use 验证园长处理反馈/风险后刷新仍保留。

