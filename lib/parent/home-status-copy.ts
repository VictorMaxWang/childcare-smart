export function buildParentHomeStatusCopy(input: {
  childName: string; todayText: string; hasRecords: boolean;
  dataUpdatedAt?: string | null; aiProvenance: "loading" | "ai" | "local-rule";
}) {
  const parsed = input.dataUpdatedAt ? new Date(input.dataUpdatedAt) : null;
  const updated = parsed && !Number.isNaN(parsed.getTime())
    ? /^\d{4}-\d{2}-\d{2}$/.test(input.dataUpdatedAt!)
      ? input.dataUpdatedAt
      : parsed.toLocaleString("zh-CN", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  return {
    greeting: input.hasRecords
      ? `${input.todayText}，查看${input.childName}已保存的一日记录，再决定今晚怎么做。`
      : `${input.childName}还没有已同步的一日记录，暂时无法判断今天的状态。`,
    updateLabel: updated ? `记录更新于 ${updated}` : "暂无已同步记录",
    focusTitle: input.aiProvenance === "ai" ? "AI 建议回看重点" : "可与老师沟通的观察点",
    focusSource: input.aiProvenance === "ai" ? "AI 建议" : "记录规则建议",
  };
}
