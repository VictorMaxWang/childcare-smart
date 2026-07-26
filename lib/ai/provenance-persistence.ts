import "server-only";

import {
  sanitizeConsultationInputForPersistence,
  sanitizeHealthParseInputForPersistence,
  sanitizeMealRecordInputForPersistence,
  sanitizeStorybookInputForPersistence,
  sanitizeWeeklyReportInputForPersistence,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";
import {
  DefaultAppDataRepository,
  type AppDataRepository,
} from "@/lib/server/app-data-repository";
import { resolveRequestSession } from "@/lib/server/session";

export type AiPersistenceKind =
  | "consultation"
  | "health-parse"
  | "record"
  | "storybook"
  | "weekly-report";

export interface AiPersistenceRequestOptions {
  recordId?: string;
  healthMaterialId?: string;
  repository?: Pick<AppDataRepository, "load">;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function childIdFromHealthParse(input: AnyRecord) {
  if (!isRecord(input.parseResult)) return "";
  const rawResponse = input.parseResult.rawResponse;
  return isRecord(rawResponse) ? readString(rawResponse.childId) : "";
}

function buildContext(input: {
  userId: string;
  institutionId: string;
  capability: string;
  scopeId?: string;
}): AiProvenanceContext {
  return {
    userId: input.userId,
    institutionId: input.institutionId,
    capability: input.capability,
    scopeId: input.scopeId || null,
  };
}

function rebuildJsonRequest(request: Request, body: AnyRecord) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
}

async function resolvePersistedChildScope(
  session: NonNullable<Awaited<ReturnType<typeof resolveRequestSession>>>,
  options: AiPersistenceRequestOptions
) {
  if (!options.recordId && !options.healthMaterialId) return "";

  try {
    const repository = options.repository ?? new DefaultAppDataRepository();
    const snapshot = await repository.load(session.user);
    if (options.recordId) {
      return readString(
        snapshot.meals.find((record) => record.id === options.recordId)?.childId
      );
    }
    return readString(
      snapshot.healthMaterials.find(
        (material) => material.materialId === options.healthMaterialId
      )?.childId
    );
  } catch {
    // 原 handler 仍负责返回数据层错误；provenance 在无法确认资源范围时必须失败关闭。
    return "";
  }
}

/**
 * 资源 API 的统一防伪入口。鉴权和业务权限仍由原 handler 执行；这里只在已有
 * session 时验证 AI 回执，防止浏览器把自报 provider/model/live 直接写入快照。
 */
export async function sanitizeAiPersistenceRequest(
  request: Request,
  kind: AiPersistenceKind,
  options: AiPersistenceRequestOptions = {}
) {
  let body: AnyRecord;
  try {
    const parsed = (await request.clone().json()) as unknown;
    if (!isRecord(parsed)) return request;
    body = parsed;
  } catch {
    return request;
  }

  let session: Awaited<ReturnType<typeof resolveRequestSession>>;
  try {
    session = await resolveRequestSession(request);
  } catch {
    // 原 API handler 会用统一错误格式处理无效或被禁用的 session。
    return request;
  }
  if (!session) return request;

  const identity = {
    userId: session.user.id,
    institutionId: session.user.institutionId,
  };
  let sanitized: AnyRecord;
  const persistedChildScope = await resolvePersistedChildScope(
    session,
    options
  );

  if (kind === "consultation") {
    sanitized = sanitizeConsultationInputForPersistence(
      body,
      buildContext({
        ...identity,
        capability: "high-risk-consultation",
        scopeId: readString(body.childId),
      })
    );
  } else if (kind === "storybook") {
    const responseChildId = isRecord(body.response)
      ? readString(body.response.childId)
      : "";
    sanitized = sanitizeStorybookInputForPersistence(
      body,
      buildContext({
        ...identity,
        capability: "parent-storybook",
        scopeId: readString(body.childId) || responseChildId,
      })
    );
  } else if (kind === "weekly-report") {
    sanitized = sanitizeWeeklyReportInputForPersistence(
      body,
      buildContext({
        ...identity,
        capability: "admin-agent",
        scopeId:
          readString(body.scopeType) === "institution"
            ? session.user.institutionId
            : readString(body.scopeId),
      })
    );
  } else if (kind === "health-parse") {
    sanitized = sanitizeHealthParseInputForPersistence(
      body,
      buildContext({
        ...identity,
        capability: "health-file-bridge",
        scopeId:
          options.healthMaterialId !== undefined
            ? persistedChildScope
            : childIdFromHealthParse(body),
      })
    );
  } else {
    sanitized = sanitizeMealRecordInputForPersistence(
      body,
      buildContext({
        ...identity,
        capability: "vision-meal",
        scopeId:
          options.recordId !== undefined
            ? persistedChildScope
            : readString(body.childId),
      })
    );
  }

  return rebuildJsonRequest(request, sanitized);
}
