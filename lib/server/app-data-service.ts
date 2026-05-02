import type { SessionUser } from "@/lib/auth/accounts";
import type {
  ApiAttachment,
  ApiExtendedSnapshot,
  ApiTeacher,
  ApiWeeklyReport,
  ArchiveAction,
  AttachmentRelatedType,
  RecordType,
  ReportScopeType,
} from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { AppDataRepository } from "@/lib/server/app-data-repository";
import { appendAuditLog, createApiId } from "@/lib/server/app-data-model";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  canAccessChild,
  canViewFeedback,
  findChild,
  requireChildAccess,
  requireClassAccess,
  requireConversationReplyAccess,
  requireDirector,
  requireFeedbackViewAccess,
  requireRecordModifyAccess,
  requireTeacherAccess,
} from "@/lib/server/scope";

type Archivable<T> = T & { archivedAt?: string; updatedAt?: string };
type AnyRecord = Record<string, unknown>;
type SnapshotMessage = AppStateSnapshot["messages"][number];
type SnapshotConversation = AppStateSnapshot["conversations"][number];
type SnapshotFeedback = AppStateSnapshot["feedback"][number] & { id?: string; feedbackId?: string; status?: string };
type SnapshotReminder = AppStateSnapshot["reminders"][number];
type HealthMaterialParseStatus = AppStateSnapshot["healthMaterials"][number]["parseStatus"];

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

function requireStaff(session: SessionUser) {
  if (session.role !== "教师" && session.role !== "机构管理员") {
    throw new ApiRouteError("forbidden_scope", "当前操作仅教师或机构管理员可执行。");
  }
}

function feedbackIdOf(feedback: SnapshotFeedback) {
  return feedback.feedbackId ?? feedback.id ?? "";
}

function isNotArchived<T extends { archivedAt?: string }>(item: T) {
  return !item.archivedAt;
}

