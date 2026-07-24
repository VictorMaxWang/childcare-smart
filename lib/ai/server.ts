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
import {
  requestDashscopeFollowUp,
  requestDashscopeSuggestion,
  requestDashscopeWeeklyReport,
  resolveBailianRuntimeConfig,
} from "@/lib/ai/dashscope";
import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import { buildActionizedWeeklyReportResponse, resolveWeeklyReportRole } from "@/lib/ai/weekly-report";
import { getVivoProviderStatus, requestVivoChat, VivoProviderError } from "@/lib/providers/vivo";
import type { VivoProviderStatus } from "@/lib/providers/vivo";
import type {
  AiActionPlan,
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiRiskLevel,
  AiSuggestionPayload,
  AiSuggestionResponse,
  AiTrendPrediction,
  ChildSuggestionSnapshot,
  InstitutionSuggestionSnapshot,
  WeeklyReportRole,
  WeeklyReportPayload,
  WeeklyReportResponse,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";

const DEFAULT_DISCLAIMER =
  "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断；如出现持续发热或明显异常，请及时就医。";

type ChatProviderStatus = VivoProviderStatus<"chat">;

export class AiProviderUnavailableError extends Error {
  code = "provider_unavailable" as const;
  capability = "chat" as const;
  providerStatus: ChatProviderStatus;
  status = 503;

  constructor(message: string, providerStatus: ChatProviderStatus) {
    super(message);
    this.name = "AiProviderUnavailableError";
    this.providerStatus = providerStatus;
  }
}

export function isAiProviderUnavailableError(error: unknown): error is AiProviderUnavailableError {
  return error instanceof AiProviderUnavailableError;
}

export function buildAiProviderUnavailableBody(error: AiProviderUnavailableError) {
  return {
    ok: false,
    code: error.code,
    error: error.message,
    message: error.message,
    capability: error.capability,
    providerStatus: error.providerStatus,
  };
}

export interface AiRuntimeOptions {
  configuredModel: string;
  forceMock: boolean;
  forceFallback: boolean;
  fallbackReason?: string | null;
}

export function getAiRuntimeOptions(
  request?: Request,
  context?: { accountKind?: "demo" | "normal" }
): AiRuntimeOptions {
  const allowConfiguredMock = context?.accountKind === "demo";

  return {
    configuredModel: process.env.VIVO_LLM_MODEL || "Volc-DeepSeek-V3.2",
    // 全局 mock 开关只服务演示账号，真实账号必须继续尝试真实 provider。
    forceMock: allowConfiguredMock && process.env.NEXT_PUBLIC_FORCE_MOCK_MODE === "true",
    forceFallback:
      process.env.NODE_ENV !== "production" && request?.headers.get("x-ai-force-fallback") === "1",
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeArray(input: unknown, limit = 5): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, limit);
}

function normalizeRiskLevel(input: unknown): AiRiskLevel {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function normalizeTrendPrediction(input: unknown): AiTrendPrediction {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "up") return "up";
  if (value === "down") return "down";
  return "stable";
}

function normalizeActionPlan(input: unknown): AiActionPlan | undefined {
  if (!isRecord(input)) return undefined;
  const schoolActions = normalizeArray(input.schoolActions, 4);
  const familyActions = normalizeArray(input.familyActions, 4);
  const reviewActions = normalizeArray(input.reviewActions, 4);
  if (schoolActions.length === 0 && familyActions.length === 0 && reviewActions.length === 0) {
    return undefined;
  }
  return { schoolActions, familyActions, reviewActions };
}

function normalizeSuggestionOutput(raw: unknown): Omit<AiSuggestionResponse, "source"> | null {
  if (!isRecord(raw)) return null;
  const summary = String(raw.summary ?? "").trim();
  const highlights = normalizeArray(raw.highlights);
  const concerns = normalizeArray(raw.concerns);
  const actions = normalizeArray(raw.actions);
  if (!summary || (highlights.length === 0 && concerns.length === 0 && actions.length === 0)) {
    return null;
  }

  return {
    riskLevel: normalizeRiskLevel(raw.riskLevel),
    summary,
    highlights,
    concerns,
    actions,
    actionPlan: normalizeActionPlan(raw.actionPlan),
    trendPrediction: normalizeTrendPrediction(raw.trendPrediction),
    disclaimer: String(raw.disclaimer ?? "").trim() || DEFAULT_DISCLAIMER,
  };
}

function normalizeFollowUpOutput(raw: unknown): Omit<AiFollowUpResponse, "source"> | null {
  if (!isRecord(raw)) return null;
  const answer = String(raw.answer ?? "").trim();
  const keyPoints = normalizeArray(raw.keyPoints);
  const nextSteps = normalizeArray(raw.nextSteps);
  if (!answer || (keyPoints.length === 0 && nextSteps.length === 0)) return null;

  return {
    answer,
    keyPoints,
    nextSteps,
    tonightTopAction: typeof raw.tonightTopAction === "string" ? raw.tonightTopAction : undefined,
    whyNow: typeof raw.whyNow === "string" ? raw.whyNow : undefined,
    homeSteps: normalizeArray(raw.homeSteps),
    observationPoints: normalizeArray(raw.observationPoints),
    teacherObservation: typeof raw.teacherObservation === "string" ? raw.teacherObservation : undefined,
    reviewIn48h: typeof raw.reviewIn48h === "string" ? raw.reviewIn48h : undefined,
    recommendedQuestions: normalizeArray(raw.recommendedQuestions),
    disclaimer: String(raw.disclaimer ?? "").trim() || DEFAULT_DISCLAIMER,
  };
}

function normalizeWeeklyReportOutput(
  raw: unknown,
  snapshot: WeeklyReportSnapshot,
  role: WeeklyReportRole
): Omit<WeeklyReportResponse, "source"> | null {
  if (!isRecord(raw)) return null;
  const summary = String(raw.summary ?? "").trim();
  const highlights = normalizeArray(raw.highlights);
  const risks = normalizeArray(raw.risks);
  const nextWeekActions = normalizeArray(raw.nextWeekActions);
  if (!summary || (highlights.length === 0 && risks.length === 0 && nextWeekActions.length === 0)) {
    return null;
  }

  return buildActionizedWeeklyReportResponse({
    role,
    snapshot,
    summary,
    highlights,
    risks,
    nextWeekActions,
    trendPrediction: normalizeTrendPrediction(raw.trendPrediction),
    disclaimer: String(raw.disclaimer ?? "").trim() || DEFAULT_DISCLAIMER,
    source: "ai",
  });
}

function withoutRuntimeFields<T extends Record<string, unknown>>(value: T) {
  const clone = { ...value };
  delete clone.source;
  delete clone.model;
  delete clone.provider;
  delete clone.providerStatus;
  delete clone.fallbackReason;
  return clone;
}

function buildStructuredPrompt(params: {
  task: string;
  input: unknown;
  example: unknown;
}) {
  return [
    `Task: ${params.task}`,
    "You are an AI assistant for a childcare institution.",
    "Use only the supplied institution, class, child and care records. Do not invent IDs or private data.",
    "Write natural Simplified Chinese suitable for childcare staff or parents.",
    "Do not make medical diagnoses. Keep health advice as observation and communication guidance.",
    "Return strict JSON only. Do not include markdown, comments, source, model or provider keys.",
    "The JSON must follow this example shape while replacing the content with a provider-generated answer:",
    JSON.stringify(params.example),
    "Input:",
    JSON.stringify(params.input),
  ].join("\n");
}

async function requestStructuredVivoJson(params: {
  prompt: string;
  options: AiRuntimeOptions;
  taskType: string;
}) {
  const status = getVivoProviderStatus("chat");
  if (!status.configured || !status.supported) {
    throw new AiProviderUnavailableError(
      status.reason ?? "vivo chat provider is unavailable because required environment variables are missing.",
      status
    );
  }

  try {
    const result = await requestVivoChat({
      model: params.options.configuredModel,
      temperature: 0.2,
      maxTokens: 1400,
      taskType: params.taskType,
      messages: [
        {
          role: "system",
          content:
            "You are a childcare assistant. Return strict JSON only, with Simplified Chinese values and no medical diagnosis.",
        },
        {
          role: "user",
          content: params.prompt,
        },
      ],
    });
    const parsed = safeJsonParse(result.text);
    if (!parsed) {
      throw new AiProviderUnavailableError("vivo chat response was not valid JSON.", {
        ...result.status,
        status: "error",
        configured: result.status.configured,
      });
    }
    return { parsed, model: result.model, providerStatus: result.status };
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) throw error;
    if (error instanceof VivoProviderError) {
      throw new AiProviderUnavailableError(error.message, {
        ...getVivoProviderStatus("chat"),
        status: error.status,
        reason: error.message,
      });
    }
    throw new AiProviderUnavailableError(
      error instanceof Error ? error.message : "vivo chat provider failed.",
      {
        ...getVivoProviderStatus("chat"),
        status: "provider-unavailable",
        reason: "vivo chat provider failed.",
      }
    );
  }
}

