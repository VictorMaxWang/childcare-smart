# C22 代码扫描：按钮、表单、上传和动作闭环审计

你执行 C22，只做代码扫描，不修业务源码。

## 输出文件

- JSON findings：`docs/feature-audit/findings/C22-actions-buttons-forms.json`
- Markdown 报告：`docs/feature-audit/findings/C22-actions-buttons-forms.md`
- 证据目录：`artifacts/feature-audit/C22-code/`

只写以上文件，不要编辑 `INCOMPLETE_FEATURES.json`。

## 扫描范围

- `app/**/page.tsx`
- `components/**`
- `lib/mobile/**`
- `lib/bridge/**`
- `lib/agent/**`
- 上传、表单、按钮、toast、drawer/dialog 相关组件。

## 搜索信号

查找：按钮无 `onClick`、表单无 `onSubmit`、`preventDefault` 后无 API、`toast.success` 与真实响应无关、`setTimeout` 模拟成功、只调用 `setState`、上传 input 没有 request、确认按钮没有 mutation、删除/保存按钮缺少错误处理。

## Finding 要求

- `findingId` 使用 `C22-001` 递增。
- `apiIntegrationResult` 对每个动作明确：`real-api`、`mock-only`、`no-api`、`local-state-only` 或 `unknown`。
- `dataPersistenceResult` 对保存/提交类动作明确。
- `evidence.sourceFiles` 写组件和页面文件。
- `evidence.codeSignals` 写具体按钮、handler、toast 或 form 代码信号。

## 报告内容

Markdown 报告包含：

- 按角色分组的按钮/表单动作清单。
- fake success、ui-only、not-persisted 高风险动作。
- 建议先实现哪些动作闭环。

