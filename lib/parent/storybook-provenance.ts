interface ChildScopedRecord {
  id: string;
  childId: string;
}

interface CollectStorybookSourceRecordIdsInput {
  childId: string;
  healthCheckRecords: readonly ChildScopedRecord[];
  mealRecords: readonly ChildScopedRecord[];
  growthRecords: readonly ChildScopedRecord[];
  guardianFeedbacks: readonly ChildScopedRecord[];
  taskCheckInRecords: readonly ChildScopedRecord[];
  interventionId?: string;
  consultationId?: string;
}

/**
 * 汇总 AI 绘本实际读取的业务记录，去重后作为可追溯来源写入绘本。
 * 这里只接收已按当前会话授权加载的数据，且再次按 childId 收窄。
 */
export function collectStorybookSourceRecordIds(
  input: CollectStorybookSourceRecordIdsInput
) {
  const recordGroups = [
    input.healthCheckRecords,
    input.mealRecords,
    input.growthRecords,
    input.guardianFeedbacks,
    input.taskCheckInRecords,
  ];
  const ids = recordGroups.flatMap((records) =>
    records
      .filter((record) => record.childId === input.childId)
      .map((record) => record.id)
  );
  ids.push(input.interventionId ?? "", input.consultationId ?? "");

  return [...new Set(ids.filter(Boolean))];
}
