# Current Status Ledger

更新基准：`2026-07-24`

## 当前状态

- 真实账号注册仍创建独立的个人/机构初始空间；注册成功不等于已经加入同一托育机构。
- 新增的一次性机构邀请码负责后续正式绑定：园长创建邀请，教师按稳定班级 ID 加入，家长在完整监护同意校验后迁入孩子与历史记录。
- 规范授权真相位于 `institution_memberships`、`teacher_class_assignments`、`child_registry`、`guardian_child_links`；`app_users` 的机构、班级、child_ids 仅保留兼容投影。
- 代码、单元/API 测试与生产构建已通过；生产 SQL、示例账号对齐、部署和 Chrome 三账号闭环仍待执行，当前不能宣称线上已修复。
- 比赛展示口径已统一为 `慧育童行 - SmartChildcare Agent`，中文展示名为 `慧育童行`，英文名 / 技术系统名为 `SmartChildcare Agent`。
- 当前 demo 数据热修已经切到“相对日期 + 固定 hero child matrix”模式。
- 前端本地 demo snapshot 与后端 `build_demo_snapshot()` 已经围绕同一批 child case 对齐。
- Parent / Teacher / Admin 三端的主要录屏页现在都能拿到更饱满的 demo 内容。

## 当前最稳定的录屏主线

1. `c-8` 负责 Teacher 风险故事和会诊入口。
2. `c-15` 负责 Admin 首屏优先级与 weekly-report。
3. `c-11` 负责偏食与家园沟通。
4. `c-14` 负责晨曦班睡眠复核链路。
5. `c-1` 负责 Parent 闭环收尾。
6. `c-3` 负责正向成长对照，不让画面全是风险。

## 相对日期策略

- 核心展示窗口：最近 `14` 天。
- 高密度展示窗口：最近 `7` 天。
- 今日重点：`daysAgo(0)`。
- 未来提醒 / 跟进：未来 `1-3` 天。
- 本地 demo 用户每次载入 snapshot 时都会重基准，避免 localStorage 长期缓存旧日期。

## 受益最大的页面

- `/parent`
- `/parent/agent?child=c-1`
- `/parent/storybook?child=c-1`
- `/teacher`
- `/teacher/high-risk-consultation`
- `/admin`

补充路线仍保留 `/teacher/agent` 与 `/admin/agent?action=weekly-report`，但答辩主线优先按 `docs/competition-message-guide.md` 执行。

## 演示素材口径

- 餐食图片与成长图片只来自本地 demo 资产。
- 全部素材都应被表述为“示意图 / demo-safe illustration”。
- 本轮没有引入外链素材，也没有引入儿童正脸素材。

## 仍然成立的限制

- 未执行 `supabase/sql/20260724_create_institution_memberships.sql` 的环境会回退旧授权字段，不具备正式邀请绑定能力。
- `scripts/align-sample-accounts.mjs` 默认 dry-run；只有人工确认目标库后使用 `--apply` 才会写入。
- demo 数据仍然是演示化数据，不能夸大成真实业务事实。
- Parent 仍只绑定 `c-1`。
- Storybook 受保护文件未动，本轮不会改变其上游能力边界。
- 录屏顺序仍建议人工挑选，尤其是 Admin top 4 consultation 与 Parent 收尾之间的切换。

## 后续最容易被冲掉的点

- hero child 排序
- 相对日期重基准逻辑
- meal / growth 资产轮换
- consultation / weekly / follow-up 对齐关系
- `lib/store.tsx` 与 `backend/app/db/demo_snapshot.py` 的叙事一致性
