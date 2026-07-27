import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { getAuthSessionSecret } from "@/lib/auth/session-config";

export const AI_PROVENANCE_ATTESTATION_FIELD = "provenanceAttestation";
export const UNVERIFIED_AI_PROVIDER = "unverified-client";
export const UNVERIFIED_AI_FALLBACK_REASON =
  "unverified-client-provenance";

const ATTESTATION_VERSION = 1;
const MAX_ATTESTATION_LENGTH = 16_384;
const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;

export interface AiProvenanceContext {
  userId: string;
  institutionId: string;
  capability: string;
  scopeId?: string | null;
}

interface AiProvenanceAttestationPayload {
  version: typeof ATTESTATION_VERSION;
  issuedAt: number;
  userId: string;
  institutionId: string;
  capability: string;
  scopeId: string | null;
  resultDigest: string;
}

interface AiProvenanceAttestationEnvelope {
  payload: AiProvenanceAttestationPayload;
  signature: string;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function jsonSafeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${stableSerialize(entry)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function unsignedResult(value: AnyRecord) {
  const result = jsonSafeClone(value);
  delete result[AI_PROVENANCE_ATTESTATION_FIELD];
  return result;
}

function resultDigest(value: AnyRecord) {
  return createHash("sha256")
    .update(stableSerialize(unsignedResult(value)))
    .digest("base64url");
}

function resolveAttestationSecret() {
  return createHmac("sha256", getAuthSessionSecret())
    .update("smartchildcare-ai-provenance-v1")
    .digest();
}

function signPayload(payload: AiProvenanceAttestationPayload) {
  return createHmac("sha256", resolveAttestationSecret())
    .update(stableSerialize(payload))
    .digest("base64url");
}

function normalizeContext(
  context: AiProvenanceContext
): Required<Omit<AiProvenanceContext, "scopeId">> & {
  scopeId: string | null;
} {
  const normalized = {
    userId: readString(context.userId),
    institutionId: readString(context.institutionId),
    capability: readString(context.capability),
    scopeId: readString(context.scopeId) || null,
  };
  if (
    !normalized.userId ||
    !normalized.institutionId ||
    !normalized.capability
  ) {
    throw new Error("AI provenance context is incomplete.");
  }
  return normalized;
}

function readResultChildId(value: AnyRecord) {
  return (
    readString(value.childId) ||
    readString(value.targetChildId) ||
    readString(value.scopeChildId)
  );
}

function resultScopeMatches(value: AnyRecord, context: AiProvenanceContext) {
  const expectedScopeId = readString(context.scopeId);
  if (!expectedScopeId) return true;

  const childId = readResultChildId(value);
  if (!childId) return true;
  return childId === expectedScopeId;
}

function parseAttestation(
  token: string
): AiProvenanceAttestationEnvelope | null {
  if (!token || token.length > MAX_ATTESTATION_LENGTH) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    ) as unknown;
    if (
      !isRecord(decoded) ||
      !isRecord(decoded.payload) ||
      typeof decoded.signature !== "string"
    ) {
      return null;
    }
    const payload = decoded.payload;
    if (
      payload.version !== ATTESTATION_VERSION ||
      typeof payload.issuedAt !== "number" ||
      !Number.isSafeInteger(payload.issuedAt) ||
      typeof payload.userId !== "string" ||
      typeof payload.institutionId !== "string" ||
      typeof payload.capability !== "string" ||
      (payload.scopeId !== null && typeof payload.scopeId !== "string") ||
      typeof payload.resultDigest !== "string"
    ) {
      return null;
    }
    return decoded as unknown as AiProvenanceAttestationEnvelope;
  } catch {
    return null;
  }
}

/**
 * 给服务端刚生成的 AI 结果附加不可伪造回执。回执绑定完整结果摘要和账号作用域，
 * 因此客户端修改 provider/model/live 等任一字段后都无法继续通过验签。
 */
