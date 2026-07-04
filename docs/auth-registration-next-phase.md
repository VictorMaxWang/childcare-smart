# 开放注册真实数据库版下一阶段说明

更新日期：2026-07-04

本文档用于承接 T0 之后的注册真实数据库版开发。它记录当前代码事实、下一阶段目标和开发边界，避免后续实现把真实用户、demo 账号、session、机构空间和儿童建档合规混在一起。

## 当前认证系统现状

- 登录入口：`/login` 是真实登录页，`/auth/login` 重定向到 `/login`；`proxy.ts` 放行 `/login`、`/auth/login` 和 `/api/auth/*`。
- 普通登录：`app/api/auth/login/route.ts` 接收 `{ username, password }`，调用 `authenticateNormalAccount`，成功后通过 `setSessionCookie` 写 `ccs_session`。
- 普通注册：`app/api/auth/register/route.ts` 接收 `RegisterAccountInput & { confirmPassword }`，服务端已校验 `confirmPassword === password`，成功后同样写 `ccs_session`。
- session：`lib/auth/session.ts` 使用 HMAC SHA-256 签名 payload，cookie 名称为 `ccs_session`，12 小时有效；`proxy.ts` 有一套 Edge 侧校验逻辑。
- 账号模型：`lib/auth/accounts.ts` 当前只有 `username`、`password`、`role`、可选 `className` 和可选家长 `child` 输入，没有 `phone` 或 `phone_normalized`。
- 数据库：`supabase/sql/app_users.sql` 定义 `app_users`，唯一键是 `username_normalized`；`supabase/sql/app_state_snapshots.sql` 按 `institution_id` 保存 snapshot。
- 注册写入：`lib/auth/account-server.ts` 当前会创建 `app_users`，`is_demo=false`，并用事务 upsert `app_state_snapshots`。家长注册会立即通过 `parentStarterSnapshot` 创建儿童档案。
- 页面现状：`app/login/page.tsx` 的注册弹窗文案已经写“手机号”，但实际仍把手机号输入值作为 `username` 发送；验证码按钮是禁用的演示控件。
- 权限现状：`scopeSnapshotForSessionUser`、`lib/server/scope.ts`、AI route guard 和 `/api/state` 已经按 `institutionId`、教师班级、家长 `childIds` 做范围控制。

## 下一阶段目标

- 注册表单升级为手机号 + 密码 + 确认密码 + 角色，服务端以手机号作为主注册凭据。
- 注册成功后创建真实普通账号、真实机构/家庭空间和初始 snapshot，并立即建立现有 `ccs_session` 登录态。
- 登录页主输入改为手机号 + 密码，同时兼容旧 `username_normalized` 普通账号。
- 家长注册不再绕过儿童建档同意。第一阶段家长账号只创建家庭空间；儿童档案创建必须经过监护人确认与同意记录。
- 保持 demo 账号独立：示例账号继续走 `/api/auth/demo-login` 和 demo snapshot，不接受真实注册写入。

## 数据库变更建议

- 在 `app_users` 增加 `phone_normalized varchar(32) null`，并添加唯一键 `idx_app_users_phone_normalized`。
- 保留 `username_normalized`，用于旧账号登录和历史数据兼容；新手机号账号可把 `username_normalized` 设置为 `phone_normalized` 或保留迁移兼容策略，但不能删除旧字段。
- 可增加账号显示字段，例如 `display_name` 继续使用手机号脱敏展示或后续用户资料名；不要把手机号明文用于日志。
- 家长同意建议先在 snapshot 内记录最小审计对象，后续再拆表。字段至少包括：`consentId`、`childId`、`guardianName`、`guardianRelation`、`guardianPhoneNormalized`、`purpose`、`acceptedAt`、`acceptedByUserId`。
- 不在 T0 创建 SQL 迁移；迁移脚本、兼容回填和唯一索引冲突处理留到 T4/T5。

## API 契约

### `POST /api/auth/register`

下一阶段请求体：

