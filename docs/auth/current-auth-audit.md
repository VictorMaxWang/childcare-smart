# 当前认证系统审计

更新日期：2026-07-04

本文档是 T1 认证系统审计结论，只记录当前代码事实和后续“手机号 + 密码 + 确认密码注册真实数据库版”的施工边界。T1 不修改业务代码、页面、SQL schema、cookie 机制或 public API。

## 1. 当前登录流程

- 页面入口：
  - `/login` 是当前真实登录页，位于 `app/login/page.tsx`。
  - `/auth/login` 位于 `app/auth/login/page.tsx`，只负责 `redirect("/login")`。
  - `proxy.ts` 明确放行 `/login`、`/auth/login` 和 `/api/auth/*`。
- 页面提交：
  - `app/login/page.tsx` 调用 `useApp().login(username, password)`。
  - `lib/store.tsx` 将登录请求发送到 `POST /api/auth/login`，请求体为 `{ username, password }`。
  - 页面文案目前显示“普通账号”和占位“账号 / 手机号”，但服务端仍只按 `username_normalized` 查询。
- API 路由：
  - `app/api/auth/login/route.ts` 解析 `{ username?: string; password?: string }`。
  - 路由调用 `authenticateNormalAccount(body.username ?? "", body.password ?? "")`。
  - `authenticateNormalAccount` 先 `normalizeUsername`，再查 `app_users.username_normalized`，然后用 `verifyPassword` 校验 scrypt hash。
- 成功响应和 session：
  - 成功后调用 `setSessionCookie(result.data.id, result.data.role)`。
  - 响应体为 `{ ok: true, user: result.data }`。
  - 页面收到成功用户后通过 `resolveAuthorizedRedirectPath(role, nextPath)` 跳转到角色允许的入口。
- 失败状态码与错误信息：
  - 缺少账号或密码：`400`，`请输入账号和密码。`
  - 账号不存在或密码错误：`401`，`账号或密码错误。`
  - 缺少或无法访问 `DATABASE_URL`：`503`，`服务端缺少 DATABASE_URL 配置。` 或 `数据库访问失败，请稍后重试。`
  - 缺少生产 `AUTH_SESSION_SECRET`：`503`，`服务端缺少 AUTH_SESSION_SECRET 配置。`
  - JSON 解析等无效请求：`400`，`登录请求无效。`

## 2. 当前注册流程

- 页面入口：
  - 当前没有独立 `/register` 页面。
  - 注册入口是 `/login` 页内的 Radix Dialog 弹窗。
  - 页面弹窗文案已经写“手机号”，验证码按钮 disabled，提示为本地演示控件；但提交值仍写入 `username` 字段。
- 页面提交字段：
  - `username`：来自注册弹窗的“手机号”输入框。
  - `password`
  - `confirmPassword`
  - `role`：`家长`、`教师`、`机构管理员`。
  - `className`：教师可选，默认 `新注册班`。
  - `child`：家长当前必须填写孩子姓名、出生日期和性别；还可提交身高、体重、监护人电话。
  - `kindergartenName` 和验证码输入只存在于页面状态，当前不会发送给注册 API。
- API 路由：
  - `app/api/auth/register/route.ts` 解析 `RegisterAccountInput & { confirmPassword?: string }`。
  - 当前请求契约仍是旧 username 契约，不支持 `phone` 或 `phone_normalized`。
- `confirmPassword` 校验位置：
  - 页面做一次前端一致性提示。
  - 服务端在 `app/api/auth/register/route.ts` 中再次校验 `(confirmPassword ?? "") === (password ?? "")`。
  - 不一致返回 `400`，`两次输入的密码不一致。`
- role 处理方式：
  - `lib/auth/account-server.ts` 的 `validateRole` 只接受 `家长`、`教师`、`机构管理员`。
  - 无效角色返回 `400`，`用户类型无效。`
  - 教师注册时设置 `class_name`，未填则使用 `DEFAULT_TEACHER_CLASS_NAME`。
  - 家长注册当前要求 `child.name`、`child.birthDate`、`child.gender`，缺失返回 `400`，`家长注册需要补充孩子基础信息。`
- 当前是否写 `app_users`：
  - 是。`registerNormalAccount` 生成 `userId` 和 `institutionId`，使用 scrypt 写 `password_hash`，并插入 `app_users`。
  - 写入字段包括 `username_normalized`、`display_name`、`password_hash`、`role`、`avatar`、`institution_id`、`class_name`、`child_ids`、`is_demo`。
  - 当前真实注册写 `is_demo=false`，不会写入 demo account 列表。
- 当前是否写 `app_state_snapshots`：
  - 是。`registerNormalAccount` 在 `withDbTransaction` 中先插入 `app_users`，再 upsert `app_state_snapshots`。
  - admin/teacher 使用 `emptyInstitutionSnapshot()`。
  - parent 当前使用 `parentStarterSnapshot(...)`，会同时创建一个 child 并把 childId 写入新用户 `child_ids`。