export function attestAiResult<T extends object>(
  value: T,
  context: AiProvenanceContext
): T & Record<typeof AI_PROVENANCE_ATTESTATION_FIELD, string> {
  const result = value as unknown as AnyRecord;
  const normalizedContext = normalizeContext(context);
  if (!resultScopeMatches(result, normalizedContext)) {
    throw new Error("AI result scope does not match provenance context.");
  }

  const payload: AiProvenanceAttestationPayload = {
    version: ATTESTATION_VERSION,
    issuedAt: Date.now(),
    userId: normalizedContext.userId,
    institutionId: normalizedContext.institutionId,
    capability: normalizedContext.capability,
    scopeId: normalizedContext.scopeId,
    resultDigest: resultDigest(result),
  };
  const envelope: AiProvenanceAttestationEnvelope = {
    payload,
    signature: signPayload(payload),
  };

  return {
    ...value,
    [AI_PROVENANCE_ATTESTATION_FIELD]: Buffer.from(
      JSON.stringify(envelope),
      "utf8"
    ).toString("base64url"),
  };
}

/**
 * 验证结果是否由当前服务端为同一账号和作用域签发。回执允许重放同一份结果，
 * 但不能修改内容、跨账号或跨幼儿挪用。
 */
export function verifyAiResultAttestation(
  value: unknown,
  context: AiProvenanceContext
) {
  if (!isRecord(value)) return false;
  const token = readString(value[AI_PROVENANCE_ATTESTATION_FIELD]);
  const envelope = parseAttestation(token);
  if (!envelope) return false;

  let normalizedContext: ReturnType<typeof normalizeContext>;
  try {
    normalizedContext = normalizeContext(context);
  } catch {
    return false;
  }

  if (
    envelope.payload.issuedAt > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS ||
    envelope.payload.userId !== normalizedContext.userId ||
    envelope.payload.institutionId !== normalizedContext.institutionId ||
    envelope.payload.capability !== normalizedContext.capability ||
    envelope.payload.scopeId !== normalizedContext.scopeId ||
    envelope.payload.resultDigest !== resultDigest(value) ||
    !resultScopeMatches(value, normalizedContext)
  ) {
    return false;
  }

  const expected = Buffer.from(signPayload(envelope.payload), "base64url");
  const actual = Buffer.from(envelope.signature, "base64url");
  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

/**
 * 为已有 JSON Response 附加回执，同时保留状态码和传输诊断响应头。
 * 错误响应和非对象 JSON 不签名，避免把错误壳误当成 AI 结果。
 */
export async function attestAiJsonResponse(
  response: Response,
  context: AiProvenanceContext
) {
  if (!response.ok) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) return response;

  const body = (await response.clone().json().catch(() => null)) as unknown;
  if (!isRecord(body)) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(
    JSON.stringify(attestAiResult(body, context)),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    }
  );
}

function unverifiedProvenance(capability: string) {
  return {
    verified: false,
    provider: UNVERIFIED_AI_PROVIDER,
    model: UNVERIFIED_AI_PROVIDER,
    source: "client-unverified",
    mode: "fallback",
    state: "fallback",
    live: false,
    configured: false,
    fallback: true,
    fallbackReason: UNVERIFIED_AI_FALLBACK_REASON,
    realProvider: false,
    mock: false,
    capability,
  };
}

function hasAiTrustClaims(value: AnyRecord) {
  return [
    AI_PROVENANCE_ATTESTATION_FIELD,
    "provider",
    "model",
    "providerTrace",
    "providerMeta",
    "provenance",
    "traceMeta",
    "realProvider",
    "live",
    "fallback",
    "fallbackReason",
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function downgradeAiResult(value: AnyRecord, capability: string) {
  const result = jsonSafeClone(value);
  const unverified = unverifiedProvenance(capability);

  result.source = "fallback";
  result.provider = UNVERIFIED_AI_PROVIDER;
  result.model = UNVERIFIED_AI_PROVIDER;
  result.mode = "fallback";
  result.state = "fallback";
  result.live = false;
  result.configured = false;
  result.fallback = true;
  result.fallbackReason = UNVERIFIED_AI_FALLBACK_REASON;
  result.realProvider = false;
  result.mock = false;
  result.liveReadyButNotVerified = false;
  result.providerStatus = {
    verified: false,
    reason: UNVERIFIED_AI_FALLBACK_REASON,
  };
  result.providerTrace = { ...unverified };
  result.provenance = { ...unverified };
  delete result[AI_PROVENANCE_ATTESTATION_FIELD];
  return result;
}

function sanitizeConsultationEvidence(value: unknown, capability: string) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!isRecord(item)) return item;
    const metadata = isRecord(item.metadata)
      ? jsonSafeClone(item.metadata)
      : {};
    metadata.provenance = unverifiedProvenance(capability);
    return {
      ...jsonSafeClone(item),
      metadata,
    };
  });
}

