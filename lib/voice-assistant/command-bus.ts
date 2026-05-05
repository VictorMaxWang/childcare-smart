import "server-only";

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

export function getAssistantProviderStatus(): AssistantProviderStatus {
  const chat = getVivoProviderStatus("chat");
  const asr = getVivoProviderStatus("asr");

  return {
    chat,
    asr,
    fallbackText:
      !chat.configured || !asr.configured
        ? "当前使用文本/本地规则 fallback"
        : "vivo provider 已配置，可用于后续增强。",
  };
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

export async function planAssistantCommand(request: Request, body: AssistantCommandApiRequest): Promise<AssistantPlanResult> {
  const session = await requireSession(request);
  const utterance = body.utterance;
  if (!utterance?.text?.trim()) {
    throw new ApiRouteError("invalid_request", "语音助手需要文本指令或转写结果。");
  }

  const context = await buildAssistantParseContext(session.user, request, body);
  const command = parseAssistantCommand(context, utterance);
  return {
    command: applyPermissionStatus(command, context),
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

  return executeAssistantCommand(session.user, command);
}

export function makeTextUtterance(text: string): AssistantUtterance {
  return {
    text,
    inputMode: "text",
    transcriptSource: "text-fallback",
  };
}
