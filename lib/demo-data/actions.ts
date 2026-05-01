import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import { createDemoId } from "./ids";
import { mutateAppSnapshot } from "./store";
import { getCurrentDemoContext, readContextSnapshot } from "./persistence";
import type {
  DailyRecordInput,
  HealthMaterialInput,
  MarkMessageReadInput,
  MarkReminderReadInput,
  MessageInput,
  ParseHealthMaterialInput,
  ReplyMessageInput,
  ConsultationInput,
  ConsultationNoteInput,
  ConsultationStatusInput,
  ConsultationWorkflowStatus,
  SaveConsultationResultInput,
  UpdateDailyRecordInput,
  UpdateHealthMaterialStatusInput,
  MutationResult,
} from "./types";

function getChild(snapshot: AppStateSnapshot, childId: string) {
  return snapshot.children.find((child) => child.id === childId);
}

function roleToMessageRole(role: string): "parent" | "teacher" | "director" {
  if (role === "教师") return "teacher";
  if (role === "机构管理员") return "director";
  return "parent";
}

function upsertByKey<T>(items: T[], nextItem: T, key: (item: T) => string) {
  const nextKey = key(nextItem);
  const existingIndex = items.findIndex((item) => key(item) === nextKey);
  if (existingIndex === -1) return [nextItem, ...items];
  const next = [...items];
  next[existingIndex] = nextItem;
  return next;
}

function failedMutation(
  context: { now: () => string },
  snapshot: AppStateSnapshot,
  error: string,
  message: string
): MutationResult<never> {
  return {
    status: "failed" as const,
    snapshot,
    persistedAt: context.now(),
    message,
    error,
  };
}

function findHealthMaterialChildId(snapshot: AppStateSnapshot, materialId: string) {
  return snapshot.healthMaterials.find((material) => material.materialId === materialId)?.childId;
}

function findConsultationChildId(snapshot: AppStateSnapshot, consultationId: string) {
  return snapshot.consultations.find((consultation) => consultation.consultationId === consultationId)?.childId;
}

function mapWorkflowStatus(status: ConsultationWorkflowStatus): "pending" | "in_progress" | "completed" {
  if (status === "resolved") return "completed";
  if (status === "in-progress") return "in_progress";
  return "pending";
}

function normalizeConsultationForWorkflow(
  consultation: AppStateSnapshot["consultations"][number],
  workflowStatus: ConsultationWorkflowStatus,
  updatedAt: string
) {
  return {
    ...consultation,
    workflowStatus,
    status: workflowStatus === "resolved" ? "resolved" : "active",
    directorDecisionCard: {
      ...consultation.directorDecisionCard,
      status: mapWorkflowStatus(workflowStatus),
    },
    updatedAt,
  } as AppStateSnapshot["consultations"][number];
}

export function sendMessage(input: MessageInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => {
      const now = input.context.now();
      const child = getChild(snapshot, input.childId);
      const conversationId = input.conversationId ?? `conv-${input.childId}-home-school`;
      const senderRole = roleToMessageRole(input.context.user.role);
      const message = {
        messageId: createDemoId("msg"),
        conversationId,
        childId: input.childId,
        classId: input.classId ?? child?.className ?? "",
        senderRole,
        senderId: input.context.user.id,
        senderName: input.context.user.name,
        receiverRole: input.receiverRole ?? (senderRole === "parent" ? "teacher" : "parent"),
        targetRole: input.targetRole ?? (senderRole === "parent" ? "teacher" : "parent"),
        content: input.content,
        createdAt: now,
        readBy: [input.context.user.id],
        status: "sent",
      } satisfies AppStateSnapshot["messages"][number];

      const conversation = {
        conversationId,
        childId: input.childId,
        classId: child?.className ?? "",
        participantIds: Array.from(
          new Set([
            input.context.user.id,
            ...(snapshot.conversations.find((item) => item.conversationId === conversationId)?.participantIds ?? []),
          ])
        ),
        participantRoles: Array.from(
          new Set([
            senderRole,
            ...(snapshot.conversations.find((item) => item.conversationId === conversationId)?.participantRoles ?? []),
          ])
        ),
        status: "open",
        createdAt:
          snapshot.conversations.find((item) => item.conversationId === conversationId)?.createdAt ?? now,
        updatedAt: now,
      } satisfies AppStateSnapshot["conversations"][number];

      return {
        ...snapshot,
        messages: [...snapshot.messages, message],
        conversations: upsertByKey(snapshot.conversations, conversation, (item) => item.conversationId),
        updatedAt: now,
      };
    },
    {
      requiredChildId: input.childId,
      operation: "message.write",
      data: (snapshot) => snapshot.messages[snapshot.messages.length - 1],
    }
  );
}

