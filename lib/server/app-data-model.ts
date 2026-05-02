import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import type { ApiAttachment, ApiAuditLog, ApiExtendedSnapshot, ApiTeacher, ApiWeeklyReport } from "@/lib/api/types";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import { normalizeAppStateSnapshot, type AppStateSnapshot } from "@/lib/persistence/snapshot";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function createApiId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function seedTeachersForSession(session: Pick<SessionUser, "institutionId" | "id" | "role" | "name" | "className">) {
  const demoTeachers = DEMO_ACCOUNTS.filter(
    (account) => account.institutionId === session.institutionId && account.role === "教师"
  ).map((account) => ({
    teacherId: account.id,
    userId: account.id,
    name: account.name,
    institutionId: account.institutionId,
    className: account.className,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  } satisfies ApiTeacher));

  if (demoTeachers.length > 0) return demoTeachers;
  if (session.role !== "教师") return [];

  return [
    {
      teacherId: session.id,
      userId: session.id,
      name: session.name,
      institutionId: session.institutionId,
      className: session.className,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] satisfies ApiTeacher[];
}

function normalizeTeachers(value: unknown, session: SessionUser) {
  const teachers = readArray(value)
    .filter(isRecord)
    .map((item): ApiTeacher | null => {
      const teacherId = readString(item.teacherId ?? item.id ?? item.userId);
      const name = readString(item.name);
      const institutionId = readString(item.institutionId) || session.institutionId;
      if (!teacherId || !name || !institutionId) return null;
      return {
        teacherId,
        userId: readString(item.userId) || undefined,
        name,
        institutionId,
        className: readString(item.className) || undefined,
        archivedAt: readString(item.archivedAt) || undefined,
        createdAt: readString(item.createdAt) || new Date().toISOString(),
        updatedAt: readString(item.updatedAt) || new Date().toISOString(),
      };
    })
    .filter((item): item is ApiTeacher => Boolean(item));

  return teachers.length > 0 ? teachers : seedTeachersForSession(session);
}

function normalizeWeeklyReports(value: unknown) {
  return readArray(value)
    .filter(isRecord)
    .map((item): ApiWeeklyReport | null => {
      const reportId = readString(item.reportId);
      const scopeType = readString(item.scopeType);
      if (!reportId || (scopeType !== "institution" && scopeType !== "class" && scopeType !== "child")) return null;
      return {
        reportId,
        title: readString(item.title) || "周报",
        scopeType,
        scopeId: readString(item.scopeId),
        institutionId: readString(item.institutionId),
        periodStart: readString(item.periodStart),
        periodEnd: readString(item.periodEnd),
        status: item.status === "archived" ? "archived" : "generated",
        payload: isRecord(item.payload) ? item.payload : {},
        sourceRecordIds: readArray(item.sourceRecordIds).filter((value): value is string => typeof value === "string"),
        createdBy: readString(item.createdBy),
        createdAt: readString(item.createdAt) || new Date().toISOString(),
        updatedAt: readString(item.updatedAt) || new Date().toISOString(),
        archivedAt: readString(item.archivedAt) || undefined,
      };
    })
    .filter((item): item is ApiWeeklyReport => Boolean(item));
}

function normalizeAttachments(value: unknown) {
  return readArray(value)
    .filter(isRecord)
    .map((item): ApiAttachment | null => {
      const attachmentId = readString(item.attachmentId);
      const fileName = readString(item.fileName);
      if (!attachmentId || !fileName) return null;
      return {
        attachmentId,
        institutionId: readString(item.institutionId),
        childId: readString(item.childId) || undefined,
        relatedType:
          item.relatedType === "message" ||
          item.relatedType === "feedback" ||
          item.relatedType === "health-material" ||
          item.relatedType === "consultation" ||
          item.relatedType === "weekly-report"
            ? item.relatedType
            : undefined,
        relatedId: readString(item.relatedId) || undefined,
        fileName,
        mimeType: readString(item.mimeType) || "application/octet-stream",
        byteSize: typeof item.byteSize === "number" ? item.byteSize : undefined,
        storageMode: item.storageMode === "uploaded" ? "uploaded" : "metadata_only",
        uploadStatus: item.uploadStatus === "uploaded" || item.uploadStatus === "failed" ? item.uploadStatus : "metadata_saved",
        createdBy: readString(item.createdBy),
        createdAt: readString(item.createdAt) || new Date().toISOString(),
        updatedAt: readString(item.updatedAt) || new Date().toISOString(),
      };
    })
    .filter((item): item is ApiAttachment => Boolean(item));
}

function normalizeAuditLogs(value: unknown) {
  return readArray(value)
    .filter(isRecord)
    .map((item): ApiAuditLog | null => {
      const auditId = readString(item.auditId);
      const actorRole = item.actorRole;
      if (!auditId || (actorRole !== "家长" && actorRole !== "教师" && actorRole !== "机构管理员")) return null;
      return {
        auditId,
        actorUserId: readString(item.actorUserId),
        actorRole,
        institutionId: readString(item.institutionId),
        targetType: readString(item.targetType),
        targetId: readString(item.targetId),
        action: readString(item.action),
        result: item.result === "failed" ? "failed" : "success",
        createdAt: readString(item.createdAt) || new Date().toISOString(),
      };
    })
    .filter((item): item is ApiAuditLog => Boolean(item));
}

export function normalizeExtendedSnapshot(value: unknown, session: SessionUser): ApiExtendedSnapshot {
  const data = isRecord(value) ? value : {};
  const core =
    normalizeAppStateSnapshot(value) ??
    (session.accountKind === "demo" ? createDemoSeedSnapshot() : emptyInstitutionSnapshot());

  return {
    ...core,
    teachers: normalizeTeachers(data.teachers, session),
    weeklyReports: normalizeWeeklyReports(data.weeklyReports),
    attachments: normalizeAttachments(data.attachments),
    auditLogs: normalizeAuditLogs(data.auditLogs),
  };
}

export function appendAuditLog(
  snapshot: ApiExtendedSnapshot,
  session: SessionUser,
  targetType: string,
  targetId: string,
  action: string,
  result: "success" | "failed" = "success"
) {
  snapshot.auditLogs = [
    {
      auditId: createApiId("audit"),
      actorUserId: session.id,
      actorRole: session.role,
      institutionId: session.institutionId,
      targetType,
      targetId,
      action,
      result,
      createdAt: new Date().toISOString(),
    },
    ...snapshot.auditLogs,
  ];
}

export function toCoreSnapshot(snapshot: ApiExtendedSnapshot): AppStateSnapshot {
  const core = { ...snapshot } as Partial<ApiExtendedSnapshot>;
  delete core.teachers;
  delete core.weeklyReports;
  delete core.attachments;
  delete core.auditLogs;
  return core as AppStateSnapshot;
}
