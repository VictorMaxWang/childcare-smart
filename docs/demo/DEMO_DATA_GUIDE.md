# 答辩 Demo Fixture 数据说明

## 目标

本 fixture 用于让现有 demo provider / app snapshot 在答辩路径中直接展示足够数据，不新增“一键系统导览”、不新增 `demo=1` 自动重置，也不单独重做 storybook 页面。

目标页面：

- `/teacher`
- `/teacher/agent?action=weekly-summary`
- `/teacher/high-risk-consultation`
- `/admin`
- `/parent`
- `/parent/storybook?child=c-1`
- `/parent/agent?child=c-1`

## 关键账号与角色

- 班级：晨曦班，`class-morning`
- 教师：周老师，`u-teacher2`
- 管理端：园长/管理员，`u-admin`
- 家长账号：林小雨妈妈，`u-parent`
- 家长可见儿童保持现有 demo 范围：`c-1`、`c-4`

## 核心儿童矩阵

| ID | 姓名 | 答辩场景 | 主要展示点 |
| --- | --- | --- | --- |
| `c-1` | 林小雨 | 走廊活动害怕退缩 | 勇敢表达与小步尝试、固定绘本、今晚行动、家庭反馈 |
| `c-2` | 高远舟 | 午睡焦虑、饮水少、离园前复查 | 家长沟通待回复、48 小时复查任务、高风险会诊 |
| `c-3` | 陈安安 | 午餐进食偏少 | 饮食观察、家园同步、补充成长记录 |
| `c-4` | 赵一诺 | 情绪稳定 | 正常对照样本 |
| `c-5` | 王沐辰 | 偶发咳嗽 | 健康材料待解析、园内继续观察 |
| `c-6` | 刘予安 | 主动分享玩具 | 正向成长记录和成长故事素材 |

## 数据结构

新增数据入口：

- `lib/demo-data/defense-scenario.ts`：答辩账号、班级、儿童画像和 dataset version。
- `lib/demo-data/defense-fixture.ts`：将答辩场景合并进 `createDemoSeedSnapshot()` 产出的 D-SEED snapshot。

fixture 覆盖以下 bucket：

- `children`：将 `c-1` 到 `c-6` 校准为晨曦班 / 周老师；保持 36 名儿童和 18/18 班级拆分。
- `attendance`：目标儿童今日均在园，支撑教师端首页 `presentChildren`。
- `health`：高远舟、王沐辰、林小雨有固定关注记录，赵一诺为正常对照。
- `meals`：陈安安今日午餐固定为进食偏少；高远舟今日饮水偏少。
- `growth`：补足林小雨勇敢表达、陈安安饮食观察、刘予安主动分享等固定记录。
- `feedback`：林小雨家庭反馈固定为“孩子能复述故事，并愿意尝试走到门口”。
- `messages` / `conversations`：高远舟家长沟通待回复；林小雨、陈安安、王沐辰有家园沟通闭环。
- `tasks` / `reminders`：今晚家庭行动、48 小时复查、补成长记录、健康材料解析跟进。
- `consultations` / `interventionCards`：至少 4 条答辩风险数据，其中至少 3 条进入管理端风险优先级。
- `storybooks`：林小雨继续复用现有固定绘本《林小雨的一小步勇敢》。
- `weeklyReports`：新增 `weekly-report-defense-morning`，作为晨曦班答辩周报快照。
- `healthMaterials`：王沐辰健康材料固定为 `pending`，用于展示待解析状态。

## 使用方式

正常使用现有 demo 登录按钮或 demo session header 即可：

- 管理端：`demo-admin`
- 周老师：`demo-teacher-zhou`
- 家长端：`demo-parent-lin`

`DEMO_DATASET_VERSION` 已更新为 `v6-defense-scenario`。这会让浏览器使用新的 demo localStorage namespace，并让服务端 demo snapshot cache 使用带版本的 key。它不是自动重置逻辑，也不会添加 `demo=1` 之类的入口。

## 页面验收点

- `/teacher`：晨曦班有 18 名可见儿童，今日在园、健康异常、任务、消息等数字不再大量为 0。
- `/teacher/agent?action=weekly-summary`：班级上下文包含林小雨、高远舟、陈安安、王沐辰、刘予安的数据。
- `/teacher/high-risk-consultation`：可看到固定会诊、干预卡和 48 小时复查线索。
- `/admin`：风险优先级板至少展示 3 条可解释风险。
- `/parent?child=c-1`：林小雨首页有成长故事、今晚行动和反馈入口。
- `/parent/storybook?child=c-1`：展示固定绘本《林小雨的一小步勇敢》。
- `/parent/agent?child=c-1`：可围绕今晚行动提交或查看家庭反馈。

## 验证命令

```bash
npm run test:demo-data-consistency
npm run storybook:xiaoyu:test
npm run product:smoke
```

如修改了类型导出或页面组件，再运行：

```bash
npm run lint
npm run typecheck
```
