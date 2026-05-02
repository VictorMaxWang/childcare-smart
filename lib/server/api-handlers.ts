import { setSessionCookie } from "@/lib/auth/session";
import { getDemoAccountById } from "@/lib/auth/accounts";
import type { ArchiveAction, AttachmentRelatedType, RecordType } from "@/lib/api/types";
import { apiOk, readJsonBody, withApiErrors, ApiRouteError } from "@/lib/server/api-errors";
import { AppDataService } from "@/lib/server/app-data-service";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { requireSession, resolveRequestSession } from "@/lib/server/session";

export const runtime = "nodejs";

async function serviceFor(request: Request) {
  const session = await requireSession(request);
  return {
    session,
    service: new AppDataService(session.user, new DefaultAppDataRepository()),
  };
}

function boolParam(url: URL, key: string) {
  return url.searchParams.get(key) === "1" || url.searchParams.get(key) === "true";
}

function recordTypeFrom(value: string | null | undefined): RecordType {
  if (value === "attendance" || value === "health" || value === "meal" || value === "growth") return value;
  if (value === "morning-check") return "health";
  if (value === "diet") return "meal";
  throw new ApiRouteError("invalid_request", "记录类型无效。");
}

function archiveActionFrom(value: unknown): ArchiveAction {
  return value === "restore" ? "restore" : "archive";
}

function relatedTypeFrom(value: string | null): AttachmentRelatedType | undefined {
  if (
    value === "message" ||
    value === "feedback" ||
    value === "health-material" ||
    value === "consultation" ||
    value === "weekly-report"
  ) {
    return value;
  }
  return undefined;
}

export function handleDemoSession(request: Request) {
  return withApiErrors(async () => {
    const session = await resolveRequestSession(request);
    if (!session) throw new ApiRouteError("unauthorized", "未登录或示例账号 header 无效。");
    return apiOk({ user: session.user, source: session.source });
  });
}

export function handleDemoSessionSwitch(request: Request) {
  return withApiErrors(async () => {
    const body = await readJsonBody<{ accountId?: string }>(request);
    const account = getDemoAccountById(body.accountId ?? "");
    if (!account) throw new ApiRouteError("not_found", "示例账号不存在。");
    await setSessionCookie(account.id, account.role);
    return apiOk({ user: account, source: "cookie" as const });
  });
}

export function handleChildren(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listChildren({ includeArchived: boolParam(url, "includeArchived") }));
    }
    return apiOk(await service.createChild(await readJsonBody(request)), { status: 201 });
  });
}

export function handleChild(request: Request, childId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") return apiOk(await service.getChild(childId));
    return apiOk(await service.updateChild(childId, await readJsonBody(request)));
  });
}

export function handleChildArchive(request: Request, childId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const body = await readJsonBody<{ action?: ArchiveAction }>(request);
    return apiOk(await service.archiveChild(childId, archiveActionFrom(body.action)));
  });
}

export function handleTeachers(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listTeachers({ includeArchived: boolParam(url, "includeArchived") }));
    }
    return apiOk(await service.createTeacher(await readJsonBody(request)), { status: 201 });
  });
}

export function handleTeacher(request: Request, teacherId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") return apiOk(await service.getTeacher(teacherId));
    return apiOk(await service.updateTeacher(teacherId, await readJsonBody(request)));
  });
}

export function handleTeacherArchive(request: Request, teacherId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const body = await readJsonBody<{ action?: ArchiveAction }>(request);
    return apiOk(await service.archiveTeacher(teacherId, archiveActionFrom(body.action)));
  });
}

export function handleMessages(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listMessages({ childId: url.searchParams.get("childId") ?? undefined }));
    }
    return apiOk(await service.sendMessage(await readJsonBody(request)), { status: 201 });
  });
}

export function handleMessageReply(request: Request, messageId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.replyMessage(messageId, await readJsonBody(request)), { status: 201 });
  });
}

export function handleMessageRead(request: Request, messageId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.markMessageRead(messageId));
  });
}

export function handleFeedbackList(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const url = new URL(request.url);
    return apiOk(await service.listFeedback({ childId: url.searchParams.get("childId") ?? undefined }));
  });
}