function isRichConsultationInput(value: AnyRecord) {
  return [
    "consultationId",
    "evidenceItems",
    "todayInSchoolActions",
    "tonightAtHomeActions",
    "followUp48h",
    "providerTrace",
    "traceMeta",
    "interventionCard",
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function verifyConsultationAttestation(
  value: AnyRecord,
  context: AiProvenanceContext
) {
  if (verifyAiResultAttestation(value, context)) return true;
  if (value.workflowStatus !== "pending") return false;

  // 页面在持久化前只会附加这个工作流状态；AI 正文和 provenance 仍由原摘要完整约束。
  const signedResult = jsonSafeClone(value);
  delete signedResult.workflowStatus;
  return verifyAiResultAttestation(signedResult, context);
}

export function sanitizeConsultationInputForPersistence(
  input: AnyRecord,
  context: AiProvenanceContext
) {
  const value = jsonSafeClone(input);
  if (!isRichConsultationInput(value) && !hasAiTrustClaims(value)) {
    return value;
  }
  if (verifyConsultationAttestation(value, context)) return value;

  const result = downgradeAiResult(value, context.capability);
  const traceMeta = isRecord(value.traceMeta)
    ? jsonSafeClone(value.traceMeta)
    : {};
  result.traceMeta = {
    ...traceMeta,
    ...unverifiedProvenance(context.capability),
  };
  result.evidenceItems = sanitizeConsultationEvidence(
    value.evidenceItems,
    context.capability
  );
  if (isRecord(value.interventionCard)) {
    result.interventionCard = {
      ...jsonSafeClone(value.interventionCard),
      source: "fallback",
      model: UNVERIFIED_AI_PROVIDER,
      provider: UNVERIFIED_AI_PROVIDER,
      fallback: true,
      realProvider: false,
    };
  }
  return result;
}

function downgradeStorybookResponse(
  input: AnyRecord,
  capability: string
) {
  const result = downgradeAiResult(input, capability);
  const meta = isRecord(input.providerMeta)
    ? jsonSafeClone(input.providerMeta)
    : {};
  result.providerMeta = {
    ...meta,
    provider: UNVERIFIED_AI_PROVIDER,
    mode: "fallback",
    textProvider: UNVERIFIED_AI_PROVIDER,
    textDelivery: "fallback",
    imageProvider: UNVERIFIED_AI_PROVIDER,
    imageDelivery: "dynamic-fallback",
    audioProvider: UNVERIFIED_AI_PROVIDER,
    audioDelivery: "preview-only",
    fallbackReason: UNVERIFIED_AI_FALLBACK_REASON,
    realProvider: false,
    diagnostics: {
      verified: false,
      reason: UNVERIFIED_AI_FALLBACK_REASON,
    },
  };
  if (isRecord(input.cacheMeta)) {
    result.cacheMeta = {
      ...jsonSafeClone(input.cacheMeta),
      realSceneCount: 0,
      audioDelivery: "preview-only",
    };
  }
  if (Array.isArray(input.scenes)) {
    result.scenes = input.scenes.map((scene) => {
      if (!isRecord(scene)) return scene;
      const downgradedScene = jsonSafeClone(scene);
      // 未签名媒体引用和异步 task 都不能穿过信任边界继续访问上游。
      delete downgradedScene.imageTaskId;
      delete downgradedScene.imageTaskProvider;
      delete downgradedScene.imageTaskSubmittedAtMs;
      delete downgradedScene.imageTaskPollErrorCount;
      delete downgradedScene.imageProvider;
      delete downgradedScene.audioProvider;
      delete downgradedScene.imageStorageObject;
      delete downgradedScene.audioStorageObject;
      return {
        ...downgradedScene,
        imageUrl: null,
        assetRef: null,
        audioUrl: null,
        audioRef: null,
        imageSourceKind: "dynamic-fallback",
        imageStatus: "fallback",
        audioStatus: "fallback",
        imageCacheHit: false,
        audioCacheHit: false,
      };
    });
  }
  return result;
}

function sanitizeStorybookResponse(
  value: unknown,
  context: AiProvenanceContext
) {
  if (!isRecord(value)) return value;
  if (verifyAiResultAttestation(value, context)) {
    return jsonSafeClone(value);
  }
  return downgradeStorybookResponse(value, context.capability);
}

/**
 * media-status 会接收浏览器回传的上一版绘本。继续调用 provider 前必须先验签，
 * 否则伪造的 realProvider 会被服务端二次处理后重新签成可信。
 */
export function sanitizeStorybookResultForContinuation(
  value: unknown,
  context: AiProvenanceContext
) {
  return sanitizeStorybookResponse(value, context);
}

export function sanitizeStorybookInputForPersistence(
  input: AnyRecord,
  context: AiProvenanceContext
) {
  const value = jsonSafeClone(input);
  if (isRecord(value.response)) {
    value.response = sanitizeStorybookResponse(value.response, context);
  }
  if (Array.isArray(value.pages)) {
    value.pages = value.pages.map((page) => {
      if (!isRecord(page)) return page;
      if (isRecord(page.response)) {
        return {
          ...jsonSafeClone(page),
          response: sanitizeStorybookResponse(page.response, context),
        };
      }
      return hasAiTrustClaims(page)
        ? downgradeAiResult(page, context.capability)
        : jsonSafeClone(page);
    });
  }
  return value;
}

function buildTrustedHealthProvenance(
  rawResponse: AnyRecord,
  previous: AnyRecord
) {
  return {
    fallback: Boolean(rawResponse.fallback),
    mock: Boolean(rawResponse.mock),
    live: Boolean(rawResponse.live),
    configured: Boolean(rawResponse.configured),
    realProvider:
      Boolean(rawResponse.live) &&
      !Boolean(rawResponse.fallback) &&
      !Boolean(rawResponse.mock),
    provider: readString(rawResponse.provider) || undefined,
    model: readString(rawResponse.model) || undefined,
    providerStatus: isRecord(rawResponse.providerStatus)
      ? jsonSafeClone(rawResponse.providerStatus)
      : undefined,
    extractedText: readString(rawResponse.extractedText) || undefined,
    warnings: Array.isArray(rawResponse.warnings)
      ? jsonSafeClone(rawResponse.warnings)
      : undefined,
    generatedAt: readString(rawResponse.generatedAt) || undefined,
    files: Array.isArray(previous.files)
      ? jsonSafeClone(previous.files)
      : undefined,
    verified: true,
  };
}

export function sanitizeHealthParseInputForPersistence(
  input: AnyRecord,
  context: AiProvenanceContext
) {
  const value = jsonSafeClone(input);
  if (!isRecord(value.parseResult)) return value;

  const parseResult = jsonSafeClone(value.parseResult);
  const previousProvenance = isRecord(parseResult.provenance)
    ? parseResult.provenance
    : {};
  const rawResponse = isRecord(parseResult.rawResponse)
    ? parseResult.rawResponse
    : null;

  if (
    rawResponse &&
    verifyAiResultAttestation(rawResponse, context)
  ) {
    parseResult.rawResponse = jsonSafeClone(rawResponse);
    parseResult.provenance = buildTrustedHealthProvenance(
      rawResponse,
      previousProvenance
    );
    parseResult.sourceLabel = Boolean(rawResponse.fallback)
      ? "服务端已验证的降级解析"
      : `${readString(rawResponse.provider) || "AI"} 服务端已验证解析`;
    value.parseResult = parseResult;
    return value;
  }

  parseResult.rawResponse = rawResponse
    ? downgradeAiResult(rawResponse, context.capability)
    : undefined;
  parseResult.provenance = {
    ...unverifiedProvenance(context.capability),
    files: Array.isArray(previousProvenance.files)
      ? jsonSafeClone(previousProvenance.files)
      : undefined,
  };
  parseResult.sourceLabel = "客户端未验证的解析结果";
  parseResult.requiresHumanReview = true;
  value.parseResult = parseResult;
  return value;
}

function sanitizeAdminResult(
  value: unknown,
  context: AiProvenanceContext
) {
  if (!isRecord(value)) return value;
  if (verifyAiResultAttestation(value, context)) {
    return jsonSafeClone(value);
  }
  return downgradeAiResult(value, context.capability);
}

export function sanitizeWeeklyReportInputForPersistence(
  input: AnyRecord,
  context: AiProvenanceContext
) {
  const value = jsonSafeClone(input);
  if (!isRecord(value.payload)) return value;

  const payload = jsonSafeClone(value.payload);
  for (const key of ["adminAgentResult", "aiResult", "result"]) {
    if (isRecord(payload[key])) {
      payload[key] = sanitizeAdminResult(payload[key], context);
    }
  }
  if (hasAiTrustClaims(payload)) {
    value.payload = sanitizeAdminResult(payload, context);
  } else {
    value.payload = payload;
  }
  return value;
}

function verifyVisionAttestationForMealRecord(
  value: AnyRecord,
  context: AiProvenanceContext
) {
  const visionContext = {
    ...context,
    capability: "vision-meal",
  };
  if (verifyAiResultAttestation(value, visionContext)) return true;

  // Bulk 图片识别只绑定账号与机构。写入具体幼儿记录时允许回放 null scope，
  // 但用户、机构、能力与结果摘要仍由同一签名完整约束。
  if (
    readString(context.scopeId) &&
    verifyAiResultAttestation(value, {
      ...visionContext,
      scopeId: null,
    })
  ) {
    return true;
  }
  return false;
}

function verifyVisionFoodAttestation(
  value: AnyRecord,
  context: AiProvenanceContext
) {
  if (verifyVisionAttestationForMealRecord(value, context)) return true;
  if (!readString(value.id)) return false;

  // 客户端仅为列表渲染补充本地 id；食物内容和 provider 声明仍由原回执约束。
  const signedFood = jsonSafeClone(value);
  delete signedFood.id;
  return verifyVisionAttestationForMealRecord(signedFood, context);
}

function isCompleteMealEvaluation(value: AnyRecord) {
  return (
    ["mealScore", "todayScore", "recentScore"].every(
      (key) =>
        typeof value[key] === "number" &&
        Number.isFinite(value[key])
    ) &&
    ["mealComment", "todayComment", "recentComment", "generatedAt"].every(
      (key) => Boolean(readString(value[key]))
    ) &&
    Array.isArray(value.suggestions) &&
    value.suggestions.every(
      (suggestion) => typeof suggestion === "string" && suggestion.trim()
    )
  );
}

export function sanitizeMealRecordInputForPersistence(
  input: AnyRecord,
  context: AiProvenanceContext
) {
  const value = jsonSafeClone(input);
  if (Array.isArray(value.foods)) {
    value.foods = value.foods.map((food) => {
      if (!isRecord(food) || !hasAiTrustClaims(food)) return food;
      return verifyVisionFoodAttestation(food, context)
        ? food
        : downgradeAiResult(food, "vision-meal");
    });
  }
  if (!isRecord(value.aiEvaluation)) return value;

  const evaluation = jsonSafeClone(value.aiEvaluation);
  if (!isCompleteMealEvaluation(evaluation)) {
    // 图片识别回执只能证明 foods，不能伪装成页面会直接解引用的完整营养评估。
    delete value.aiEvaluation;
    return value;
  }
  if (!hasAiTrustClaims(evaluation)) return value;
  const childScopeId = readString(context.scopeId);
  // 膳食评估包含幼儿健康结论，必须与当前记录的具体 child scope 完全一致。
  const trustedDietEvaluation =
    Boolean(childScopeId) &&
    verifyAiResultAttestation(evaluation, {
      ...context,
      capability: "diet-evaluation",
      scopeId: childScopeId,
    });
  if (trustedDietEvaluation) {
    return value;
  }

  value.aiEvaluation = downgradeAiResult(
    evaluation,
    context.capability
  );
  return value;
}
