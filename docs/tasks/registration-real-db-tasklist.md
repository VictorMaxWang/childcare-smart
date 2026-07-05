# 开放注册真实数据库版任务清单

更新日期：2026-07-04

本清单承接 T0 文档规则，后续实现按 T1-T9 推进。每个任务都必须保护现有 `teacher/admin/parent` 主链、现有 HMAC `ccs_session` 和 demo 账号隔离。

## 完成状态（2026-07-05）

- T1 完成：当前认证、session、DB 表、页面入口和权限隔离事实已记录。
- T4 完成：手机号标准化、`phone_normalized` 迁移脚本和手机号优先查询已落地。
- T3 完成：注册 API 支持手机号、服务端 `confirmPassword` 校验和旧 username 兼容。
- T5 完成：注册后写入真实 `app_users`、创建真实 `institution_id` 和初始 `app_state_snapshots`。
- T2 完成：`/register` 手机号注册页和 `/login` 注册入口已落地。
- T6 完成：手机号 + 密码登录已落地，并兼容旧 username 登录。
- T7 完成：parent 儿童建档移至登录后 onboarding，创建前要求监护人确认与同意。
- T8A/T8B 完成：租户隔离审计与本轮服务端 scope 修复已记录在 `docs/security/tenant-isolation-audit.md`。
- T9 完成：新增真实 DB 注册 smoke、README/env/docs 收口和发布前检查清单。

## T1 现有认证系统审计

**目标**

审计当前登录、注册、session、数据库表、页面入口和权限隔离现状，形成可执行事实清单。

**涉及文件**

- `app/api/auth/login/route.ts`
- `app/api/auth/register/route.ts`
- `lib/auth/account-server.ts`
- `lib/auth/session.ts`
- `lib/auth/accounts.ts`
- `supabase/sql/app_users.sql`
- `app/login/page.tsx`

**验收标准**

- 文档记录当前请求体、响应体、cookie、DB 写入、demo 账号路径和真实账号路径。
- 明确哪些行为已存在：`confirmPassword` 服务端校验、`ccs_session`、`app_users`、`app_state_snapshots`。
- 明确哪些行为缺失：`phone_normalized`、手机号登录、监护人同意记录、独立 `/register` 页面。

**不要做什么**

- 不改业务代码。
- 不创建迁移。
- 不改页面。

## T2 手机号注册 UI

**目标**

实现 `/register` 页面，提供手机号、密码、确认密码、角色选择，并与现有登录页形成清晰入口。

**涉及文件**

- `app/register/page.tsx`
- `app/login/page.tsx`
- `lib/store.tsx`
- `components/ui/*`

**验收标准**

- 页面提交 `{ phone, password, confirmPassword, role }`。
- 前端做基础空值和两次密码一致提示，但不替代服务端校验。
- 注册成功后按角色跳转到对应首页。
- 验证码如未接入真实短信，必须保持 disabled 或不展示。
- T2 页面入口统一为 `/register`；`/login` 仅保留“立即注册”跳转入口。

**不要做什么**

- 不接入第三方短信或 SaaS 鉴权。
- 不把 `/login` 改成纯营销页。
- 不删除 demo 快速体验入口。

## T3 注册 API 契约升级

**目标**

升级 `/api/auth/register` 支持 `phone`，保留 `confirmPassword` 服务端校验，并兼容旧 `username` 请求。

**涉及文件**

- `app/api/auth/register/route.ts`
- `lib/auth/account-server.ts`
- `lib/auth/accounts.ts`
- `lib/auth/password.ts`

**验收标准**

- `confirmPassword` 不一致返回 `400`。
- 手机号无效返回 `400`。
- 重复手机号返回 `409`。
- 成功后返回 `{ ok: true, user }` 并设置 `ccs_session`。
- 旧 username 注册兼容策略被测试覆盖或明确记录。

**不要做什么**

- 不移除现有 password scrypt 哈希。
- 不绕过 `setSessionCookie`。
- 不把真实用户写入 demo 账号。

## T4 手机号标准化与唯一性

**目标**

建立手机号标准化、唯一性查询和重复提示，兼容旧 `username_normalized`。

**涉及文件**

- `lib/auth/accounts.ts`
- `lib/auth/account-server.ts`
- `supabase/sql/app_users.sql`
- 迁移脚本文件按后续迁移规范新增

**验收标准**

- `13800000000`、`+8613800000000`、`86 13800000000` 统一为 `+8613800000000`。
- `app_users.phone_normalized` 唯一。
- 登录/注册查询优先使用 `phone_normalized`。
- 旧 `username_normalized` 账号仍能登录。

**不要做什么**

- 不删除 `username_normalized`。
- 不在日志里输出手机号明文。
- 不把格式化失败的手机号静默当作 username。

## T5 注册即创建真实空间

**目标**

