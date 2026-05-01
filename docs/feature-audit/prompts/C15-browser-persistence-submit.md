# C15 Browser Use：提交、保存、上传、持久化抽检

你执行 C15，横向审计主要提交类动作，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C15-persistence-submit.json`
- Markdown 报告：`docs/feature-audit/findings/C15-persistence-submit.md`
- 截图/证据目录：`artifacts/feature-audit/C15-persistence-submit/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 审计范围

- Demo 账号：林妈妈、李老师、周老师、陈园长。
- 路由：所有主要角色入口和提交类页面，重点 `/parent/agent`、`/parent/storybook`、`/teacher/agent`、`/teacher/health-file-bridge`、`/teacher/high-risk-consultation`、`/admin/agent`、`/admin/agent?action=weekly-report`。
- 功能：提交、保存、上传、确认、生成、回复、反馈、标记、刷新持久化。

## 操作要求

1. 建立一张提交动作清单：按钮文本、路由、账号、预期结果。
2. 每个动作至少抽检：点击前状态、点击后网络、反馈提示、刷新后状态。
3. 将 `toast 成功但无请求`、`set state 后刷新丢失`、`请求失败仍显示成功` 优先记录。
4. 覆盖桌面视口；至少抽检一个移动视口提交动作。
5. 不要修按钮、表单或接口，只记录。

## Finding 要求

- `findingId` 使用 `C15-001` 递增。
- `featureArea` 按实际功能命名，例如 `weekly-report`、`storybook`、`health-upload`。
- `dataPersistenceResult` 必须明确：`persisted`、`lost-after-refresh`、`no-submit`、`unknown` 或 `not-applicable`。
- `apiIntegrationResult` 必须明确：`real-api`、`mock-only`、`no-api`、`local-state-only` 或 `unknown`。

## 报告内容

Markdown 报告包含：

- 提交动作清单和抽检结果。
- fake success 与 not-persisted 的高优先级列表。
- 建议先实现哪些提交/持久化闭环。

