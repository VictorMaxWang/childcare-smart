import { setSessionCookie } from "@/lib/auth/session";
import { getDemoAccountById } from "@/lib/auth/accounts";
import type {
  AnalyticsMetric,
  ApiAssignmentStatus,
  ArchiveAction,
  AttachmentRelatedType,
  RecordType,
  StorybookExportFormat,
  WeeklyReportExportFormat,
} from "@/lib/api/types";
import { apiOk, readJsonBody, withApiErrors, ApiRouteError } from "@/lib/server/api-errors";
import { AppDataService } from "@/lib/server/app-data-service";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { requireSession, resolveRequestSession } from "@/lib/server/session";
import { resolveLinXiaoyuChildId } from "@/lib/storybooks/lin-xiaoyu-bravery";

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
  if (typeof value === "undefined" || value === null || value === "archive") return "archive";
  if (value === "restore") return "restore";
  throw new ApiRouteError("invalid_request", "Archive action must be archive or restore.");
}

function analyticsMetricFrom(value: string | null | undefined): AnalyticsMetric | undefined {
  if (
    value === "records" ||
    value === "health" ||
    value === "health-abnormal" ||
    value === "meal" ||
    value === "growth" ||
    value === "feedback" ||
    value === "consultation" ||
    value === "high-risk-consultation" ||
    value === "reminder"
  ) {
    return value;
  }
  if (!value) return undefined;
  throw new ApiRouteError("invalid_request", "Trend metric is not supported.");
}

function trendOptionsFrom(url: URL) {
  const windowDaysText = url.searchParams.get("windowDays");
  const windowDays = windowDaysText ? Number(windowDaysText) : undefined;
  if (typeof windowDays !== "undefined" && (!Number.isFinite(windowDays) || windowDays < 1)) {
    throw new ApiRouteError("invalid_request", "windowDays must be a positive number.");
  }
  return {
    childId: url.searchParams.get("childId") ?? undefined,
    classId: url.searchParams.get("classId") ?? undefined,
    metric: analyticsMetricFrom(url.searchParams.get("metric")),
    timeRange: url.searchParams.get("timeRange") ?? undefined,
    windowDays,
  };
}

function weeklyReportExportFormatFrom(value: string | null): WeeklyReportExportFormat {
  if (value === "json" || value === "markdown" || value === "html" || value === "print-html" || value === "share-text") {
    return value;
  }
  if (!value) return "json";
  throw new ApiRouteError("invalid_request", "Weekly report export format is not supported.");
}

function storybookExportFormatFrom(value: string | null): StorybookExportFormat {
  if (value === "json" || value === "markdown" || value === "html" || value === "print-html" || value === "share-text") {
    return value;
  }
  if (!value) return "json";
  throw new ApiRouteError("invalid_request", "Storybook export format is not supported.");
}

function assignmentStatusFrom(value: string | null | undefined): ApiAssignmentStatus | undefined {
  if (!value) return undefined;
  if (value === "pending" || value === "in_progress" || value === "completed" || value === "overdue") return value;
  if (value === "in-progress" || value === "acknowledged") return "in_progress";
  if (value === "done" || value === "resolved") return "completed";
  throw new ApiRouteError("invalid_request", "Assignment status is not supported.");
}

function relatedTypeFrom(value: string | null): AttachmentRelatedType | undefined {
  if (
    value === "message" ||
    value === "feedback" ||
    value === "health-material" ||
    value === "consultation" ||
    value === "weekly-report" ||
    value === "storybook"
  ) {
    return value;
  }
  return undefined;
}

function attachmentContentFromDataUrl(dataUrl: string, fallbackMimeType: string) {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) {
    throw new ApiRouteError("not_found", "Attachment content is not available from this environment.");
  }
  const mimeType = match[1] || fallbackMimeType || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const body = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
  return { body, mimeType };
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
    const body = await readJsonBody<{ action?: ArchiveAction; archiveReason?: string }>(request);
    return apiOk(await service.archiveChild(childId, archiveActionFrom(body.action), body.archiveReason));
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
    const body = await readJsonBody<{ action?: ArchiveAction; archiveReason?: string }>(request);
    return apiOk(await service.archiveTeacher(teacherId, archiveActionFrom(body.action), body.archiveReason));
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
    if (request.method === "POST") {
      return apiOk(await service.createFeedback(await readJsonBody(request)), { status: 201 });
    }
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
    const body = await readJsonBody<{ type?: string; action?: ArchiveAction; archiveReason?: string }>(request);
    return apiOk(await service.archiveRecord(recordTypeFrom(body.type), recordId, archiveActionFrom(body.action), body.archiveReason));
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

