# D05 Health Material Consultation

你现在执行 D05：健康材料解析 / 高风险会诊。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D01-result.json`
- `docs/feature-audit/findings/C14-health-materials.*`
- `docs/feature-audit/findings/C11-teacher.*`
- `docs/feature-audit/findings/C15-persistence-submit.*`
- `docs/feature-audit/findings/C20-api-mock-visual-only.*`
- `docs/feature-audit/findings/C23-tests-coverage.*`
- `app/teacher/health-file-bridge/page.tsx`
- `app/teacher/high-risk-consultation/page.tsx`
- `app/api/ai/health-file-bridge/route.ts`
- `app/api/ai/high-risk-consultation/*`
- `components/consultation/*`

## 任务范围

只处理 D05-G01 到 D05-G05。

补齐：

- 文件选择和基本校验。
- demo 解析任务状态。
- 解析结果保存。
- 会诊创建、查看、备注、状态更新。
- 教师端和园长端基于同一条会诊数据展示。
- 高风险同步提示必须对应真实持久化结果。

## 要求

- 必须调用 D01 公共数据 API。
- 可以使用 subagents 做只读定位。
- 实际修改代码。
- 不直接修改 `IMPLEMENTATION_STATUS.md`。
- 写 `results/D05-result.json` 和 `results/D05-result.md`。
- 运行 `npm run lint`、`npm run build`。
- 使用 Playwright 或 Browser Use 验证解析任务、会诊保存、刷新、园长端可见。

