# CRUD And Archive Spec

## Entities

E02 最小覆盖：

- `children`
- `teachers`
- `attendance`
- `healthRecords`
- `mealRecords`
- `growthRecords`

E03-E05 延伸覆盖：

- `weeklyReports`
- `feedback`
- `attachments`
- `healthMaterials`
- `consultations`
- `storybookVersions`

## Archive Model

所有“删除”默认软归档：

```ts
{
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  restoredAt?: string;
  restoredBy?: string;
}
```

普通列表默认隐藏 `archivedAt` 非空对象；带 `includeArchived=true` 且有权限时可查看。恢复只清空归档字段并写审计记录。硬删除不进入 MVP。

## Confirmation Rules

- 创建草稿：轻确认。
- 保存正式记录、回复、发送、归档、恢复、派单：强确认。
- 命令式语音写入必须展示目标孩子、动作、摘要和保存位置。
- 缺少孩子、目标对象、内容或置信度低时必须补问，不得直接写入。

## Refresh Persistence

每个 CRUD 验收都必须覆盖：

- 创建后刷新仍存在。
- 编辑后刷新仍保留新值。
- 归档后默认列表隐藏。
- 恢复后默认列表重新可见。
- 越权用户不可读取或写入。

