# C12 Browser Use：园长端功能完整性审计

你执行 C12，只审计园长端，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C12-director.json`
- Markdown 报告：`docs/feature-audit/findings/C12-director.md`
- 截图/证据目录：`artifacts/feature-audit/C12-director/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 审计范围

- Demo 账号：陈园长。
- 路由：`/admin`、`/admin/agent`、`/admin/agent?action=weekly-report`、`/children`、`/health`、`/growth`、`/diet`。
- 功能：管理看板、AI 助手、周报、风险看板、通知事件、管理动作、跨班级数据范围。

## 操作要求

1. 登录陈园长，检查管理看板指标是否来自真实接口或固定展示。
2. 操作 AI 助手和周报生成，记录请求、响应、fallback 和刷新后状态。
3. 点击管理看板中的风险、通知、任务、周报相关按钮。
4. 检查是否只是 pixel replica、visual-only 或 mock-only。
5. 记录 Brain proxy fallback、接口 500/503、toast 成功和真实状态差异。
6. 刷新后验证周报、管理动作和通知状态是否保留。

## Finding 要求

- `findingId` 使用 `C12-001` 递增。
- `role` 使用 `director`。
- `demoAccount` 使用 `陈园长`。
- 园长端看板如果只来自 replica/static data，标记 `visual-only` 或 `mock-only`。
- 周报/AI 助手如果 fallback 后可展示但无真实后端，标记 `backend-missing` 或 `partial`。

## 报告内容

Markdown 报告包含：

- 管理看板、AI 助手、周报分别的真实接入结论。
- 所有发现按 F0-F4 排序。
- 建议先实现哪些园长端功能。