export function replyMessage(input: ReplyMessageInput) {
  const baseSnapshot = readContextSnapshot(input.context);
  const baseMessage = input.messageId
    ? baseSnapshot.messages.find((message) => message.messageId === input.messageId)
    : undefined;
  const baseConversation = baseSnapshot.conversations.find(
    (item) => item.conversationId === (input.conversationId ?? baseMessage?.conversationId)
  );
  const requiredChildId = baseMessage?.childId ?? baseConversation?.childId;
  if (!requiredChildId) {
    return {
      status: "failed" as const,
      snapshot: baseSnapshot,
      persistedAt: input.context.now(),
      message: "Reply rejected because no conversation child scope was found.",
      error: "missing_child_id",
    };
  }

  return mutateAppSnapshot(
    input.context,
    (currentSnapshot) => {
      const targetMessage = input.messageId
        ? currentSnapshot.messages.find((message) => message.messageId === input.messageId)
        : undefined;
      const conversationId = input.conversationId ?? targetMessage?.conversationId;
      const conversation = currentSnapshot.conversations.find((item) => item.conversationId === conversationId);
      const childId = targetMessage?.childId ?? conversation?.childId ?? "";
      const child = getChild(currentSnapshot, childId);
      const now = input.context.now();
      const senderRole = roleToMessageRole(input.context.user.role);
      const message = {
        messageId: createDemoId("msg"),
        conversationId: conversationId ?? `conv-${childId}-home-school`,
        childId,
        classId: child?.className ?? conversation?.classId ?? "",
        senderRole,
        senderId: input.context.user.id,
        senderName: input.context.user.name,
        receiverRole: targetMessage?.senderRole ?? (senderRole === "parent" ? "teacher" : "parent"),
        targetRole: targetMessage?.senderRole ?? (senderRole === "parent" ? "teacher" : "parent"),
        content: input.content,
        createdAt: now,
        readBy: [input.context.user.id],
        status: "sent",
      } satisfies AppStateSnapshot["messages"][number];

      return {
        ...currentSnapshot,
        messages: [...currentSnapshot.messages, message],
        conversations: currentSnapshot.conversations.map((item) =>
          item.conversationId === message.conversationId ? { ...item, updatedAt: now } : item
        ),
        updatedAt: now,
      };
    },
    {
      requiredChildId,
      operation: "message.write",
      data: (nextSnapshot) => nextSnapshot.messages[nextSnapshot.messages.length - 1],
    }
  );
}

export function markMessageRead(input: MarkMessageReadInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => ({
      ...snapshot,
      messages: snapshot.messages.map((message) =>
        message.messageId === input.messageId
          ? { ...message, readBy: Array.from(new Set([...message.readBy, input.context.user.id])) }
          : message
      ),
      updatedAt: input.context.now(),
    }),
    {
      operation: "message.read",
      data: (snapshot) => snapshot.messages.find((message) => message.messageId === input.messageId),
    }
  );
}

