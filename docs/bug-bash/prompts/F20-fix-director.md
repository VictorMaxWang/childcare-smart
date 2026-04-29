# F20 Fix Director

你现在执行 F20：园长端修复。

## 必修 bugId

- `BUG-001`
- `BUG-B11-001`
- `BUG-B11-002`
- `BUG-B11-003`
- `BUG-B11-005`
- `BUG-B21-003`
- `BUG-B21-004`
- `BUG-B25-002`

只处理 F20 分配 bugId。`BUG-B22-004` 是 `BUG-B21-004` 的 duplicate，只保留为证据，不作为独立修复项。

## 读取

- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/BUGS.md`
- `artifacts/bug-bash/B11/B11-exploration-results.json`
- `artifacts/bug-bash/B21/visual-only-mock-scan.md`
- `artifacts/bug-bash/B25/data-state-empty-error-scan.md`
- `artifacts/bug-bash/B26/b26-smoke-results.json`
- `package.json`

## 修复范围

- 园长首页 `/admin`。
- 园长 AI 助手 `/admin/agent`。
- 周报/报表入口和 query 状态。
- `/api/admin/notification-events` 本地/demo fallback 或前端错误处理。
- 园长 replica 静态 mock 数据、过期日期、0/空状态覆盖。
- 导出/分享/使用说明等无 handler 按钮。
- 园长首页数据卡下钻或非交互态。

## 约束

- 只能在 F00 完成后并行执行。
- 不要直接修改 `BUGS.md` 或 `BUGS.json`；结果交给 F90 合并。
- 如果修改共享导航、API fallback 或 pixel replica 公共 primitive，记录冲突风险。
- 不要修复教师、家长或共享表单问题。

## 验证

- 用 Browser Use 或 Playwright 以陈园长覆盖 `/admin`、`/admin/agent`、周报入口。
- 验证无 503 console/network 暴露，AI 输入可编辑并可发送或有明确可用状态。
- 验证 no-op 按钮有真实行为、禁用态或明确反馈。
- 验证真实 0/空状态不会被 mock 覆盖。
- 运行必要检查。

## 输出

- 写入 `docs/bug-bash/fix-results/F20-result.md`。
- 写入 `docs/bug-bash/fix-results/F20-result.json`。
- JSON 至少包含 `threadId`、`bugIds`、`statusByBugId`、`changedFiles`、`checksRun`、`browserOrPlaywrightEvidence`、`unfixedReasons`、`conflictRisks`。