export function handleAdminSummary(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getAdminSummary());
  });
}

export function handleAdminQualityMetrics(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getAdminQualityMetrics());
  });
}

export function handleTrends(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const options = trendOptionsFrom(new URL(request.url));
    const childId = options.childId ?? "all";
    if (!childId) throw new ApiRouteError("invalid_request", "趋势查询必须提供 childId。");
    return apiOk(await service.getTrends(options));
  });
}

export function handleChildTrend(request: Request, childId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getChildTrend(childId, trendOptionsFrom(new URL(request.url))));
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
    return apiOk(await service.createWeeklyReport(await readJsonBody(request)), { status: 201 });
  });
}

export function handleWeeklyReport(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "PATCH") return apiOk(await service.updateWeeklyReport(reportId, await readJsonBody(request)));
    return apiOk(await service.getScopedWeeklyReport(reportId));
  });
}

export function handleWeeklyReportArchive(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const body = await readJsonBody<{ action?: ArchiveAction }>(request);
    return apiOk(await service.setWeeklyReportArchived(reportId, archiveActionFrom(body.action)));
  });
}

export function handleWeeklyReportExport(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const format = weeklyReportExportFormatFrom(new URL(request.url).searchParams.get("format"));
    return apiOk(await service.exportWeeklyReportData(reportId, format));
  });
}

export function handleWeeklyReportShare(request: Request, reportId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.shareWeeklyReport(reportId, await readJsonBody(request)));
  });
}

export function handleStorybooks(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(await service.listStorybooks({
        childId: resolveLinXiaoyuChildId(url.searchParams.get("childId") ?? url.searchParams.get("child") ?? undefined),
      }));
    }
    return apiOk(await service.upsertStorybook(await readJsonBody(request)), { status: 201 });
  });
}

export function handleStorybook(request: Request, storybookId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getStorybook(storybookId));
  });
}

export function handleStorybookExport(request: Request, storybookId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const format = storybookExportFormatFrom(new URL(request.url).searchParams.get("format"));
    return apiOk(await service.exportStorybookData(storybookId, format));
  });
}

export function handleStorybookShare(request: Request, storybookId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.shareStorybook(storybookId, await readJsonBody(request)));
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

export function handleAssignments(request: Request) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      return apiOk(
        await service.listAssignments({
          childId: url.searchParams.get("childId") ?? undefined,
          teacherId: url.searchParams.get("teacherId") ?? undefined,
          status: assignmentStatusFrom(url.searchParams.get("status")),
        })
      );
    }
    return apiOk(await service.createAssignment(await readJsonBody(request)), { status: 201 });
  });
}

export function handleAssignment(request: Request, assignmentId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.updateAssignmentStatus(assignmentId, await readJsonBody(request)));
  });
}

export function handleAttachment(request: Request, attachmentId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    return apiOk(await service.getAttachment(attachmentId));
  });
}

export function handleAttachmentContent(request: Request, attachmentId: string) {
  return withApiErrors(async () => {
    const { service } = await serviceFor(request);
    const attachment = await service.getAttachment(attachmentId);
    if (!attachment.localPreviewUrl) {
      throw new ApiRouteError("not_found", "Attachment content is metadata-only and has no local preview payload.");
    }
    const { body, mimeType } = attachmentContentFromDataUrl(attachment.localPreviewUrl, attachment.mimeType);
    const dispositionMode = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const encodedFileName = encodeURIComponent(attachment.fileName);
    return new Response(body, {
      headers: {
        "content-type": mimeType,
        "content-length": String(body.byteLength),
        "content-disposition": `${dispositionMode}; filename*=UTF-8''${encodedFileName}`,
        "cache-control": "no-store",
      },
    });
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
