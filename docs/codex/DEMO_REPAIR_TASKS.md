# Demo Repair Tasks

更新日期：`2026-05-18`

本任务表是后续 Codex 修复线程的总控入口。所有修复只围绕“AI 助手稳定性”和“答辩演示数据完整性”推进。

## 当前最可能的问题链路

`teacher agent 页面 -> /api/ai/teacher-agent -> brain proxy 不可用后进入 Next fallback -> fallback 仍依赖外部 vivo 或当前 demo snapshot -> demo data 不足时结果变薄、空或 provider_unavailable`

## 全局约束

- 不新增“一键系统导览 / resetDemo / demo=1 自动重置页面”这类功能。
- 不单独重做 `/parent/storybook` 页面；绘本页只使用现有页面能力和示例数据支撑。
- 不删除教师端、管理端、家长端主路径页面。
- 不绕过现有鉴权和角色权限。
- 不把真实用户数据硬编码到生产逻辑中；演示数据必须通过 demo fixture、mock provider、seed script 或 app snapshot 注入。
- AI fallback 输出必须保持结构化，主要演示页必须在无外部 AI 服务时仍可展示。

## 任务清单

| 任务编号 | 目标 | 需关注文件 | 验收标准 | 是否允许新增测试 | 是否允许新增 demo fixture | 建议执行顺序 |
| --- | --- | --- | --- | --- | --- | --- |
| DR-00 | 总控文档落地 | `AGENTS.md`、`docs/codex/DEMO_REPAIR_TASKS.md` | 两个文件存在；`AGENTS.md` 已写入 Demo Repair guardrails；本文件包含任务编号、目标、需关注文件、验收标准、测试/fixture 权限和执行顺序 | 否 | 否 | 0 |
| DR-01 | 教师 AI 助手 fallback 契约 | `app/api/ai/teacher-agent/route.ts`、`lib/ai/server.ts`、`lib/ai/fallback.ts`、`lib/agent/teacher-agent.ts` | 在 Brain 不可用且无外部 AI 服务时，`communication`、`follow-up`、`weekly-summary` 三种 workflow 均返回结构化 `TeacherAgentResult`；结果包含非空 `summary`、`highlights`、`actionItems` 和明确 `source/fallback` provenance，不返回空文本或裸 503 | 是 | 按需允许 | 1 |
| DR-02 | 教师周总结演示数据完整性 | `lib/demo-data/seed.ts`、`lib/persistence/state-scope.ts`、`backend/app/db/demo_snapshot.py`、现有 demo-data consistency 测试 | `/teacher/agent?action=weekly-summary` 能基于可见班级数据展示非空 `summary`、`highlights`、`actionItems`、`keyChildren`、`riskTypes`；教师角色 scoped snapshot 不缺少周总结所需健康、成长、反馈数据 | 是 | 是 | 2 |
| DR-03 | 高风险会诊/Admin 演示兜底 | `app/teacher/high-risk-consultation/page.tsx`、`app/api/ai/high-risk-consultation/route.ts`、`app/api/ai/high-risk-consultation/stream/route.ts`、`lib/consultation/trace-fixtures.ts`、demo snapshot | `/teacher/high-risk-consultation` 与 `/admin` 在外部 AI/Brain 不可用时仍能展示 trace、priority、provenance；兜底状态清楚标识为 fallback/mock/demo，不伪装成 live provider | 是 | 是 | 3 |
| DR-04 | Parent agent/storybook 数据完整性 | `app/parent/agent/page.tsx`、`app/parent/storybook/page.tsx`、`app/api/ai/parent-storybook/route.ts`、`lib/server/parent-storybook-cache.ts`、storybook seed 相关文件 | `/parent/agent?child=c-1` 与 `/parent/storybook?child=c-1` 可离线展示；不重做 `/parent/storybook` 页面；不把 `demoSeed` 自动注入正常导航；已保存绘本或 fixture 能支撑答辩展示 | 是 | 是 | 4 |
| DR-05 | 鉴权和角色权限回归 | `lib/server/ai-route-guard.ts`、`lib/persistence/state-scope.ts`、AI route auth tests | 越权 child/role 请求仍返回 `401/403`；任何 fallback、fixture、mock provider 都不能扩大用户可见 child/class 范围 | 是 | 否 | 5 |
| DR-06 | 保护路径无外部 AI smoke | Playwright/route smoke tests、保护路径相关页面与 API | 保护路径 `/teacher`、`/teacher/agent?action=weekly-summary`、`/teacher/high-risk-consultation`、`/admin`、`/parent`、`/parent/storybook?child=c-1`、`/parent/agent?child=c-1` 在 AI endpoints 失败或 provider 缺失时不白屏、不暴露未处理 `500/503`，并展示可解释 fallback 状态 | 是 | 否 | 6 |

## 建议执行顺序

1. 先完成 DR-00，锁定后续线程边界。
2. 再做 DR-01，优先修复 `/api/ai/teacher-agent` 离线结构化 fallback。
3. 再做 DR-02，补齐教师周总结所需 demo data。
4. 再做 DR-03 和 DR-04，分别覆盖高风险/Admin 与 Parent 演示链路。
5. 最后做 DR-05 和 DR-06，统一验证权限边界和保护路径 smoke。
