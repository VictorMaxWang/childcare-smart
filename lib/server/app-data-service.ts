import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import type {
  ApiAttachment,
  ApiAssignment,
  ApiAssignmentStatus,
  ApiFeedbackDetail,
  ApiFeedbackStatusHistoryItem,
  ApiExtendedSnapshot,
  ApiStorybook,
  ApiStorybookExportData,
  ApiTeacher,
  ApiWeeklyReport,
  ArchiveAction,
  AttachmentKind,
  AttachmentRelatedType,
  FeedbackStatus,
  RecordType,
  ReportScopeType,
  StorybookExportFormat,
  WeeklyReportExportFormat,
} from "@/lib/api/types";
import { normalizeParentStructuredFeedback } from "@/lib/feedback/normalize";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { AppDataRepository } from "@/lib/server/app-data-repository";
import { appendAuditLog, createApiId } from "@/lib/server/app-data-model";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  buildAdminQualityMetrics,
  buildAdminSummary,
  buildTrend,
  buildWeeklyReportPayload,
  type AnalyticsTrendOptions,
} from "@/lib/server/analytics-aggregates";
import {
  canAccessChild,
  canAccessReport,
  canManageDirectorResource,
  canViewFeedback,
  findChild,
  requireChildAccess,
  requireClassAccess,
  requireConversationReplyAccess,
  requireDirector,
  requireFeedbackViewAccess,
  requireReportAccess,
  requireRecordModifyAccess,
  requireTeacherAccess,
} from "@/lib/server/scope";

type Archivable<T> = T & {
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  restoredAt?: string;
  restoredBy?: string;
  updatedAt?: string;
};
type AnyRecord = Record<string, unknown>;
type SnapshotMessage = AppStateSnapshot["messages"][number];
type SnapshotConversation = AppStateSnapshot["conversations"][number];
type SnapshotFeedback = AppStateSnapshot["feedback"][number] & { id?: string; feedbackId?: string; status?: string };
type SnapshotReminder = AppStateSnapshot["reminders"][number];
type SnapshotStorybook = AppStateSnapshot["storybooks"][number] & ApiStorybook;
type SnapshotTask = AppStateSnapshot["tasks"][number];
type HealthMaterialParseStatus = AppStateSnapshot["healthMaterials"][number]["parseStatus"];

const FEEDBACK_STATUSES: FeedbackStatus[] = ["open", "in-progress", "resolved", "archived"];
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_MAX_PER_RELATED_ENTITY = 3;
const ATTACHMENT_RELATED_TYPES: AttachmentRelatedType[] = [
  "message",
  "feedback",
  "health-material",
  "consultation",
  "weekly-report",
  "storybook",
];