```json
{
  "phone": "13800000000",
  "password": "example123",
  "confirmPassword": "example123",
  "role": "机构管理员"
}
```

行为要求：

- 服务端必须校验 `phone`、`password`、`confirmPassword`、`role`。
- `confirmPassword` 不一致返回 `400`。
- 手机号格式无效返回 `400`。
- 手机号已注册返回 `409`。
- 数据库或 session 配置缺失返回现有 `503` 口径。
- 成功返回 `{ ok: true, user }`，并设置现有 `ccs_session`。
- 兼容期可接受旧 `{ username, password, confirmPassword, role }`，但新页面必须发送 `phone`。

### `POST /api/auth/login`

下一阶段请求体：

```json
{
  "phone": "13800000000",
  "password": "example123"
}
```

行为要求：

- 优先按 `phone_normalized` 查询。
- 兼容旧 `{ username, password }` 和旧 `username_normalized` 查询。
- 失败错误仍保持“账号或密码错误”这类不泄露枚举信息的口径。
- 成功后继续返回 `{ ok: true, user }` 并写 `ccs_session`。

## 页面改造清单

- 新增或整理 `/register` 页面，表单字段为手机号、密码、确认密码、角色。
- `/login` 登录表单主文案改为手机号 + 密码，保留“旧账号也可登录”的兼容提示。
- 移除注册弹窗中“验证码为本地演示控件”的误导路径，除非明确保持 disabled 并标注暂未接入短信。
- 家长角色注册后进入家长首页或儿童建档引导页，但不能自动创建儿童档案。
- 儿童建档页增加监护人确认与同意记录；第一版只要求最小必要儿童字段。
- 不改 teacher/admin/parent 现有主链页面结构，不删除 demo 快速体验入口。

## 安全与隐私边界

- 继续使用现有 HMAC `ccs_session`，不引入第三方 SaaS 鉴权。
- 手机号标准化和唯一性校验必须在服务端完成。
- 日志不得输出手机号明文、密码、session payload、cookie、儿童姓名、监护人信息或反馈正文。
- 所有真实数据写入必须绑定 `institution_id`；所有儿童、反馈、绘本、会诊、周报读取必须绑定 `institution_id` 或 `child_ids`。
- 家长账号无儿童授权时应显示空状态或建档引导，不应回退到 demo child。
- 验证码在未接入真实短信前必须保持 disabled 或明确为未开放，不能返回 fake success。

## 测试清单

- 注册缺少手机号返回 `400`。
- 注册手机号格式错误返回 `400`。
- 注册密码短于当前策略返回 `400`。
- 注册 `confirmPassword` 不一致返回 `400`。
- 注册重复手机号返回 `409`。
- 注册成功后 `app_users.is_demo=false`，`phone_normalized` 唯一，`institution_id` 存在。
- 注册成功后创建对应 `app_state_snapshots`，且不会写入 demo 账号或 demo snapshot。
- 登录支持手机号 + 密码。
- 登录兼容旧 `username` + 密码。
- parent 只能访问自己 `childIds` 或 `parentUserId` 绑定儿童；teacher 只能访问本班；admin 只能访问本机构。
- `npm run lint`、`npm run typecheck`、`npm run build`。
- 有真实 `DATABASE_URL` 和 `AUTH_SESSION_SECRET` 时补跑 normal-session auth/scope Playwright smoke。

## 回滚方案

- 如果手机号注册发布后出现问题，先隐藏 `/register` 入口或将注册按钮切回 disabled，不影响 demo login。
- 保留旧 `username` 登录路径，确保已存在普通账号仍可登录。
- 数据库回滚时不要删除 `username_normalized`、`institution_id`、`child_ids` 或已有 `app_state_snapshots`。
- 如果 `phone_normalized` 唯一索引引发冲突，先暂停新注册，导出冲突手机号，修复标准化逻辑后再恢复。
- 如果家长建档同意流程未完成，不允许自动创建儿童；保持家庭空间为空并显示引导。
