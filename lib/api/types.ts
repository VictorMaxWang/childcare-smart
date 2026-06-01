import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { TaskOwnerRole, TaskSourceType } from "@/lib/tasks/types";

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
export type WeeklyReportStatus = "generated" | "draft" | "archived" | "shared";
export type WeeklyReportExportFormat = "json" | "markdown" | "html" | "print-html" | "share-text";
export type AnalyticsMetric =
  | "records"
  | "health"
  | "health-abnormal"
  | "meal"
  | "growth"
  | "feedback"
  | "consultation"
  | "high-risk-consultation"
  | "reminder";
export type AttachmentRelatedType =
  | "message"
  | "feedback"
  | "health-material"
  | "consultation"
  | "weekly-report"
  | "storybook";

export type AttachmentKind = "image" | "audio" | "pdf" | "other";
export type FeedbackStatus = "open" | "in-progress" | "resolved" | "archived";
export type ApiAssignmentStatus = "pending" | "in_progress" | "completed" | "overdue";
export type StorageObjectMode = "object_storage" | "local_demo" | "metadata_only" | "cached_media" | "fallback";
export type StorageObjectKind =
  | "attachment"
  | "storybook-image"
  | "storybook-audio"
  | "weekly-report-export"
  | "weekly-report-share"
  | "storybook-export"
  | "storybook-share";

export interface StorageObjectOwner {
  ownerType: "institution" | "child" | "user" | "system";
  ownerId: string;
  institutionId?: string;
  childId?: string;
  createdBy?: string;
}

export interface StorageObjectScope {
  institutionId: string;
  childId?: string;
  scopeType?: ReportScopeType;
  scopeId?: string;
  relatedType?: AttachmentRelatedType | "storybook-media" | "weekly-report";
  relatedId?: string;
}

export interface StorageObjectPermissions {
  actorId?: string;
  actorRole?: AccountRole;
  canRead: boolean;
  canPreview: boolean;
  canDownload: boolean;
  canShare: boolean;
  reason?: string;
}

export interface StorageObject {
  id: string;
  owner: StorageObjectOwner;
  scope: StorageObjectScope;
  kind: StorageObjectKind;
  storageMode: StorageObjectMode;
  url: string | null;
  localPreviewUrl: string | null;
  metadataOnly: boolean;
  expiresAt: string | null;
  permissions: StorageObjectPermissions;
}

export interface ApiDataQuality {
  source: "app-data-service";
  sparse: boolean;
  fallback: false;
  observedDays: number;
  coverageRatio: number;
  note: string;
}

export interface ApiTrendPoint {
  date: string;
  label: string;
  value: number;
  rawCount: number;
  missing: boolean;
}

export interface ApiAnalyticsTrend {
  metric: AnalyticsMetric;
  timeRange: string;
  classId?: string;
  childId?: string;
  series: ApiTrendPoint[];
  sourceRecordIds: string[];
  generatedAt: string;
  dataQuality: ApiDataQuality;
  emptyReason?: string;
}

export interface ApiAdminClassStat {
  classId: string;
  childCount: number;
  teacherCount: number;
  todayRecordCount: number;
  healthAbnormalCount: number;
  mealRecordCount: number;
  growthRecordCount: number;
  unresolvedFeedbackCount: number;
  highRiskConsultationCount: number;
  reminderCount: number;
}

export interface ApiAssignmentCounts {
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  total: number;
  sourceRecordIds: string[];
}

export interface ApiAdminSummary {
  childCount: number;
  teacherCount: number;
  todayRecordCount: number;
  healthAbnormalCount: number;
  mealRecordCount: number;
  growthRecordCount: number;
  unresolvedFeedbackCount: number;
  highRiskConsultationCount: number;
  reminderCount: number;
  feedbackCount: number;
  feedbackCompletionRate: number;
  feedbackCompletedChildCount: number;
  feedbackExpectedChildCount: number;
  activeConsultationCount: number;
  attachmentCount: number;
  assignmentCounts: ApiAssignmentCounts;
  recordCounts: Record<RecordType, number>;
  classStats: ApiAdminClassStat[];
  recent7DayTrend: ApiAnalyticsTrend;
  currentWeekTrend: ApiAnalyticsTrend;
  sourceRecordIds: string[];
  generatedAt: string;
  updatedAt: string;
  dataQuality: ApiDataQuality;
}