export function createDailyRecord(input: DailyRecordInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => {
      const now = input.context.now();
      const child = getChild(snapshot, input.childId);
      if (input.type === "morning-check") {
        const record = {
          id: createDemoId("hc"),
          childId: input.childId,
          date: String(input.payload.date ?? now.slice(0, 10)),
          temperature: Number(input.payload.temperature ?? 36.6),
          mood: String(input.payload.mood ?? "stable"),
          handMouthEye: input.payload.handMouthEye === "异常" ? "异常" : "正常",
          isAbnormal: Boolean(input.payload.isAbnormal ?? false),
          remark: typeof input.payload.remark === "string" ? input.payload.remark : undefined,
          checkedBy: input.context.user.name,
          checkedByRole: input.context.user.role,
        } satisfies AppStateSnapshot["health"][number];
        return { ...snapshot, health: [record, ...snapshot.health], updatedAt: now };
      }

      if (input.type === "diet") {
        const record = {
          id: createDemoId("meal"),
          childId: input.childId,
          date: String(input.payload.date ?? now.slice(0, 10)),
          meal: (input.payload.meal === "早餐" ||
          input.payload.meal === "晚餐" ||
          input.payload.meal === "加餐"
            ? input.payload.meal
            : "午餐") as AppStateSnapshot["meals"][number]["meal"],
          foods: Array.isArray(input.payload.foods)
            ? (input.payload.foods as AppStateSnapshot["meals"][number]["foods"])
            : [{ id: createDemoId("food"), name: "demo food", category: "其他", amount: "1份" }],
          intakeLevel: "适中",
          preference: "正常",
          waterMl: Number(input.payload.waterMl ?? 180),
          nutritionScore: Number(input.payload.nutritionScore ?? 80),
          recordedBy: input.context.user.name,
          recordedByRole: input.context.user.role,
        } satisfies AppStateSnapshot["meals"][number];
        return { ...snapshot, meals: [record, ...snapshot.meals], updatedAt: now };
      }

      const record = {
        id: createDemoId("growth"),
        childId: input.childId,
        createdAt: String(input.payload.createdAt ?? now),
        recorder: input.context.user.name,
        recorderRole: input.context.user.role,
        category: (typeof input.payload.category === "string" ? input.payload.category : "情绪表现") as AppStateSnapshot["growth"][number]["category"],
        tags: Array.isArray(input.payload.tags) ? (input.payload.tags as string[]) : ["demo"],
        description: String(input.payload.description ?? `${child?.name ?? input.childId} growth record`),
        needsAttention: Boolean(input.payload.needsAttention ?? false),
        followUpAction: typeof input.payload.followUpAction === "string" ? input.payload.followUpAction : undefined,
        reviewStatus: input.payload.reviewStatus === "待复查" ? "待复查" : "已完成",
      } satisfies AppStateSnapshot["growth"][number];
      return { ...snapshot, growth: [record, ...snapshot.growth], updatedAt: now };
    },
    {
      requiredChildId: input.childId,
      operation: "dailyRecord.write",
    }
  );
}

export function updateDailyRecord(input: UpdateDailyRecordInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => {
      const now = input.context.now();
      if (input.type === "morning-check") {
        return {
          ...snapshot,
          health: snapshot.health.map((record) =>
            record.id === input.recordId ? { ...record, ...input.payload } : record
          ),
          updatedAt: now,
        };
      }
      if (input.type === "diet") {
        return {
          ...snapshot,
          meals: snapshot.meals.map((record) =>
            record.id === input.recordId ? { ...record, ...input.payload } : record
          ),
          updatedAt: now,
        };
      }
      return {
        ...snapshot,
        growth: snapshot.growth.map((record) =>
          record.id === input.recordId ? { ...record, ...input.payload } : record
        ),
        updatedAt: now,
      };
    },
    {
      requiredChildId: input.childId,
      operation: "dailyRecord.write",
    }
  );
}

export function createHealthMaterial(input: HealthMaterialInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => {
      const now = input.context.now();
      const material = {
        materialId: createDemoId("hm"),
        childId: input.childId,
        uploadedBy: input.context.user.id,
        filename: input.filename,
        fileType: input.fileType,
        description: input.description,
        parseStatus: input.parseResult ? "completed" : "pending",
        parseResult: input.parseResult,
        createdAt: now,
        updatedAt: now,
      } satisfies AppStateSnapshot["healthMaterials"][number];
      return { ...snapshot, healthMaterials: [material, ...snapshot.healthMaterials], updatedAt: now };
    },
    {
      requiredChildId: input.childId,
      operation: "healthMaterial.write",
      data: (snapshot) => snapshot.healthMaterials[0],
    }
  );
}

export function parseHealthMaterial(input: ParseHealthMaterialInput) {
  return saveHealthParseResult({
    ...input,
    parseResult: input.parseResult ?? {
      summary: "Demo parse result saved by D01.",
      riskItems: [],
      parsedAt: input.context.now(),
    },
  });
}

