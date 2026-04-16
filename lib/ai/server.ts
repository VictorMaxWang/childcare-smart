import { requestDashscopeFollowUp, requestDashscopeSuggestion, requestDashscopeWeeklyReport } from "@/lib/ai/dashscope";
import {
  buildFallbackFollowUp,
  buildFallbackInstitutionSuggestion,
  buildFallbackSuggestion,
  buildFallbackWeeklyReport,
} from "@/lib/ai/fallback";
import {
  buildMockAiFollowUp,
  buildMockAiSuggestion,
  buildMockInstitutionSuggestion,
  buildMockWeeklyReport,
} from "@/lib/ai/mock";
import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import { resolveWeeklyReportRole } from "@/lib/ai/weekly-report";
import type {
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionPayload,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  InstitutionSuggestionSnapshot,
  WeeklyReportPayload,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";

export interface AiRuntimeOptions {
  configuredModel: string;
  forceMock: boolean;
  forceFallback: boolean;
}

export function getAiRuntimeOptions(request?: Request): AiRuntimeOptions {
  return {
    configuredModel: process.env.AI_MODEL || "qwen-turbo",
    forceMock: process.env.NEXT_PUBLIC_FORCE_MOCK_MODE === "true",
    forceFallback:
      process.env.NODE_ENV !== "production" && request?.headers.get("x-ai-force-fallback") === "1",
  };
}

export function isValidSuggestionSnapshot(snapshot: unknown): snapshot is ChildSuggestionSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  if (!obj.child || typeof obj.child !== "object") return false;
  if (!obj.summary || typeof obj.summary !== "object") return false;
  if (!Array.isArray(obj.ruleFallback)) return false;
  return true;
}

export function isValidInstitutionSuggestionSnapshot(snapshot: unknown): snapshot is InstitutionSuggestionSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  return (
    typeof obj.institutionName === "string" &&
    obj.sevenDayOverview !== null &&
    typeof obj.sevenDayOverview === "object" &&
    Array.isArray(obj.priorityTopItems) &&
    Array.isArray(obj.riskChildren) &&
    Array.isArray(obj.riskClasses) &&
    Array.isArray(obj.feedbackRiskItems) &&
    Array.isArray(obj.pendingDispatches) &&
    Array.isArray(obj.weeklyHighlights) &&
    Array.isArray(obj.ruleFallback)
  );
}

export function isValidSuggestionPayload(payload: unknown): payload is AiSuggestionPayload {
  if (!payload || typeof payload !== "object") return false;
  const snapshot = (payload as Record<string, unknown>).snapshot;
  return isValidSuggestionSnapshot(snapshot) || isValidInstitutionSuggestionSnapshot(snapshot);
}

export function isValidFollowUpPayload(payload: unknown): payload is AiFollowUpPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const history = obj.history;
  const historyValid =
    history === undefined ||
    (Array.isArray(history) &&
      history.every(
        (item) =>
          item &&
          typeof item === "object" &&
          ((item as Record<string, unknown>).role === "user" ||
            (item as Record<string, unknown>).role === "assistant") &&
          typeof (item as Record<string, unknown>).content === "string"
      ));
  const latestFeedbackValid =
    obj.latestFeedback === undefined || Boolean(toFollowUpFeedbackLite(obj.latestFeedback));

  return (
    (isValidSuggestionSnapshot(obj.snapshot) || isValidInstitutionSuggestionSnapshot(obj.snapshot)) &&
    typeof obj.suggestionTitle === "string" &&
    obj.suggestionTitle.trim().length > 0 &&
    typeof obj.question === "string" &&
    obj.question.trim().length > 0 &&
    historyValid &&
    latestFeedbackValid
  );
}

export function isValidWeeklyReportSnapshot(snapshot: unknown): snapshot is WeeklyReportSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  return Boolean(obj.institutionName && obj.periodLabel && obj.overview && obj.diet);
}

export function isValidWeeklyReportPayload(payload: unknown): payload is WeeklyReportPayload {
  if (!payload || typeof payload !== "object") return false;
  return isValidWeeklyReportSnapshot((payload as Record<string, unknown>).snapshot);
}

