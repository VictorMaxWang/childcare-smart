# D07 Shared Actions Visual Only Cleanup

你现在执行 D07：共享操作和 visual-only 清理。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D02-result.json`
- `docs/feature-implementation/results/D03-result.json`
- `docs/feature-implementation/results/D04-result.json`
- `docs/feature-implementation/results/D05-result.json`
- `docs/feature-implementation/results/D06-result.json`
- `docs/feature-audit/findings/C20-api-mock-visual-only.*`
- `docs/feature-audit/findings/C22-actions-buttons-forms.*`
- `docs/bug-bash/BUGS.json`
- `components/ui/*`

## 任务范围

只处理 D07-G01 到 D07-G04。

清理：

- fake-success。
- ui-only button。
- 表单提交。
- 弹窗/抽屉操作。
- visual-only 标识或替换。
- shared pages 行为一致性。

## 要求

- 优先在 D02-D06 完成后执行。
- 必须调用 D01 公共数据 API，不创建第二套持久化。
- 可以使用 subagents 做只读定位。
- 实际修改代码。
- 不直接修改 `IMPLEMENTATION_STATUS.md`。
- 写 `results/D07-result.json` 和 `results/D07-result.md`。
- 运行 `npm run lint`、`npm run build`。
- 使用 Playwright 或 Browser Use 验证 fake-success 失败态：断开写入接口时不能显示远端成功。

