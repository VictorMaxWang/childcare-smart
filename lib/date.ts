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
