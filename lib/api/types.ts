import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden_scope"
  | "not_found"
  | "conflict"
  | "needs_confirmation"
  | "provider_unavailable"
  | "server_error";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: string;
  code: ApiErrorCode;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export type ArchiveAction = "archive" | "restore";
export type RecordType = "attendance" | "health" | "meal" | "growth";
export type ReportScopeType = "institution" | "class" | "child";
export type AttachmentRelatedType = "message" | "feedback" | "health-material" | "consultation" | "weekly-report";

export interface ApiTeacher {
  teacherId: string;
  userId?: string;
  name: string;
  institutionId: string;
  className?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiWeeklyReport {
  reportId: string;
  title: string;
  scopeType: ReportScopeType;
  scopeId: string;
  institutionId: string;
  periodStart: string;
  periodEnd: string;
  status: "generated" | "archived";
  payload: Record<string, unknown>;
  sourceRecordIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface ApiAttachment {
  attachmentId: string;
  institutionId: string;
  childId?: string;
  relatedType?: AttachmentRelatedType;
  relatedId?: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
  storageMode: "metadata_only" | "uploaded";
  uploadStatus: "metadata_saved" | "uploaded" | "failed";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAuditLog {
  auditId: string;
  actorUserId: string;
  actorRole: AccountRole;
  institutionId: string;
  targetType: string;
  targetId: string;
  action: string;
  result: "success" | "failed";
  createdAt: string;
}

export type ApiExtendedSnapshot = AppStateSnapshot & {
  teachers: ApiTeacher[];
  weeklyReports: ApiWeeklyReport[];
  attachments: ApiAttachment[];
  auditLogs: ApiAuditLog[];
};

export interface DemoSessionData {
  user: SessionUser;
  source: "cookie" | "demo-header";
}