export function resolveWeeklyReportRoleFromPayload(
  payload: WeeklyReportPayload | null | undefined
) {
  return resolveWeeklyReportRole(payload);
}

export async function executeSuggestion(
  payload: AiSuggestionPayload,
  options: AiRuntimeOptions
): Promise<AiSuggestionResponse> {
  const isInstitutionScope =
    payload.scope === "institution" || isValidInstitutionSuggestionSnapshot(payload.snapshot);

  if (options.forceMock) {
    return {
      ...(isInstitutionScope
        ? buildMockInstitutionSuggestion(payload.snapshot as InstitutionSuggestionSnapshot)
        : buildMockAiSuggestion(payload.snapshot as ChildSuggestionSnapshot)),
      model: isInstitutionScope ? "mock-institution-suggestion" : "mock-suggestion",
    } satisfies AiSuggestionResponse;
  }

  const fallback = {
    ...(isInstitutionScope
      ? buildFallbackInstitutionSuggestion(payload.snapshot as InstitutionSuggestionSnapshot)
      : buildFallbackSuggestion(payload.snapshot as ChildSuggestionSnapshot)),
    model: isInstitutionScope ? "institution-rule-fallback" : "rule-fallback",
  } satisfies AiSuggestionResponse;

  if (options.forceFallback) {
    return fallback;
  }

  const aiResult = await requestDashscopeSuggestion(payload.snapshot);
  if (!aiResult) {
    const fallbackTarget = isInstitutionScope
      ? (payload.snapshot as InstitutionSuggestionSnapshot).institutionName
      : (payload.snapshot as ChildSuggestionSnapshot).child.id;
    console.warn(
      `[AI] Falling back to rules for ${isInstitutionScope ? "institution" : "child"} ${fallbackTarget} using model ${options.configuredModel}.`
    );
    return fallback;
  }

  return {
    ...aiResult,
    source: "ai",
    model: options.configuredModel,
  } satisfies AiSuggestionResponse;
}

export async function executeFollowUp(
  payload: AiFollowUpPayload,
  options: AiRuntimeOptions
): Promise<AiFollowUpResponse> {
  const isInstitutionScope =
    payload.scope === "institution" || isValidInstitutionSuggestionSnapshot(payload.snapshot);

  if (options.forceMock) {
    return {
      ...buildMockAiFollowUp(payload),
      model: isInstitutionScope ? "mock-institution-follow-up" : "mock-follow-up",
    } satisfies AiFollowUpResponse;
  }

  const fallback = {
    ...buildFallbackFollowUp(payload),
    model: isInstitutionScope ? "institution-follow-up-rule-fallback" : "follow-up-rule-fallback",
  } satisfies AiFollowUpResponse;

  if (options.forceFallback) {
    return fallback;
  }

  const aiResult = await requestDashscopeFollowUp(payload);
  if (!aiResult) {
    console.warn(
      `[AI] Falling back to ${isInstitutionScope ? "institution" : "child"} follow-up using model ${options.configuredModel}.`
    );
    return fallback;
  }

  return {
    ...aiResult,
    source: "ai",
    model: options.configuredModel,
  } satisfies AiFollowUpResponse;
}

export async function executeWeeklyReport(
  payload: WeeklyReportPayload,
  options: AiRuntimeOptions
): Promise<WeeklyReportResponse> {
  const role = resolveWeeklyReportRole(payload);
  if (!role) {
    throw new Error("Weekly report role is required");
  }

  if (options.forceMock) {
    return {
      ...buildMockWeeklyReport(payload.snapshot, role),
      model: "mock-weekly-report",
    } satisfies WeeklyReportResponse;
  }

  const fallback = {
    ...buildFallbackWeeklyReport(payload.snapshot, role),
    model: "weekly-rule-fallback",
  } satisfies WeeklyReportResponse;

  if (options.forceFallback) {
    return fallback;
  }

  const aiResult = await requestDashscopeWeeklyReport(payload.snapshot, role);
  if (!aiResult) {
    console.warn(`[AI] Falling back to weekly report rules using model ${options.configuredModel}.`);
    return fallback;
  }

  return {
    ...aiResult,
    source: "ai",
    model: options.configuredModel,
  } satisfies WeeklyReportResponse;
}
