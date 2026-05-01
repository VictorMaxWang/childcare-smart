# D01 Core Data Layer

你现在执行 D01：核心数据层。

## 必须读取

- `docs/feature-implementation/README.md`
- `docs/feature-implementation/IMPLEMENTATION_PLAN.md`
- `docs/feature-implementation/DATA_MODEL_SPEC.md`
- `docs/feature-implementation/DEMO_PERSISTENCE_SPEC.md`
- `docs/feature-implementation/FINDING_TO_TASK_MAP.md`
- `docs/feature-implementation/FEATURE_THREAD_MATRIX.md`
- `docs/feature-audit/findings/*.json`
- `docs/feature-audit/findings/*.md`
- `docs/feature-audit/API_GAP_ANALYSIS.md`
- `docs/feature-audit/DATA_PERSISTENCE_AUDIT.md`
- `docs/feature-audit/MOCK_VISUAL_ONLY_AUDIT.md`
- `lib/store.tsx`
- `lib/persistence/snapshot.ts`
- `lib/persistence/state-scope.ts`
- `app/api/state/route.ts`

## 任务范围

只处理 D01-G01 到 D01-G05。

实现统一数据层，供 D02-D07 调用：

- 统一 snapshot schema/version。
- demo persistence helper。
- seed 数据读取和迁移。
- role/child/class mapping 和授权 guard。
- mutation helper，返回 `remote_synced`、`local_only`、`failed`。
- event/update helper，禁止页面只 toast 成功。

## 要求

- 可以使用 subagents 做只读分析，但必须由本线程完成代码修改。
- 实际修改代码。
- 不直接修改 `docs/feature-implementation/IMPLEMENTATION_STATUS.md`。
- 修复后写 `results/D01-result.json` 和 `results/D01-result.md`。
- 运行 `npm run lint` 和 `npm run build`。
- 使用 Playwright 或 Browser Use 验证至少一个 demo 写入刷新保留路径。

## 验收

- demo 写入刷新仍存在。
- normal 账号保留 `/api/state` 路径。
- 未授权 childId 写入被拒绝。
- UI 可区分 local-only 和 remote-synced。
- 不引入大规模数据库迁移。

