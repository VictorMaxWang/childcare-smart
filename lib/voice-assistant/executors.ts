import "server-only";

import type {
  AnalyticsMetric,
  ApiAssignment,
  ApiAssignmentStatus,
  ApiFeedbackDetail,
  FeedbackStatus,
  StorybookExportFormat,
  WeeklyReportExportFormat,
} from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/accounts";
import { ApiRouteError } from "@/lib/server/api-errors";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { AppDataService } from "@/lib/server/app-data-service";
import type { AssistantCommand, AssistantExecuteResult, AssistantObjectRefs } from "@/lib/voice-assistant/types";

type AnyRecord = Record<string, unknown>;

function serviceFor(session: SessionUser) {
  return new AppDataService(session, new DefaultAppDataRepository());
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function feedbackIdOf(feedback: unknown) {
  const record = asRecord(feedback);
  return readString(record.feedbackId) || readString(record.id);
}

function feedbackTitle(feedback: unknown) {
  const record = asRecord(feedback);
  return readString(record.title) || readString(record.category) || "家长反馈";
}

function feedbackStatus(value: unknown): FeedbackStatus {
  const status = readString(value).toLowerCase();
  if (status === "resolved" || status === "archived" || status === "in-progress" || status === "open") return status;
  if (status === "done" || status === "completed" || status === "handled") return "resolved";
  return "open";
}

function isOpenFeedback(feedback: unknown) {
  const status = feedbackStatus(asRecord(feedback).status);
  return status !== "resolved" && status !== "archived";
}

function refsForFeedback(detail: ApiFeedbackDetail): AssistantObjectRefs {
  return {
    feedbackId: feedbackIdOf(detail.feedback),
    childId: detail.child.id,
  };
}

async function resolveFeedbackDetail(service: AppDataService, command: AssistantCommand) {
  const explicit = readString(command.params.feedbackId);
  if (explicit) return service.getFeedback(explicit);

  const childId = readString(command.params.childId);
  const feedbackItems = await service.listFeedback(childId ? { childId } : {});
  const target = feedbackItems.find(isOpenFeedback) ?? feedbackItems[0];
  const feedbackId = feedbackIdOf(target);
  if (!feedbackId) {
    throw new ApiRouteError("not_found", childId ? "该儿童没有可访问的反馈。" : "没有可访问的反馈。");
  }
  return service.getFeedback(feedbackId);
}

async function resolveWeeklyReportId(service: AppDataService, command: AssistantCommand) {
  const explicit = readString(command.params.weeklyReportId);
  if (explicit) return explicit;

  const reports = await service.listWeeklyReports();
  const latest = reports[0];
  if (!latest) {
    throw new ApiRouteError("not_found", "没有可访问的周报，无法执行该命令。");
  }
  return latest.reportId;
}

async function resolveStorybookId(service: AppDataService, command: AssistantCommand, session: SessionUser) {
  const explicit = readString(command.params.storybookId);
  if (explicit) return explicit;

  const childId = readString(command.params.childId) || session.childIds?.[0];
  const storybooks = await service.listStorybooks(childId ? { childId } : {});
  const latest = storybooks[0];
  if (!latest) {
    throw new ApiRouteError("not_found", "没有找到可访问的成长绘本，请先打开成长绘本页面生成并保存。");
  }
  return latest.storybookId;
}

async function resolveReminderId(service: AppDataService, command: AssistantCommand, session: SessionUser) {
  const explicit = readString(command.params.reminderId);
  if (explicit) return explicit;

  const childId = readString(command.params.childId) || session.childIds?.[0];
  if (!childId) throw new ApiRouteError("invalid_request", "标记提醒已读需要 childId 或 reminderId。");
  const reminders = await service.listReminders({ childId });
  const latestPending = reminders
    .filter((reminder) => reminder.status !== "done" && reminder.status !== "acknowledged")
    .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt))[0];
  if (!latestPending) {
    throw new ApiRouteError("not_found", "当前孩子没有待读提醒。");
  }
  return latestPending.reminderId;
}

function readAssignmentStatus(value: unknown, fallback: ApiAssignmentStatus = "in_progress"): ApiAssignmentStatus {
  const status = readString(value).toLowerCase();
  if (status === "pending" || status === "in_progress" || status === "completed" || status === "overdue") return status;
  if (status === "in-progress" || status === "processing" || status === "acknowledged") return "in_progress";
  if (status === "done" || status === "resolved" || status === "closed") return "completed";
  return fallback;
}

