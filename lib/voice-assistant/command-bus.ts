import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import { sanitizeNextPath } from "@/lib/auth/route-access";
import { ApiRouteError } from "@/lib/server/api-errors";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { requireSession } from "@/lib/server/session";
import { canAccessChild } from "@/lib/server/scope";
import { getVivoProviderStatus } from "@/lib/providers/vivo";
import { accountRoleToAssistantRole } from "@/lib/voice-assistant/intents";
import { parseAssistantCommand } from "@/lib/voice-assistant/parser";
import { intentNeedsConfirmation, validateAssistantCommandPermission } from "@/lib/voice-assistant/permissions";
import { executeAssistantCommand } from "@/lib/voice-assistant/executors";
import type {
  AssistantCommand,
  AssistantCommandApiRequest,
  AssistantParseContext,
  AssistantPlanResult,
  AssistantProviderStatus,
  AssistantUtterance,
} from "@/lib/voice-assistant/types";

function readContextQuery(request: Request, body?: AssistantCommandApiRequest) {
  const url = new URL(request.url);
  return {
    child: url.searchParams.get("child") ?? body?.context?.currentQuery?.child,
    childId: url.searchParams.get("childId") ?? body?.context?.currentQuery?.childId,
  };
}

function teacherIdOf(teacher: { teacherId?: string; userId?: string }) {
  return teacher.teacherId ?? teacher.userId ?? "";
}

