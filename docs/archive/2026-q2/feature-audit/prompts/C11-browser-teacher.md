# C11 Browser Use：教师端功能完整性审计

你执行 C11，只审计教师端，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C11-teacher.json`
- Markdown 报告：`docs/feature-audit/findings/C11-teacher.md`
- 截图/证据目录：`artifacts/feature-audit/C11-teacher/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 审计范围

- Demo 账号：李老师、周老师。
- 路由：`/teacher`、`/teacher/home`、`/teacher/agent`、`/teacher/high-risk-consultation`、`/teacher/health-file-bridge`、`/children`、`/health`、`/growth`、`/diet`。
- 功能：教师工作台、记录提交、草稿确认、语音/文本 AI 助手、高风险会诊、健康材料入口、家园沟通入口、班级数据范围。

## 操作要求

1. 分别登录李老师和周老师，检查班级、孩子、记录是否隔离。
2. 点击教师端所有主要动作：新增、保存、确认、生成、转办、反馈、上传入口。
3. 记录点击后是否有 POST/PUT/PATCH/DELETE 或明确持久化。
4. 刷新后验证状态是否保留。
5. 捕获 console error、network request、失败响应和截图。
6. 特别检查 classId、teacherId、childId 是否像是硬编码或跨账号共享。

## Finding 要求

- `findingId` 使用 `C11-001` 递增。
- `role` 使用 `teacher`。
- `demoAccount` 使用 `李老师` 或 `周老师`。
- 权限/班级范围问题优先标记为 `permission-incomplete`，严重程度按数据风险评估。
- 如果按钮看起来可用但没有真实行为，标记 `ui-only` 或 `fake-success`。

## 报告内容

Markdown 报告包含：

- 两个教师账号分别覆盖的路线。
- 班级隔离和数据范围结论。
- 发现列表，按 F0-F4 排序。
- 建议先实现哪些教师端功能。