function providerMeta(providerStatus: ChatProviderStatus) {
  return {
    provider: "vivo",
    providerStatus: { chat: providerStatus },
  };
}

function fallbackReasonMeta(options: AiRuntimeOptions, providerStatus: ChatProviderStatus) {
  const explicitReason = options.fallbackReason?.trim();
  const providerReason = providerStatus.reason?.trim();
  return explicitReason || providerReason || (options.forceFallback ? "force-fallback" : null);
}

function isBailianConfigured() {
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim());
}

function bailianProviderMeta() {
  const config = resolveBailianRuntimeConfig();
  return {
    model: config.model,
    provider: "dashscope",
    providerStatus: {
      chat: {
        provider: "dashscope",
        configured: true,
        supported: true,
        status: "ready",
        model: config.model,
      },
    },
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
      provider: "mock",
      fallbackReason: options.fallbackReason ?? "force-mock-mode",
    } satisfies AiSuggestionResponse;
  }

  const fallbackProviderStatus = getVivoProviderStatus("chat");
  const fallback = {
    ...(isInstitutionScope
      ? buildFallbackInstitutionSuggestion(payload.snapshot as InstitutionSuggestionSnapshot)
      : buildFallbackSuggestion(payload.snapshot as ChildSuggestionSnapshot)),
    model: isInstitutionScope ? "institution-rule-fallback" : "rule-fallback",
    provider: "local-rule-fallback",
    providerStatus: { chat: fallbackProviderStatus },
    fallbackReason: fallbackReasonMeta(options, fallbackProviderStatus),
  } satisfies AiSuggestionResponse;

  if (options.forceFallback) {
    return fallback;
  }

  try {
    const { parsed, model, providerStatus } = await requestStructuredVivoJson({
      options,
      taskType: "childcare-ai-suggestion",
      prompt: buildStructuredPrompt({
        task: isInstitutionScope
          ? "Generate an institution-level director assistant risk summary and action plan."
          : "Generate a child-level childcare suggestion summary and action plan.",
        input: payload,
        example: withoutRuntimeFields(fallback),
      }),
    });
    const aiResult = normalizeSuggestionOutput(parsed);
    if (!aiResult) {
      throw new AiProviderUnavailableError("vivo chat response could not be normalized as an AI suggestion.", {
        ...providerStatus,
        status: "error",
        reason: "Invalid suggestion JSON shape.",
      });
    }

    return {
      ...aiResult,
      source: "ai",
      model,
      ...providerMeta(providerStatus),
    } satisfies AiSuggestionResponse;
  } catch (error) {
    if (!isAiProviderUnavailableError(error) || !isBailianConfigured()) throw error;

    // vivo 失败时才尝试百炼，保证真实账号仍能得到真实模型结果，而不是直接退回 mock。
    const bailianResult = await requestDashscopeSuggestion(payload.snapshot);
    if (!bailianResult) throw error;
    return {
      ...bailianResult,
      source: "ai",
      ...bailianProviderMeta(),
    } satisfies AiSuggestionResponse;
  }
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
      provider: "mock",
      fallbackReason: options.fallbackReason ?? "force-mock-mode",
    } satisfies AiFollowUpResponse;
  }

  const fallbackProviderStatus = getVivoProviderStatus("chat");
  const fallback = {
    ...buildFallbackFollowUp(payload),
    model: isInstitutionScope ? "institution-follow-up-rule-fallback" : "follow-up-rule-fallback",
    provider: "local-rule-fallback",
    providerStatus: { chat: fallbackProviderStatus },
    fallbackReason: fallbackReasonMeta(options, fallbackProviderStatus),
  } satisfies AiFollowUpResponse;

  if (options.forceFallback) {
    return fallback;
  }

  try {
    const { parsed, model, providerStatus } = await requestStructuredVivoJson({
      options,
      taskType: "childcare-ai-follow-up",
      prompt: buildStructuredPrompt({
        task: isInstitutionScope
          ? "Answer a director follow-up question about institution priorities and dispatch decisions."
          : "Answer a parent or teacher follow-up question about the current childcare action card.",
        input: payload,
        example: withoutRuntimeFields(fallback),
      }),
    });
    const aiResult = normalizeFollowUpOutput(parsed);
    if (!aiResult) {
      throw new AiProviderUnavailableError("vivo chat response could not be normalized as a follow-up answer.", {
        ...providerStatus,
        status: "error",
        reason: "Invalid follow-up JSON shape.",
      });
    }

    return {
      ...aiResult,
      source: "ai",
      model,
      ...providerMeta(providerStatus),
    } satisfies AiFollowUpResponse;
  } catch (error) {
    if (!isAiProviderUnavailableError(error) || !isBailianConfigured()) throw error;

    const bailianResult = await requestDashscopeFollowUp(payload);
    if (!bailianResult) throw error;
    return {
      ...bailianResult,
      source: "ai",
      ...bailianProviderMeta(),
    } satisfies AiFollowUpResponse;
  }
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
      provider: "mock",
      fallbackReason: options.fallbackReason ?? "force-mock-mode",
    } satisfies WeeklyReportResponse;
  }

  const fallbackProviderStatus = getVivoProviderStatus("chat");
  const fallback = {
    ...buildFallbackWeeklyReport(payload.snapshot, role),
    model: "weekly-rule-fallback",
    provider: "local-rule-fallback",
    providerStatus: { chat: fallbackProviderStatus },
    fallbackReason: fallbackReasonMeta(options, fallbackProviderStatus),
  } satisfies WeeklyReportResponse;

  if (options.forceFallback) {
    return fallback;
  }

  try {
    const { parsed, model, providerStatus } = await requestStructuredVivoJson({
      options,
      taskType: "childcare-ai-weekly-report",
      prompt: buildStructuredPrompt({
        task: `Generate a role=${role} weekly report for childcare operations.`,
        input: payload,
        example: withoutRuntimeFields(fallback),
      }),
    });
    const aiResult = normalizeWeeklyReportOutput(parsed, payload.snapshot, role);
    if (!aiResult) {
      throw new AiProviderUnavailableError("vivo chat response could not be normalized as a weekly report.", {
        ...providerStatus,
        status: "error",
        reason: "Invalid weekly report JSON shape.",
      });
    }

    return {
      ...aiResult,
      source: "ai",
      model,
      ...providerMeta(providerStatus),
    } satisfies WeeklyReportResponse;
  } catch (error) {
    if (!isAiProviderUnavailableError(error) || !isBailianConfigured()) throw error;

    const bailianResult = await requestDashscopeWeeklyReport(payload.snapshot, role);
    if (!bailianResult) throw error;
    return {
      ...bailianResult,
      source: "ai",
      ...bailianProviderMeta(),
    } satisfies WeeklyReportResponse;
  }
}
