const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalToday() {
  return formatLocalDate(new Date());
}

export function parseLocalDate(dateString: string) {
  const normalized = normalizeLocalDate(dateString);
  if (!normalized) {
    return new Date(NaN);
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftLocalDate(baseDate: string, diffDays: number) {
  const date = parseLocalDate(baseDate);
  date.setDate(date.getDate() + diffDays);
  return formatLocalDate(date);
}

export function startOfLocalDay(dateString: string) {
  return parseLocalDate(dateString).getTime();
}

export function buildRecentLocalDateRange(days: number, endDate = getLocalToday()) {
  return Array.from({ length: days }, (_, index) => shiftLocalDate(endDate, index - (days - 1)));
}

export function isDateWithinLastDays(dateString: string, days: number, today = getLocalToday()) {
  const pureDate = normalizeLocalDate(dateString);
  if (!pureDate) return false;

  const diff = startOfLocalDay(today) - startOfLocalDay(pureDate);
  return diff >= 0 && diff <= (days - 1) * DAY_MS;
}

export function normalizeLocalDate(value: string) {
  if (!value) return "";

  const explicitMatch = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (explicitMatch) {
    const [, year, month, day] = explicitMatch;
    return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return formatLocalDate(parsed);
}

/**
 * 格式化业务记录中的时钟时间。
 *
 * 出勤记录历史上同时存在 `08:35` 纯时间和完整 ISO 时间戳；直接交给
 * `new Date("08:35")` 会得到 Invalid Date，因此先识别纯时间，再回退到日期解析。
 */
export function formatClockTime(value: string | null | undefined, fallback = "") {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  const timeOnly = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${pad(hour)}:${pad(minute)}`;
    }
    return fallback;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}
