# Current Status Ledger

更新基准：`2026-04-12`

## 当前状态

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
- `/teacher`
- `/teacher/agent`
- `/admin`
- `/admin/agent?action=weekly-report`

## 演示素材口径

- 餐食图片与成长图片只来自本地 demo 资产。
- 全部素材都应被表述为“示意图 / demo-safe illustration”。
- 本轮没有引入外链素材，也没有引入儿童正脸素材。

## 仍然成立的限制

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
