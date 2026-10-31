import { normalizeLocalDate } from "@/lib/date";

const BUSINESS_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 反馈同时存在历史纯日期和服务端ISO时间戳。只在消费时归日，不改写date/submittedAt原文。
 * 纯日期/无时区墙上时间保留原日；明确Z或offset的瞬时时间统一到业务UTC+8。
 */
export function normalizeFeedbackBusinessDate(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "";
  if (/^\d{8}$/u.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/[T\s]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/iu.test(text)) {
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? new Date(timestamp + BUSINESS_OFFSET_MS).toISOString().slice(0, 10) : "";
  }
  return normalizeLocalDate(text);
}

export function feedbackBusinessDate(record: { date?: string | null; submittedAt?: string | null }) {
  return normalizeFeedbackBusinessDate(record.date) || normalizeFeedbackBusinessDate(record.submittedAt);
}

export function getFeedbackBusinessToday(now: Date = new Date()) {
  return normalizeFeedbackBusinessDate(now.toISOString());
}

export function isFeedbackOnDate(record: { date?: string | null; submittedAt?: string | null }, date = getFeedbackBusinessToday()) {
  const day = feedbackBusinessDate(record);
  return Boolean(day) && day === normalizeFeedbackBusinessDate(date);
}
