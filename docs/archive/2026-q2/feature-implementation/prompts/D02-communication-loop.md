# D02 Communication Loop

你现在执行 D02：家园沟通 / 聊天闭环。

## 必须读取

- `docs/feature-implementation/*`
- `docs/feature-implementation/results/D01-result.json`
- `docs/feature-audit/findings/C10-parent.*`
- `docs/feature-audit/findings/C13-chat-communication.*`
- `docs/feature-audit/findings/C15-persistence-submit.*`
- `docs/feature-audit/findings/C20-api-mock-visual-only.*`
- `docs/feature-audit/findings/C23-tests-coverage.*`
- `app/parent/agent/page.tsx`
- `components/parent/ParentStructuredFeedbackComposer.tsx`
- `app/teacher/agent/page.tsx`
- `app/admin/page.tsx`

## 任务范围

只处理 D02-G01 到 D02-G04。

实现闭环：

- 家长提交消息或反馈。
- 教师按班级和 childId 查看。
- 教师回复并持久化。
- 家长刷新后查看回复。
- 园长查看反馈汇总和处理状态。
- AI 建议只能作为辅助文案，不伪装为已发送。

## 要求

- 必须调用 D01 公共数据 API，不重新定义 localStorage key。
- 可以使用 subagents 做只读定位。
- 实际修改代码。
- 不直接修改 `IMPLEMENTATION_STATUS.md` 或 `INCOMPLETE_FEATURES.json`。
- 写 `results/D02-result.json` 和 `results/D02-result.md`。
- 运行 `npm run lint`、`npm run build`。
- 使用 Playwright 或 Browser Use 验证：家长发唯一 token、教师回复、家长刷新可见、其他班教师不可见。