function childRefOf(child: {
  id: string;
  name: string;
  className?: string;
  nickname?: string;
  guardians?: Array<{ name?: string }>;
}) {
  return {
    id: child.id,
    name: child.name,
    className: child.className,
    nickname: child.nickname,
    guardianNames: (child.guardians ?? [])
      .map((guardian) => guardian.name)
      .filter((name): name is string => Boolean(name)),
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function storybookTitleOf(storybook: { pages?: Array<Record<string, unknown>>; storybookId: string }) {
  const firstPage = storybook.pages?.[0];
  const response = firstPage && typeof firstPage.response === "object" && firstPage.response ? firstPage.response as Record<string, unknown> : null;
  return readString(response?.title) || readString(firstPage?.title) || storybook.storybookId;
}

export function getAssistantProviderStatusLegacy(): AssistantProviderStatus {
  const chat = getVivoProviderStatus("chat");
  const ocr = getVivoProviderStatus("ocr");
  const asr = getVivoProviderStatus("asr");
  const tts = getVivoProviderStatus("tts");
  const allConfigured = [chat, ocr, asr, tts].every((capability) => capability.configured);

  return {
    chat,
    ocr,
    asr,
    tts,
    fallbackText:
      !allConfigured
        ? "当前使用文本/本地规则 fallback"
        : "vivo provider 已配置，可用于后续增强。",
  };
}

export function getAssistantProviderStatus(): AssistantProviderStatus {
  const chat = getVivoProviderStatus("chat");
  const ocr = getVivoProviderStatus("ocr");
  const asr = getVivoProviderStatus("asr");
  const tts = getVivoProviderStatus("tts");
  const allConfigured = [chat, ocr, asr, tts].every((capability) => capability.configured);

  return {
    chat,
    ocr,
    asr,
    tts,
    fallbackText: allConfigured
      ? "vivo provider ready"
      : "vivo provider missing-env; text fallback is available and writes still require confirmation.",
  };
}

function confirmationSecret() {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.VOICE_ASSISTANT_CONFIRMATION_SECRET ||
    process.env.VIVO_APP_KEY ||
    "childcare-smart-local-confirmation-secret"
  );
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function jsonSafeRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function confirmationPayload(sessionUser: SessionUser, command: AssistantCommand, expiresAt: number) {
  return jsonSafeRecord({
    userId: sessionUser.id,
    role: sessionUser.role,
    institutionId: sessionUser.institutionId,
    intent: command.intent,
    params: command.params,
    execute: command.execute,
    safetyLevel: command.safetyLevel,
    requiredConfirmation: command.requiredConfirmation,
    expiresAt,
  });
}

function signConfirmationPayload(payload: Record<string, unknown>) {
  return createHmac("sha256", confirmationSecret()).update(stableSerialize(payload)).digest("base64url");
}

function createConfirmationToken(sessionUser: SessionUser, command: AssistantCommand) {
  const payload = confirmationPayload(sessionUser, command, Date.now() + 10 * 60 * 1000);
  return Buffer.from(
    JSON.stringify({
      payload,
      signature: signConfirmationPayload(payload),
    })
  ).toString("base64url");
}

function verifyConfirmationToken(sessionUser: SessionUser, command: AssistantCommand) {
  const token = command.confirmationToken;
  if (!token) {
    throw new ApiRouteError("needs_confirmation", "写入类语音命令缺少确认 token。");
  }

  let envelope: { payload?: Record<string, unknown>; signature?: string };
  try {
    envelope = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as typeof envelope;
  } catch {
    throw new ApiRouteError("needs_confirmation", "写入类语音命令确认 token 无效。");
  }

  if (!envelope.payload || typeof envelope.signature !== "string") {
    throw new ApiRouteError("needs_confirmation", "写入类语音命令确认 token 无效。");
  }
  if (typeof envelope.payload.expiresAt !== "number" || envelope.payload.expiresAt < Date.now()) {
    throw new ApiRouteError("needs_confirmation", "写入类语音命令确认 token 已过期，请重新解析指令。");
  }

  const expectedPayload = confirmationPayload(sessionUser, command, envelope.payload.expiresAt);
  if (stableSerialize(envelope.payload) !== stableSerialize(expectedPayload)) {
    throw new ApiRouteError("needs_confirmation", "写入类语音命令与确认 token 不匹配。");
  }

  const expected = Buffer.from(signConfirmationPayload(envelope.payload));
  const actual = Buffer.from(envelope.signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiRouteError("needs_confirmation", "写入类语音命令确认签名无效。");
  }
}

export async function buildAssistantParseContext(
  sessionUser: SessionUser,
  request: Request,
  body?: AssistantCommandApiRequest
): Promise<AssistantParseContext> {
  const repository = new DefaultAppDataRepository();
  const snapshot = await repository.load(sessionUser);
  const role = accountRoleToAssistantRole(sessionUser.role);
  const currentQuery = readContextQuery(request, body);

  const children = snapshot.children
    .filter((child) => canAccessChild(sessionUser, child))
    .map(childRefOf);
  const accessibleChildIds = new Set(children.map((child) => child.id));

  const allChildren = snapshot.children
    .filter((child) => child.institutionId === sessionUser.institutionId)
    .map(childRefOf);

  const teachers =
    role === "director"
      ? snapshot.teachers
          .filter((teacher) => teacher.institutionId === sessionUser.institutionId && !teacher.archivedAt)
          .map((teacher) => ({
            id: teacherIdOf(teacher),
            name: teacher.name,
            className: teacher.className,
          }))
      : role === "teacher"
        ? [
            {
              id: sessionUser.id,
              name: sessionUser.name,
              className: sessionUser.className,
            },
          ]
        : [];

  return {
    role,
    accountRole: sessionUser.role as AccountRole,
    user: {
      id: sessionUser.id,
      name: sessionUser.name,
      role: sessionUser.role,
      institutionId: sessionUser.institutionId,
      className: sessionUser.className,
      childIds: sessionUser.childIds,
    },
    currentPath: body?.context?.currentPath,
    currentQuery,
    children,
    allChildren,
    teachers,
    reminders: snapshot.reminders
      .map((reminder) => {
        const childId = readString((reminder as { childId?: unknown; targetId?: unknown }).childId) || readString((reminder as { childId?: unknown; targetId?: unknown }).targetId);
        return {
          id: reminder.reminderId,
          childId,
          title: reminder.title,
          status: reminder.status,
          scheduledAt: reminder.scheduledAt,
        };
      })
      .filter((reminder) => reminder.childId && accessibleChildIds.has(reminder.childId)),
    storybooks: snapshot.storybooks
      .filter((storybook) => accessibleChildIds.has(storybook.childId))
      .map((storybook) => ({
        id: storybook.storybookId,
        childId: storybook.childId,
        title: storybookTitleOf(storybook),
        generatedAt: storybook.generatedAt,
      }))
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)),
    objects: body?.context?.objects,
  };
}

