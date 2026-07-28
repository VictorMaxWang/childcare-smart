# Demo Persistence Spec

本阶段采用 demo-grade 功能闭环。demo 持久化不是生产后端，但必须刷新后仍存在，并且必须按 role、childId、classId 隔离。

## 存储决策

1. demo 账号
   - 只写共享机构级 localStorage。
   - 共享 namespace：`demo:{DEMO_DATASET_VERSION}:institution:{institutionId}`。
   - 当前 D01 版本：`demo:v5-d01-shared-demo:institution:{institutionId}`。
   - 读取和写入时必须再通过 session scope 做 child/class/role 隔离。
   - 不调用 `/api/state` PUT。
   - UI 必须能区分 `local_only` 或演示持久化。

2. normal 账号
   - 先写本地 snapshot，保证当前会话即时反馈。
   - 后台 PUT `/api/state`。
   - 远端失败时不能展示远端成功；必须显示失败或 local-only 状态。

3. 远端不可用
   - 可继续 local-only 演示。
   - 不允许把 local-only 伪装成生产保存成功。

## localStorage key

沿用现有 scoped key 思路，D01 需要把规则集中到公共 helper：

- demo namespace: `demo:{DEMO_DATASET_VERSION}:institution:{institutionId}`
- normal namespace: `normal:{institutionId}:{role}:{userId}`
- bucket key: `childcare.{namespace}.{bucketVersion}`

D01 保留 legacy user namespace 兼容读取：`demo:v4-demo-recovery-hotfix:{userId}`。新写入只进入机构级 namespace，避免家长、教师、园长各自持有互不可见的数据副本。

## Snapshot 规则

- 所有读入数据必须经过 `normalizeAppStateSnapshot`。
- 缺失 bucket 补空数组或默认值。
- legacy 字段由 normalizer 或 migration helper 升级。
- `updatedAt` 每次写入更新。
- 建议 D01 增加显式 schema 字段：`demoPersistenceSchemaVersion: "d01-v1"`。
- D01 已增加并在 seed、empty snapshot、normalizer 中保留该字段。

## 写入规则

- 所有写入必须走统一 mutation helper。
- helper 返回明确结果：`remote_synced`、`local_only`、`failed`。
- UI 只有在 `remote_synced` 或明确 `local_only` 被用户可见标识时才允许显示成功态。
- 不允许点击后只 toast 成功但 snapshot 没变化。
- 不允许只改 React state 后刷新丢失。

## 隔离规则

- 家长只能写自己授权 childId 的反馈、提醒状态和家庭侧任务证据。
- 教师只能写本班 childId 的晨检、饮食、成长、会诊备注和回复。
- 园长只能写同机构内的风险处理、周报生成记录、反馈处理状态。
- 任何 childId 不匹配必须拒绝写入，并显示失败态。

## 迁移策略

1. D01 保守实现：继续使用 `AppStateSnapshot` JSON，补齐 schemaVersion、normalizer、migration 和 mutation helper。
2. 后续影子表：为 feedback、consultations、tasks、reminders 等高价值实体建规范表。
3. 生产切换：实体表成为主读写，snapshot 降级为演示 seed、导入导出和备份。
