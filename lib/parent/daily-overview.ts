import type { ParentHomeData } from "@/lib/demo-data/types";

export type ParentDailyRecord = ParentHomeData["dailyRecords"][number];

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

/** 带时区的时间戳按业务时区归日；历史纯日期保持原来的发生日期。 */
export function parentRecordDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function buildParentDailyOverview(records: readonly ParentDailyRecord[], childId: string) {
  return records.filter(record => record.childId === childId && record.visibleToParent !== false)
    .map(record => {
      const payload = record.payload;
      const summary = record.type === "growth" ? text(payload.description)
        : record.type === "morning-check" ? [
          typeof payload.temperature === "number" ? `${payload.temperature.toFixed(1)}°C` : "",
          text(payload.mood), text(payload.remark),
        ].filter(Boolean).join(" · ")
        : [text(payload.meal), Array.isArray(payload.foods) ? payload.foods.map(food => typeof food === "object" && food ? text((food as { name?: unknown }).name) : text(food)).filter(Boolean).join("、") : "",
          typeof payload.waterMl === "number" ? `饮水 ${payload.waterMl}ml` : "",
        ].filter(Boolean).join(" · ");
      const media = record.type === "diet" ? payload.photoUrls : payload.mediaUrls;
      return {
        id: record.recordId, date: parentRecordDateKey(record.createdAt),
        title: record.type === "growth" ? text(payload.category) || "成长观察" : record.type === "morning-check" ? "健康晨检" : "饮食记录",
        summary: summary || "本条记录暂无详细说明。", recorder: text(record.createdBy) || "未注明",
        occurredAt: record.createdAt, updatedAt: text(record.updatedAt) || record.createdAt,
        mediaUrls: Array.isArray(media) ? [...new Set(media.map(text).filter(Boolean))].slice(0, 4) : [],
      };
    }).filter(record => record.date)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