注册成功后按角色创建真实机构空间或家庭空间，并写入初始 `app_state_snapshots`。

**涉及文件**

- `lib/auth/account-server.ts`
- `lib/persistence/bootstrap.ts`
- `lib/persistence/snapshot.ts`
- `lib/server/app-data-repository.ts`
- `app/api/auth/register/route.ts`
- `supabase/sql/app_state_snapshots.sql`

**验收标准**

- 普通账号 `is_demo=false`。
- 每个新账号有真实 `institution_id`。
- admin/teacher 创建空机构 snapshot。
- parent 创建空家庭 snapshot，不自动创建儿童档案。
- 初始 snapshot 写入 `meta.workspace` 和默认 `meta.usageLimits`。
- 注册响应返回按角色计算的 `redirectPath`。
- 整个创建流程在数据库事务中完成。

**不要做什么**

- 不使用邀请码。
- 不默认进入 demo。
- 不把 parent 注册和儿童建档同意混为一步。

## T6 登录页改为手机号 + 密码

**目标**

把登录表单主流程改成手机号 + 密码，同时服务端兼容旧账号。

**涉及文件**

- `app/login/page.tsx`
- `lib/store.tsx`
- `app/api/auth/login/route.ts`
- `lib/auth/account-server.ts`

**验收标准**

- 登录请求支持 `{ phone, password }`。
- 旧 `{ username, password }` 仍可登录。
- 登录成功继续按 `resolveAuthorizedRedirectPath` 跳转。
- 登录失败不泄露手机号是否存在。

**不要做什么**

- 不重写路由权限。
- 不删除 `/auth/login` 重定向兼容。
- 不改变 demo login 行为。

## T7 家长儿童档案创建与监护人同意

**目标**

把儿童档案创建从注册流程拆出，改为 parent 登录后的 onboarding；创建 child 前必须完成监护人确认与同意记录。

**涉及文件**

- `app/parent/page.tsx`
- `app/parent/onboarding/child/page.tsx`
- `app/api/parent/children/route.ts`
- `lib/server/parent-child-onboarding.ts`
- `lib/parent/child-onboarding.ts`
- `lib/api/parent-children.ts`
- `lib/persistence/snapshot.ts`
- `lib/persistence/state-scope.ts`
- `supabase/sql/20260704_create_consent_records.sql`

**验收标准**

- parent 注册后进入 `/parent`，无 child 时展示“创建孩子成长档案”入口。
- `POST /api/parent/children` 仅允许普通家长账号创建自己的家庭空间 child。
- 新建 child 前前端必须勾选三项同意，服务端也必须拒绝 `consentAccepted=false`。
- 同一事务内创建 child、更新 parent `child_ids`、写入三条 `consent_records`。
- 第一版字段限制为姓名/昵称、出生日期或月龄、可选性别；不采集身份证、详细住址、人脸照片或医疗记录。

**不要做什么**

- 不强制采集非必要健康、身高体重、过敏、特殊关注项或监护人联系电话。
- 不只做前端勾选而不落库。
- 不让家长越权绑定其他机构儿童。
- 不改 director `/api/children` 主链。

## T8 权限隔离与防串数据检查

**目标**

确保真实账号所有儿童、班级、反馈、绘本、会诊、周报数据都按 `institution_id` 或 `child_ids` 隔离。

**涉及文件**

- `lib/persistence/state-scope.ts`
- `lib/server/scope.ts`
- `lib/server/ai-route-guard.ts`
- `app/api/state/route.ts`
- `tests/product-completion/ai-routes-normal-session.spec.ts`

**验收标准**

- parent forged childId 返回 `403` 或明确 limited。
- teacher 跨班访问返回 `403`。
- admin 跨机构访问返回 `403`。
- `/api/state` 读写只合并当前 scope。
- AI route guard 不允许缺少 child/class/institution scope 的真实账号绕过。

**不要做什么**

- 不为了通过 smoke 放宽 scope。
- 不给 admin 增加跨机构 super-admin。
- 不在无授权 childId 时静默回退 demo child。

## T9 测试、烟测、文档更新

**目标**

完成 lint、build、注册登录 smoke、README/开发文档更新，并记录真实限制。

**涉及文件**

- `README.md`
- `AGENTS.md`
- `docs/auth-registration-next-phase.md`
- `docs/tasks/registration-real-db-tasklist.md`
- 相关测试文件

**验收标准**

- `npm run lint` 通过。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- 有 `DATABASE_URL` 和 `AUTH_SESSION_SECRET` 时 normal-session 注册/登录/scope smoke 通过。
- README 不夸大真实短信、生产账号生命周期、密码找回或完整合规能力。

**不要做什么**

- 不把未接入能力写成已完成。
- 不提交真实手机号、密码、cookie、数据库连接串或 provider key。
- 不修改无关视觉重构、demo 素材或业务主链。
