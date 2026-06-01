# Admin Dispatch Contract

## 目标

管理端派单必须进入同一条任务链：园长创建治理动作后，教师端能看到并处理；教师完成后，管理端 assignment 和 notification event 状态同步变化。

## 唯一事实源

`CanonicalTask` 是派单事实源。

- 管理端派单写入 `CanonicalTask`，固定 `sourceType: "admin_dispatch"`。
- 同一个 `dispatchId` 写入 `CanonicalTask.sourceId`。
- `CanonicalTask.taskId` 是内部任务 ID；`sourceId`/`dispatchId` 是跨视图关联 ID。
- `ownerRole` 表示承接角色，`assigneeId`/`assigneeName` 表示具体承接人。
- `createdBy` 保留创建人，用于审计和兼容展示。

## 三个视图的关系

`Assignment` 是教师可执行视图。

- 仅 `ownerRole === "teacher"` 的 admin dispatch 进入教师任务链。
- `assignmentId === dispatchId === CanonicalTask.sourceId`。
- `/api/assignments` 从 canonical task 投影返回，不再维护第二套状态。
- 教师 PATCH `/api/assignments/[assignmentId]` 更新 canonical task 状态，并同步 reminder。

`NotificationEvent` 是园长端展示和兼容镜像视图。

- `/api/admin/notification-events` GET 优先返回 canonical task 投影。
- DB `admin_notification_events` 仅作为 legacy/best-effort mirror。
- canonical 与 DB 同 ID 时，canonical 记录优先。
- DB-only legacy event 可继续展示，但标记为未绑定 canonical task；不保证进入教师任务链。

`ReminderItem` 是教师端提醒视图。

- 创建 teacher dispatch 时同步生成 reminder。
- `reminder.sourceType === "admin_dispatch"`，`reminder.sourceId === dispatchId`，`reminder.taskId === CanonicalTask.taskId`。

## 状态映射

Canonical task / assignment:

- `pending`
- `in_progress`
- `completed`

Reminder:

- `pending` -> `pending`
- `in_progress` -> `acknowledged`
- `completed` -> `done`

Notification event:

- 从 canonical task status 投影为 `pending | in_progress | completed`。
- PATCH notification event 时先更新 canonical task，再 best-effort 同步 DB mirror。

## 展示字段

管理端 notification 卡片、管理端 48h task 面板、教师端 reminder/assignment 卡片都应展示：

- `source`
- `status`
- `createdAt`
- `assigneeRole`

API assignment 额外返回：

- `sourceType`
- `sourceId`
- `assigneeRole`

Notification event 额外返回：

- `assignmentId`
- `taskId`
- `reminderId`
- `sourceType`
- `sourceId`
- `assigneeRole`
- `assigneeId`
- `assigneeName`
- `source.taskId`
- `source.sourceType`
- `source.sourceId`
- `source.relatedTaskIds`

## Demo 与 DB Mirror 策略

Demo 账号继续使用 `DefaultAppDataRepository` 的内存/snapshot 持久层。

- Demo 不依赖 DB notification table。
- Demo 创建派单只要求 canonical task、assignment、reminder 闭环。
- Demo notification events 从 canonical projection 返回。

非 demo 账号：

- 创建派单先写 canonical task，再 best-effort 写 DB mirror。
- 更新状态先写 canonical task/reminder，再 best-effort 更新 DB mirror。
- DB mirror 失败不影响教师端可见性或 canonical 状态闭环。

## 兼容边界

- 不做历史 DB notification event 数据迁移。
- legacy DB-only event 仍可在管理端展示，但不会自动生成 teacher assignment。
- `sourceType/sourceId` 缺失的 legacy event 会按 `legacy_notification_event` 展示。
- 后续迁移历史事件时，必须生成 canonical task 并保持 `dispatchId` 一致。