export interface ApiAdminQualityMetrics {
  generatedAt: string;
  metrics: Array<{
    key: string;
    label: string;
    value: number;
    unit: string;
    level: "normal" | "warning" | "risk";
    sourceRecordIds: string[];
  }>;
  dataQuality: ApiDataQuality;
}

export interface ApiWeeklyReportShare {
  shareId: string;
  sharedBy: string;
  sharedAt: string;
  summary: string;
  localText: string;
  storageObject?: StorageObject;
}

export type StorybookExportFormat = "json" | "markdown" | "html" | "print-html" | "share-text";

export interface ApiStorybookShare {
  shareId: string;
  sharedBy: string;
  sharedAt: string;
  summary: string;
  localText: string;
  storageObject?: StorageObject;
}

export type ApiStorybook = AppStateSnapshot["storybooks"][number] & {
  share?: ApiStorybookShare;
  updatedAt?: string;
};

export interface ApiStorybookExportData {
  kind: "download";
  storybookId: string;
  childId: string;
  format: StorybookExportFormat;
  exportedAt: string;
  content: string;
  mimeType: string;
  filename: string;
  storageObject?: StorageObject;
}

export interface ApiWeeklyReportExportData {
  reportId: string;
  format: WeeklyReportExportFormat;
  exportedAt: string;
  content: string;
  mimeType: string;
  filename: string;
  storageObject: StorageObject;
}

export interface ApiArchiveMetadata {
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  restoredAt?: string;
  restoredBy?: string;
}

export type ApiChild = AppStateSnapshot["children"][number] &
  ApiArchiveMetadata & {
    createdAt?: string;
    updatedAt?: string;
  };

export interface ApiChildInput {
  name: string;
  nickname?: string;
  birthDate: string;
  gender: "男" | "女";
  allergies: string[];
  heightCm: number;
  weightKg: number;
  guardians: AppStateSnapshot["children"][number]["guardians"];
  className: string;
  specialNotes: string;
  parentUserId?: string;
}

export type ApiChildPatch = Partial<ApiChildInput>;

export interface ApiArchiveInput {
  action: ArchiveAction;
  archiveReason?: string;
}

export interface ApiTeacher extends ApiArchiveMetadata {
  teacherId: string;
  userId?: string;
  name: string;
  institutionId: string;
  className?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTeacherInput {
  name: string;
  className?: string;
}

export type ApiTeacherPatch = Partial<ApiTeacherInput>;

export interface ApiWeeklyReport {
  reportId: string;
  title: string;
  scopeType: ReportScopeType;
  scopeId: string;
  institutionId: string;
  periodStart: string;
  periodEnd: string;
  status: WeeklyReportStatus;
  payload: Record<string, unknown>;
  sourceRecordIds: string[];
  createdBy: string;
  generatedBy?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: string;
  share?: ApiWeeklyReportShare;
}

export interface ApiAssignment {
  assignmentId: string;
  taskId: string;
  institutionId: string;
  childId: string;
  childName: string;
  teacherId: string;
  teacherName: string;
  title: string;
  description: string;
  status: ApiAssignmentStatus;
  sourceType: TaskSourceType;
  sourceId: string;
  assigneeRole: TaskOwnerRole;
  dueAt: string;
  reminderId?: string;
  feedbackId?: string;
  consultationId?: string;
  riskItemId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ApiAttachment {
  attachmentId: string;
  institutionId: string;
  childId?: string;
  relatedType?: AttachmentRelatedType;
  relatedId?: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize?: number;
  storageMode: StorageObjectMode;
  uploadStatus: "metadata_saved" | "uploaded" | "failed";
  localPreviewUrl?: string;
  downloadUrl?: string;
  metadataOnly?: boolean;
  storageObject?: StorageObject;
  durationMs?: number;
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
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ApiFeedbackStatusHistoryItem {
  status: FeedbackStatus;
  previousStatus?: FeedbackStatus;
  action: "created" | "update_status";
  actorUserId?: string;
  actorRole?: AccountRole;
  createdAt: string;
}

export interface ApiFeedbackDetail {
  feedback: AppStateSnapshot["feedback"][number] & { status: FeedbackStatus };
  child: AppStateSnapshot["children"][number];
  parent: {
    userId?: string;
    name: string;
  } | null;
  teacher: ApiTeacher | null;
  messages: AppStateSnapshot["messages"];
  replies: AppStateSnapshot["messages"];
  attachments: ApiAttachment[];
  statusHistory: ApiFeedbackStatusHistoryItem[];
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
