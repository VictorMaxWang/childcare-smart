export interface StorybookOrderValue {
  generatedAt: string;
  updatedAt?: string;
}

export function resolveStorybookActivityAt(storybook: StorybookOrderValue) {
  return storybook.updatedAt?.trim() || storybook.generatedAt;
}

export function compareStorybooksByLatestSave(
  left: StorybookOrderValue,
  right: StorybookOrderValue
) {
  // provider 缓存可能保留旧 generatedAt；用户刚保存或补全媒体的版本应优先展示。
  const activityOrder = resolveStorybookActivityAt(right).localeCompare(
    resolveStorybookActivityAt(left)
  );
  if (activityOrder !== 0) return activityOrder;
  return right.generatedAt.localeCompare(left.generatedAt);
}
