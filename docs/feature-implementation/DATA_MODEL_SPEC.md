# 数据模型规范

本阶段以现有 `AppStateSnapshot` 为权威演示业务数据结构。D01 应补齐类型、normalizer、迁移和 helper，让 D02-D07 通过统一 API 读写。

## D01 实施结果

- `AppStateSnapshot` 已增加 `demoPersistenceSchemaVersion: "d01-v1"` 可选字段。
- `normalizeAppStateSnapshot` 已支持缺失 bucket 自动补空数组，旧 snapshot 不会因为缺少 D01 新 bucket 被拒绝。
- D01 新增 bucket：`messages`、`conversations`、`healthMaterials`、`nutritionMenus`、`storybooks`。
- 新 bucket 已纳入 `scopeSnapshotForSessionUser` 和 `mergeScopedSnapshotForSessionUser`：消息、会话、健康材料、绘本按 `childId` 隔离；餐谱按授权 child 所在 `className` 隔离。
- D02-D06 应优先调用 `lib/demo-data` 导出的 selectors/actions，而不是页面内各自写 localStorage。

## 权威 snapshot bucket

- `children`
- `attendance`
- `health`
- `meals`
- `growth`
- `feedback`
- `consultations`
- `interventionCards`
- `tasks`
- `taskCheckIns`
- `reminders`
- `mobileDrafts`
- `messages`
- `conversations`
- `healthMaterials`
- `nutritionMenus`
- `storybooks`
- `updatedAt`

## 基础实体

### User

- `id`
- `username?`
- `name`
- `role`: `家长`、`教师`、`机构管理员`
- `institutionId`
- `className?`
- `childIds?`
- `accountKind`: `demo` 或 `normal`

### Child

- `id`
- `institutionId`
- `className`
- `parentUserId?`
- `name`
- `birthDate`
- `gender`
- `heightCm?`
- `weightKg?`
- `allergies?`
- `guardians?`
- `specialNotes?`

## 记录实体

### AttendanceRecord

- `id`
- `childId`
- `date`
- `isPresent`
- `checkInAt?`
- `checkOutAt?`
- `absenceReason?`

### HealthRecord

- `id`
- `childId`
- `date`
- `temperature`
- `mood`
- `handMouthEye?`
- `isAbnormal?`
- `remark?`
- `checkedBy`
- `checkedByRole`

### MealRecord

- `id`
- `childId`
- `date`
- `meal`
- `foods[]`
- `waterMl?`
- `intakeLevel?`
- `preference?`
- `nutritionScore?`
- `aiEvaluation?`
- `recordedBy`
- `recordedByRole`

### GrowthRecord

- `id`
- `childId`
- `createdAt`
- `recorder`
- `recorderRole`
- `category`
- `tags[]`
- `description`
- `needsAttention`
- `followUpAction?`
- `reviewDate?`
- `reviewStatus?`
- `mediaUrls?`

## 沟通与反馈实体

### GuardianFeedback

- `id` 或 `feedbackId`
- `childId`
- `relatedTaskId?`
- `relatedConsultationId?`
- `executionStatus`
- `executorRole`
- `childReaction`
- `improvementStatus`
- `barriers[]`
- `notes`
- `attachments[]`
- `submittedAt`
- `createdBy`
- `createdByRole`
- `teacherReplies[]`
- `status`

### CommunicationThread

本阶段可由 `GuardianFeedback` 扩展实现，不强制新建独立表。

- `threadId`
- `childId`
- `sourceFeedbackId?`
- `participants[]`
- `messages[]`
- `status`
- `createdAt`
- `updatedAt`

### CommunicationMessage

- `messageId`
- `threadId`
- `childId`
- `senderUserId`
- `senderRole`
- `body`
- `attachments[]`
- `createdAt`
- `readBy[]`

## 健康材料与会诊实体

### HealthMaterialParseTask

- `taskId`
- `childId`
- `fileName`
- `fileKind`
- `sourceRole`
- `status`: `pending`、`parsed`、`failed`、`archived`
- `parsedSummary?`
- `riskItems[]`
- `createdAt`
- `updatedAt`

### ConsultationResult

- `consultationId`
- `childId`
- `riskLevel`
- `triggerType[]`
- `triggerReasons[]`
- `agentFindings[]`
- `summary`
- `actions[]`
- `evidenceItems[]`
- `notes[]`
- `status`: `draft`、`active`、`resolved`
- `memoryMeta?`
- `providerTrace?`
- `generatedAt`
- `updatedAt`

### InterventionCard

- `id`
- `targetChildId`
- `consultationId?`
- `riskLevel`
- `summary`
- `todayInSchoolAction`
- `tonightHomeAction`
- `reviewIn48h`
- `parentMessageDraft`
- `source`
- `createdAt`
- `updatedAt`

## 任务与提醒实体

### CanonicalTask

- `taskId`
- `taskType`
- `childId`
- `sourceType`
- `sourceId`
- `ownerRole`
- `title`
- `description`
- `dueAt`
- `dueWindow`
- `status`
- `evidenceSubmissionMode`
- `legacyRefs?`
- `createdAt`
- `updatedAt`

### ReminderItem

- `reminderId`
- `childId?`
- `targetRole`
- `targetId`
- `taskId?`
- `sourceId?`
- `scheduledAt`
- `status`
- `title`
- `description`
- `createdAt`
- `updatedAt`

### MobileDraft

- `draftId`
- `childId`
- `draftType`
- `targetRole`
- `content`
- `structuredPayload?`
- `persistenceScope`: `local-only` 或 `remote`
- `syncStatus`
- `createdAt`
- `updatedAt`

## 派生模型

### DashboardSummary

园长看板、教师工作台、家长首页和周报默认从 snapshot 派生，不作为第一阶段权威数据保存。

- `summaryType`
- `scope`: institution、class、child
- `periodStart`
- `periodEnd`
- `payload`
- `generatedAt`
- `sourceRecordIds[]`

## 权限规则

- 园长：只能访问同 `institutionId` 全园数据。
- 教师：只能访问同 `institutionId` 且同 `className` 的孩子及其 child-scoped 记录。
- 家长：优先按 `childIds[]` 授权，否则按 `parentUserId === user.id`，并且必须同 `institutionId`。
- 所有 child-scoped 记录必须有 `childId`。
- 写回时不得用客户端全量覆盖未授权范围，必须保留非授权 child 数据。
