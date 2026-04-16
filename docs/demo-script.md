# Demo Script

更新基准：`2026-04-12`

## 本轮结论

- demo 账号现在按相对日期回滚，核心记录固定落在最近 `0-14` 天，提醒与 follow-up 落在未来 `1-3` 天。
- 录屏主线固定为 `c-1 / c-8 / c-11 / c-14 / c-15`，`c-3` 作为正向成长对照样本。
- 餐食图与成长图只使用本地 `public/demo-meals/*`、`public/demo-growth/*`，统一口径为“示意图 / demo-safe illustration”。

## Hero Child Matrix

| Child | 角色主线 | 最适合讲的点 |
| --- | --- | --- |
| `c-1` | Parent 主线 | 今日 meals、有图的 media、家长反馈、轻 follow-up、weekly preview |
| `c-8` | Teacher 风险主线 | 分离焦虑、午睡过渡、会诊 trace、待沟通 |
| `c-11` | Teacher/Admin 饮食主线 | 偏食、蔬果摄入低、家园沟通、餐食趋势 |
| `c-14` | 晨曦班睡眠复核 | 连续睡眠问题、48h review、园长复核 |
| `c-15` | Admin / Weekly-report 主线 | 饮水偏低、补水趋势、top consultation、运营看板 |
| `c-3` | 正向对照 | 成长亮点，不让首页只有风险样本 |

## 固定录屏顺序

1. `/teacher`
2. `/teacher/agent`
3. `/admin`
4. `/admin/agent?action=weekly-report`
5. `/parent`
6. `/parent/agent?child=c-1`

## 页面讲解重点

### `/teacher`

- 首屏应同时看到异常晨检、待复查、待沟通、正向亮点。
- 风险不要只落在一个 child，优先讲 `c-8 / c-11 / c-14 / c-15` 的差异化。

### `/teacher/agent`

- 优先围绕 `c-8` 讲会诊闭环。
- 可补 `c-14` 作为晨曦班睡眠复核 drill-down。

### `/admin`

- 首屏优先讲 top 4 consultation：`c-15 / c-14 / c-8 / c-11`。
- 同时覆盖班级分布、风险差异、attendance、反馈完成度。

### `/admin/agent?action=weekly-report`

- 默认 child 为 `c-15`，适合讲补水趋势、follow-up、reminder、risk child distribution。
- 这页不再依赖绝对日期录屏。

### `/parent`

- 只围绕 `c-1`。
- 录屏时应能看到今日餐食图、近 7 天成长影像、最新 feedback、weekly preview。

### `/parent/agent?child=c-1`

- 用 `c-1` 讲“园内记录 -> 家长反馈 -> 下次跟进”的轻闭环。
- 这页是 Parent 端最稳定的收尾页面。

## 素材口径

- 餐食图：仅本地 demo-safe illustration，不代表真实园所采集。
- 成长图：仅本地示意素材，不使用儿童正脸。
- 若后续新增外部素材，必须满足合法、安全、无隐私风险，并继续保持“示意素材”口径。

## 录屏前检查

- 首页日期应分散在最近几天，不要扎堆同一天。
- `/parent` 必须看到 meals 图、growth media、feedback、weekly preview。
- `/teacher` 至少要有 `3-5` 个可讲 child case。
- `/admin` 必须稳定出现 risk child、risk class、attendance、consultation、weekly 入口。

## 剩余限制

- demo 数据仍然是 mock，不得描述成真实机构运营事实。
- Parent 账号目前仍只绑定 `c-1`。
- 最佳录屏顺序仍建议人工预跑一遍，尤其是 `c-8` 与 `c-15` 的切换。 
