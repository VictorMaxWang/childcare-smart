# D04 Parent Features

你现在执行 D04：家长端功能补齐。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D01-result.json`
- `docs/feature-audit/findings/C10-parent.*`
- `docs/feature-audit/findings/C20-api-mock-visual-only.*`
- `docs/feature-audit/findings/C22-actions-buttons-forms.*`
- `docs/feature-audit/findings/C23-tests-coverage.*`
- `app/parent/page.tsx`
- `app/parent/agent/page.tsx`
- `app/parent/storybook/page.tsx`
- `components/parent/*`
- `app/children/page.tsx`
- `app/health/page.tsx`
- `app/diet/page.tsx`
- `app/growth/page.tsx`

## 任务范围

只处理 D04-G01 到 D04-G05。

补齐：

- 家长首页基于 child-scoped 演示数据。
- 成长档案、成长记录详情和空状态。
- 成长绘本保存、分享、导出或明确禁用/标识。
- 家长健康管理和营养餐谱只读视角。
- 日常提醒状态持久化。
- child 参数正确传递和未授权 child 拒绝。

## 要求

- 必须调用 D01 公共数据 API。
- 可以使用 subagents 做只读定位。
- 实际修改代码。
- 不直接修改 `IMPLEMENTATION_STATUS.md`。
- 写 `results/D04-result.json` 和 `results/D04-result.md`。
- 运行 `npm run lint`、`npm run build`。
- 使用 Playwright 或 Browser Use 验证 `child=c-1` 正确、未授权 child 不提交、刷新后提醒/绘本状态正确。

