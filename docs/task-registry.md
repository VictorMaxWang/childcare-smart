# Task Registry

更新基准：`2026-04-12`

## Active Hotfix

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
