# Task Registry

更新基准：`2026-07-24`

## Active Hotfix

### Real Account Institution Membership Hotfix

- 状态：`Code-verified / Production-pending`
- 目标：让独立注册的园长、教师、家长通过一次性邀请码建立正式机构、班级与监护关系，并完成“教师记录 -> 家长读取 -> AI 分析/绘本”的真实账号闭环。
- 主改动源：
  - `lib/server/institution-membership.ts`
  - `supabase/sql/20260724_create_institution_memberships.sql`
  - `app/api/admin/member-invitations/route.ts`
  - `app/api/account/member-invitations/accept/route.ts`
  - `lib/auth/membership-projection.ts`
  - `lib/server/app-data-repository.ts`
  - `scripts/align-sample-accounts.mjs`
- 已完成：
  - 规范机构成员、稳定班级 ID、教师分班、幼儿登记、监护链接和授权审计。
  - 家长迁移前校验三类监护同意，失败整体回滚并保留源家庭快照。
  - 晨检、饮食、成长真实账号写入改为等待服务端成功后再提示。
  - 家长真实账号直接读取服务端作用域数据；AI 绘本记录完整来源 ID。
  - 授权/建档/缓存/记录测试、注册测试、lint、typecheck、production build 已通过。
- 生产待完成：
  - 在生产库执行规范关系 SQL 并运行 `npm run db:check`。
  - dry-run 后执行三示例账号对齐。
  - 部署 main，并在 Chrome 完成三账号记录、读取与 AI/绘本验收。

### Demo Data & Recording Asset Recovery Hotfix

- 状态：`Done-code-only`
- 目标：让 demo 账号每天都像刚更新过，提升三端录屏可讲性。
- 主改动源：
  - `lib/store.tsx`
  - `backend/app/db/demo_snapshot.py`
  - `lib/demo/demo-consultations.ts`
  - `backend/app/db/childcare_repository.py`

## 本轮固定叙事

- `c-1`：Parent 主线，负责 meals / media / feedback / weekly preview。
- `c-8`：Teacher 风险主线，负责分离焦虑与午睡过渡。
- `c-11`：Teacher / Admin 饮食主线，负责偏食与家园沟通。
- `c-14`：晨曦班睡眠复核。
- `c-15`：Admin 与 weekly-report 主线，负责补水趋势与 top consultation。
- `c-3`：正向成长对照。

## 本轮 contract

- demo 时间字段统一输出规范日期或 ISO 时间字符串。
- consultation / intervention / reminders / tasks / mobile drafts / taskCheckIns 共享同一套 hero child narrative。
- 不新增外部依赖，不改主工作流，不碰 Storybook 受保护文件。

## 已落地验证目标

- Parent 首页不再只有功能没有内容。
- Teacher 首页风险样本不再集中在一个 child。
- Admin 首页与 weekly-report 可以稳定讲班级分布、风险差异、attendance、consultation、follow-up。
- consultation fallback 与 backend snapshot 已按同一故事线对齐。

## 后续待继续的项

- 生成页面 smoke 截图并沉淀到 `artifacts/qa-sweep/<timestamp>/`
- 对 `npm run ai:smoke` 做一轮完整复验
- 在下一轮热修里继续守住 demo-safe 素材口径