async function resolveAssignment(service: AppDataService, command: AssistantCommand) {
  const explicit = readString(command.params.assignmentId) || readString(command.params.dispatchId);
  if (explicit) {
    const assignments = await service.listAssignments();
    const found = assignments.find((assignment) => assignment.assignmentId === explicit || assignment.taskId === explicit);
    if (!found) throw new ApiRouteError("not_found", "没有找到该派单。");
    return found;
  }

  const childId = readString(command.params.childId);
  const teacherId = readString(command.params.teacherId);
  const assignments = await service.listAssignments({
    childId: childId || undefined,
    teacherId: teacherId || undefined,
  });
  const target = assignments.find((assignment) => assignment.status !== "completed") ?? assignments[0];
  if (!target) {
    throw new ApiRouteError("not_found", "没有找到可更新的园长派单。");
  }
  return target;
}

async function replyToMessage(service: AppDataService, command: AssistantCommand) {
  const messageId = readString(command.params.messageId);
  const content = readString(command.params.content);
  if (!content) throw new ApiRouteError("invalid_request", "回复内容不能为空。");

  if (messageId) {
    return service.replyMessage(messageId, { content });
  }

  const childId = readString(command.params.childId);
  if (!childId) throw new ApiRouteError("invalid_request", "回复消息需要 childId 或 messageId。");

  const messages = await service.listMessages({ childId });
  const latestMessage = messages
    .slice()
    .reverse()
    .find((message) => message.senderRole === "parent");
  if (!latestMessage?.messageId) {
    throw new ApiRouteError("not_found", "没有找到可回复的会话。");
  }
  return service.replyMessage(latestMessage.messageId, { content });
}

async function upsertHealthRecord(service: AppDataService, input: Record<string, unknown>) {
  const childId = readString(input.childId);
  const date = readString(input.date, todayKey());
  const records = (await service.listRecords("health", { childId })) as unknown as Array<AnyRecord>;
  const existing = records.find((record) => readString(record.date) === date);
  const payload = {
    childId,
    date,
    temperature: readNumber(input.temperature, 36.6),
    mood: readString(input.mood, "stable"),
    handMouthEye: input.handMouthEye === "异常" ? "异常" : "正常",
    isAbnormal: readBoolean(input.isAbnormal),
    remark: readString(input.remark),
  };
  return existing ? service.updateRecord("health", readString(existing.id), payload) : service.createRecord("health", payload);
}

async function upsertMealRecord(service: AppDataService, input: Record<string, unknown>) {
  const childId = readString(input.childId);
  const date = readString(input.date, todayKey());
  const meal = readString(input.meal, "午餐");
  const records = (await service.listRecords("meal", { childId })) as unknown as Array<AnyRecord>;
  const existing = records.find(
    (record) => readString(record.date) === date && readString(record.meal) === meal
  );
  const payload = {
    childId,
    date,
    meal,
    foods: Array.isArray(input.foods) ? input.foods : [],
    intakeLevel: readString(input.intakeLevel, "适中"),
    preference: readString(input.preference, "正常"),
    nutritionScore: readNumber(input.nutritionScore, 78),
    waterMl: readNumber(input.waterMl, 0),
  };
  return existing ? service.updateRecord("meal", readString(existing.id), payload) : service.createRecord("meal", payload);
}

async function resolveDispatchConsultationId(service: AppDataService, command: AssistantCommand) {
  const explicit = readString(command.params.consultationId) || readString(command.params.dispatchId);
  if (explicit) return explicit;

  const childId = readString(command.params.childId);
  const consultations = await service.listConsultations(childId ? { childId } : {});
  const latest =
    consultations.find((consultation) => {
      const workflowStatus = readString((consultation as { workflowStatus?: unknown }).workflowStatus, "pending");
      return workflowStatus !== "resolved";
    }) ?? consultations[0];

  if (!latest?.consultationId) {
    throw new ApiRouteError("not_found", "没有找到可更新的园长派单或会诊任务。");
  }
  return latest.consultationId;
}

function childIdsFromClass(children: Array<{ id: string; className?: string }>, className: string) {
  return children.filter((child) => child.className === className).map((child) => child.id);
}

