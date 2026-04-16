import type {
  WeeklyReportPayload,
  WeeklyReportPrimaryAction,
  WeeklyReportResponse,
  WeeklyReportRole,
  WeeklyReportSection,
} from "@/lib/ai/types";

type WeeklyReportBadgeVariant = "info" | "warning" | "secondary";

const WEEKLY_REPORT_SOURCE_META = {
  ai: {
    label: "智能生成",
    variant: "info",
  },
  fallback: {
    label: "本地兜底",
    variant: "warning",
  },
  mock: {
    label: "演示结果",
    variant: "secondary",
  },
} as const satisfies Record<
  WeeklyReportResponse["source"],
  { label: string; variant: WeeklyReportBadgeVariant }
>;

const WEEKLY_REPORT_ROLE_META = {
  teacher: {
    label: "教师周报",
  },
  admin: {
    label: "园长周报",
  },
  parent: {
    label: "家长周报",
  },
} as const satisfies Record<WeeklyReportRole, { label: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isWeeklyReportSection(value: unknown): value is WeeklyReportSection {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) => isRecord(item) && typeof item.label === "string" && typeof item.detail === "string"
    )
  );
}

function isWeeklyReportPrimaryAction(value: unknown): value is WeeklyReportPrimaryAction {
  if (!isRecord(value)) return false;

  return (
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.ownerRole === "string" &&
    typeof value.dueWindow === "string"
  );
}

export function isWeeklyReportResponse(value: unknown): value is WeeklyReportResponse {
  if (!isRecord(value)) return false;

  return (
    typeof value.schemaVersion === "string" &&
    typeof value.role === "string" &&
    typeof value.summary === "string" &&
    isStringArray(value.highlights) &&
    isStringArray(value.risks) &&
    isStringArray(value.nextWeekActions) &&
    typeof value.trendPrediction === "string" &&
    Array.isArray(value.sections) &&
    value.sections.every(isWeeklyReportSection) &&
    (value.primaryAction === undefined || isWeeklyReportPrimaryAction(value.primaryAction)) &&
    (value.continuityNotes === undefined || isStringArray(value.continuityNotes)) &&
    typeof value.disclaimer === "string" &&
    (value.source === "ai" || value.source === "fallback" || value.source === "mock") &&
    (value.model === undefined || typeof value.model === "string")
  );
}

async function readErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { error?: string; detail?: string } | null;
    return body?.error ?? body?.detail ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function fetchWeeklyReport(
  payload: WeeklyReportPayload,
  options?: { signal?: AbortSignal }
) {
  const response = await fetch("/api/ai/weekly-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "周报预览暂时不可用"));
  }

  const data = (await response.json()) as unknown;
  if (!isWeeklyReportResponse(data)) {
    throw new Error("周报接口返回结构异常");
  }

  return data;
}

export function getWeeklyReportSourceMeta(source: WeeklyReportResponse["source"]) {
  return WEEKLY_REPORT_SOURCE_META[source];
}

export function getWeeklyReportRoleMeta(role: WeeklyReportRole) {
  return WEEKLY_REPORT_ROLE_META[role];
}
