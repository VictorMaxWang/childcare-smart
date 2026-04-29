# F50 Fix Shared Interactions

你现在执行 F50：共享业务页、表单、按钮、弹窗、状态修复。

## 必修 bugId

- `BUG-B11-006`
- `BUG-B22-001`
- `BUG-B22-003`

只处理 F50 分配 bugId。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/BUGS.md`
- `artifacts/bug-bash/B11/B11-targeted-interactions.json`
- `artifacts/bug-bash/B22/forms-modals-buttons-scan.md`
- `package.json`

## 修复范围

- `/children` 儿童档案详情/编辑入口。
- `/health` 晨检弹窗非法体温/空体温校验。
- authenticated shell 顶部搜索、通知、消息图标按钮。
- 通用表格、表单、弹窗、抽屉和 visual-only 可点击误导。

## 约束

- F50 必须串行执行，在 F10/F20/F30/F40/F70 完成后开始。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- 如果改动共享 shell、表单组件或业务记录模型，记录冲突风险。
- 不要修复 F60 的样式/资源问题，除非是完成当前交互必需。

## 验证

- 用 Browser Use 或 Playwright 覆盖陈园长 `/children` 和 `/health` 关键交互。
- 验证非法体温不能保存为 `NaN`，并有明确错误提示。
- 验证儿童姓名/详情入口有明确行为。
- 验证顶部图标按钮有行为、禁用态或明确反馈。
- 运行必要检查。

## 输出

- 写入 `docs/bug-bash/fix-results/F50-result.md`。
- 写入 `docs/bug-bash/fix-results/F50-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
