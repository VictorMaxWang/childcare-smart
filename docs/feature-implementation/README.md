# D00 智慧托育平台功能补齐总控

本目录承接 `docs/feature-audit` 的 C10-C23 功能完整性审计，将发现的问题转化为 D01-D08 可执行开发任务。

本阶段目标不是继续视觉还原，而是补齐真实功能闭环：

- 主按钮必须有真实行为。
- 保存、回复、处理后必须有状态变化。
- 刷新后数据仍存在。
- 家长、教师、园长能看到同一业务数据的授权视角。
- visual-only、mock-only、fake-success 必须被替换、禁用或明确标识。

## 关键结论

- 项目已有 Next API、FastAPI、MySQL snapshot 持久化路径。
- 当前业务主线仍是 `lib/store.tsx`、scoped localStorage、`/api/state`、`app_state_snapshots.snapshot` 的混合方案。
- demo 账号不写远端 `/api/state`，需要明确归类为演示持久化。
- D01 必须先统一数据层，D02-D07 只能调用 D01 公共 API。

## 文件说明

- `IMPLEMENTATION_PLAN.md`: D01-D08 总体实施路线。
- `DATA_MODEL_SPEC.md`: 统一领域模型。
- `DEMO_PERSISTENCE_SPEC.md`: demo/local/remote snapshot 持久化规则。
- `FEATURE_THREAD_MATRIX.md`: 串行、并行和文件冲突边界。
- `FILE_OWNERSHIP.md`: 后续线程主要文件归属。
- `FINDING_TO_TASK_MAP.md`: C findings 到 D 任务的去重分派。
- `API_OR_LOCAL_STORE_DECISIONS.md`: 真实 API 与演示持久化决策。
- `ACCEPTANCE_CRITERIA.md`: 功能补齐验收标准。
- `IMPLEMENTATION_STATUS.md`: D00 创建的初始状态，不由 D02-D08 并行线程直接修改。
- `PRODUCT_DECISIONS_NEEDED.md`: 产品规则待定项。
- `results/`: 后续线程结果文件。
- `prompts/`: D01-D08、D90、D99 后续执行提示词。

