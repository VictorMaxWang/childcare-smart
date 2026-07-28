# F20 园长端修复结果

## 分配 bugId

- BUG-001
- BUG-B11-001
- BUG-B11-002
- BUG-B11-003
- BUG-B11-005
- BUG-B21-003
- BUG-B21-004
- BUG-B25-002

## 已修复 bugId

- BUG-001
- BUG-B11-001
- BUG-B11-002
- BUG-B11-003
- BUG-B11-005
- BUG-B21-003
- BUG-B21-004
- BUG-B25-002

## 未修复 bugId

- 无

## 园长端修复摘要

- `/api/admin/notification-events` 在本地/数据库不可用时返回 `200 + { available:false, items:[] }`，保留 401/403 权限语义，避免园长首页和 AI 助手出现 503。
- 园长导航改为 query-aware：`/admin/agent` 仅高亮 AI 助手，`/admin/agent?action=weekly-report` 仅高亮周报分析；同步桌面侧边栏、移动菜单、底栏和面包屑标题。
- 园长首页“刷新数据”改为真实刷新按钮，保持在 `/admin` 并重新拉取周报摘要；核心 KPI 卡片接入真实下钻链接 `/children`、`/health`、`/diet`、`/growth`。
- 园长首页、AI 助手、周报页移除静态 `weeklyPendingRows`、`assignedObjects`、`childArchiveRows`、`classDistribution` 等 mock 兜底展示，改用真实派生数据和明确空状态。
- 导出周报、分享周报、使用说明、批量派单、反馈详情等无真实逻辑入口改为 disabled，并显示“暂未开放”。
- AI 助手增加真实受控输入框，非空输入后启用发送按钮并触发 `question-follow-up`。
- 家园反馈计数改为真实 `completed / expected`，并避免完成数大于应完成对象数。
- demo scoped localStorage 的核心记录数组被清空时允许渲染真实 0 值，不再被 demo 校验或 mock 数据覆盖。

## 陈园长复测

- 首页：通过。页面非空；刷新数据后仍在 `/admin`；指标卡可进入 `/children`、`/health`、`/diet`、`/growth`。
- AI 助手：通过。`/admin/agent` 仅 AI 助手高亮；真实输入框可输入，自定义追问触发 `question-follow-up`。
- 周报/报表：通过。`/admin/agent?action=weekly-report` 仅周报分析高亮；重新生成周报按钮可用。
- visual-only 标识：通过。导出、分享、使用说明、批量派单、反馈详情均 disabled，并显示“暂未开放”。
- 空/零状态：通过。清空 demo scoped localStorage 记录数组后，首页显示出勤 0、晨检 0、饮食覆盖 0、成长关注 0、家园反馈 0，不再展示假繁荣数据。

## 复测证据

- Browser Use：已尝试，受本机 Node `v22.20.0` 限制；`node_repl` 要求 `>= v22.22.0`，因此使用 Playwright fallback。
- Playwright fallback：通过，证据文件 `artifacts/bug-bash/fixes/F20/playwright-evidence.json`。
- `/api/admin/notification-events`：复测期间同源请求状态均为 200，无 503。
- 浏览器复测：consoleErrors=0，pageErrors=0，serverErrors=0。

## 修改文件

### 新增

- `docs/bug-bash/fix-results/F20-result.md`
- `docs/bug-bash/fix-results/F20-result.json`

### 修改

- `app/admin/page.tsx`
- `app/admin/agent/page.tsx`
- `app/api/admin/notification-events/contract.ts`
- `components/Navbar.tsx`
- `components/MobileNav.tsx`
- `components/admin/pixel-replica/DirectorDashboardReplica.tsx`
- `components/admin/pixel-replica/DirectorAgentReplica.tsx`
- `components/admin/pixel-replica/DirectorWeeklyReportReplica.tsx`
- `components/admin/pixel-replica/DirectorReplicaPrimitives.tsx`
- `lib/agent/admin-agent.ts`
- `lib/agent/admin-types.ts`
- `lib/navigation/primary-nav.ts`
- `lib/store.tsx`

## 检查结果

- `npm run lint`：通过
- `npm run build`：通过
