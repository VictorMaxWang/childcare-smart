# C14 Browser Use：健康材料解析与高风险会诊审计

你执行 C14，只审计健康材料、健康管理和高风险会诊，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C14-health-materials.json`
- Markdown 报告：`docs/feature-audit/findings/C14-health-materials.md`
- 截图/证据目录：`artifacts/feature-audit/C14-health-materials/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 审计范围

- Demo 账号：李老师、周老师、陈园长，必要时林妈妈。
- 路由：`/teacher/health-file-bridge`、`/teacher/high-risk-consultation`、`/health`、`/admin`、`/admin/agent`。
- 功能：健康材料上传、OCR/解析、解析结果确认、健康记录入库、高风险会诊 feed/stream/follow-up、风险状态流转。

## 操作要求

1. 打开健康材料页面，尝试上传或触发解析入口。
2. 记录是否有真实 upload 请求、文件 payload、解析请求和响应。
3. 检查解析结果是否可保存或进入健康记录。
4. 打开高风险会诊，检查 feed、stream、follow-up 是否真实请求。
5. 尝试处理/转办/确认会诊动作，刷新后验证状态。
6. 记录 Brain proxy fallback、本地 mock、固定 demo 风险数据。

## Finding 要求

- `findingId` 使用 `C14-001` 递增。
- 健康材料上传无真实上传时标记 `ui-only` 或 `backend-missing`。
- 解析结果只能展示不能保存时标记 `partial` 或 `not-persisted`。
- 高风险数据跨班级/跨角色不正确时标记 `permission-incomplete`。

## 报告内容

Markdown 报告包含：

- 上传、解析、保存、会诊四段链路的完整性结论。
- 所有发现按 F0-F4 排序。
- 建议先实现哪些健康和会诊功能。

