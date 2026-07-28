# 文档导航

本目录只保留仍在维护的事实源、运行手册和验收入口。2026 年第二季度已经收口的提示词、状态表、执行日志和审计结果已从当前文件树移除；需要追溯时使用 Git 历史。

## 先读这些

发生口径冲突时，先核对代码事实，再按下列顺序阅读：

1. [`competition-message-guide.md`](competition-message-guide.md)：比赛与产品统一口径。
2. [`current-status-ledger.md`](current-status-ledger.md)：当前阶段、稳定路径和验证边界。
3. [`competition-architecture.md`](competition-architecture.md)：比赛架构、lane 与共享契约。
4. [`task-registry.md`](task-registry.md)：当前任务、依赖和验收登记。
5. [`../AGENTS.md`](../AGENTS.md)：线程启动、协作和回写规则。

## 按主题查找

| 主题 | 入口 | 用途 |
| --- | --- | --- |
| 智能体工作流 | [`agent-workflows.md`](agent-workflows.md) | 三角色智能体协作与数据回流说明 |
| 认证与注册 | [`auth/`](auth/) | 当前认证审计、真实数据库注册后续计划 |
| 演示与答辩 | [`demo/`](demo/) | 演示脚本、素材、种子矩阵、冻结检查单 |
| QA 与 Smoke | [`qa/`](qa/) | Teacher 会诊/语音与 Parent 趋势定向验收 |
| 发布与部署 | [`release/`](release/) | VPS、生产发布、回滚和限制说明 |
| 安全 | [`security/`](security/) | 租户隔离等安全审计 |
| 状态契约 | [`status/`](status/) | AI、存储、权限和知识库等稳定契约 |
| 当前任务 | [`tasks/`](tasks/) | 仍需执行或跟踪的任务清单 |
| 托育知识库 | [`knowledge/`](knowledge/) | 知识条目及维护说明 |
| Pixel Replica | [`pixel-replica/README.md`](pixel-replica/README.md) | 当前视觉复刻规则与验收入口 |
| README 配图 | [`assets/`](assets/) | 仓库文档使用的静态图片 |

## 文件与生成物约定

- 可重复使用的 Playwright 页面规格位于 [`../tests/fixtures/frontend-replica/page-specs/`](../tests/fixtures/frontend-replica/page-specs/)。
- Frontend Replica 审计输入位于 [`../tests/fixtures/frontend-replica/audit-inputs/`](../tests/fixtures/frontend-replica/audit-inputs/)，Demo Media 命名输入位于 [`../scripts/fixtures/demo-media/`](../scripts/fixtures/demo-media/)。
- 审计、截图、测试结果等可再生成材料写入已忽略的 `artifacts/`，不得回写活动文档目录。
- 不再提交按任务拆分的提示词、一次性实施日志、阶段状态表或生成结果；长期有效的规则应合并进对应主题 README 或事实源。
- `docs/archive/` 与 `docs/pixel-replica/prompts/` 已被明确忽略，避免退休的过程文档再次进入 GitHub 当前树。