- 当前 `is_demo` 行为：
  - 普通注册固定 `is_demo=false`。
  - demo 登录走独立 `POST /api/auth/demo-login`，按 `DEMO_ACCOUNTS` 取内存示例账号，再写同一个 `ccs_session` cookie。
  - `resolveSessionUserById` 会先按 demo id 匹配示例账号，再查真实 `app_users`。

## 3. 当前 HMAC session cookie 机制

- cookie 名称：`ccs_session`。
- 服务端实现：
  - `lib/auth/session.ts` 使用 HMAC SHA-256 签名 base64url payload。
  - token 格式为 `<base64url-json-payload>.<base64url-signature>`。
  - cookie 参数为 `httpOnly`、`sameSite: "lax"`、`path: "/"`，生产环境 `secure=true`。
- payload 内容：
  - `userId`
  - `role`
  - `exp`
  - `SessionTokenPayload` 对外只暴露 `userId` 和可选 `role`，但实际签名 payload 带 `exp`。
- exp 处理：
  - `SESSION_AGE_SECONDS = 60 * 60 * 12`，即 12 小时。
  - `buildSessionToken` 写入当前时间 + 12 小时的 `exp`。
  - `setSessionCookie` 同时设置 cookie `maxAge` 为 12 小时。
  - `verifySessionToken` 在签名校验后检查 `exp`，过期返回 `null`。
- `proxy.ts` 保护路由方式：
  - Edge 侧重新实现 HMAC SHA-256 校验，使用同一 `AUTH_SESSION_SECRET`。
  - 放行 `/_next`、公开素材、`/api/auth/*`、登录页和由 API 自己处理鉴权的业务 API 前缀。
  - 对其他页面读取 `ccs_session`，无 session 或无效 session 重定向到 `/login?next=...` 并清空 cookie。
  - 对 `/admin`、`/teacher`、`/parent` 路径按 `role` 做页面级访问控制；角色不符时跳回该角色自己的首页并附加 `accessDenied=1`。

## 4. 当前用户表 `app_users` 结构

当前 MySQL schema 位于 `supabase/sql/app_users.sql`：

```sql
create table if not exists app_users (
  id varchar(191) primary key,
  username_normalized varchar(191) not null,
  display_name varchar(255) not null,
  password_hash varchar(255) not null,
  role varchar(32) not null,
  avatar varchar(255) null,
  institution_id varchar(191) not null,
  class_name varchar(255) null,
  child_ids json not null default (json_array()),
  is_demo boolean not null default false,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key idx_app_users_username_normalized (username_normalized),
  key idx_app_users_institution_id (institution_id)
);
```

- `username_normalized`：当前唯一登录名，来自 `normalizeUsername(username)`。
- `password_hash`：当前为 `scrypt:<salt>:<hash>`，由 `lib/auth/password.ts` 生成和校验。
- `role`：三种中文角色之一，决定页面和业务访问边界。
- `institution_id`：真实账号注册时生成新 `inst-*`，也是 `app_state_snapshots` 的主键。
- `child_ids`：JSON 数组；parent 当前注册时会包含 `parentStarterSnapshot` 生成的 childId。
- `is_demo`：普通注册写 `false`；demo 账号不来自这张表。
- 当前没有 `phone_normalized` 字段，也没有手机号唯一索引。

## 5. 当前 parent 注册边界

- 当前是否直接创建 child：
  - 是。parent 注册时 `registerNormalAccount` 调用 `parentStarterSnapshot`。
  - `parentStarterSnapshot` 会创建一个 child，写入 `name`、`birthDate`、`gender`、`heightCm`、`weightKg`、`guardians`、`institutionId`、`className`、`parentUserId` 等字段。
  - 新 parent 用户的 `child_ids` 会设置为 `[starter.childId]`。
- 是否缺少 `consent_records`：
  - 是。当前代码没有 `consent_records` 表，也没有 snapshot 内的同意审计对象。
  - 当前 parent 注册收集的 guardian 信息只是 child profile 的 guardian 字段，不等同于“监护人确认与同意记录”。
- 为什么 T7 要后置处理儿童档案创建：
  - T0 规则要求儿童建档前必须有监护人确认与同意记录。
  - 当前注册流程把“创建 parent 账号”和“创建 child 档案”混成一步，会绕过 T0 要求的同意审计边界。
  - 因此 T5 应先把 parent 注册改为空家庭空间，T7 再引入儿童建档和同意记录的最小合规流程。

## 6. 手机号注册最小变更路径

