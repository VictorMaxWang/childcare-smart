# F30 Fix Teacher

你现在执行 F30：教师端修复。

## 必修 bugId

- `BUG-B12-001`
- `BUG-B21-002`
- `BUG-B21-005`
- `BUG-B22-002`
- `BUG-B22-005`
- `BUG-B22-006`
- `BUG-B22-007`
- `BUG-B25-001`

只处理 F30 分配 bugId。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/BUGS.md`
- `artifacts/bug-bash/B12/targeted-checks.json`
- `artifacts/bug-bash/B21/visual-only-mock-scan.md`
- `artifacts/bug-bash/B22/forms-modals-buttons-scan.md`
- `artifacts/bug-bash/B25/data-state-empty-error-scan.md`
- `package.json`

## 修复范围

- 教师工作台 `/teacher`。
- 教师 AI 与家园沟通 `/teacher/agent`。
- 高风险会诊 `/teacher/high-risk-consultation`。
- 健康材料解析 `/teacher/health-file-bridge`。
- mock 语音/OCR 草稿进入真实持久化队列的风险。
- visual-only 控件、重复生成、错误发送语义、真实空/零状态被 fallback 覆盖。

## 约束

- 只能在 F00 完成后并行执行。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- 如果改动 shared state、draft persistence 或 AI API 协议，记录冲突风险。
- 不要修复园长、家长或共享样式问题。

## 验证

- 用 Browser Use 或 Playwright 以李老师和周老师覆盖教师工作台、教师 AI、高风险会诊、健康材料解析。
- 验证可点击控件必须有行为、禁用态或明确反馈。
- 验证 mock draft 不会在普通真实路径进入持久化。
- 验证空/零数据状态不会显示设计稿默认数据。
- 运行必要检查。

## 输出

- 写入 `docs/bug-bash/fix-results/F30-result.md`。
- 写入 `docs/bug-bash/fix-results/F30-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
