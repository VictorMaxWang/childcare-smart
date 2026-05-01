# API Or Local Store Decisions

## 总原则

- 有真实业务 API 时优先接真实 API。
- 当前没有细粒度业务 API 的功能，先通过 D01 统一 demo persistence 闭环。
- 不允许页面各自写 localStorage。
- 不允许只 toast 成功但没有 snapshot 状态变化。

## 当前真实接口

| 接口 | 用途 | 决策 |
| --- | --- | --- |
| `/api/state` | normal 账号远端 snapshot GET/PUT | 保留为本阶段远端持久化入口。 |
| `/api/auth/*` | 登录、注册、session | 保留。 |
| `/api/ai/*` | AI/agent/fallback | AI 只作为生成或建议来源，不作为业务写入成功依据。 |
| FastAPI backend | brain/agent/memory | 不在 D00/D01 中改为主业务数据库。 |

## 本阶段本地持久化

| 功能 | 决策 |
| --- | --- |
| demo 家长反馈 | 写统一机构级 snapshot/localStorage，并明确 local-only。 |
| demo 教师回复 | 写统一机构级 snapshot/localStorage，不再只写页面 state。 |
| demo 记录保存 | 写统一机构级 snapshot/localStorage，刷新保留并可被授权家长读取。 |
| demo 会诊结果 | 写统一机构级 snapshot/localStorage，教师和园长从同一数据源读取。 |
| demo 看板/周报 | 默认派生，必要时保存生成结果和处理状态。 |

## D01 公共数据层

| 能力 | 决策 |
| --- | --- |
| `lib/demo-data` | 作为 D02-D06 的公共 demo-grade 数据 API。 |
| `/api/state` | normal 账号继续使用；demo 账号仍禁止 PUT。 |
| AI/fallback 结果 | 只能作为生成来源，必须通过 D01 action 写入后才算业务保存。 |
| 跨角色同步 | demo 账号使用 `demo:v5-d01-shared-demo:institution:{institutionId}` 共享 bucket，再按 session scope 裁剪。 |
| 未授权 childId | D01 `mutateAppSnapshot` 返回 `failed`，不写入 snapshot。 |

## 后续 API gap

- 细粒度 `messages/threads` API。
- 细粒度 `health-records`、`meal-records`、`growth-records` API。
- `health-material-parse-tasks` API。
- `consultations` API。
- `tasks/reminders` API。
- `weekly-reports` export/share API。

这些缺口由各 D 线程补充到结果文件，D90 统一合并。