export function updateHealthMaterialParseStatus(input: UpdateHealthMaterialStatusInput) {
  const baseSnapshot = readContextSnapshot(input.context);
  const requiredChildId = findHealthMaterialChildId(baseSnapshot, input.materialId);
  if (!requiredChildId) {
    return failedMutation(
      input.context,
      baseSnapshot,
      "missing_material_id",
      "Health material status update rejected because no material child scope was found."
    );
  }

  return mutateAppSnapshot(
    input.context,
    (snapshot) => ({
      ...snapshot,
      healthMaterials: snapshot.healthMaterials.map((material) =>
        material.materialId === input.materialId
          ? {
              ...material,
              parseStatus: input.status,
              parseError: input.status === "failed" ? input.error ?? "parse_failed" : undefined,
              updatedAt: input.context.now(),
            }
          : material
      ),
      updatedAt: input.context.now(),
    }),
    {
      requiredChildId,
      operation: "healthMaterial.write",
      data: (snapshot) => snapshot.healthMaterials.find((material) => material.materialId === input.materialId),
    }
  );
}

export function saveHealthParseResult(input: ParseHealthMaterialInput & { parseResult: Record<string, unknown> }) {
  const baseSnapshot = readContextSnapshot(input.context);
  const requiredChildId = findHealthMaterialChildId(baseSnapshot, input.materialId);
  if (!requiredChildId) {
    return failedMutation(
      input.context,
      baseSnapshot,
      "missing_material_id",
      "Health material parse result rejected because no material child scope was found."
    );
  }

  return mutateAppSnapshot(
    input.context,
    (snapshot) => ({
      ...snapshot,
      healthMaterials: snapshot.healthMaterials.map((material) =>
        material.materialId === input.materialId
          ? {
              ...material,
              parseStatus: "completed",
              parseResult: input.parseResult,
              parseError: undefined,
              updatedAt: input.context.now(),
            }
          : material
      ),
      updatedAt: input.context.now(),
    }),
    {
      requiredChildId,
      operation: "healthMaterial.write",
      data: (snapshot) => snapshot.healthMaterials.find((material) => material.materialId === input.materialId),
    }
  );
}

export function failHealthParseResult(input: ParseHealthMaterialInput & { error: string }) {
  return updateHealthMaterialParseStatus({
    context: input.context,
    materialId: input.materialId,
    status: "failed",
    error: input.error,
  });
}