- T4 要改什么：
  - 在 `app_users` 增加 `phone_normalized` 和唯一约束。
  - 新增手机号标准化逻辑，至少覆盖 `13800000000`、`+8613800000000`、`86 13800000000` 到统一 `+8613800000000`。
  - 登录和注册查询优先使用 `phone_normalized`，同时保留 `username_normalized` 兼容旧账号。
- T3 要改什么：
  - 将 `RegisterAccountInput` 和 `/api/auth/register` 扩展为支持 `{ phone, password, confirmPassword, role }`。
  - 保留服务端 `confirmPassword` 校验，不依赖页面。
  - 手机号无效返回 `400`，重复手机号返回 `409`。
  - 成功后仍调用 `setSessionCookie`，不改变 `ccs_session`。
  - 兼容期明确处理旧 `{ username, password, confirmPassword, role }` 请求。
- T5 要改什么：
  - 继续在事务中创建普通账号和初始 `app_state_snapshots`。
  - admin/teacher 创建真实空机构 snapshot。
  - parent 创建真实空家庭 snapshot，不自动创建 child，不写 demo snapshot。
  - 所有真实账号继续 `is_demo=false`，并拥有真实 `institution_id`。
- T2/T6 页面如何配合：
  - T2 新增或整理 `/register` 页面，提交 `{ phone, password, confirmPassword, role }`。
  - T2 不接入第三方短信或 SaaS 鉴权，验证码未接入时保持 disabled 或不展示。
  - T6 将登录页主输入改为手机号 + 密码，但提示旧账号仍可登录。
  - T6 保持 `resolveAuthorizedRedirectPath`、`/auth/login` 重定向和 demo login 行为不变。

## 7. 风险点

- 重复手机号：
  - 当前只有 `username_normalized` 唯一约束，没有手机号唯一约束。
  - T4 增加 `phone_normalized` 后要处理标准化冲突和重复手机号返回 `409`。
- 旧 username 兼容：
  - 当前普通账号全部依赖 `username_normalized`。
  - 迁移后不能删除旧字段，也不能让旧账号无法登录。
- session 不兼容：
  - 当前 cookie payload 只关心 `userId`、`role`、`exp`，不需要把手机号写进 session。
  - 后续注册和登录应继续使用 `setSessionCookie`，避免引入并行 session 体系。
- parent 无同意记录：
  - 当前 parent 注册直接创建儿童档案，是下一阶段最明显的合规边界风险。
  - T5/T7 必须拆开 parent 注册和儿童建档。
- tenant isolation：
  - 当前 `scopeSnapshotForSessionUser`、`requireChildAccess`、`requireClassAccess`、AI route guard 和 `/api/state` 已按 `institutionId`、`className`、`childIds` 或 `parentUserId` 控制范围。
  - 后续手机号注册不能为了打通注册而放宽这些 scope。
  - parent 无授权 child 时应显示空状态或建档引导，不应回退 demo child。

## 8. 测试点

- `password != confirmPassword`：
  - `POST /api/auth/register` 返回 `400` 和 `两次输入的密码不一致。`
- 手机号非法：
  - T3/T4 后应覆盖格式非法返回 `400`。
- 手机号重复：
  - T4 后应覆盖标准化后重复手机号返回 `409`。
- 注册成功写真实库：
  - 新用户写 `app_users.is_demo=false`。
  - 新用户有真实 `institution_id`。
  - 新机构或家庭空间写入 `app_state_snapshots`。
  - 不写 demo account、demo fixture 或 demo snapshot。
- 旧账号登录兼容：
  - 旧 `{ username, password }` 账号仍可按 `username_normalized` 登录。
- 新账号登录成功：
  - T6 后 `{ phone, password }` 可登录，并继续写 `ccs_session`。
- admin/teacher/parent 跳转正确：
  - 登录后继续使用 `resolveAuthorizedRedirectPath`。
  - `/admin`、`/teacher`、`/parent` 仍由 `proxy.ts` 和 `route-access` 按角色保护。
- scope 隔离：
  - parent forged childId 返回 `403` 或 limited。
  - teacher 跨班访问被拒绝。
  - admin 只能访问同 `institution_id` 数据，不新增跨机构 super-admin。

## 9. T1 结论

- 当前代码已经具备服务端 `confirmPassword` 校验、HMAC `ccs_session`、真实 `app_users` 写入、真实 `app_state_snapshots` 写入和基础 scope 隔离。
- 当前代码仍缺少 `phone_normalized`、手机号登录、独立 `/register` 页面、手机号注册 API 契约和监护人同意记录。
- 当前 parent 注册会直接创建 child，和 T0 “儿童建档前必须有监护人确认与同意记录”的下一阶段目标不一致；该行为必须在 T5/T7 拆开处理。
- T1 不改变任何 public API、类型、cookie、SQL schema 或页面行为，只为 T2-T7 提供施工事实清单。