function withArchive<T extends object>(item: T, action: ArchiveAction): T {
  if (action === "restore") {
    const restored = { ...item } as T & { archivedAt?: string; updatedAt?: string };
    delete restored.archivedAt;
    restored.updatedAt = nowIso();
    return restored;
  }
  return { ...item, archivedAt: nowIso(), updatedAt: nowIso() };
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
        gender: input.gender === "男" ? "男" : "女",
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
      const { found, next } = updateById(snapshot.children, childId, (child) => child.id, (child) => ({
        ...child,
        ...input,
        id: child.id,
        institutionId: child.institutionId,
        updatedAt: nowIso(),
      } as AppStateSnapshot["children"][number]));
      if (!found) throw new ApiRouteError("not_found", "未找到儿童档案。");
      snapshot.children = next;
      return next.find((child) => child.id === childId);
    });
  }

  async archiveChild(childId: string, action: ArchiveAction) {
    requireDirector(this.session);
    return this.mutate("child", childId, action, (snapshot) => {
      requireChildAccess(this.session, snapshot, childId);
      const { found, next } = updateById(snapshot.children, childId, (child) => child.id, (child) =>
        withArchive(child, action)
      );
      if (!found) throw new ApiRouteError("not_found", "未找到儿童档案。");
      snapshot.children = next;
      return next.find((child) => child.id === childId);
    });
  }

  async listTeachers(options: { includeArchived?: boolean } = {}) {
    const snapshot = await this.load();
    return snapshot.teachers
      .filter((teacher) => teacher.institutionId === this.session.institutionId)
      .filter((teacher) => this.session.role === "机构管理员" || teacher.userId === this.session.id || teacher.teacherId === this.session.id)
      .filter((teacher) => options.includeArchived || !teacher.archivedAt);
  }

  async getTeacher(teacherId: string) {
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

  async archiveTeacher(teacherId: string, action: ArchiveAction) {
    requireDirector(this.session);
    return this.mutate("teacher", teacherId, action, (snapshot) => {
      requireTeacherAccess(this.session, snapshot.teachers.find((teacher) => teacher.teacherId === teacherId || teacher.userId === teacherId));
      snapshot.teachers = snapshot.teachers.map((teacher) =>
        teacher.teacherId === teacherId || teacher.userId === teacherId ? withArchive(teacher, action) : teacher
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

  async listFeedback(options: { childId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    return snapshot.feedback
      .filter((feedback) => (!options.childId || feedback.childId === options.childId))
      .filter((feedback) => canViewFeedback(this.session, snapshot, feedback));
  }

  async getFeedback(feedbackId: string) {
    const snapshot = await this.load();
    const feedback = snapshot.feedback.find((item) => feedbackIdOf(item as SnapshotFeedback) === feedbackId) as SnapshotFeedback | undefined;
    requireFeedbackViewAccess(this.session, snapshot, feedback);
    return feedback;
  }

  async updateFeedbackStatus(feedbackId: string, input: AnyRecord) {
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
        return { ...record, ...safeInput, id: record.id, childId: record.childId, updatedAt: nowIso() };
      });
      this.setRecords(snapshot, type, next as Array<Archivable<object>>);
      return next.find((record) => record.id === recordId);
    });
  }

  async archiveRecord(type: RecordType, recordId: string, action: ArchiveAction) {
    requireStaff(this.session);
    return this.mutate("record", recordId, `${action}_${type}`, (snapshot) => {
      const records = this.getRecords(snapshot, type);
      const existing = records.find((record) => record.id === recordId);
      requireRecordModifyAccess(this.session, snapshot, existing);
      const next = records.map((record) => (record.id === recordId ? withArchive(record, action) : record));
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
    const children = snapshot.children.filter((child) => child.institutionId === this.session.institutionId);
    return {
      childCount: children.filter((child) => isNotArchived(child as Archivable<typeof child>)).length,
      teacherCount: snapshot.teachers.filter((teacher) => teacher.institutionId === this.session.institutionId && !teacher.archivedAt).length,
      messageCount: snapshot.messages.filter((message) => canAccessChild(this.session, findChild(snapshot, message.childId))).length,
      feedbackCount: snapshot.feedback.filter((feedback) => canViewFeedback(this.session, snapshot, feedback)).length,
      consultationCount: snapshot.consultations.filter((item) => canAccessChild(this.session, findChild(snapshot, item.childId))).length,
      attachmentCount: snapshot.attachments.filter((item) => item.institutionId === this.session.institutionId).length,
      updatedAt: snapshot.updatedAt,
    };
  }

  async getTrends(childId: string) {
    const snapshot = await this.load();
    requireChildAccess(this.session, snapshot, childId);
    return {
      childId,
      healthCount: snapshot.health.filter((item) => item.childId === childId && isNotArchived(item as Archivable<typeof item>)).length,
      mealCount: snapshot.meals.filter((item) => item.childId === childId && isNotArchived(item as Archivable<typeof item>)).length,
      growthCount: snapshot.growth.filter((item) => item.childId === childId && isNotArchived(item as Archivable<typeof item>)).length,
      consultationCount: snapshot.consultations.filter((item) => item.childId === childId).length,
      generatedAt: nowIso(),
    };
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
      .filter((report) => this.canAccessReport(snapshot, report))
      .filter((report) => options.includeArchived || report.status !== "archived");
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
      if (!this.canAccessReport(snapshot, report)) throw new ApiRouteError("forbidden_scope", "当前账号无权访问该周报。");
      return report.scopeType === "child" ? report.scopeId : undefined;
    }
    requireDirector(this.session);
    return undefined;
  }

  async createAttachment(input: AnyRecord) {
    return this.mutate("attachment", "new", "create_metadata", (snapshot) => {
      const relatedType = readString(input.relatedType) as AttachmentRelatedType;
      const relatedId = readString(input.relatedId) || undefined;
      const childId = this.resolveAttachmentScope(snapshot, {
        childId: readString(input.childId) || undefined,
        relatedType,
        relatedId,
      });
      const attachment: ApiAttachment = {
        attachmentId: createApiId("attch"),
        institutionId: this.session.institutionId,
        childId,
        relatedType: relatedType || undefined,
        relatedId,
        fileName: readString(input.fileName, "attachment"),
        mimeType: readString(input.mimeType, "application/octet-stream"),
        byteSize: typeof input.byteSize === "number" ? input.byteSize : undefined,
        storageMode: "metadata_only",
        uploadStatus: "metadata_saved",
        createdBy: this.session.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      snapshot.attachments = [attachment, ...snapshot.attachments];
      return attachment;
    });
  }

  async listAttachments(options: { childId?: string; relatedType?: AttachmentRelatedType; relatedId?: string } = {}) {
    const snapshot = await this.load();
    if (options.childId) requireChildAccess(this.session, snapshot, options.childId);
    if (options.relatedType || options.relatedId) this.resolveAttachmentScope(snapshot, options);
    return snapshot.attachments.filter((attachment) => {
      if (attachment.institutionId !== this.session.institutionId) return false;
      if (options.childId && attachment.childId !== options.childId) return false;
      if (options.relatedType && attachment.relatedType !== options.relatedType) return false;
      if (options.relatedId && attachment.relatedId !== options.relatedId) return false;
      if (attachment.childId) return canAccessChild(this.session, findChild(snapshot, attachment.childId));
      return this.session.role === "机构管理员";
    });
  }

  async getAttachment(attachmentId: string) {
    const snapshot = await this.load();
    const attachment = snapshot.attachments.find((item) => item.attachmentId === attachmentId);
    if (!attachment) throw new ApiRouteError("not_found", "未找到附件。");
    if (attachment.childId) requireChildAccess(this.session, snapshot, attachment.childId);
    else requireDirector(this.session);
    return attachment;
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
