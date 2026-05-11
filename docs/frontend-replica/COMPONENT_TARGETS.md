# Component Targets

## Global Shell
- `AppShell`：承接 `app/layout.tsx` 和 `components/Navbar.tsx` 的页面框架。
- `DesktopRoleNav`：复刻桌面左侧栏、顶部栏、角色身份、通知和折叠菜单。
- `MobileBottomNav`：复刻移动端底部导航和抽屉入口。
- `RoleAccessGate`：保持现有登录、权限、scope，不在 UI 复刻中绕过。

## Replica Primitives
- `ReplicaPanel`：统一白色卡片、边框、阴影、圆角、标题区。
- `ReplicaMetricCard`：KPI、趋势、状态值、环比箭头。
- `ReplicaActionCard`：快捷操作、任务入口、查看详情。
- `ReplicaStatusPill`：P0/P1/P2、健康/警告/成功/AI 标签。
- `ReplicaAvatar`：教师、家长、幼儿、机器人头像。

## Charts
- `ReplicaChartFrame`：图表标题、说明、筛选器、导出按钮、legend、空态。
- `ReplicaLineChart`、`ReplicaBarChart`、`ReplicaDonutChart`、`ReplicaComboChart`。
- 优先复用 Recharts；迷你趋势可保留 SVG，但要真实数据驱动。

## AI Assistant
- `AssistantWorkspaceFrame`：三端统一 AI 工作区布局。
- `AssistantPromptList`：预设问题、推荐动作、快捷入口。
- `AssistantConversationPanel`：真实问答、loading、error、provenance。
- `AssistantResultCard`：结构化建议、闭环动作、反馈入口。
- `AssistantRightRail`：AI 洞察、待办、上下文摘要。

## Drawers And Modals
- 使用现有 `components/ui/dialog.tsx` 和 `components/ui/drawer.tsx`。
- 统一确认弹窗、权限拒绝、批量操作、反馈详情、上传解析状态。

## Data Boundary
- 复刻组件尽量纯展示，数据来自 `lib/store.tsx`、`lib/view-models/role-home.ts`、`lib/demo-data/selectors.ts`、现有 API client。
- 不新增静态假数据替代已有 demo 数据或 API。
