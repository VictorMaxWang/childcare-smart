import { normalizeBusinessDate } from "@/lib/date";

type HealthRecord = { childId: string; date: string; isAbnormal: boolean; updatedAt?: string; createdAt?: string };
export type HealthDailyFilter = "all" | "checked" | "abnormal" | "unchecked";

/** 晨检完成情况以全部可见幼儿为分母；出勤登记单独计数，不能把未签到儿童的真实晨检归零。 */
export function buildHealthDailySummary<C extends { id: string }, R extends HealthRecord>(
  visibleChildren: readonly C[], records: readonly R[], presentChildren: readonly { id: string }[], today = normalizeBusinessDate(new Date().toISOString()),
) {
  const visibleIds = new Set(visibleChildren.map(child => child.id));
  const todayRecords = new Map<string, R>();
  const revisionTime = (record: R) => Date.parse(record.updatedAt || record.createdAt || record.date) || 0;
  for (const record of records) {
    if (!visibleIds.has(record.childId) || normalizeBusinessDate(record.date) !== today) continue;
    const previous = todayRecords.get(record.childId);
    // 同一儿童同日多次复核时只计一人，列表与汇总使用同一份最新记录。
    if (!previous || revisionTime(record) >= revisionTime(previous)) todayRecords.set(record.childId, record);
  }
  const children = visibleChildren.map(child => ({ ...child, health: todayRecords.get(child.id) }));
  const presentIds = new Set(presentChildren.filter(child => visibleIds.has(child.id)).map(child => child.id));
  const checked = children.filter(child => child.health).length;
  const abnormal = children.filter(child => child.health?.isAbnormal).length;
  const stats = { total: children.length, present: presentIds.size, checked, abnormal, unchecked: children.length - checked };
  return { children, stats };
}

export function filterHealthDailyChildren<C extends { name: string; nickname?: string; health?: HealthRecord }>(
  children: readonly C[], status: HealthDailyFilter, search = "",
) {
  return children.filter(child => {
    if (!child.name.includes(search) && !child.nickname?.includes(search)) return false;
    if (status === "checked") return Boolean(child.health);
    if (status === "unchecked") return !child.health;
    if (status === "abnormal") return Boolean(child.health?.isAbnormal);
    return true;
  });
}