function applyPermissionStatus(command: AssistantCommand, context: AssistantParseContext) {
  const permission = validateAssistantCommandPermission(command, context);
  if (permission.ok) return command;

  return {
    ...command,
    status: permission.status,
    previewText: permission.message,
  };
}

function attachConfirmationToken(command: AssistantCommand, sessionUser: SessionUser) {
  if (!command.requiredConfirmation || command.status !== "needs_confirmation") return command;
  return {
    ...command,
    confirmationToken: createConfirmationToken(sessionUser, command),
  };
}

export async function planAssistantCommand(request: Request, body: AssistantCommandApiRequest): Promise<AssistantPlanResult> {
  const session = await requireSession(request);
  const utterance = body.utterance;
  if (!utterance?.text?.trim() && !body.command) {
    throw new ApiRouteError("invalid_request", "语音助手需要文本指令或转写结果。");
  }

  const context = await buildAssistantParseContext(session.user, request, body);
  if (body.command) {
    const plannedCommand = normalizeExecutableCommand(body.command);
    const permittedCommand = applyPermissionStatus(plannedCommand, context);
    return {
      command: attachConfirmationToken(permittedCommand, session.user),
      providerStatus: getAssistantProviderStatus(),
    };
  }

  if (!utterance) {
    throw new ApiRouteError("invalid_request", "Voice assistant planning requires text or a command.");
  }
  const command = parseAssistantCommand(context, utterance);
  const permittedCommand = applyPermissionStatus(command, context);
  return {
    command: attachConfirmationToken(permittedCommand, session.user),
    providerStatus: getAssistantProviderStatus(),
  };
}

function throwPermissionError(command: AssistantCommand, context: AssistantParseContext) {
  const permission = validateAssistantCommandPermission(command, context);
  if (permission.ok) return;

  if (permission.status === "forbidden") {
    throw new ApiRouteError("forbidden_scope", permission.message);
  }
  if (permission.status === "needs_params") {
    throw new ApiRouteError("invalid_request", permission.message);
  }
  throw new ApiRouteError("invalid_request", permission.message);
}

function normalizeExecutableCommand(command: AssistantCommand): AssistantCommand {
  const requiredConfirmation = intentNeedsConfirmation(command.intent);
  let normalized: AssistantCommand = {
    ...command,
    requiredConfirmation,
    safetyLevel: requiredConfirmation && command.safetyLevel === "safe" ? "write" : command.safetyLevel,
    status: requiredConfirmation ? "needs_confirmation" : command.status,
    confirmationToken: command.confirmationToken,
  };

  if (command.intent !== "navigate") {
    return normalized;
  }

  const rawPath = readString(command.params.path) || command.deeplink || "";
  const sanitizedPath = sanitizeNextPath(rawPath);
  if (!sanitizedPath) {
    return {
      ...normalized,
      params: { ...normalized.params, path: "" },
      deeplink: undefined,
      status: "forbidden",
      previewText: "Voice command cannot open this path.",
    };
  }

  normalized = {
    ...normalized,
    params: { ...normalized.params, path: sanitizedPath },
    deeplink: sanitizedPath,
  };
  return normalized;
}

export async function executePlannedAssistantCommand(
  request: Request,
  body: AssistantCommandApiRequest
) {
  const session = await requireSession(request);
  if (!body.command) {
    throw new ApiRouteError("invalid_request", "执行语音命令需要 command。");
  }

  const context = await buildAssistantParseContext(session.user, request, body);
  const command = normalizeExecutableCommand(body.command);
  throwPermissionError(command, context);

  if (command.requiredConfirmation && !body.confirmed) {
    throw new ApiRouteError("needs_confirmation", "写入型或危险语音命令需要先确认。");
  }

  if (command.requiredConfirmation) {
    verifyConfirmationToken(session.user, command);
  }

  return executeAssistantCommand(session.user, command);
}

export function makeTextUtterance(text: string): AssistantUtterance {
  return {
    text,
    inputMode: "text",
    transcriptSource: "text-fallback",
  };
}