export function handleFeedback(request: Request, feedbackId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") return apiOk(await service.getFeedback(feedbackId));
    return apiOk(await service.updateFeedbackStatus(feedbackId, await readJsonBody(request)));
  });
}

export function handleRecords(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const url = new URL(request.url);
    if (request.method === "GET") {
      const type = recordTypeFrom(url.searchParams.get("type"));
      return apiOk(await service.listRecords(type, {
        childId: url.searchParams.get("childId") ?? undefined,
        includeArchived: boolParam(url, "includeArchived"),
      }));
    }
    const body = await readJsonBody<Record<string, unknown> & { type?: string }>(request);
    return apiOk(await service.createRecord(recordTypeFrom(body.type), body), { status: 201 });
  });
}

export function handleRecord(request: Request, recordId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const body = await readJsonBody<Record<string, unknown> & { type?: string }>(request);
    return apiOk(await service.updateRecord(recordTypeFrom(body.type), recordId, body));
  });
}

export function handleRecordArchive(request: Request, recordId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const body = await readJsonBody<{ type?: string; action?: ArchiveAction }>(request);
    return apiOk(await service.archiveRecord(recordTypeFrom(body.type), recordId, archiveActionFrom(body.action)));
  });
}

export function handleHealthMaterials(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listHealthMaterials({ childId: url.searchParams.get("childId") ?? undefined }));
    }
    return apiOk(await service.createHealthMaterial(await readJsonBody(request)), { status: 201 });
  });
}

export function handleHealthMaterialUpdate(request: Request, materialId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.updateHealthMaterial(materialId, await readJsonBody(request)));
  });
}

export function handleConsultations(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listConsultations({ childId: url.searchParams.get("childId") ?? undefined }));
    }
    return apiOk(await service.createConsultation(await readJsonBody(request)), { status: 201 });
  });
}

export function handleConsultationNote(request: Request, consultationId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.addConsultationNote(consultationId, await readJsonBody(request)), { status: 201 });
  });
}

export function handleConsultationStatus(request: Request, consultationId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.updateConsultationStatus(consultationId, await readJsonBody(request)));
  });
}

export function handleDirectorDashboard(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getDirectorDashboard());
  });
}

export function handleTrends(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const childId = new URL(request.url).searchParams.get("childId");
    if (!childId) throw new ApiRouteError("invalid_request", "趋势查询必须提供 childId。");
    return apiOk(await service.getTrends(childId));
  });
}

export function handleTeacherWorkbench(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const teacherId = new URL(request.url).searchParams.get("teacherId") ?? undefined;
    return apiOk(await service.getTeacherWorkbench(teacherId));
  });
}

export function handleParentHome(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const childId = new URL(request.url).searchParams.get("childId");
    if (!childId) throw new ApiRouteError("invalid_request", "家长首页查询必须提供 childId。");
    return apiOk(await service.getParentHome(childId));
  });
}

export function handleWeeklyReports(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listWeeklyReports({ includeArchived: boolParam(url, "includeArchived") }));
    }
    return apiOk(await service.generateWeeklyReport(await readJsonBody(request)), { status: 201 });
  });
}

export function handleWeeklyReport(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getWeeklyReport(reportId));
  });
}

export function handleWeeklyReportArchive(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const body = await readJsonBody<{ action?: ArchiveAction }>(request);
    return apiOk(await service.archiveWeeklyReport(reportId, archiveActionFrom(body.action)));
  });
}

export function handleWeeklyReportExport(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    return apiOk(await service.exportWeeklyReport(reportId, format));
  });
}

export function handleAttachments(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listAttachments({
        childId: url.searchParams.get("childId") ?? undefined,
        relatedType: relatedTypeFrom(url.searchParams.get("relatedType")),
        relatedId: url.searchParams.get("relatedId") ?? undefined,
      }));
    }
    return apiOk(await service.createAttachment(await readJsonBody(request)), { status: 201 });
  });
}

export function handleAttachment(request: Request, attachmentId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getAttachment(attachmentId));
  });
}

export function handleReminders(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listReminders({ childId: url.searchParams.get("childId") ?? undefined }));
    }
    return apiOk(await service.createReminder(await readJsonBody(request)), { status: 201 });
  });
}

export function handleReminder(request: Request, reminderId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.updateReminder(reminderId, await readJsonBody(request)));
  });
}
