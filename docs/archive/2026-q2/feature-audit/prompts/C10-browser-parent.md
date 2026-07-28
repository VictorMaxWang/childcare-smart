# C10 Browser Use：家长端功能完整性审计

你执行 C10，只审计家长端，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C10-parent.json`
- Markdown 报告：`docs/feature-audit/findings/C10-parent.md`
- 截图/证据目录：`artifacts/feature-audit/C10-parent/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 审计范围

- Demo 账号：林妈妈。
- 路由：`/parent?child=c-1`、`/parent/agent?child=c-1`、`/parent/agent?child=c-1#feedback`、`/parent/storybook?child=c-1`、`/health`、`/growth`、`/diet`。
- 功能：家园沟通、回复/反馈、成长档案、成长绘本、健康管理、营养餐谱、日常提醒、AI 建议。

## 操作要求

1. 像真实家长一样登录、点击、填写、提交、刷新。
2. 每个主要按钮都要判断是否有真实网络请求或明确本地持久化。
3. 提交后刷新页面，判断数据是否保留。
4. 尝试换到其他账号或退出重登，判断孩子数据是否隔离。
5. 记录 console error、network request、toast、页面变化、截图。
6. 遇到固定 demo/mock 数据，要记录 `mock-only` 或 `visual-only`。

## Finding 要求

- `findingId` 使用 `C10-001` 递增。
- `role` 使用 `parent`。
- `viewport` 使用实际视口：`desktop`、`mobile` 或 `tablet`。
- `featureStatus` 必须从 `docs/feature-audit/FEATURE_STATUS_TAXONOMY.md` 选择。
- `evidence.screenshots` 写相对路径，例如 `artifacts/feature-audit/C10-parent/feedback-submit.png`。
- `evidence.networkRequests` 至少包含方法、URL、状态码、是否发生在点击后。
- 如果发现 fake success，必须说明刷新后实际状态。

## 报告内容

Markdown 报告包含：

- 覆盖的路线和账号。
- 发现列表，按 F0-F4 排序。
- 无 finding 的功能也要列为“已抽检未发现问题”。
- 建议先实现哪些家长端功能，按业务优先级排序。