export function createConsultation(input: ConsultationInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => {
      const now = input.context.now();
      const child = getChild(snapshot, input.childId);
      const workflowStatus = input.workflowStatus ?? "pending";
      const summary = input.summary ?? input.notes ?? "D01 demo consultation";
      const schoolAction = "园内先进行事实核对和短时观察，不做医疗诊断。";
      const homeAction = "今晚向家长同步可见摘要，并请家长反馈孩子状态变化。";
      const reviewIn48h = "48 小时内回看园内观察、家庭反馈和材料复核结论。";
      const interventionCard = {
        id: createDemoId("ic"),
        title: `D05 会诊跟进：${child?.name ?? input.childId}`,
        riskLevel: input.riskLevel,
        targetChildId: input.childId,
        triggerReason: summary,
        summary,
        todayInSchoolAction: schoolAction,
        tonightHomeAction: homeAction,
        homeSteps: ["核对孩子今晚状态", "只反馈观察事实", "如有明显不适及时线下处理"],
        observationPoints: ["体温和精神状态", "材料原文需要复核的点", "家长晚间反馈"],
        tomorrowObservationPoint: "明早入园后复核精神状态和材料原件。",
        reviewIn48h,
        parentMessageDraft: "今天老师已根据健康材料做了本地演示整理，会继续核对原件并观察孩子状态。",
        teacherFollowupDraft: "请老师补充原件复核结论和 48 小时观察结果。",
        consultationMode: true,
        consultationSummary: summary,
        participants: ["Health", "Coordinator"],
        shouldEscalateToAdmin: input.riskLevel === "high",
        source: "fallback",
        createdAt: now,
        updatedAt: now,
      };
      const consultation = {
        consultationId: createDemoId("consult"),
        triggerReason: summary,
        triggerType: ["multi-risk"],
        triggerReasons: [summary],
        participants: [
          { id: "health-agent", label: "Health" },
          { id: "coordinator", label: "Coordinator" },
        ],
        childId: input.childId,
        riskLevel: input.riskLevel,
        agentFindings: [],
        summary,
        keyFindings: ["本地演示解析结果需要老师复核原件", "该记录已写入 D01 共享演示数据"],
        healthAgentView: {
          role: "HealthObservationAgent",
          title: "Health review",
          summary: "No deterministic diagnosis in demo mode.",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        dietBehaviorAgentView: {
          role: "DietBehaviorAgent",
          title: "Diet review",
          summary: "Diet evidence is available in snapshot records.",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        parentCommunicationAgentView: {
          role: "ParentCommunicationAgent",
          title: "Home-school communication",
          summary: input.notes ?? "Awaiting family feedback.",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        inSchoolActionAgentView: {
          role: "InSchoolActionAgent",
          title: "In-school action",
          summary: "Teacher can add follow-up actions.",
          signals: [],
          actions: [],
          observationPoints: [],
          evidence: [],
        },
        todayInSchoolActions: [schoolAction],
        tonightAtHomeActions: [homeAction],
        followUp48h: [reviewIn48h],
        parentMessageDraft: interventionCard.parentMessageDraft,
        directorDecisionCard: {
          title: `Follow ${child?.name ?? input.childId}`,
          reason: input.notes ?? "D01 consultation",
          recommendedOwnerRole: "teacher",
          recommendedOwnerName: input.assignedTo ?? "李老师",
          recommendedAt: now,
          status: mapWorkflowStatus(workflowStatus),
        },
        explainability: [],
        evidenceItems: [],
        nextCheckpoints: [],
        interventionCard,
        coordinatorSummary: {
          finalConclusion: summary,
          riskLevel: input.riskLevel,
          problemDefinition: input.notes ?? "Needs follow-up",
          schoolAction,
          homeAction,
          observationPoints: interventionCard.observationPoints,
          reviewIn48h,
          shouldEscalateToAdmin: input.riskLevel === "high",
        },
        schoolAction,
        homeAction,
        observationPoints: interventionCard.observationPoints,
        reviewIn48h,
        shouldEscalateToAdmin: input.riskLevel === "high",
        source: "rule",
        providerTrace: {
          provider: "d01-local-demo",
          source: "local",
          transport: "local-store",
          transportSource: "demo-data",
          consultationSource: "health-material",
          realProvider: false,
          fallback: true,
        },
        memoryMeta: {
          backend: "d01-demo-local",
          degraded: true,
          usedSources: ["healthMaterials", "consultations"],
          errors: [],
          matchedSnapshotIds: input.sourceMaterialId ? [input.sourceMaterialId] : [],
          matchedTraceIds: [],
        },
        traceMeta: {
          memory: {
            backend: "d01-demo-local",
            degraded: true,
            usedSources: ["healthMaterials", "consultations"],
            errors: [],
            matchedSnapshotIds: input.sourceMaterialId ? [input.sourceMaterialId] : [],
            matchedTraceIds: [],
          },
        },
        fallback: false,
        generatedAt: now,
        status: workflowStatus === "resolved" ? "resolved" : "active",
        workflowStatus,
        notes: input.notes ? [{ note: input.notes, createdAt: now, createdBy: input.context.user.id }] : [],
        createdBy: input.context.user.id,
        assignedTo: input.assignedTo,
        sourceMaterialId: input.sourceMaterialId,
        updatedAt: now,
      } as AppStateSnapshot["consultations"][number];
      return { ...snapshot, consultations: [consultation, ...snapshot.consultations], updatedAt: now };
    },
    {
      requiredChildId: input.childId,
      operation: "consultation.write",
      data: (snapshot) => snapshot.consultations[0],
    }
  );
}

export function saveConsultationResult(input: SaveConsultationResultInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => {
      const now = input.context.now();
      const workflowStatus =
        input.workflowStatus ??
        ((input.consultation as { workflowStatus?: ConsultationWorkflowStatus }).workflowStatus ?? "pending");
      const consultation = normalizeConsultationForWorkflow(
        {
          ...input.consultation,
          childId: input.childId,
          sourceMaterialId:
            input.sourceMaterialId ??
            (input.consultation as { sourceMaterialId?: string }).sourceMaterialId,
          updatedAt: now,
        } as AppStateSnapshot["consultations"][number],
        workflowStatus,
        now
      );
      return {
        ...snapshot,
        consultations: upsertByKey(snapshot.consultations, consultation, (item) => item.consultationId),
        updatedAt: now,
      };
    },
    {
      requiredChildId: input.childId,
      operation: "consultation.write",
      data: (snapshot) =>
        snapshot.consultations.find((item) => item.consultationId === input.consultation.consultationId),
    }
  );
}

export function addConsultationNote(input: ConsultationNoteInput) {
  const baseSnapshot = readContextSnapshot(input.context);
  const requiredChildId = findConsultationChildId(baseSnapshot, input.consultationId);
  if (!requiredChildId) {
    return failedMutation(
      input.context,
      baseSnapshot,
      "missing_consultation_id",
      "Consultation note rejected because no consultation child scope was found."
    );
  }

  return mutateAppSnapshot(
    input.context,
    (snapshot) => ({
      ...snapshot,
      consultations: snapshot.consultations.map((consultation) =>
        consultation.consultationId === input.consultationId
          ? ({
              ...consultation,
              notes: [
                ...(((consultation as { notes?: unknown[] }).notes as unknown[] | undefined) ?? []),
                { note: input.note, createdAt: input.context.now(), createdBy: input.context.user.id },
              ],
              updatedAt: input.context.now(),
            } as AppStateSnapshot["consultations"][number])
          : consultation
      ),
      updatedAt: input.context.now(),
    }),
    {
      requiredChildId,
      operation: "consultation.write",
      data: (snapshot) => snapshot.consultations.find((item) => item.consultationId === input.consultationId),
    }
  );
}

export function updateConsultationStatus(input: ConsultationStatusInput) {
  const baseSnapshot = readContextSnapshot(input.context);
  const requiredChildId = findConsultationChildId(baseSnapshot, input.consultationId);
  if (!requiredChildId) {
    return failedMutation(
      input.context,
      baseSnapshot,
      "missing_consultation_id",
      "Consultation status update rejected because no consultation child scope was found."
    );
  }

  return mutateAppSnapshot(
    input.context,
    (snapshot) => ({
      ...snapshot,
      consultations: snapshot.consultations.map((consultation) =>
        consultation.consultationId === input.consultationId
          ? normalizeConsultationForWorkflow(consultation, input.status, input.context.now())
          : consultation
      ),
      updatedAt: input.context.now(),
    }),
    {
      requiredChildId,
      operation: "consultation.write",
      data: (snapshot) => snapshot.consultations.find((item) => item.consultationId === input.consultationId),
    }
  );
}

export function markReminderRead(input: MarkReminderReadInput) {
  return mutateAppSnapshot(
    input.context,
    (snapshot) => ({
      ...snapshot,
      reminders: snapshot.reminders.map((reminder) =>
        reminder.reminderId === input.reminderId
          ? ({ ...reminder, status: "acknowledged", readAt: input.context.now() } as AppStateSnapshot["reminders"][number])
          : reminder
      ),
      updatedAt: input.context.now(),
    }),
    {
      operation: "reminder.write",
      data: (snapshot) => snapshot.reminders.find((item) => item.reminderId === input.reminderId),
    }
  );
}

export function generateStorybookFromGrowthRecords(childId: string, context = getCurrentDemoContext("parent")) {
  return mutateAppSnapshot(
    context,
    (snapshot) => {
      const now = context.now();
      const sourceRecordIds = snapshot.growth.filter((record) => record.childId === childId).map((record) => record.id);
      const storybook = {
        storybookId: createDemoId("storybook"),
        childId,
        sourceRecordIds,
        pages: sourceRecordIds.length > 0
          ? sourceRecordIds.map((recordId, index) => ({
              page: index + 1,
              title: `Growth moment ${index + 1}`,
              sourceRecordId: recordId,
            }))
          : [{ page: 1, title: "Demo storybook", sourceRecordId: null }],
        generatedAt: now,
      } satisfies AppStateSnapshot["storybooks"][number];
      return { ...snapshot, storybooks: [storybook, ...snapshot.storybooks], updatedAt: now };
    },
    {
      requiredChildId: childId,
      operation: "storybook.write",
      data: (snapshot) => snapshot.storybooks[0],
    }
  );
}