function nowIso() {
  return new Date().toISOString();
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readParseStatus(value: unknown, fallback: HealthMaterialParseStatus): HealthMaterialParseStatus {
  const status = readString(value, fallback);
  if (status === "pending" || status === "processing" || status === "completed" || status === "failed") {
    return status;
  }
  return fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function roleToMessageRole(role: SessionUser["role"]): SnapshotMessage["senderRole"] {
  if (role === "教师") return "teacher";
  if (role === "机构管理员") return "director";
  return "parent";
}

function roleToFeedbackSourceRole(role: SessionUser["role"]) {
  const messageRole = roleToMessageRole(role);
  return messageRole === "director" ? "admin" : messageRole;
}

function normalizeFeedbackStatus(value: unknown, fallback: FeedbackStatus = "open"): FeedbackStatus {
  const status = readString(value).toLowerCase();
  if ((FEEDBACK_STATUSES as string[]).includes(status)) return status as FeedbackStatus;
  if (status === "handled" || status === "completed" || status === "done") return "resolved";
  if (status === "partial" || status === "processing" || status === "progress") return "in-progress";
  if (status === "pending" || status === "not_started" || status === "not-started") return "open";
  return fallback;
}

function readFeedbackStatus(value: unknown): FeedbackStatus {
  const status = readString(value).toLowerCase();
  if ((FEEDBACK_STATUSES as string[]).includes(status)) return status as FeedbackStatus;
  throw new ApiRouteError("invalid_request", "Feedback status must be open, in-progress, resolved, or archived.");
}

function readAssignmentStatus(value: unknown, fallback: ApiAssignmentStatus = "pending"): ApiAssignmentStatus {
  const status = readString(value).toLowerCase();
  if (status === "pending" || status === "in_progress" || status === "completed" || status === "overdue") {
    return status;
  }
  if (status === "in-progress" || status === "acknowledged" || status === "processing") return "in_progress";
  if (status === "done" || status === "resolved" || status === "closed") return "completed";
  return fallback;
}

function assignmentReminderStatus(status: ApiAssignmentStatus): SnapshotReminder["status"] {
  if (status === "completed") return "done";
  if (status === "in_progress") return "acknowledged";
  return "pending";
}

function isAdminDispatchTask(task: SnapshotTask) {
  return task.sourceType === "admin_dispatch" && task.ownerRole === "teacher";
}

function assignmentIdOfTask(task: SnapshotTask) {
  return task.legacyRefs?.adminDispatchEventId ?? task.sourceId;
}

function deriveAttachmentKind(mimeType: string, fileName = ""): AttachmentKind {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.startsWith("audio/")) return "audio";
  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  return "other";
}

function readAttachmentKind(value: unknown, mimeType: string, fileName: string): AttachmentKind {
  if (value === "image" || value === "audio" || value === "pdf" || value === "other") return value;
  return deriveAttachmentKind(mimeType, fileName);
}

function readAttachmentRelatedType(value: unknown): AttachmentRelatedType | undefined {
  const relatedType = readString(value);
  if (!relatedType) return undefined;
  if ((ATTACHMENT_RELATED_TYPES as string[]).includes(relatedType)) return relatedType as AttachmentRelatedType;
  throw new ApiRouteError("invalid_request", "Attachment relatedType is invalid.");
}

function requireStaff(session: SessionUser) {
  if (session.role !== "教师" && session.role !== "机构管理员") {
    throw new ApiRouteError("forbidden_scope", "当前操作仅教师或机构管理员可执行。");
  }
}

function feedbackIdOf(feedback: SnapshotFeedback) {
  return feedback.feedbackId ?? feedback.id ?? "";
}

function feedbackTimestampOf(feedback: SnapshotFeedback) {
  const record = feedback as unknown as AnyRecord;
  return (
    readString(record.updatedAt) ||
    readString(record.submittedAt) ||
    readString(record.date) ||
    readString(record.createdAt)
  );
}

function isNotArchived<T extends { archivedAt?: string }>(item: T) {
  return !item.archivedAt;
}

function readGender(value: unknown, fallback: "男" | "女" = "女") {
  return value === "男" || value === "女" ? value : fallback;
}

function sanitizeChildPatch(input: AnyRecord): AnyRecord {
  const patch: AnyRecord = {};
  if ("name" in input) patch.name = readString(input.name, "未命名幼儿");
  if ("nickname" in input) patch.nickname = readString(input.nickname) || undefined;
  if ("birthDate" in input) patch.birthDate = readString(input.birthDate);
  if ("gender" in input) patch.gender = readGender(input.gender);
  if ("allergies" in input) patch.allergies = readArray<string>(input.allergies).filter((item) => typeof item === "string");
  if ("heightCm" in input) patch.heightCm = readNumber(input.heightCm, 0);
  if ("weightKg" in input) patch.weightKg = readNumber(input.weightKg, 0);
  if ("guardians" in input) patch.guardians = readArray(input.guardians);
  if ("className" in input) patch.className = readString(input.className, "待分班");
  if ("specialNotes" in input) patch.specialNotes = readString(input.specialNotes);
  if ("parentUserId" in input) patch.parentUserId = readString(input.parentUserId) || undefined;
  return patch;
}

function withArchive<T extends object>(
  item: T,
  action: ArchiveAction,
  actorUserId: string,
  archiveReason?: string
): T {
  if (action === "restore") {
    const restored = { ...item } as Archivable<T>;
    delete restored.archivedAt;
    delete restored.archivedBy;
    delete restored.archiveReason;
    restored.restoredAt = nowIso();
    restored.restoredBy = actorUserId;
    restored.updatedAt = nowIso();
    return restored;
  }
  const archived = { ...item } as Archivable<T>;
  archived.archivedAt = nowIso();
  archived.archivedBy = actorUserId;
  archived.archiveReason = archiveReason || undefined;
  delete archived.restoredAt;
  delete archived.restoredBy;
  archived.updatedAt = nowIso();
  return archived;
}

function updateById<T>(
  items: T[],
  id: string,
  readId: (item: T) => string,
  update: (item: T) => T
) {
  let found = false;
  const next = items.map((item) => {
    if (readId(item) !== id) return item;
    found = true;
    return update(item);
  });
  return { found, next };
}

function blankAgentView(title: string) {
  return {
    role: title,
    title,
    summary: "E01 API service generated consultation shell.",
    signals: [],
    actions: [],
    observationPoints: [],
    evidence: [],
  };
}

function buildConsultation(input: {
  session: SessionUser;
  childId: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  notes?: string;
  sourceMaterialId?: string;
}) {
  const now = nowIso();
  const summary = input.summary || input.notes || "E01 consultation";
  return {
    consultationId: createApiId("consult"),
    triggerReason: summary,
    triggerType: ["multi-risk"],
    triggerReasons: [summary],
    participants: [{ id: "coordinator", label: "API Service" }],
    childId: input.childId,
    riskLevel: input.riskLevel,
    agentFindings: [],
    summary,
    keyFindings: [summary],
    healthAgentView: blankAgentView("HealthObservationAgent"),
    dietBehaviorAgentView: blankAgentView("DietBehaviorAgent"),
    parentCommunicationAgentView: blankAgentView("ParentCommunicationAgent"),
    inSchoolActionAgentView: blankAgentView("InSchoolActionAgent"),
    todayInSchoolActions: [],
    tonightAtHomeActions: [],
    followUp48h: [],
    parentMessageDraft: "",
    directorDecisionCard: {
      title: "E01 consultation follow-up",
      reason: summary,
      recommendedOwnerRole: "teacher",
      recommendedOwnerName: input.session.name,
      recommendedAt: now,
      status: "pending",
    },
    explainability: [],
    evidenceItems: [],
    nextCheckpoints: [],
    coordinatorSummary: {
      finalConclusion: summary,
      riskLevel: input.riskLevel,
      problemDefinition: summary,
      schoolAction: "",
      homeAction: "",
      observationPoints: [],
      reviewIn48h: "",
      shouldEscalateToAdmin: input.riskLevel === "high",
    },
    schoolAction: "",
    homeAction: "",
    observationPoints: [],
    reviewIn48h: "",
    shouldEscalateToAdmin: input.riskLevel === "high",
    source: "rule",
    generatedAt: now,
    status: "active",
    workflowStatus: "pending",
    notes: input.notes ? [{ note: input.notes, createdAt: now, createdBy: input.session.id }] : [],
    createdBy: input.session.id,
    sourceMaterialId: input.sourceMaterialId,
    updatedAt: now,
  } as AppStateSnapshot["consultations"][number];
}

export class AppDataService {
  constructor(
    private readonly session: SessionUser,
    private readonly repository: AppDataRepository
  ) {}

  private async load() {
    return this.repository.load(this.session);
  }

  private async save(snapshot: ApiExtendedSnapshot) {
    snapshot.updatedAt = nowIso();
    await this.repository.save(this.session, snapshot);
  }

  private async mutate<T>(
    targetType: string,
    targetId: string,
    action: string,
    mutator: (snapshot: ApiExtendedSnapshot) => T
  ) {
    const snapshot = await this.load();
    const data = mutator(snapshot);
    appendAuditLog(snapshot, this.session, targetType, targetId, action, "success");
    await this.save(snapshot);
    return data;
  }

  async listChildren(options: { includeArchived?: boolean } = {}) {
    const snapshot = await this.load();
    return snapshot.children
      .filter((child) => canAccessChild(this.session, child))
      .filter((child) => options.includeArchived || isNotArchived(child as Archivable<typeof child>));
  }

  async getChild(childId: string) {
    const snapshot = await this.load();
    return requireChildAccess(this.session, snapshot, childId);
  }

  async createChild(input: AnyRecord) {
    requireDirector(this.session);
    return this.mutate("child", "new", "create", (snapshot) => {
      const now = nowIso();
      const child = {
        id: createApiId("c"),
        name: readString(input.name, "未命名幼儿"),
        nickname: readString(input.nickname) || undefined,
        birthDate: readString(input.birthDate, now.slice(0, 10)),
        gender: readGender(input.gender),
        allergies: readArray<string>(input.allergies).filter((item) => typeof item === "string"),
        heightCm: readNumber(input.heightCm, 0),
        weightKg: readNumber(input.weightKg, 0),
        guardians: readArray(input.guardians),
        institutionId: this.session.institutionId,
        className: readString(input.className, "待分班"),
        specialNotes: readString(input.specialNotes),
        avatar: input.gender === "男" ? "👦" : "👧",
        parentUserId: readString(input.parentUserId) || undefined,
        createdAt: now,
        updatedAt: now,
      } as AppStateSnapshot["children"][number];
      snapshot.children = [child, ...snapshot.children];
      return child;
    });
  }

  async updateChild(childId: string, input: AnyRecord) {
    requireDirector(this.session);
    return this.mutate("child", childId, "update", (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const patch = sanitizeChildPatch(input);
      const { found, next } = updateById(snapshot.children, childId, (child) => child.id, (child) => ({
        ...child,
        ...patch,
        id: child.id,
        institutionId: child.institutionId,
        updatedAt: nowIso(),
      } as AppStateSnapshot["children"][number]));
      if (!found) throw new ApiRouteError("not_found", "未找到儿童档案。");
      snapshot.children = next;
      return next.find((child) => child.id === childId);
    });
  }

  async archiveChild(childId: string, action: ArchiveAction, archiveReason?: string) {
    requireDirector(this.session);
    return this.mutate("child", childId, action, (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const { found, next } = updateById(snapshot.children, childId, (child) => child.id, (child) =>
        withArchive(child, action, this.session.id, archiveReason)
      );
      if (!found) throw new ApiRouteError("not_found", "未找到儿童档案。");
      snapshot.children = next;
      return next.find((child) => child.id === childId);
    });
  }

  async listTeachers(options: { includeArchived?: boolean } = {}) {
    requireDirector(this.session);
    const snapshot = await this.load();
    return snapshot.teachers
      .filter((teacher) => teacher.institutionId === this.session.institutionId)
      .filter((teacher) => options.includeArchived || !teacher.archivedAt);
  }

  async getTeacher(teacherId: string) {
    requireDirector(this.session);
    const snapshot = await this.load();
    return requireTeacherAccess(this.session, snapshot.teachers.find((teacher) => teacher.teacherId === teacherId || teacher.userId === teacherId));
  }

  async createTeacher(input: AnyRecord) {
    requireDirector(this.session);
    return this.mutate("teacher", "new", "create", (snapshot) => {
      const teacher: ApiTeacher = {
        teacherId: createApiId("teacher"),
        name: readString(input.name, "未命名教师"),
        institutionId: this.session.institutionId,
        className: readString(input.className) || undefined,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      snapshot.teachers = [teacher, ...snapshot.teachers];
      return teacher;
    });
  }

  async updateTeacher(teacherId: string, input: AnyRecord) {
    requireDirector(this.session);
    return this.mutate("teacher", teacherId, "update", (snapshot) => {
      requireTeacherAccess(this.session, snapshot.teachers.find((teacher) => teacher.teacherId === teacherId || teacher.userId === teacherId));
      snapshot.teachers = snapshot.teachers.map((teacher) =>
        teacher.teacherId === teacherId || teacher.userId === teacherId
          ? { ...teacher, name: readString(input.name, teacher.name), className: readString(input.className, teacher.className ?? "") || undefined, updatedAt: nowIso() }
          : teacher
      );
      return snapshot.teachers.find((teacher) => teacher.teacherId === teacherId || teacher.userId === teacherId);
    });
  }

  async archiveTeacher(teacherId: string, action: ArchiveAction, archiveReason?: string) {
    requireDirector(this.session);
    return this.mutate("teacher", teacherId, action, (snapshot) => {
      requireTeacherAccess(this.session, snapshot.teachers.find((teacher) => teacher.teacherId === teacherId || teacher.userId === teacherId));
      snapshot.teachers = snapshot.teachers.map((teacher) =>
        teacher.teacherId === teacherId || teacher.userId === teacherId
          ? withArchive(teacher, action, this.session.id, archiveReason)
          : teacher
      );
      return snapshot.teachers.find((teacher) => teacher.teacherId === teacherId || teacher.userId === teacherId);
    });
  }

  async listMessages(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.messages
      .filter((message) => (!options.childId || message.childId === options.childId))
      .filter((message) => canAccessChild(this.session, findChild(snapshot, message.childId)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async sendMessage(input: AnyRecord) {
    const childId = readString(input.childId);
    if (!childId) throw new ApiRouteError("invalid_request", "发送消息必须提供 childId。");
    return this.mutate("message", "new", "send", (snapshot) => {
      const child = requireChildAccess(this.session, snapshot, childId);
      const now = nowIso();
      const conversationId = readString(input.conversationId, `conv-${childId}-home-school`);
      const senderRole = roleToMessageRole(this.session.role);
      const message = {
        messageId: createApiId("msg"),
        conversationId,
        childId,
        classId: child.className,
        senderRole,
        senderId: this.session.id,
        senderName: this.session.name,
        receiverRole: senderRole === "parent" ? "teacher" : "parent",
        targetRole: senderRole === "parent" ? "teacher" : "parent",
        content: readString(input.content),
        createdAt: now,
        readBy: [this.session.id],
        status: "sent",
      } satisfies SnapshotMessage;
      const existingConversation = snapshot.conversations.find((conversation) => conversation.conversationId === conversationId);
      const conversation = {
        conversationId,
        childId,
        classId: child.className,
        participantIds: Array.from(new Set([this.session.id, ...(existingConversation?.participantIds ?? [])])),
        participantRoles: Array.from(new Set([senderRole, ...(existingConversation?.participantRoles ?? [])])),
        status: "open",
        createdAt: existingConversation?.createdAt ?? now,
        updatedAt: now,
      } satisfies SnapshotConversation;
      snapshot.messages = [...snapshot.messages, message];
      snapshot.conversations = [
        conversation,
        ...snapshot.conversations.filter((item) => item.conversationId !== conversationId),
      ];
      return message;
    });
  }

  async replyMessage(messageId: string, input: AnyRecord) {
    return this.mutate("message", messageId, "reply", (snapshot) => {
      const baseMessage = snapshot.messages.find((message) => message.messageId === messageId);
      const conversation = snapshot.conversations.find(
        (item) => item.conversationId === (readString(input.conversationId) || baseMessage?.conversationId)
      );
      requireConversationReplyAccess(this.session, snapshot, conversation);
      if (!conversation) throw new ApiRouteError("not_found", "Message conversation was not found.");
      const child = requireChildAccess(this.session, snapshot, conversation.childId);
      const now = nowIso();
      const senderRole = roleToMessageRole(this.session.role);
      const reply = {
        messageId: createApiId("msg"),
        conversationId: conversation.conversationId,
        childId: conversation.childId,
        classId: child.className,
        senderRole,
        senderId: this.session.id,
        senderName: this.session.name,
        receiverRole: baseMessage?.senderRole ?? (senderRole === "parent" ? "teacher" : "parent"),
        targetRole: baseMessage?.senderRole ?? (senderRole === "parent" ? "teacher" : "parent"),
        content: readString(input.content),
        createdAt: now,
        readBy: [this.session.id],
        status: "sent",
      } satisfies SnapshotMessage;
      snapshot.messages = [...snapshot.messages, reply];
      snapshot.conversations = snapshot.conversations.map((item) =>
        item.conversationId === conversation.conversationId ? { ...item, updatedAt: now } : item
      );
      return reply;
    });
  }

  async markMessageRead(messageId: string) {
    return this.mutate("message", messageId, "mark_read", (snapshot) => {
      const message = snapshot.messages.find((item) => item.messageId === messageId);
      if (!message) throw new ApiRouteError("not_found", "未找到消息。");
      requireChildAccess(this.session, snapshot, message.childId);
      snapshot.messages = snapshot.messages.map((item) =>
        item.messageId === messageId ? { ...item, readBy: Array.from(new Set([...item.readBy, this.session.id])) } : item
      );
      return snapshot.messages.find((item) => item.messageId === messageId);
    });
  }

  private decorateAttachment(attachment: ApiAttachment): ApiAttachment {
    return {
      ...attachment,
      kind: attachment.kind ?? deriveAttachmentKind(attachment.mimeType, attachment.fileName),
      downloadUrl: `/api/attachments/${attachment.attachmentId}/content`,
    };
  }

  private buildFeedbackDetail(snapshot: ApiExtendedSnapshot, feedbackId: string): ApiFeedbackDetail {
    const feedback = snapshot.feedback.find((item) => feedbackIdOf(item as SnapshotFeedback) === feedbackId) as
      | SnapshotFeedback
      | undefined;
    if (!feedback) throw new ApiRouteError("not_found", "Feedback was not found.");
    requireFeedbackViewAccess(this.session, snapshot, feedback);

    const child = requireChildAccess(this.session, snapshot, feedback.childId);
    const childMessages = snapshot.messages
      .filter((message) => message.childId === child.id)
      .filter((message) => canAccessChild(this.session, findChild(snapshot, message.childId)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const messageIds = new Set(childMessages.map((message) => message.messageId));
    const attachments = snapshot.attachments
      .filter((attachment) => {
        if (attachment.institutionId !== this.session.institutionId) return false;
        if (attachment.relatedType === "feedback" && attachment.relatedId === feedbackId) return true;
        if (attachment.relatedType === "message" && attachment.relatedId && messageIds.has(attachment.relatedId)) {
          return true;
        }
        return false;
      })
      .filter((attachment) => !attachment.childId || canAccessChild(this.session, findChild(snapshot, attachment.childId)))
      .map((attachment) => this.decorateAttachment(attachment));
    const parentAccount = DEMO_ACCOUNTS.find((account) => account.childIds?.includes(child.id));
    const teacher =
      snapshot.teachers.find(
        (item) => item.institutionId === this.session.institutionId && item.className === child.className
      ) ?? null;
    const updateLogs = snapshot.auditLogs
      .filter((log) => log.targetType === "feedback" && log.targetId === feedbackId && log.action === "update_status")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const firstPreviousStatus = updateLogs[0]?.metadata?.previousStatus;
    const initialStatus = normalizeFeedbackStatus(firstPreviousStatus, normalizeFeedbackStatus(feedback.status));
    const statusHistory: ApiFeedbackStatusHistoryItem[] = [
      {
        status: initialStatus,
        action: "created",
        actorUserId: feedback.createdBy,
        actorRole: feedback.createdByRole,
        createdAt: feedback.submittedAt ?? feedback.date ?? childMessages[0]?.createdAt ?? nowIso(),
      },
      ...updateLogs.map((log) => ({
        status: normalizeFeedbackStatus(log.metadata?.status, normalizeFeedbackStatus(feedback.status)),
        previousStatus: log.metadata?.previousStatus
          ? normalizeFeedbackStatus(log.metadata.previousStatus)
          : undefined,
        action: "update_status" as const,
        actorUserId: log.actorUserId,
        actorRole: log.actorRole,
        createdAt: log.createdAt,
      })),
    ];

    return {
      feedback: {
        ...feedback,
        status: normalizeFeedbackStatus(feedback.status),
      } as ApiFeedbackDetail["feedback"],
      child,
      parent: parentAccount ? { userId: parentAccount.id, name: parentAccount.name } : null,
      teacher,
      messages: childMessages,
      replies: childMessages.filter(
        (message) => message.senderRole === "teacher" || message.senderRole === "director" || message.senderRole === "admin"
      ),
      attachments,
      statusHistory,
    };
  }

  async listFeedback(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.feedback
      .filter((feedback) => (!options.childId || feedback.childId === options.childId))
      .filter((feedback) => canViewFeedback(this.session, snapshot, feedback))
      .sort((left, right) =>
        feedbackTimestampOf(right as SnapshotFeedback).localeCompare(feedbackTimestampOf(left as SnapshotFeedback))
      )
      .map((feedback) => ({
        ...feedback,
        status: normalizeFeedbackStatus((feedback as SnapshotFeedback).status),
      }));
  }

  async createFeedback(input: AnyRecord) {
    const childId = readString(input.childId);
    if (!childId) throw new ApiRouteError("invalid_request", "Feedback must include childId.");
    const feedbackId = readString(input.feedbackId, readString(input.id)) || createApiId("feedback");
    return this.mutate("feedback", feedbackId, "create", (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const now = nowIso();
      const sourceRole = roleToFeedbackSourceRole(this.session.role);
      const normalized = normalizeParentStructuredFeedback(
        {
          ...input,
          id: feedbackId,
          feedbackId,
          childId,
          status: normalizeFeedbackStatus(input.status),
          sourceChannel: readString(input.sourceChannel, "parent-agent"),
          source: isRecordLike(input.source)
            ? {
                ...input.source,
                kind: "structured",
                createdBy: this.session.id,
                createdByRole: this.session.role,
              }
            : {
                kind: "structured",
                workflow: readString(input.sourceChannel, "parent-agent"),
                createdBy: this.session.id,
                createdByRole: this.session.role,
              },
          createdBy: this.session.id,
          createdByRole: this.session.role,
          submittedAt: readString(input.submittedAt, now),
          date: readString(input.date, now),
        },
        {
          feedbackId,
          createdBy: this.session.id,
          createdByRole: this.session.role,
          sourceRole,
          sourceChannel: readString(input.sourceChannel, "parent-agent"),
          submittedAt: readString(input.submittedAt, now),
        }
      );
      if (!normalized) throw new ApiRouteError("invalid_request", "Feedback payload is invalid.");
      snapshot.feedback = [normalized, ...snapshot.feedback.filter((item) => feedbackIdOf(item as SnapshotFeedback) !== feedbackId)];
      return this.buildFeedbackDetail(snapshot, feedbackId);
    });
  }

  async getFeedback(feedbackId: string) {
    const snapshot = await this.load();
    return this.buildFeedbackDetail(snapshot, feedbackId);
  }

  async updateFeedbackStatus(feedbackId: string, input: AnyRecord) {
    requireStaff(this.session);
    const nextStatus = readFeedbackStatus(input.status);
    const snapshot = await this.load();
    const feedback = snapshot.feedback.find((item) => feedbackIdOf(item as SnapshotFeedback) === feedbackId) as
      | SnapshotFeedback
      | undefined;
    if (!feedback) throw new ApiRouteError("not_found", "Feedback was not found.");
    requireFeedbackViewAccess(this.session, snapshot, feedback);
    const previousStatus = normalizeFeedbackStatus(feedback.status);
    const updatedAt = nowIso();
    snapshot.feedback = snapshot.feedback.map((item) =>
      feedbackIdOf(item as SnapshotFeedback) === feedbackId
        ? ({ ...item, status: nextStatus, updatedAt } as AppStateSnapshot["feedback"][number])
        : item
    );
    appendAuditLog(snapshot, this.session, "feedback", feedbackId, "update_status", "success", {
      previousStatus,
      status: nextStatus,
    });
    await this.save(snapshot);
    return this.buildFeedbackDetail(snapshot, feedbackId);
  }

  private async updateFeedbackStatusLegacy(feedbackId: string, input: AnyRecord) {
    return this.mutate("feedback", feedbackId, "update_status", (snapshot) => {
      const feedback = snapshot.feedback.find((item) => feedbackIdOf(item as SnapshotFeedback) === feedbackId) as SnapshotFeedback | undefined;
      requireFeedbackViewAccess(this.session, snapshot, feedback);
      if (this.session.role === "家长") {
        throw new ApiRouteError("forbidden_scope", "家长不能更新反馈处理状态。");
      }
      snapshot.feedback = snapshot.feedback.map((item) =>
        feedbackIdOf(item as SnapshotFeedback) === feedbackId
          ? ({ ...item, status: readString(input.status, "handled"), updatedAt: nowIso() } as AppStateSnapshot["feedback"][number])
          : item
      );
      return snapshot.feedback.find((item) => feedbackIdOf(item as SnapshotFeedback) === feedbackId);
    });
  }

  private getRecords(snapshot: ApiExtendedSnapshot, type: RecordType) {
    if (type === "attendance") return snapshot.attendance as Array<Archivable<AppStateSnapshot["attendance"][number]>>;
    if (type === "health") return snapshot.health as Array<Archivable<AppStateSnapshot["health"][number]>>;
    if (type === "meal") return snapshot.meals as Array<Archivable<AppStateSnapshot["meals"][number]>>;
    return snapshot.growth as Array<Archivable<AppStateSnapshot["growth"][number]>>;
  }

  private setRecords(snapshot: ApiExtendedSnapshot, type: RecordType, records: Array<Archivable<object>>) {
    if (type === "attendance") snapshot.attendance = records as AppStateSnapshot["attendance"];
    else if (type === "health") snapshot.health = records as AppStateSnapshot["health"];
    else if (type === "meal") snapshot.meals = records as AppStateSnapshot["meals"];
    else snapshot.growth = records as AppStateSnapshot["growth"];
  }

  async listRecords(type: RecordType, options: { childId?: string; includeArchived?: boolean } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return this.getRecords(snapshot, type)
      .filter((record) => (!options.childId || record.childId === options.childId))
      .filter((record) => canAccessChild(this.session, findChild(snapshot, record.childId)))
      .filter((record) => options.includeArchived || isNotArchived(record));
  }

  async createRecord(type: RecordType, input: AnyRecord) {
    requireStaff(this.session);
    const childId = readString(input.childId);
    if (!childId) throw new ApiRouteError("invalid_request", "创建记录必须提供 childId。");
    return this.mutate("record", "new", `create_${type}`, (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const now = nowIso();
      let record: object;
      if (type === "attendance") {
        record = {
          id: createApiId("att"),
          childId,
          date: readString(input.date, now.slice(0, 10)),
          isPresent: readBoolean(input.isPresent, true),
          checkInAt: readString(input.checkInAt) || undefined,
          checkOutAt: readString(input.checkOutAt) || undefined,
          absenceReason: readString(input.absenceReason) || undefined,
        };
      } else if (type === "health") {
        record = {
          id: createApiId("hc"),
          childId,
          date: readString(input.date, now.slice(0, 10)),
          temperature: readNumber(input.temperature, 36.6),
          mood: readString(input.mood, "stable"),
          handMouthEye: input.handMouthEye === "异常" ? "异常" : "正常",
          isAbnormal: readBoolean(input.isAbnormal, false),
          remark: readString(input.remark) || undefined,
          checkedBy: this.session.name,
          checkedByRole: this.session.role,
        };
      } else if (type === "meal") {
        record = {
          id: createApiId("meal"),
          childId,
          date: readString(input.date, now.slice(0, 10)),
          meal: readString(input.meal, "午餐"),
          foods: readArray(input.foods),
          intakeLevel: readString(input.intakeLevel, "适中"),
          preference: readString(input.preference, "正常"),
          waterMl: readNumber(input.waterMl, 0),
          nutritionScore: readNumber(input.nutritionScore, 80),
          recordedBy: this.session.name,
          recordedByRole: this.session.role,
        };
      } else {
        record = {
          id: createApiId("growth"),
          childId,
          createdAt: readString(input.createdAt, now),
          recorder: this.session.name,
          recorderRole: this.session.role,
          category: readString(input.category, "情绪表现"),
          tags: readArray<string>(input.tags).filter((item) => typeof item === "string"),
          description: readString(input.description, "E01 growth record"),
          needsAttention: readBoolean(input.needsAttention, false),
          followUpAction: readString(input.followUpAction) || undefined,
          reviewDate: readString(input.reviewDate) || undefined,
          reviewStatus: readString(input.reviewStatus, "已完成"),
          mediaUrls: readArray<string>(input.mediaUrls).filter((item) => typeof item === "string"),
        };
      }
      const records = this.getRecords(snapshot, type);
      this.setRecords(snapshot, type, [record, ...records] as Array<Archivable<object>>);
      return record;
    });
  }

  async updateRecord(type: RecordType, recordId: string, input: AnyRecord) {
    requireStaff(this.session);
    return this.mutate("record", recordId, `update_${type}`, (snapshot) => {
      const records = this.getRecords(snapshot, type);
      const existing = records.find((record) => record.id === recordId);
      requireRecordModifyAccess(this.session, snapshot, existing);
      const next = records.map((record) => {
        if (record.id !== recordId) return record;
        const safeInput = { ...input };
        delete safeInput.id;
        delete safeInput.childId;
        delete safeInput.institutionId;
        delete safeInput.archivedAt;
        delete safeInput.archivedBy;
        delete safeInput.archiveReason;
        delete safeInput.restoredBy;
        return { ...record, ...safeInput, id: record.id, childId: record.childId, updatedAt: nowIso() };
      });
      this.setRecords(snapshot, type, next as Array<Archivable<object>>);
      return next.find((record) => record.id === recordId);
    });
  }

  async archiveRecord(type: RecordType, recordId: string, action: ArchiveAction, archiveReason?: string) {
    requireStaff(this.session);
    return this.mutate("record", recordId, `${action}_${type}`, (snapshot) => {
      const records = this.getRecords(snapshot, type);
      const existing = records.find((record) => record.id === recordId);
      requireRecordModifyAccess(this.session, snapshot, existing);
      const next = records.map((record) =>
        record.id === recordId ? withArchive(record, action, this.session.id, archiveReason) : record
      );
      this.setRecords(snapshot, type, next as Array<Archivable<object>>);
      return next.find((record) => record.id === recordId);
    });
  }

  async listHealthMaterials(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.healthMaterials
      .filter((material) => (!options.childId || material.childId === options.childId))
      .filter((material) => canAccessChild(this.session, findChild(snapshot, material.childId)));
  }

  async createHealthMaterial(input: AnyRecord) {
    const childId = readString(input.childId);
    if (!childId) throw new ApiRouteError("invalid_request", "健康材料必须提供 childId。");
    return this.mutate("health-material", "new", "create", (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const material = {
        materialId: createApiId("hm"),
        childId,
        uploadedBy: this.session.id,
        filename: readString(input.filename, "material"),
        fileType: readString(input.fileType, "application/octet-stream"),
        description: readString(input.description) || undefined,
        parseStatus: input.parseResult ? "completed" : "pending",
        parseResult: input.parseResult && typeof input.parseResult === "object" ? (input.parseResult as Record<string, unknown>) : undefined,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } satisfies AppStateSnapshot["healthMaterials"][number];
      snapshot.healthMaterials = [material, ...snapshot.healthMaterials];
      return material;
    });
  }

  async updateHealthMaterial(materialId: string, input: AnyRecord) {
    requireStaff(this.session);
    return this.mutate("health-material", materialId, "update_parse", (snapshot) => {
      const material = snapshot.healthMaterials.find((item) => item.materialId === materialId);
      if (!material) throw new ApiRouteError("not_found", "未找到健康材料。");
      requireChildAccess(this.session, snapshot, material.childId);
      snapshot.healthMaterials = snapshot.healthMaterials.map((item) =>
        item.materialId === materialId
          ? {
              ...item,
              parseStatus: readParseStatus(input.parseStatus ?? input.status, item.parseStatus),
              parseResult: input.parseResult && typeof input.parseResult === "object" ? (input.parseResult as Record<string, unknown>) : item.parseResult,
              parseError: readString(input.parseError, readString(input.error)) || undefined,
              updatedAt: nowIso(),
            }
          : item
      );
      return snapshot.healthMaterials.find((item) => item.materialId === materialId);
    });
  }

  async listConsultations(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.consultations
      .filter((consultation) => (!options.childId || consultation.childId === options.childId))
      .filter((consultation) => canAccessChild(this.session, findChild(snapshot, consultation.childId)));
  }

  async createConsultation(input: AnyRecord) {
    requireStaff(this.session);
    const childId = readString(input.childId);
    if (!childId) throw new ApiRouteError("invalid_request", "会诊必须提供 childId。");
    return this.mutate("consultation", "new", "create", (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const consultation = buildConsultation({
        session: this.session,
        childId,
        riskLevel: input.riskLevel === "low" || input.riskLevel === "medium" || input.riskLevel === "high" ? input.riskLevel : "medium",
        summary: readString(input.summary, readString(input.notes, "E01 consultation")),
        notes: readString(input.notes) || undefined,
        sourceMaterialId: readString(input.sourceMaterialId) || undefined,
      });
      snapshot.consultations = [consultation, ...snapshot.consultations];
      return consultation;
    });
  }

  async addConsultationNote(consultationId: string, input: AnyRecord) {
    return this.mutate("consultation", consultationId, "add_note", (snapshot) => {
      const consultation = snapshot.consultations.find((item) => item.consultationId === consultationId);
      if (!consultation) throw new ApiRouteError("not_found", "未找到会诊。");
      requireChildAccess(this.session, snapshot, consultation.childId);
      snapshot.consultations = snapshot.consultations.map((item) =>
        item.consultationId === consultationId
          ? ({
              ...item,
              notes: [
                ...readArray((item as { notes?: unknown }).notes),
                { note: readString(input.note), createdAt: nowIso(), createdBy: this.session.id },
              ],
              updatedAt: nowIso(),
            } as AppStateSnapshot["consultations"][number])
          : item
      );
      return snapshot.consultations.find((item) => item.consultationId === consultationId);
    });
  }

  async updateConsultationStatus(consultationId: string, input: AnyRecord) {
    requireStaff(this.session);
    return this.mutate("consultation", consultationId, "update_status", (snapshot) => {
      const consultation = snapshot.consultations.find((item) => item.consultationId === consultationId);
      if (!consultation) throw new ApiRouteError("not_found", "未找到会诊。");
      requireChildAccess(this.session, snapshot, consultation.childId);
      const workflowStatus = readString(input.status, "in-progress");
      snapshot.consultations = snapshot.consultations.map((item) =>
        item.consultationId === consultationId
          ? ({
              ...item,
              workflowStatus,
              status: workflowStatus === "resolved" ? "resolved" : "active",
              updatedAt: nowIso(),
              directorDecisionCard: {
                ...item.directorDecisionCard,
                status: workflowStatus === "resolved" ? "completed" : workflowStatus === "in-progress" ? "in_progress" : "pending",
              },
            } as AppStateSnapshot["consultations"][number])
          : item
      );
      return snapshot.consultations.find((item) => item.consultationId === consultationId);
    });
  }

  async getDirectorDashboard() {
    requireDirector(this.session);
    const snapshot = await this.load();
    const summary = buildAdminSummary(snapshot, this.session);
    return {
      ...summary,
      messageCount: snapshot.messages.filter((message) => canAccessChild(this.session, findChild(snapshot, message.childId))).length,
      consultationCount: summary.activeConsultationCount,
      updatedAt: snapshot.updatedAt,
    };
  }

  async getAdminSummary() {
    requireDirector(this.session);
    const snapshot = await this.load();
    return buildAdminSummary(snapshot, this.session);
  }

  async getAdminQualityMetrics() {
    requireDirector(this.session);
    const snapshot = await this.load();
    return buildAdminQualityMetrics(snapshot, this.session);
  }

  async getTrends(options: AnalyticsTrendOptions = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    else if (options.classId) requireClassAccess(this.session, snapshot, options.classId);
    else if (!canManageDirectorResource(this.session)) {
      const childId = readArray<string>(this.session.childIds)[0];
      if (childId) {
        requireChildAccess(this.session, snapshot, childId);
        options = { ...options, childId };
      } else if (this.session.className) {
        requireClassAccess(this.session, snapshot, this.session.className);
        options = { ...options, classId: this.session.className };
      } else {
        throw new ApiRouteError("forbidden_scope", "Current account has no trend scope.");
      }
    } else {
      requireDirector(this.session);
    }
    return buildTrend(snapshot, this.session, options);
  }

  async getChildTrend(childId: string, options: Omit<AnalyticsTrendOptions, "childId"> = {}) {
    const snapshot = await this.load();
    requireChildAccess(this.session, snapshot, childId);
    return buildTrend(snapshot, this.session, { ...options, childId });
  }

  async getTeacherWorkbench(teacherId?: string) {
    const snapshot = await this.load();
    const teacher = teacherId
      ? snapshot.teachers.find((item) => item.teacherId === teacherId || item.userId === teacherId)
      : snapshot.teachers.find((item) => item.userId === this.session.id || item.teacherId === this.session.id);
    const effectiveTeacher = requireTeacherAccess(this.session, teacher ?? (this.session.role === "教师" ? {
      teacherId: this.session.id,
      userId: this.session.id,
      name: this.session.name,
      institutionId: this.session.institutionId,
      className: this.session.className,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } : null));
    const className = effectiveTeacher.className;
    const children = snapshot.children.filter((child) => child.institutionId === this.session.institutionId && child.className === className);
    return {
      teacher: effectiveTeacher,
      visibleChildCount: children.length,
      pendingMessages: snapshot.messages.filter((message) => children.some((child) => child.id === message.childId) && !message.readBy.includes(effectiveTeacher.userId ?? effectiveTeacher.teacherId)).length,
      activeConsultations: snapshot.consultations.filter((item) => children.some((child) => child.id === item.childId)).length,
      generatedAt: nowIso(),
    };
  }

  async getParentHome(childId: string) {
    const snapshot = await this.load();
    const child = requireChildAccess(this.session, snapshot, childId);
    return {
      child,
      messages: snapshot.messages.filter((item) => item.childId === childId),
      records: {
        health: snapshot.health.filter((item) => item.childId === childId && isNotArchived(item as Archivable<typeof item>)),
        meals: snapshot.meals.filter((item) => item.childId === childId && isNotArchived(item as Archivable<typeof item>)),
        growth: snapshot.growth.filter((item) => item.childId === childId && isNotArchived(item as Archivable<typeof item>)),
      },
      consultations: snapshot.consultations.filter((item) => item.childId === childId),
      reminders: snapshot.reminders.filter((item) => item.childId === childId || item.targetId === childId),
      generatedAt: nowIso(),
    };
  }

  async listStorybooks(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.storybooks
      .filter((storybook) => (!options.childId || storybook.childId === options.childId) && canAccessChild(this.session, findChild(snapshot, storybook.childId)))
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)) as SnapshotStorybook[];
  }

  async getStorybook(storybookId: string) {
    const snapshot = await this.load();
    const storybook = snapshot.storybooks.find((item) => item.storybookId === storybookId) as SnapshotStorybook | undefined;
    if (!storybook) throw new ApiRouteError("not_found", "未找到成长绘本。");
    requireChildAccess(this.session, snapshot, storybook.childId);
    return storybook;
  }

  async upsertStorybook(input: AnyRecord) {
    const response = isRecordLike(input.response) ? input.response : null;
    const childId = readString(input.childId, readString(response?.childId));
    if (!childId) throw new ApiRouteError("invalid_request", "成长绘本必须提供 childId。");
    const storybookId = readString(input.storybookId, readString(input.storyId, readString(response?.storyId))) || createApiId("storybook");
    const pages = readArray<Record<string, unknown>>(input.pages).filter(isRecordLike);
    const responsePages = response ? [{ kind: "parent-storybook-response", response }] : [];
    return this.mutate("storybook", storybookId, "upsert", (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const existing = snapshot.storybooks.find((item) => item.storybookId === storybookId) as SnapshotStorybook | undefined;
      const now = nowIso();
      const storybook = {
        storybookId,
        childId,
        sourceRecordIds: readArray<string>(input.sourceRecordIds).filter((item) => typeof item === "string"),
        pages: pages.length > 0 ? pages : responsePages,
        generatedAt: readString(input.generatedAt, readString(response?.generatedAt, existing?.generatedAt ?? now)),
        updatedAt: now,
        share: existing?.share,
      } satisfies SnapshotStorybook;
      snapshot.storybooks = [storybook, ...snapshot.storybooks.filter((item) => item.storybookId !== storybookId)];
      return storybook;
    });
  }

  async exportStorybookData(storybookId: string, format: StorybookExportFormat = "json"): Promise<ApiStorybookExportData> {
    const storybook = await this.getStorybook(storybookId);
    const content = renderStorybookExport(storybook, format);
    const extension = format === "json" ? "json" : format === "markdown" ? "md" : format === "share-text" ? "txt" : "html";
    return {
      kind: "download",
      storybookId,
      childId: storybook.childId,
      format,
      exportedAt: nowIso(),
      content,
      mimeType:
        format === "json"
          ? "application/json"
          : format === "markdown" || format === "share-text"
            ? "text/plain"
            : "text/html",
      filename: `${storybook.storybookId}.${extension}`,
    };
  }

  async shareStorybook(storybookId: string, input: AnyRecord = {}) {
    return this.mutate("storybook", storybookId, "share", (snapshot) => {
      const storybook = snapshot.storybooks.find((item) => item.storybookId === storybookId) as SnapshotStorybook | undefined;
      if (!storybook) throw new ApiRouteError("not_found", "未找到成长绘本。");
      requireChildAccess(this.session, snapshot, storybook.childId);
      const share = {
        shareId: readString(input.shareId, createApiId("share")),
        sharedBy: this.session.id,
        sharedAt: nowIso(),
        summary: readString(input.summary) || storybookShareSummary(storybook),
        localText: storybookShareText(storybook),
      };
      snapshot.storybooks = snapshot.storybooks.map((item) =>
        item.storybookId === storybookId
          ? ({
              ...item,
              share,
              updatedAt: nowIso(),
            } as SnapshotStorybook)
          : item
      );
      return {
        kind: "share-text" as const,
        storybookId,
        childId: storybook.childId,
        share,
        summary: share.summary,
        localText: share.localText,
        copyText: share.localText,
        externalService: "unavailable",
        note: "尚未接入外部分享服务，已生成本地分享摘要和可复制文案。",
      };
    });
  }

  private canAccessReport(snapshot: ApiExtendedSnapshot, report: ApiWeeklyReport) {
    if (report.institutionId !== this.session.institutionId) return false;
    if (report.scopeType === "institution") return this.session.role === "机构管理员";
    if (report.scopeType === "class") {
      try {
        requireClassAccess(this.session, snapshot, report.scopeId);
        return true;
      } catch {
        return false;
      }
    }
    return canAccessChild(this.session, findChild(snapshot, report.scopeId));
  }

  async listWeeklyReports(options: { includeArchived?: boolean } = {}) {
    const snapshot = await this.load();
    return snapshot.weeklyReports
      .filter((report) => canAccessReport(this.session, snapshot, report))
      .filter((report) => options.includeArchived || report.status !== "archived")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async generateWeeklyReport(input: AnyRecord) {
    const scopeType = readString(input.scopeType, this.session.role === "机构管理员" ? "institution" : this.session.role === "教师" ? "class" : "child") as ReportScopeType;
    const scopeId = readString(input.scopeId, scopeType === "institution" ? this.session.institutionId : scopeType === "class" ? this.session.className ?? "" : readArray<string>(this.session.childIds)[0] ?? "");
    return this.mutate("weekly-report", "new", "generate", (snapshot) => {
      if (scopeType === "institution") requireDirector(this.session);
      else if (scopeType === "class") requireClassAccess(this.session, snapshot, scopeId);
      else requireChildAccess(this.session, snapshot, scopeId);
      const report: ApiWeeklyReport = {
        reportId: createApiId("wr"),
        title: readString(input.title, "托育周报"),
        scopeType,
        scopeId,
        institutionId: this.session.institutionId,
        periodStart: readString(input.periodStart, nowIso().slice(0, 10)),
        periodEnd: readString(input.periodEnd, nowIso().slice(0, 10)),
        status: "generated",
        payload: {
          summary: readString(input.summary, "E01 API generated weekly report."),
          metrics: isRecordLike(input.payload) ? input.payload : {},
        },
        sourceRecordIds: [],
        createdBy: this.session.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      snapshot.weeklyReports = [report, ...snapshot.weeklyReports];
      return report;
    });
  }

  async getWeeklyReport(reportId: string) {
    const snapshot = await this.load();
    const report = snapshot.weeklyReports.find((item) => item.reportId === reportId);
    if (!report) throw new ApiRouteError("not_found", "未找到周报。");
    if (!this.canAccessReport(snapshot, report)) throw new ApiRouteError("forbidden_scope", "当前账号无权访问该周报。");
    return report;
  }

  async archiveWeeklyReport(reportId: string, action: ArchiveAction) {
    return this.mutate("weekly-report", reportId, action, (snapshot) => {
      const report = snapshot.weeklyReports.find((item) => item.reportId === reportId);
      if (!report) throw new ApiRouteError("not_found", "未找到周报。");
      if (!this.canAccessReport(snapshot, report)) throw new ApiRouteError("forbidden_scope", "当前账号无权访问该周报。");
      if (this.session.role === "家长") throw new ApiRouteError("forbidden_scope", "家长不能归档周报。");
      snapshot.weeklyReports = snapshot.weeklyReports.map((item) =>
        item.reportId === reportId
          ? {
              ...item,
              status: action === "archive" ? "archived" : "generated",
              archivedAt: action === "archive" ? nowIso() : undefined,
              updatedAt: nowIso(),
            }
          : item
      );
      return snapshot.weeklyReports.find((item) => item.reportId === reportId);
    });
  }

  async exportWeeklyReport(reportId: string, format = "json") {
    const report = await this.getWeeklyReport(reportId);
    return {
      reportId,
      format,
      exportedAt: nowIso(),
      content: format === "markdown" ? `# ${report.title}\n\n${JSON.stringify(report.payload, null, 2)}` : report,
    };
  }

  async createWeeklyReport(input: AnyRecord) {
    const scopeType = readReportScopeType(
      input.scopeType,
      canManageDirectorResource(this.session) ? "institution" : this.session.className ? "class" : "child"
    );
    const scopeId = readString(
      input.scopeId,
      scopeType === "institution"
        ? this.session.institutionId
        : scopeType === "class"
          ? this.session.className ?? ""
          : readArray<string>(this.session.childIds)[0] ?? ""
    );
    const periodEnd = readString(input.periodEnd, nowIso().slice(0, 10));
    const periodStart = readString(input.periodStart, dateDaysBefore(periodEnd, 6));
    const snapshot = await this.load();

    if (scopeType === "institution") requireDirector(this.session);
    else if (scopeType === "class") requireClassAccess(this.session, snapshot, scopeId);
    else requireChildAccess(this.session, snapshot, scopeId);

    const payload = buildWeeklyReportPayload(snapshot, this.session, {
      scopeType,
      scopeId,
      periodStart,
      periodEnd,
    });
    const now = nowIso();
    const report: ApiWeeklyReport = {
      reportId: createApiId("wr"),
      title: readString(input.title, "Weekly report"),
      scopeType,
      scopeId,
      institutionId: this.session.institutionId,
      periodStart,
      periodEnd,
      status: "draft",
      payload: {
        ...payload,
        clientPreview: isRecordLike(input.payload) ? input.payload : undefined,
        clientSummary: readString(input.summary) || undefined,
      },
      sourceRecordIds: payload.sourceRecordIds,
      createdBy: this.session.id,
      generatedBy: this.session.id,
      createdAt: now,
      updatedAt: now,
    };

    snapshot.weeklyReports = [report, ...snapshot.weeklyReports];
    appendAuditLog(snapshot, this.session, "weekly-report", report.reportId, "generate", "success");
    await this.save(snapshot);
    return report;
  }

  async updateWeeklyReport(reportId: string, input: AnyRecord) {
    return this.mutate("weekly-report", reportId, "update", (snapshot) => {
      const report = requireReportAccess(
        this.session,
        snapshot,
        snapshot.weeklyReports.find((item) => item.reportId === reportId)
      );
      if (this.session.id !== report.createdBy && !canManageDirectorResource(this.session)) {
        throw new ApiRouteError("forbidden_scope", "Current account cannot update this weekly report.");
      }
      snapshot.weeklyReports = snapshot.weeklyReports.map((item) =>
        item.reportId === reportId
          ? {
              ...item,
              title: readString(input.title, item.title),
              updatedAt: nowIso(),
            }
          : item
      );
      return snapshot.weeklyReports.find((item) => item.reportId === reportId);
    });
  }

  async getScopedWeeklyReport(reportId: string) {
    const snapshot = await this.load();
    return requireReportAccess(
      this.session,
      snapshot,
      snapshot.weeklyReports.find((item) => item.reportId === reportId)
    );
  }

  async setWeeklyReportArchived(reportId: string, action: ArchiveAction) {
    return this.mutate("weekly-report", reportId, action, (snapshot) => {
      const report = requireReportAccess(
        this.session,
        snapshot,
        snapshot.weeklyReports.find((item) => item.reportId === reportId)
      );
      if (this.session.id !== report.createdBy && !canManageDirectorResource(this.session)) {
        throw new ApiRouteError("forbidden_scope", "Current account cannot archive this weekly report.");
      }
      snapshot.weeklyReports = snapshot.weeklyReports.map((item) =>
        item.reportId === reportId
          ? {
              ...item,
              status: action === "archive" ? "archived" : "draft",
              archivedAt: action === "archive" ? nowIso() : undefined,
              archivedBy: action === "archive" ? this.session.id : undefined,
              updatedAt: nowIso(),
            }
          : item
      );
      return snapshot.weeklyReports.find((item) => item.reportId === reportId);
    });
  }

  async shareWeeklyReport(reportId: string, input: AnyRecord = {}) {
    return this.mutate("weekly-report", reportId, "share", (snapshot) => {
      const report = requireReportAccess(
        this.session,
        snapshot,
        snapshot.weeklyReports.find((item) => item.reportId === reportId)
      );
      const share = {
        shareId: readString(input.shareId, createApiId("share")),
        sharedBy: this.session.id,
        sharedAt: nowIso(),
        summary: readString(input.summary) || reportShareSummary(report),
        localText: reportShareText(report),
      };
      snapshot.weeklyReports = snapshot.weeklyReports.map((item) =>
        item.reportId === reportId
          ? {
              ...item,
              status: item.status === "archived" ? "archived" : "shared",
              share,
              updatedAt: nowIso(),
            }
          : item
      );
      return snapshot.weeklyReports.find((item) => item.reportId === reportId);
    });
  }

  async exportWeeklyReportData(reportId: string, format: WeeklyReportExportFormat = "json") {
    const report = await this.getScopedWeeklyReport(reportId);
    const content = renderWeeklyReportExport(report, format);
    const extension = format === "json" ? "json" : format === "markdown" ? "md" : format === "share-text" ? "txt" : "html";
    return {
      reportId,
      format,
      exportedAt: nowIso(),
      content,
      mimeType:
        format === "json"
          ? "application/json"
          : format === "markdown" || format === "share-text"
            ? "text/plain"
            : "text/html",
      filename: `${report.reportId}.${extension}`,
    };
  }

  private resolveAttachmentScope(snapshot: ApiExtendedSnapshot, input: { childId?: string; relatedType?: AttachmentRelatedType; relatedId?: string }) {
    if (input.childId) {
      requireChildAccess(this.session, snapshot, input.childId);
      return input.childId;
    }
    if (input.relatedType === "message" && input.relatedId) {
      const message = snapshot.messages.find((item) => item.messageId === input.relatedId);
      if (!message) throw new ApiRouteError("not_found", "未找到消息。");
      requireChildAccess(this.session, snapshot, message.childId);
      return message.childId;
    }
    if (input.relatedType === "feedback" && input.relatedId) {
      const feedback = snapshot.feedback.find((item) => feedbackIdOf(item as SnapshotFeedback) === input.relatedId) as SnapshotFeedback | undefined;
      requireFeedbackViewAccess(this.session, snapshot, feedback);
      return feedback?.childId;
    }
    if (input.relatedType === "health-material" && input.relatedId) {
      const material = snapshot.healthMaterials.find((item) => item.materialId === input.relatedId);
      if (!material) throw new ApiRouteError("not_found", "未找到健康材料。");
      requireChildAccess(this.session, snapshot, material.childId);
      return material.childId;
    }
    if (input.relatedType === "consultation" && input.relatedId) {
      const consultation = snapshot.consultations.find((item) => item.consultationId === input.relatedId);
      if (!consultation) throw new ApiRouteError("not_found", "未找到会诊。");
      requireChildAccess(this.session, snapshot, consultation.childId);
      return consultation.childId;
    }
    if (input.relatedType === "weekly-report" && input.relatedId) {
      const report = snapshot.weeklyReports.find((item) => item.reportId === input.relatedId);
      if (!report) throw new ApiRouteError("not_found", "未找到周报。");
      requireReportAccess(this.session, snapshot, report);
      return report.scopeType === "child" ? report.scopeId : undefined;
    }
    if (input.relatedType === "storybook" && input.relatedId) {
      const storybook = snapshot.storybooks.find((item) => item.storybookId === input.relatedId);
      if (!storybook) throw new ApiRouteError("not_found", "Storybook was not found.");
      requireChildAccess(this.session, snapshot, storybook.childId);
      return storybook.childId;
    }
    requireDirector(this.session);
    return undefined;
  }

  async createAttachment(input: AnyRecord) {
    return this.mutate("attachment", "new", "create_metadata", (snapshot) => {
      const relatedType = readAttachmentRelatedType(input.relatedType);
      const relatedId = readString(input.relatedId) || undefined;
      const childId = this.resolveAttachmentScope(snapshot, {
        childId: readString(input.childId) || undefined,
        relatedType,
        relatedId,
      });
      const fileName = readString(input.fileName, "attachment");
      const mimeType = readString(input.mimeType, "application/octet-stream");
      const byteSize = typeof input.byteSize === "number" ? input.byteSize : undefined;
      if (typeof byteSize === "number" && (byteSize < 0 || byteSize > ATTACHMENT_MAX_BYTES)) {
        throw new ApiRouteError("invalid_request", "Attachment must be 5MB or smaller.");
      }
      if (relatedType && relatedId) {
        const existingRelatedCount = snapshot.attachments.filter(
          (item) =>
            item.institutionId === this.session.institutionId &&
            item.relatedType === relatedType &&
            item.relatedId === relatedId
        ).length;
        if (existingRelatedCount >= ATTACHMENT_MAX_PER_RELATED_ENTITY) {
          throw new ApiRouteError("invalid_request", "Each message, feedback, or media item supports at most 3 attachments.");
        }
      }
      const attachment: ApiAttachment = {
        attachmentId: createApiId("attch"),
        institutionId: this.session.institutionId,
        childId,
        relatedType: relatedType || undefined,
        relatedId,
        kind: readAttachmentKind(input.kind, mimeType, fileName),
        fileName,
        mimeType,
        byteSize,
        storageMode: "metadata_only",
        uploadStatus: "metadata_saved",
        localPreviewUrl: readString(input.localPreviewUrl) || undefined,
        durationMs: typeof input.durationMs === "number" ? input.durationMs : undefined,
        createdBy: this.session.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      snapshot.attachments = [attachment, ...snapshot.attachments];
      return this.decorateAttachment(attachment);
    });
  }

  async listAttachments(options: { childId?: string; relatedType?: AttachmentRelatedType; relatedId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    if (options.relatedType || options.relatedId) this.resolveAttachmentScope(snapshot, options);
    const attachments = snapshot.attachments.filter((attachment) => {
      if (attachment.institutionId !== this.session.institutionId) return false;
      if (options.childId && attachment.childId !== options.childId) return false;
      if (options.relatedType && attachment.relatedType !== options.relatedType) return false;
      if (options.relatedId && attachment.relatedId !== options.relatedId) return false;
      if (attachment.childId) return canAccessChild(this.session, findChild(snapshot, attachment.childId));
      return this.session.role === "机构管理员";
    });
    return attachments.map((attachment) => this.decorateAttachment(attachment));
  }

  async getAttachment(attachmentId: string) {
    const snapshot = await this.load();
    const attachment = snapshot.attachments.find((item) => item.attachmentId === attachmentId);
    if (!attachment) throw new ApiRouteError("not_found", "未找到附件。");
    if (attachment.childId) requireChildAccess(this.session, snapshot, attachment.childId);
    else requireDirector(this.session);
    return this.decorateAttachment(attachment);
  }

  private buildAssignment(snapshot: ApiExtendedSnapshot, task: SnapshotTask): ApiAssignment {
    const child = findChild(snapshot, task.childId);
    const taskRecord = task as SnapshotTask & {
      assignedTeacherId?: string;
      assignedTeacherName?: string;
      feedbackId?: string;
      riskItemId?: string;
      createdBy?: string;
    };
    const teacherId = readString(taskRecord.assignedTeacherId);
    const teacher =
      snapshot.teachers.find((item) => item.teacherId === teacherId || item.userId === teacherId) ??
      snapshot.teachers.find((item) => item.className && child?.className && item.className === child.className);
    const reminder =
      task.legacyRefs?.reminderIds?.length
        ? snapshot.reminders.find((item) => task.legacyRefs?.reminderIds?.includes(item.reminderId))
        : snapshot.reminders.find((item) => item.taskId === task.taskId || item.sourceId === assignmentIdOfTask(task));

    return {
      assignmentId: assignmentIdOfTask(task),
      taskId: task.taskId,
      institutionId: this.session.institutionId,
      childId: task.childId,
      childName: child?.name ?? "未知儿童",
      teacherId: teacher?.teacherId ?? teacher?.userId ?? teacherId,
      teacherName: teacher?.name ?? readString(taskRecord.assignedTeacherName, "未知老师"),
      title: task.title,
      description: task.description,
      status: readAssignmentStatus(task.status),
      dueAt: task.dueAt,
      reminderId: reminder?.reminderId,
      feedbackId: readString(taskRecord.feedbackId) || undefined,
      consultationId: task.legacyRefs?.consultationId,
      riskItemId: readString(taskRecord.riskItemId) || undefined,
      createdBy: readString(taskRecord.createdBy, this.session.id),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };
  }

  async listAssignments(options: { childId?: string; teacherId?: string; status?: ApiAssignmentStatus } = {}) {
    const snapshot = await this.load();
    if (this.session.role === "家长") {
      throw new ApiRouteError("forbidden_scope", "家长无权访问园长派单。");
    }
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    if (options.teacherId) {
      requireTeacherAccess(
        this.session,
        snapshot.teachers.find((item) => item.teacherId === options.teacherId || item.userId === options.teacherId)
      );
    }

    return snapshot.tasks
      .filter(isAdminDispatchTask)
      .filter((task) => canAccessChild(this.session, findChild(snapshot, task.childId)))
      .map((task) => this.buildAssignment(snapshot, task))
      .filter((assignment) => !options.childId || assignment.childId === options.childId)
      .filter((assignment) => !options.teacherId || assignment.teacherId === options.teacherId)
      .filter((assignment) => {
        if (this.session.role !== "教师") return true;
        return assignment.teacherId === this.session.id;
      })
      .filter((assignment) => !options.status || assignment.status === options.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createAssignment(input: AnyRecord) {
    requireDirector(this.session);
    const childId = readString(input.childId);
    const teacherId = readString(input.teacherId);
    const description = readString(input.description, readString(input.task));
    if (!childId) throw new ApiRouteError("invalid_request", "派单必须提供 childId。");
    if (!teacherId) throw new ApiRouteError("invalid_request", "派单必须提供 teacherId。");
    if (!description) throw new ApiRouteError("invalid_request", "派单内容不能为空。");

    return this.mutate("assignment", "new", "create", (snapshot) => {
      const child = requireChildAccess(this.session, snapshot, childId);
      const teacher = requireTeacherAccess(
        this.session,
        snapshot.teachers.find((item) => item.teacherId === teacherId || item.userId === teacherId)
      );
      const now = nowIso();
      const assignmentId = createApiId("assign");
      const taskId = createApiId("task");
      const reminderId = createApiId("reminder");
      const dueAt = readString(input.dueAt, now);
      const title = readString(input.title, `${child.name}跟进任务`);
      const task = {
        taskId,
        taskType: "follow_up",
        childId,
        sourceType: "admin_dispatch",
        sourceId: assignmentId,
        ownerRole: "teacher",
        title,
        description,
        dueWindow: { kind: "deadline", label: "园长派单" },
        dueAt,
        status: "pending",
        evidenceSubmissionMode: "dispatch_status_update",
        createdAt: now,
        updatedAt: now,
        createdBy: this.session.id,
        assignedTeacherId: teacher.teacherId,
        assignedTeacherName: teacher.name,
        feedbackId: readString(input.feedbackId) || undefined,
        riskItemId: readString(input.riskItemId) || undefined,
        legacyRefs: {
          adminDispatchEventId: assignmentId,
          reminderIds: [reminderId],
          consultationId: readString(input.consultationId) || undefined,
        },
      } as SnapshotTask;
      const reminder = {
        reminderId,
        reminderType: "review-48h",
        targetRole: "teacher",
        targetId: teacher.userId ?? teacher.teacherId,
        childId,
        title,
        description,
        scheduledAt: dueAt,
        status: "pending",
        sourceId: assignmentId,
        taskId,
        sourceType: "admin_dispatch",
        relatedTaskIds: [taskId],
      } as SnapshotReminder;
      snapshot.tasks = [task, ...snapshot.tasks.filter((item) => item.taskId !== taskId)];
      snapshot.reminders = [reminder, ...snapshot.reminders.filter((item) => item.reminderId !== reminderId)];
      return this.buildAssignment(snapshot, task);
    });
  }

  async updateAssignmentStatus(assignmentId: string, input: AnyRecord) {
    const nextStatus = readAssignmentStatus(input.status, "in_progress");
    return this.mutate("assignment", assignmentId, "update_status", (snapshot) => {
      const task = snapshot.tasks.find(
        (item) => isAdminDispatchTask(item) && (assignmentIdOfTask(item) === assignmentId || item.taskId === assignmentId)
      );
      if (!task) throw new ApiRouteError("not_found", "未找到派单。");
      const assignment = this.buildAssignment(snapshot, task);
      if (this.session.role === "家长") {
        throw new ApiRouteError("forbidden_scope", "家长无权更新园长派单。");
      }
      if (this.session.role === "教师" && assignment.teacherId !== this.session.id) {
        throw new ApiRouteError("forbidden_scope", "当前教师无权更新该派单。");
      }
      if (this.session.role !== "教师") {
        requireDirector(this.session);
      }
      const now = nowIso();
      snapshot.tasks = snapshot.tasks.map((item) =>
        item.taskId === task.taskId
          ? ({
              ...item,
              status: nextStatus,
              statusChangedAt: now,
              completedAt: nextStatus === "completed" ? now : item.completedAt,
              completionSummary: readString(input.completionSummary, item.completionSummary),
              updatedAt: now,
            } as SnapshotTask)
          : item
      );
      snapshot.reminders = snapshot.reminders.map((item) =>
        item.taskId === task.taskId || item.sourceId === assignment.assignmentId
          ? ({ ...item, status: assignmentReminderStatus(nextStatus), updatedAt: now } as SnapshotReminder)
          : item
      );
      const updatedTask = snapshot.tasks.find((item) => item.taskId === task.taskId);
      if (!updatedTask) throw new ApiRouteError("not_found", "未找到更新后的派单。");
      return this.buildAssignment(snapshot, updatedTask);
    });
  }

  async listReminders(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.reminders.filter((reminder) => {
      const childId = reminder.childId ?? reminder.targetId;
      return (!options.childId || childId === options.childId) && canAccessChild(this.session, findChild(snapshot, childId));
    });
  }

  async createReminder(input: AnyRecord) {
    const childId = readString(input.childId, readString(input.targetId));
    if (!childId) throw new ApiRouteError("invalid_request", "提醒必须提供 childId。");
    return this.mutate("reminder", "new", "create", (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const reminder = {
        reminderId: createApiId("reminder"),
        reminderType: readString(input.reminderType, "family-task"),
        targetRole: readString(input.targetRole, "parent"),
        targetId: childId,
        childId,
        title: readString(input.title, "提醒"),
        description: readString(input.description),
        scheduledAt: readString(input.scheduledAt, nowIso()),
        status: "pending",
        sourceId: readString(input.sourceId) || undefined,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } as SnapshotReminder;
      snapshot.reminders = [reminder, ...snapshot.reminders];
      return reminder;
    });
  }

  async updateReminder(reminderId: string, input: AnyRecord) {
    return this.mutate("reminder", reminderId, "update", (snapshot) => {
      const reminder = snapshot.reminders.find((item) => item.reminderId === reminderId);
      if (!reminder) throw new ApiRouteError("not_found", "未找到提醒。");
      const childId = reminder.childId ?? reminder.targetId;
      requireChildAccess(this.session, snapshot, childId);
      snapshot.reminders = snapshot.reminders.map((item) =>
        item.reminderId === reminderId
          ? ({ ...item, status: readString(input.status, item.status), readAt: nowIso(), updatedAt: nowIso() } as SnapshotReminder)
          : item
      );
      return snapshot.reminders.find((item) => item.reminderId === reminderId);
    });
  }
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readReportScopeType(value: unknown, fallback: ReportScopeType): ReportScopeType {
  return value === "institution" || value === "class" || value === "child" ? value : fallback;
}

function dateDaysBefore(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return nowIso().slice(0, 10);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function readReportSummary(report: ApiWeeklyReport) {
  const summary = isRecordLike(report.payload.summary) ? report.payload.summary : {};
  return {
    recordCount: readNumber(summary.recordCount, 0),
    childCount: readNumber(summary.childCount, 0),
    healthAbnormalCount: readNumber(summary.healthAbnormalCount, 0),
    highRiskConsultationCount: readNumber(summary.highRiskConsultationCount, 0),
    unresolvedFeedbackCount: readNumber(summary.unresolvedFeedbackCount, 0),
  };
}

function reportShareSummary(report: ApiWeeklyReport) {
  const summary = readReportSummary(report);
  return `${report.title}: ${report.periodStart} to ${report.periodEnd}, ${summary.recordCount} records, ${summary.healthAbnormalCount} health abnormal records, ${summary.highRiskConsultationCount} high-risk consultations.`;
}

function reportShareText(report: ApiWeeklyReport) {
  const summary = readReportSummary(report);
  return [
    report.title,
    `Period: ${report.periodStart} to ${report.periodEnd}`,
    `Scope: ${report.scopeType}/${report.scopeId}`,
    `Children: ${summary.childCount}`,
    `Records: ${summary.recordCount}`,
    `Health abnormal: ${summary.healthAbnormalCount}`,
    `High-risk consultations: ${summary.highRiskConsultationCount}`,
    `Unresolved feedback: ${summary.unresolvedFeedbackCount}`,
    `Report ID: ${report.reportId}`,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderWeeklyReportExport(report: ApiWeeklyReport, format: WeeklyReportExportFormat) {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "share-text") return report.share?.localText ?? reportShareText(report);

  const shareText = reportShareText(report);
  if (format === "markdown") {
    return [
      `# ${report.title}`,
      "",
      `- Period: ${report.periodStart} to ${report.periodEnd}`,
      `- Scope: ${report.scopeType}/${report.scopeId}`,
      `- Status: ${report.status}`,
      "",
      "## Summary",
      "",
      shareText
        .split("\n")
        .slice(3)
        .map((line) => `- ${line}`)
        .join("\n"),
      "",
      "## Payload",
      "",
      "```json",
      JSON.stringify(report.payload, null, 2),
      "```",
    ].join("\n");
  }

  const script = format === "print-html" ? "<script>window.addEventListener('load',()=>window.print())</script>" : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #172026; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    pre { white-space: pre-wrap; background: #f6f8fa; padding: 16px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.title)}</h1>
  <p>${escapeHtml(report.periodStart)} to ${escapeHtml(report.periodEnd)} · ${escapeHtml(report.scopeType)}/${escapeHtml(report.scopeId)}</p>
  <pre>${escapeHtml(shareText)}</pre>
  <h2>Payload</h2>
  <pre>${escapeHtml(JSON.stringify(report.payload, null, 2))}</pre>
  ${script}
</body>
</html>`;
}

function storybookResponseOf(storybook: SnapshotStorybook) {
  const page = storybook.pages.find((item) => isRecordLike(item.response));
  return page && isRecordLike(page.response) ? page.response : null;
}

function storybookScenes(storybook: SnapshotStorybook) {
  const response = storybookResponseOf(storybook);
  return readArray<Record<string, unknown>>(response?.scenes).filter(isRecordLike);
}

function storybookTitle(storybook: SnapshotStorybook) {
  const response = storybookResponseOf(storybook);
  return readString(response?.title) || readString(storybook.pages[0]?.title) || `成长绘本 ${storybook.storybookId}`;
}

function storybookSummary(storybook: SnapshotStorybook) {
  const response = storybookResponseOf(storybook);
  return readString(response?.summary) || readString(storybook.pages[0]?.summary) || "本地成长绘本摘要。";
}

function storybookShareSummary(storybook: SnapshotStorybook) {
  const scenes = storybookScenes(storybook);
  return `${storybookTitle(storybook)}：共 ${scenes.length || storybook.pages.length} 页，生成于 ${storybook.generatedAt}。${storybookSummary(storybook)}`;
}

function storybookShareText(storybook: SnapshotStorybook) {
  const scenes = storybookScenes(storybook);
  const sceneLines = scenes.slice(0, 6).map((scene, index) => {
    const title = readString(scene.sceneTitle) || readString(scene.title) || `第 ${index + 1} 页`;
    const text = readString(scene.sceneText) || readString(scene.text);
    return text ? `${index + 1}. ${title}: ${text}` : `${index + 1}. ${title}`;
  });
  return [
    storybookTitle(storybook),
    storybookSummary(storybook),
    "",
    ...sceneLines,
    "",
    "分享说明：当前未接入外部分享服务，本内容为本地生成的可复制分享文案。",
    `Storybook ID: ${storybook.storybookId}`,
  ].join("\n");
}

function renderStorybookExport(storybook: SnapshotStorybook, format: StorybookExportFormat) {
  if (format === "json") return JSON.stringify(storybook, null, 2);
  if (format === "share-text") return storybook.share?.localText ?? storybookShareText(storybook);

  const scenes = storybookScenes(storybook);
  const title = storybookTitle(storybook);
  const summary = storybookSummary(storybook);
  if (format === "markdown") {
    return [
      `# ${title}`,
      "",
      summary,
      "",
      ...scenes.flatMap((scene, index) => [
        `## ${readString(scene.sceneTitle) || readString(scene.title) || `第 ${index + 1} 页`}`,
        "",
        readString(scene.sceneText) || readString(scene.text) || "",
        "",
      ]),
      "## 分享说明",
      "",
      "当前未接入外部分享服务，本导出文件由本地 E01 storybook 服务生成。",
    ].join("\n");
  }

  const sceneHtml = scenes
    .map((scene, index) => {
      const sceneTitle = readString(scene.sceneTitle) || readString(scene.title) || `第 ${index + 1} 页`;
      const sceneText = readString(scene.sceneText) || readString(scene.text);
      const imageUrl = readString(scene.imageUrl);
      return `<section><h2>${escapeHtml(sceneTitle)}</h2>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" />` : ""}<p>${escapeHtml(sceneText)}</p></section>`;
    })
    .join("\n");
  const script = format === "print-html" ? "<script>window.addEventListener('load',()=>window.print())</script>" : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #172026; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    section { break-inside: avoid; margin: 24px 0; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    img { max-width: 100%; border-radius: 8px; margin: 12px 0; }
    p { line-height: 1.75; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(summary)}</p>
  ${sceneHtml || `<p>${escapeHtml(storybookShareText(storybook))}</p>`}
  <p>当前未接入外部分享服务，本导出文件由本地 E01 storybook 服务生成。</p>
  ${script}
</body>
</html>`;
}