function readMetric(value: unknown): AnalyticsMetric {
  const metric = readString(value);
  if (
    metric === "records" ||
    metric === "health" ||
    metric === "health-abnormal" ||
    metric === "meal" ||
    metric === "growth" ||
    metric === "feedback" ||
    metric === "consultation" ||
    metric === "high-risk-consultation" ||
    metric === "reminder"
  ) {
    return metric;
  }
  return "records";
}

function statusLabel(status: ApiAssignmentStatus) {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "跟进中";
  if (status === "overdue") return "已逾期";
  return "待处理";
}

function activeConsultation(consultation: unknown) {
  const record = asRecord(consultation);
  const status = readString(record.workflowStatus) || readString(record.status);
  return status !== "resolved" && status !== "closed" && status !== "completed";
}

function highRiskConsultation(consultation: unknown) {
  return readString(asRecord(consultation).riskLevel) === "high" && activeConsultation(consultation);
}

function trendSummary(metric: AnalyticsMetric) {
  if (metric === "meal") return "饮食记录";
  if (metric === "health-abnormal") return "异常晨检";
  if (metric === "growth") return "成长记录";
  if (metric === "feedback") return "家长反馈";
  if (metric === "high-risk-consultation") return "高风险会诊";
  return "运营记录";
}

function foodNames(foods: unknown) {
  return readArray<{ name?: unknown }>(foods)
    .map((food) => readString(food.name))
    .filter(Boolean);
}

function summarizeChildStatus(result: Awaited<ReturnType<AppDataService["getParentHome"]>>, section: string) {
  const childName = result.child.name;
  const today = todayKey();
  const health = result.records.health.filter((record) => record.date === today);
  const meals = result.records.meals.filter((record) => record.date === today);
  const growth = result.records.growth;

  if (section === "meal") {
    if (meals.length === 0) return `${childName}今天暂无饮食记录。`;
    const lines = meals.map((meal) => {
      const foods = foodNames(meal.foods);
      return `${meal.meal}：${foods.length > 0 ? foods.join("、") : "未填写食物"}，摄入${meal.intakeLevel}`;
    });
    return `${childName}今天饮食记录：${lines.join("；")}。`;
  }

  if (section === "health") {
    const records = health.length > 0 ? health : result.records.health.slice(-1);
    if (records.length === 0) return `${childName}暂无健康记录。`;
    const latest = records[records.length - 1];
    const dateText = latest.date === today ? "今天" : latest.date;
    return `${childName}${dateText}健康记录：体温 ${latest.temperature}℃，${latest.isAbnormal ? "需关注" : "状态正常"}${latest.remark ? `，备注：${latest.remark}` : ""}。`;
  }

  if (section === "growth") {
    if (growth.length === 0) return `${childName}暂无成长记录。`;
    const latest = growth[growth.length - 1];
    return `${childName}最近成长记录：${latest.category}，${latest.description}`;
  }

  return `${childName}今日状态：健康记录 ${health.length} 条，饮食记录 ${meals.length} 条，成长记录 ${growth.length} 条，提醒 ${result.reminders.length} 条。`;
}

function assignmentRefs(assignment: ApiAssignment): AssistantObjectRefs {
  return {
    assignmentId: assignment.assignmentId,
    childId: assignment.childId,
    reminderId: assignment.reminderId,
    feedbackId: assignment.feedbackId,
    consultationId: assignment.consultationId,
  };
}

