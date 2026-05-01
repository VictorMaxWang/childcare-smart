# D03 Teacher Records

你现在执行 D03：教师记录闭环。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D01-result.json`
- `docs/feature-audit/findings/C11-teacher.*`
- `docs/feature-audit/findings/C15-persistence-submit.*`
- `docs/feature-audit/findings/C20-api-mock-visual-only.*`
- `docs/feature-audit/findings/C22-actions-buttons-forms.*`
- `app/health/page.tsx`
- `app/diet/page.tsx`
- `app/growth/page.tsx`
- `components/teacher/*`

## 任务范围

只处理 D03-G01 到 D03-G04。

补齐：

- 晨检记录保存、编辑、刷新持久化。
- 饮食记录保存、营养评价结果保存。
- 成长记录保存、编辑、家长端只读可见。
- 教师 AI 草稿和 mobile draft 的 local-only/remote 边界。

## 要求

- 必须调用 D01 公共数据 API。
- 可以使用 subagents 做只读定位。
- 实际修改代码。
- 不直接修改 `IMPLEMENTATION_STATUS.md`。
- 写 `results/D03-result.json` 和 `results/D03-result.md`。
- 运行 `npm run lint`、`npm run build`。
- 使用 Playwright 或 Browser Use 验证记录保存后刷新仍存在，家长端可见授权 child 记录。

