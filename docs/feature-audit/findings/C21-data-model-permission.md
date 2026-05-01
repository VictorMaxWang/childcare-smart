# C21 数据模型、权限、参数、角色隔离扫描

扫描时间：2026-05-01  
扫描范围：`app/`、`components/`、`lib/`、`backend/`、`shared/` 中与 `childId`、`classId`、`teacherId`、`parentId`、`demoSeed`、`role`、`localStorage`、`searchParams` 相关的代码。

## 当前范围模型

- 账号模型：`SessionUser` 包含 `id`、`role`、`institutionId`、`className`、`childIds`、`accountKind`。
- 孩子范围：`/api/state` 会按 session user 调用 `scopeSnapshotForSessionUser`，家长按 `childIds/parentUserId`，教师按 `className`，园长按 `institutionId`。
- 本地状态：`localStorage` key 已按 `normal:<institutionId>:<role>:<userId>` 或 `demo:<datasetVersion>:<userId>` 隔离。
- 缺口：AI API 和部分 fallback API 没有复用这个服务端范围模型，仍信任客户端传入的角色、孩子和班级上下文。

## 硬编码 child/class/user 问题

- F1 `C21-005`：家长导航默认 `childId="c-1"`。
  - `lib/navigation/primary-nav.ts:36` 定义 `DEFAULT_PARENT_CHILD_ID = "c-1"`。
  - `components/Navbar.tsx:212`、`components/MobileNav.tsx:72` 在 `currentUser.childIds` 为空时回落到 `c-1`。
- F1 `C21-007`：缺少稳定 `classId`、`teacherId`、`parentId` 关系模型。
  - `lib/auth/accounts.ts:6-14` 只有 `className` 和 `childIds`。
  - `lib/persistence/state-scope.ts:21-40` 教师范围用 `child.className === user.className` 判断。
- demo seed 内允许存在固定 demo 数据，但 `u-parent/c-1` 进入真实 API 路径时需要隔离，见 `C21-003`。

## 角色隔离问题

- F0 `C21-001`：教师 AI 和高风险会诊 API 未做服务端教师角色/班级范围校验。
  - `app/api/ai/teacher-agent/route.ts:35-70` 只校验 body shape，并从客户端 `visibleChildren` 生成班级上下文。
  - `app/api/ai/high-risk-consultation/route.ts:30-90` 接受客户端 `targetChildId/currentUser/visibleChildren`。
- F0 `C21-002`：园长 AI API 未强制 admin session。
  - `app/api/ai/admin-agent/route.ts:38-57` 接受客户端 `currentUser/visibleChildren`。
  - `app/api/ai/admin-quality-metrics/route.ts:20-42` 无 admin guard。
- F0 `C21-004`：健康材料和教师语音接口接受 `childId`，未校验当前账号是否可访问该孩子。
- F1 `C21-006`：`/children`、`/health`、`/growth`、`/diet` 是 shared route，路由层无角色要求；页面内再用 UI 判断读写权限。

## query/hash 参数问题

- F2 `C21-008`：`login next` 大体支持 query/hash，但客户端未登录重定向只拼 `pathname + search`，会丢失 `#feedback` 等 hash。
  - `components/Navbar.tsx:147-154` 漏掉 `window.location.hash`。
  - `lib/auth/route-access.ts:74-111` 本身可保留 hash，问题在 next 构造处。
- 家长页 child query 正向处理较完整：
  - `app/parent/page.tsx:121-130` 会把有效 child 写回 URL。
  - `app/parent/agent/page.tsx:359-370` 会保留当前 hash。
  - `app/parent/storybook/page.tsx:156-176` 会保留 child/preset/demoSeed/hash。

## demoSeed 风险

- F0 `C21-003`：`app/api/ai/parent-storybook/route.ts:261-277` 在 `requestSource=parent-storybook-demo-seed:*` 时直接返回 demo fallback，没有先调用 `requireParentChildAccess`。
- F1 `C21-009`：`app/api/ai/high-risk-consultation/feed/route.ts:34-61` 在 brain feed 为空或不可用时返回 demo consultation feed，未按当前 session 范围过滤。

## 权限不完整风险

- 主要风险不在 `/api/state`，而在绕过 `/api/state` 的 AI/fallback/writeback API。
- `role` 判断大量用于 UI 和 payload 构造，但多个 API 没有重新从 session 派生 role/scope。
- 教师班级隔离依赖 `className` 字符串，缺少稳定 `classId` 后，班级重名或改名会导致范围边界不可靠。
- localStorage 已有账号 namespace，但只能防本地污染，不能替代服务端 API 授权。

## 最高优先级

- F0：
  - `C21-001` 教师 AI / 高风险会诊 API 信任客户端角色和 child scope。
  - `C21-002` 园长 AI API 未强制 admin session。
  - `C21-003` parent storybook demoSeed bypass 未做 child access guard。
  - `C21-004` 健康材料和教师语音 childId 未做服务端 scope 校验。
- F1：
  - `C21-005` 家长导航默认 `c-1`。
  - `C21-006` shared routes 路由层权限不清。
  - `C21-007` 缺少稳定 `classId/teacherId/parentId` 数据关系。
  - `C21-009` high-risk feed demo fallback 未按 session 过滤。
- F2：
  - `C21-008` login next 客户端路径会丢 hash。
  - `C21-010` state/localStorage scoping 是正向基础，但不能覆盖其他 API 授权缺口。

## 建议先补的边界

1. 增加 `requireTeacherChildAccess`、`requireAdminInstitutionAccess`、`requireScopedChildAccess`，所有 AI 和 writeback API 先从 session 派生范围。
2. 服务端重建 `visibleChildren/currentUser`，不要把客户端 payload 当权限来源。
3. 将 `className` 迁移为展示字段，新增稳定 `classId`，并补 teacher-class、parent-child 绑定。
4. 去掉家长导航默认 `c-1`，无 child scope 时进入 child selector 或空状态。
5. demoSeed 仅允许 demo account，真实账号 fallback 不返回 demo child data。

## 产物

- findings JSON：`docs/feature-audit/findings/C21-data-model-permission.json`
- markdown：`docs/feature-audit/findings/C21-data-model-permission.md`
- evidence：`artifacts/feature-audit/C21-code/`
