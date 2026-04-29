# F40 Fix Parent

你现在执行 F40：家长端修复。

## 必修 bugId

- `BUG-002`
- `BUG-003`
- `BUG-014`
- `BUG-015`
- `BUG-016`
- `BUG-019`
- `BUG-B21-001`
- `BUG-B23-003`
- `BUG-B25-003`

只处理 F40 分配 bugId。`BUG-018`、`BUG-B26-002`、`BUG-B26-003` 是 duplicate 证据，不作为独立修复项。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/BUGS.md`
- `artifacts/bug-bash/B10/b10-smoke-results.json`
- `artifacts/bug-bash/B13/B13-observations.json`
- `artifacts/bug-bash/B21/visual-only-mock-scan.md`
- `artifacts/bug-bash/B23/routing-auth-permission-scan.md`
- `artifacts/bug-bash/B25/data-state-empty-error-scan.md`
- `artifacts/bug-bash/B26/b26-smoke-results.json`
- `package.json`

## 修复范围

- 家长首页 `/parent`。
- 家长 AI `/parent/agent` 和 `#feedback`。
- 成长绘本 `/parent/storybook`。
- `/api/ai/suggestions`、`/api/ai/parent-storybook`、follow-up API 的 demo-safe fallback 或错误处理。
- demoSeed 自动进入真实请求、storybook child query canonicalization、反馈 child 身份错配、内部 demo copy 暴露。

## 约束

- 只能在 F00 完成后并行执行。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- 不要把 demo/mock 数据发送到真实持久化或真实 AI 请求路径，除非显式 demo/dev 模式。
- 如果改动 parent AI API payload、storybook cache 或 feedback composer props，记录冲突风险。

## 验证

- 用 Browser Use 或 Playwright 以林妈妈覆盖 `/parent`、`/parent/agent?child=c-1#feedback`、`/parent/storybook?child=c-1`。
- 验证 suggestions、storybook、follow-up 不再在正常路径暴露 500/503。
- 验证 feedback hash 在桌面和移动端落到反馈区域且不被底部导航遮挡。
- 验证 URL child 与页面 child 文案及提交 payload 一致。
- 运行必要检查。

## 输出

- 写入 `docs/bug-bash/fix-results/F40-result.md`。
- 写入 `docs/bug-bash/fix-results/F40-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