export async function executeAssistantCommand(session: SessionUser, command: AssistantCommand): Promise<AssistantExecuteResult> {
  const service = serviceFor(session);

  if (command.intent === "navigate") {
    const path = readString(command.params.path) || command.deeplink;
    if (!path) throw new ApiRouteError("invalid_request", "导航命令缺少目标页面。");
    return {
      command: { ...command, status: "executed" },
      message: command.previewText,
      deeplink: path,
      links: [{ label: command.previewText, href: path }],
    };
  }

  if (command.intent === "send_message") {
    const result = await service.sendMessage({
      childId: readString(command.params.childId),
      content: readString(command.params.content),
    });
    return {
      command: { ...command, status: "executed" },
      message: "留言已发送。",
      data: result,
      refs: { childId: result.childId, messageId: result.messageId },
      refreshed: true,
    };
  }

  if (command.intent === "reply_message") {
    const result = await replyToMessage(service, command);
    return {
      command: { ...command, status: "executed" },
      message: "回复已发送。",
      data: result,
      refs: { childId: result.childId, messageId: result.messageId },
      refreshed: true,
    };
  }

  if (command.intent === "create_morning_check") {
    const result = await upsertHealthRecord(service, {
      childId: readString(command.params.childId),
      date: todayKey(),
      temperature: readNumber(command.params.temperature, 36.6),
      mood: readString(command.params.mood, "stable"),
      handMouthEye: command.params.handMouthEye === "异常" ? "异常" : "正常",
      isAbnormal: Boolean(command.params.isAbnormal),
      remark: readString(command.params.remark),
    });
    return {
      command: { ...command, status: "executed" },
      message: "晨检记录已保存。",
      data: result,
      refs: { childId: readString(asRecord(result).childId) },
      refreshed: true,
    };
  }

  if (command.intent === "create_diet_record") {
    const className = readString(command.params.className);
    const isBulkClass = Boolean(command.params.bulkClass) && className;
    const basePayload = {
      date: todayKey(),
      meal: readString(command.params.meal, "午餐"),
      foods: Array.isArray(command.params.foods) ? command.params.foods : [],
      intakeLevel: readString(command.params.intakeLevel, "适中"),
      preference: readString(command.params.preference, "正常"),
      nutritionScore: readNumber(command.params.nutritionScore, 78),
    };
    const result = isBulkClass
      ? await Promise.all(
          childIdsFromClass(await service.listChildren(), className).map((childId) =>
            upsertMealRecord(service, { ...basePayload, childId })
          )
        )
      : await upsertMealRecord(service, {
          ...basePayload,
          childId: readString(command.params.childId),
        });

    if (Array.isArray(result) && result.length === 0) {
      throw new ApiRouteError("not_found", "该班级下没有可写入的授权儿童。");
    }
    return {
      command: { ...command, status: "executed" },
      message: Array.isArray(result) ? `饮食记录已保存，共 ${result.length} 名儿童。` : "饮食记录已保存。",
      data: result,
      refs: Array.isArray(result) ? undefined : { childId: readString(asRecord(result).childId) },
      refreshed: true,
    };
  }

  if (command.intent === "create_growth_record") {
    const result = await service.createRecord("growth", {
      childId: readString(command.params.childId),
      category: readString(command.params.category, "生活自理"),
      tags: Array.isArray(command.params.tags) ? command.params.tags : ["voice-assistant"],
      description: readString(command.params.description),
      needsAttention: Boolean(command.params.needsAttention),
    });
    return {
      command: { ...command, status: "executed" },
      message: "成长记录已保存。",
      data: result,
      refs: { childId: readString(asRecord(result).childId) },
      refreshed: true,
    };
  }

  if (command.intent === "create_feedback") {
    const result = await service.createFeedback({
      childId: readString(command.params.childId),
      title: readString(command.params.title, "语音反馈"),
      content: readString(command.params.content),
    });
    return {
      command: { ...command, status: "executed" },
      message: "反馈已提交。",
      data: result,
      refs: { childId: result.child.id, feedbackId: feedbackIdOf(result.feedback) },
      refreshed: true,
    };
  }

  if (command.intent === "mark_reminder_read") {
    const reminderId = await resolveReminderId(service, command, session);
    const result = await service.updateReminder(reminderId, { status: "acknowledged" });
    return {
      command: { ...command, status: "executed" },
      message: result?.title ? `提醒「${result.title}」已标记为已读。` : "提醒已标记为已读。",
      data: result,
      refs: { reminderId: result?.reminderId, childId: result?.childId ?? result?.targetId },
      refreshed: true,
    };
  }

  if (command.intent === "generate_weekly_report") {
    const result = await service.createWeeklyReport({
      scopeType: readString(command.params.scopeType),
      scopeId: readString(command.params.scopeId),
      title: readString(command.params.title, "本周周报"),
    });
    return {
      command: { ...command, status: "executed" },
      message: `周报草稿已生成：${result.title}。`,
      data: result,
      refs: { weeklyReportId: result.reportId },
      links: [{ label: "查看周报", href: "/admin/agent?action=weekly-report" }],
      refreshed: true,
    };
  }

  if (command.intent === "export_weekly_report") {
    const reportId = await resolveWeeklyReportId(service, command);
    const format = readString(command.params.format, "json") as WeeklyReportExportFormat;
    const result = await service.exportWeeklyReportData(reportId, format);
    return {
      command: { ...command, status: "executed" },
      message: `周报导出内容已生成：${result.filename}。`,
      data: result,
      refs: { weeklyReportId: result.reportId },
      download: {
        filename: result.filename,
        mimeType: result.mimeType,
        content: result.content,
      },
    };
  }

  if (command.intent === "share_weekly_report") {
    const reportId = await resolveWeeklyReportId(service, command);
    const result = await service.shareWeeklyReport(reportId, {});
    if (!result) {
      throw new ApiRouteError("not_found", "weekly_report_not_found");
    }
    return {
      command: { ...command, status: "executed" },
      message: `周报分享文案已生成：${result.share?.summary ?? result.title}。`,
      data: result,
      refs: { weeklyReportId: result.reportId },
      shareText: result.share?.localText,
      refreshed: true,
    };
  }

  if (command.intent === "export_storybook") {
    const storybookId = await resolveStorybookId(service, command, session);
    const format = readString(command.params.format, "json") as StorybookExportFormat;
    const result = await service.exportStorybookData(storybookId, format);
    return {
      command: { ...command, status: "executed" },
      message: `成长绘本导出内容已生成：${result.filename}。`,
      data: result,
      refs: { storybookId: result.storybookId, childId: result.childId },
      download: {
        filename: result.filename,
        mimeType: result.mimeType,
        content: result.content,
      },
    };
  }

  if (command.intent === "share_storybook") {
    const storybookId = await resolveStorybookId(service, command, session);
    const result = await service.shareStorybook(storybookId, {});
    return {
      command: { ...command, status: "executed" },
      message: `成长绘本分享文案已生成：${result.summary}`,
      data: result,
      refs: { storybookId: result.storybookId, childId: result.childId },
      shareText: result.copyText,
      refreshed: true,
    };
  }

  if (command.intent === "create_consultation") {
    const result = await service.createConsultation({
      childId: readString(command.params.childId),
      riskLevel: readString(command.params.riskLevel, "medium"),
      summary: readString(command.params.summary, "语音助手创建的会诊"),
      notes: readString(command.params.notes),
    });
    return {
      command: { ...command, status: "executed" },
      message: "会诊已创建。",
      data: result,
      refs: { childId: result.childId, consultationId: result.consultationId },
      refreshed: true,
    };
  }

  if (command.intent === "create_health_material_task") {
    const result = await service.createHealthMaterial({
      childId: readString(command.params.childId),
      filename: readString(command.params.filename, "voice-health-material-note.txt"),
      fileType: readString(command.params.fileType, "text/plain"),
      description: readString(command.params.description, "语音助手创建的健康材料解析任务"),
    });
    if (!result) {
      throw new Error("health_material_task_create_failed");
    }
    return {
      command: { ...command, status: "executed" },
      message: "健康材料解析任务已创建，请在解析页上传或补充材料。",
      data: result,
      refs: { childId: result.childId, materialId: result.materialId },
      deeplink: command.deeplink || `/teacher/health-file-bridge?childId=${encodeURIComponent(result.childId)}`,
      refreshed: true,
    };
  }

  if (command.intent === "add_consultation_note") {
    const result = await service.addConsultationNote(readString(command.params.consultationId), {
      note: readString(command.params.note),
    });
    if (!result) {
      throw new ApiRouteError("not_found", "consultation_not_found");
    }
    return {
      command: { ...command, status: "executed" },
      message: "会诊备注已补充。",
      data: result,
      refs: { childId: result.childId, consultationId: result.consultationId },
      refreshed: true,
    };
  }

  if (command.intent === "update_consultation_status") {
    const result = await service.updateConsultationStatus(readString(command.params.consultationId), {
      status: readString(command.params.status, "in-progress"),
    });
    if (!result) {
      throw new ApiRouteError("not_found", "consultation_not_found");
    }
    return {
      command: { ...command, status: "executed" },
      message: "会诊状态已更新。",
      data: result,
      refs: { childId: result.childId, consultationId: result.consultationId },
      refreshed: true,
    };
  }

  if (command.intent === "update_dispatch_status") {
    const consultationId = await resolveDispatchConsultationId(service, command);
    const status = readString(command.params.status, "in-progress");
    const result = await service.updateConsultationStatus(consultationId, {
      status,
    });
    if (!result) {
      throw new ApiRouteError("not_found", "consultation_not_found");
    }
    return {
      command: { ...command, status: "executed" },
      message: status === "resolved" ? "园长派单已标记为已完成。" : "园长派单已标记为跟进中。",
      data: result,
      refs: { childId: result.childId, consultationId: result.consultationId, dispatchId: result.consultationId },
      refreshed: true,
    };
  }

  if (command.intent === "assign_task") {
    const result = await service.createAssignment({
      childId: readString(command.params.childId),
      teacherId: readString(command.params.teacherId),
      title: readString(command.params.title, "园长派单"),
      description: readString(command.params.task) || readString(command.params.description),
      feedbackId: readString(command.params.feedbackId) || undefined,
      consultationId: readString(command.params.consultationId) || undefined,
      riskItemId: readString(command.params.riskItemId) || undefined,
    });
    return {
      command: { ...command, status: "executed" },
      message: `已给${result.teacherName}派单：${result.description}`,
      data: result,
      refs: assignmentRefs(result),
      links: [{ label: "查看园长派单", href: "/admin/agent?action=dispatch" }],
      refreshed: true,
    };
  }

  if (command.intent === "update_assignment_status") {
    const assignment = await resolveAssignment(service, command);
    const status = readAssignmentStatus(command.params.status);
    const result = await service.updateAssignmentStatus(assignment.assignmentId, {
      status,
      completionSummary: readString(command.params.completionSummary),
    });
    return {
      command: { ...command, status: "executed" },
      message: `派单状态已更新为${statusLabel(result.status)}。`,
      data: result,
      refs: assignmentRefs(result),
      refreshed: true,
    };
  }

  if (command.intent === "mark_feedback_resolved") {
    const detail = await resolveFeedbackDetail(service, command);
    const feedbackId = feedbackIdOf(detail.feedback);
    const result = await service.updateFeedbackStatus(feedbackId, { status: "resolved" });
    return {
      command: { ...command, status: "executed" },
      message: `已将${detail.child.name}的反馈标记为已处理。`,
      data: result,
      refs: refsForFeedback(detail),
      refreshed: true,
    };
  }

  if (command.intent === "view_feedback_detail") {
    const result = await resolveFeedbackDetail(service, command);
    return {
      command: { ...command, status: "executed" },
      message: `已读取${result.child.name}的反馈详情：${feedbackTitle(result.feedback)}，状态 ${result.feedback.status}。`,
      data: result,
      refs: refsForFeedback(result),
      links: [{ label: "打开园长首页", href: "/admin" }],
    };
  }

  if (command.intent === "query_director_feedback") {
    const childId = readString(command.params.childId);
    const feedbackItems = await service.listFeedback(childId ? { childId } : {});
    const pending = feedbackItems.filter(isOpenFeedback);
    const first = pending[0];
    const childMap = new Map((await service.listChildren()).map((child) => [child.id, child] as const));
    const preview = pending
      .slice(0, 3)
      .map((item) => {
        const child = childMap.get(readString(asRecord(item).childId));
        return `${child?.name ?? "未知儿童"}：${feedbackTitle(item)}`;
      })
      .join("；");
    return {
      command: { ...command, status: "executed" },
      message: pending.length > 0 ? `当前有 ${pending.length} 条未处理反馈。${preview}` : "当前没有未处理反馈。",
      data: { feedback: pending, pendingCount: pending.length },
      refs: first ? { feedbackId: feedbackIdOf(first), childId: readString(asRecord(first).childId) } : undefined,
      links: [{ label: "打开反馈看板", href: "/admin" }],
    };
  }

  if (command.intent === "query_director_risk") {
    const childId = readString(command.params.childId);
    const [summary, children, feedbackItems, consultations, healthRecords] = await Promise.all([
      service.getAdminSummary(),
      service.listChildren(),
      service.listFeedback(childId ? { childId } : {}),
      service.listConsultations(childId ? { childId } : {}),
      service.listRecords("health", childId ? { childId } : {}),
    ]);
    const today = todayKey();
    const abnormalToday = (healthRecords as unknown as Array<AnyRecord>).filter(
      (record) => readString(record.date) === today && Boolean(record.isAbnormal)
    );
    const pendingFeedback = feedbackItems.filter(isOpenFeedback);
    const highRisk = consultations.filter(highRiskConsultation);
    const riskyChildIds = new Set<string>([
      ...abnormalToday.map((record) => readString(record.childId)),
      ...pendingFeedback.map((item) => readString(asRecord(item).childId)),
      ...highRisk.map((item) => readString(asRecord(item).childId)),
    ].filter(Boolean));
    const riskyChildren = children.filter((child) => riskyChildIds.has(child.id));
    const focusType = readString(command.params.focusType);
    const message =
      focusType === "morning_abnormal"
        ? `今天有 ${abnormalToday.length} 条异常晨检。`
        : riskyChildren.length > 0
          ? `当前有 ${riskyChildren.length} 名需优先关注儿童：${riskyChildren.slice(0, 5).map((child) => child.name).join("、")}。`
          : "当前没有需要重点跟进的儿童记录。";
    return {
      command: { ...command, status: "executed" },
      message,
      data: {
        summary,
        riskyChildren,
        abnormalToday,
        pendingFeedback,
        highRiskConsultations: highRisk,
        counts: {
          abnormalMorningCheck: abnormalToday.length,
          pendingFeedback: pendingFeedback.length,
          highRiskConsultation: highRisk.length,
        },
      },
      refs: riskyChildren[0] ? { childId: riskyChildren[0].id } : undefined,
      links: [{ label: "打开园长首页", href: "/admin" }],
    };
  }

  if (command.intent === "query_director_trend") {
    const metric = readMetric(command.params.metric);
    const result = await service.getTrends({
      metric,
      timeRange: readString(command.params.timeRange, "week"),
      windowDays: readNumber(command.params.windowDays, 7),
      childId: readString(command.params.childId) || undefined,
    });
    const total = result.series.reduce((sum, point) => sum + point.value, 0);
    const latest = result.series[result.series.length - 1];
    const dataNote = result.emptyReason ? ` ${result.emptyReason}` : "";
    return {
      command: { ...command, status: "executed" },
      message: `${trendSummary(metric)}近 ${result.series.length} 天合计 ${total} 条，最新一天 ${latest?.value ?? 0} 条。${dataNote}`,
      data: result,
      links: [{ label: "打开运营报表", href: "/admin/agent?action=weekly-report" }],
    };
  }

  if (command.intent === "query_consultation_status") {
    const childId = readString(command.params.childId);
    const consultations = await service.listConsultations(childId ? { childId } : {});
    const target = consultations.filter((consultation) =>
      readString(command.params.riskLevel) === "high" ? highRiskConsultation(consultation) : activeConsultation(consultation)
    );
    const childMap = new Map((await service.listChildren()).map((child) => [child.id, child] as const));
    const first = target[0];
    const preview = target
      .slice(0, 3)
      .map((consultation) => {
        const record = asRecord(consultation);
        return `${childMap.get(readString(record.childId))?.name ?? "未知儿童"}：${readString(record.summary) || readString(record.triggerReason) || "会诊跟进"}`;
      })
      .join("；");
    return {
      command: { ...command, status: "executed" },
      message: target.length > 0 ? `当前有 ${target.length} 个高风险会诊需要关注。${preview}` : "当前没有高风险会诊需要处理。",
      data: { consultations: target, count: target.length },
      refs: first
        ? {
            consultationId: readString(asRecord(first).consultationId),
            childId: readString(asRecord(first).childId),
          }
        : undefined,
      links: [{ label: "打开高风险会诊", href: "/admin/agent?action=consultation" }],
    };
  }

  if (command.intent === "query_dashboard") {
    if (session.role === "机构管理员") {
      const [summary, quality, trend, assignments] = await Promise.all([
        service.getAdminSummary(),
        service.getAdminQualityMetrics(),
        service.getTrends({ metric: "records", timeRange: "week", windowDays: 7 }),
        service.listAssignments(),
      ]);
      const total = trend.series.reduce((sum, point) => sum + point.value, 0);
      const openAssignments = assignments.filter((assignment) => assignment.status !== "completed");
      return {
        command: { ...command, status: "executed" },
        message: `当前共有 ${summary.childCount} 名儿童，未处理反馈 ${summary.unresolvedFeedbackCount} 条，高风险会诊 ${summary.highRiskConsultationCount} 个，本周记录 ${total} 条，园长派单 ${openAssignments.length} 个待闭环。`,
        data: { summary, quality, trend, assignments },
        refs: openAssignments[0] ? assignmentRefs(openAssignments[0]) : undefined,
        links: [{ label: "打开运营报表", href: "/admin/agent?action=weekly-report" }],
      };
    }
    if (session.role === "教师") {
      const result = await service.getTeacherWorkbench();
      return {
        command: { ...command, status: "executed" },
        message: `当前班级可见儿童 ${result.visibleChildCount} 名，待读消息 ${result.pendingMessages} 条。`,
        data: result,
      };
    }
    const childId = readString(command.params.childId) || session.childIds?.[0];
    if (!childId) throw new ApiRouteError("invalid_request", "家长看板查询需要 childId。");
    const result = await service.getParentHome(childId);
    return {
      command: { ...command, status: "executed" },
      message: `已读取${result.child.name}的今日状态。`,
      data: result,
      refs: { childId },
    };
  }

  if (command.intent === "query_child_status") {
    const childId = readString(command.params.childId);
    const className = readString(command.params.className);
    if (className && !childId) {
      const children = (await service.listChildren()).filter((child) => child.className === className);
      const summaries = await Promise.all(children.map((child) => service.getParentHome(child.id)));
      return {
        command: { ...command, status: "executed" },
        message: `${className}共有 ${summaries.length} 名授权儿童，已读取今日状态。`,
        data: { className, children: summaries },
      };
    }
    const result = await service.getParentHome(childId);
    const section = readString(command.params.section, "today");
    return {
      command: { ...command, status: "executed" },
      message: summarizeChildStatus(result, section),
      data: result,
      refs: { childId: result.child.id },
    };
  }

  if (command.intent === "query_teacher_replies") {
    const childId = readString(command.params.childId) || session.childIds?.[0];
    if (!childId) throw new ApiRouteError("invalid_request", "查看老师回复需要 childId。");
    const messages = await service.listMessages({ childId });
    const replies = messages
      .filter((message) => message.senderRole === "teacher")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latest = replies[0];
    return {
      command: { ...command, status: "executed" },
      message: latest ? `最新老师回复：${latest.content}` : "当前没有老师回复。",
      data: { replies, latest },
      refs: latest ? { childId: latest.childId, messageId: latest.messageId } : { childId },
    };
  }

  if (command.intent === "query_parent_messages") {
    const childId = readString(command.params.childId);
    const messages = await service.listMessages(childId ? { childId } : {});
    const pending = messages.filter((message) => message.senderRole === "parent" && !message.readBy.includes(session.id));
    return {
      command: { ...command, status: "executed" },
      message: pending.length > 0 ? `当前还有 ${pending.length} 条未回复家长消息。` : "当前没有未回复家长消息。",
      data: { messages: pending, pendingCount: pending.length },
      refs: pending[0] ? { messageId: pending[0].messageId, childId: pending[0].childId } : undefined,
    };
  }

  if (command.intent === "query_today_tasks") {
    const childId = readString(command.params.childId) || (session.role === "家长" ? session.childIds?.[0] : "");
    const reminders = await service.listReminders(childId ? { childId } : {});
    const messages = await service.listMessages(childId ? { childId } : {});
    const consultations = await service.listConsultations(childId ? { childId } : {});
    const pending = reminders.filter((reminder) => reminder.status !== "done" && reminder.status !== "acknowledged");
    const pendingMessages = messages.filter((message) => message.senderRole === "parent" && !message.readBy.includes(session.id));
    const activeConsultations = consultations.filter(activeConsultation);
    const total = pending.length + pendingMessages.length + activeConsultations.length;
    return {
      command: { ...command, status: "executed" },
      message: total > 0 ? `今天还有 ${total} 项任务需要关注。` : "今天没有待处理任务。",
      data: {
        reminders,
        pendingReminders: pending,
        pendingMessages,
        activeConsultations,
        pendingCount: total,
      },
      refs: pending[0]
        ? { reminderId: pending[0].reminderId, childId: pending[0].childId ?? pending[0].targetId }
        : pendingMessages[0]
          ? { messageId: pendingMessages[0].messageId, childId: pendingMessages[0].childId }
          : activeConsultations[0]
            ? { consultationId: activeConsultations[0].consultationId, childId: activeConsultations[0].childId }
            : undefined,
    };
  }

  if (command.intent === "open_child_profile") {
    const child = await service.getChild(readString(command.params.childId));
    return {
      command: { ...command, status: "executed" },
      message: `已读取${child.name}的儿童档案。`,
      data: child,
      refs: { childId: child.id },
      deeplink: command.deeplink || `/children?childId=${encodeURIComponent(child.id)}`,
      links: [{ label: "打开儿童档案", href: `/children?childId=${encodeURIComponent(child.id)}` }],
    };
  }

  throw new ApiRouteError("invalid_request", "该语音命令没有可执行的核心执行器。");
}
