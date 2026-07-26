type FeedbackRecencyRecord = {
  feedbackId?: string;
  id?: string;
  sourceChannel?: string;
  source?: unknown;
  updatedAt?: string;
  submittedAt?: string;
  createdAt?: string;
  date?: string;
};

export function feedbackRecencyTimestamp(feedback: FeedbackRecencyRecord) {
  return feedback.updatedAt ?? feedback.submittedAt ?? feedback.createdAt ?? feedback.date ?? "";
}

export function isFixedDemoFeedback(feedback: FeedbackRecencyRecord) {
  const source =
    feedback.source && typeof feedback.source === "object"
      ? (feedback.source as { workflow?: unknown })
      : undefined;

  return (
    feedback.sourceChannel === "defense-demo" ||
    feedback.feedbackId === "feedback-defense-c-1" ||
    feedback.id === "feedback-defense-c-1" ||
    source?.workflow === "defense-demo-feedback"
  );
}

/**
 * 演示夹具使用固定时间保证截图稳定，但该时间可能晚于用户真实操作。
 * 排序时先让真实提交胜出，再在同一来源类型内按时间倒序。
 */
export function compareFeedbackRecency(
  left: FeedbackRecencyRecord,
  right: FeedbackRecencyRecord
) {
  const fixtureOrder = Number(isFixedDemoFeedback(left)) - Number(isFixedDemoFeedback(right));
  if (fixtureOrder !== 0) return fixtureOrder;
  return feedbackRecencyTimestamp(right).localeCompare(feedbackRecencyTimestamp(left));
}
