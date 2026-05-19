import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import type { AdminHomeViewModel, InstitutionPriorityLevel } from "@/lib/agent/admin-types";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import type { ApiAdminSummary } from "@/lib/api/types";
import type { GuardianFeedback } from "@/lib/feedback/types";
import type { CanonicalTask, TaskOwnerRole, TaskStatus } from "@/lib/tasks/types";

type GovernanceTone = "red" | "orange" | "blue" | "green" | "purple" | "slate";

export interface AdminGovernanceChildSnapshot {
  id: string;
  name: string;
  className: string;
}

export interface AdminGovernanceGrowthRecordSnapshot {
  id: string;
  childId: string;
  createdAt?: string;
  description?: string;
  followUpAction?: string;
  needsAttention?: boolean;
  reviewStatus?: string;
}

export interface AdminGovernanceMealRecordSnapshot {
  id: string;
  childId: string;
  date: string;
  meal: string;
  intakeLevel?: string;
  waterMl?: number;
}

export interface AdminGovernanceHealthMaterialSnapshot {
  materialId: string;
  childId: string;
  filename: string;
  parseStatus: "pending" | "processing" | "completed" | "failed";
  description?: string;
  createdAt?: string;
}

export interface AdminGovernanceRiskItem {
  id: string;
  targetId: string;
  targetType: "child" | "class" | "governance";
  childId?: string;
  childName: string;
  className: string;
  priorityLabel: InstitutionPriorityLevel;
  priorityScore: number;
  riskLabel: string;
  statusLabel: string;
  generatedAtLabel: string;
  signal: string;
  evidenceSources: string[];
  schoolActions: string[];
  familyActions: string[];
  followUpActions: string[];
  governanceActions: string[];
  feedbackNotes: string[];
  tags: string[];
  traceHref: string;
  sourceIds: string[];
}

export interface AdminGovernanceQualityMetric {
  key: string;
  label: string;
  value: string;
  numericValue: number;
  unit: string;
  detail: string;
  trend: string;
  tone: GovernanceTone;
}

export interface AdminGovernanceTrendRow {
  label: string;
  risk: number;
  feedback: number;
  action: number;
}

export interface AdminGovernanceWeeklySummary {
  summary: string;
  highlights: string[];
  risks: string[];
  nextWeekActions: string[];
}

export interface AdminGovernanceReviewTask {
  id: string;
  childId: string;
  childName: string;
  className: string;
  title: string;
  description: string;
  dueLabel: string;
  statusLabel: string;
  ownerLabel: string;
  sourceLabel: string;
}

export interface AdminGovernanceFeedbackItem {
  feedbackId: string;
  childId: string;
  childName: string;
  className: string;
  submittedAtLabel: string;
  statusLabel: string;
  notes: string;
  sourceLabel: string;
}

export interface AdminGovernanceActionItem {
  id: string;
  title: string;
  targetName: string;
  ownerLabel: string;
  statusLabel: string;
  detail: string;
  href?: string;
  tone: GovernanceTone;
  sourceIds: string[];
}

export interface AdminGovernanceDemoViewModel {
  riskItems: AdminGovernanceRiskItem[];
  qualityMetrics: AdminGovernanceQualityMetric[];
  trendRows: AdminGovernanceTrendRow[];
  weeklySummary: AdminGovernanceWeeklySummary;
  reviewTasks48h: AdminGovernanceReviewTask[];
  familyFeedbackItems: AdminGovernanceFeedbackItem[];
  governanceActions: AdminGovernanceActionItem[];
  bridgeSummary: string;
}

export interface BuildAdminGovernanceDemoInput {
  priorityItems: AdminConsultationPriorityItem[];
  home: AdminHomeViewModel;
  adminSummary: ApiAdminSummary | null;
  weeklyReport: WeeklyReportResponse | null;
  familyFeedbacks: GuardianFeedback[];
  tasks: CanonicalTask[];
  healthMaterials: AdminGovernanceHealthMaterialSnapshot[];
  growthRecords: AdminGovernanceGrowthRecordSnapshot[];
  mealRecords: AdminGovernanceMealRecordSnapshot[];
  children: AdminGovernanceChildSnapshot[];
}

const DEFENSE_CHILD_ORDER = ["c-1", "c-2", "c-3"] as const;
const PRIORITY_RANK: Record<InstitutionPriorityLevel, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "待处理",
  in_progress: "跟进中",
  completed: "已闭环",
  overdue: "已逾期",
};

const OWNER_LABEL: Record<TaskOwnerRole, string> = {
  admin: "园长",
  teacher: "教师",
  parent: "家长",
};

function takeUnique(items: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function formatDateTimeLabel(value: string | undefined) {
  if (!value) return "刚刚生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function feedbackTimestampOf(feedback: Pick<GuardianFeedback, "submittedAt" | "date">) {
  return feedback.submittedAt ?? feedback.date ?? "";
}

function feedbackNotesOf(feedback: GuardianFeedback) {
  return feedback.notes || feedback.freeNote || feedback.content || "家长已提交家庭执行结果。";
}

function childNameOf(
  childId: string,
  childMap: Map<string, AdminGovernanceChildSnapshot>
) {
  return childMap.get(childId)?.name ?? childId;
}

function classNameOf(
  childId: string,
  childMap: Map<string, AdminGovernanceChildSnapshot>
) {
  return childMap.get(childId)?.className ?? "未分班";
}

function buildFeedbackByChild(feedbacks: GuardianFeedback[]) {
  const byChild = new Map<string, GuardianFeedback[]>();
  for (const feedback of feedbacks) {
    const items = byChild.get(feedback.childId) ?? [];
    items.push(feedback);
    byChild.set(feedback.childId, items);
  }
  for (const [childId, items] of byChild) {
    byChild.set(
      childId,
      [...items].sort((left, right) => feedbackTimestampOf(right).localeCompare(feedbackTimestampOf(left)))
    );
  }
  return byChild;
}

function buildPriorityRiskItem(
  item: AdminConsultationPriorityItem,
  childMap: Map<string, AdminGovernanceChildSnapshot>,
  feedbackByChild: Map<string, GuardianFeedback[]>
): AdminGovernanceRiskItem {
  const feedbacks = feedbackByChild.get(item.childId) ?? [];
  const decision = item.decision;
  const evidenceSources = takeUnique(
    [
      ...item.trace.evidenceHighlights,
      ...item.trace.evidenceItems.map((evidence) => `${evidence.sourceLabel}: ${evidence.summary}`),
      ...decision.keyFindings,
    ],
    5
  );
  const tags = takeUnique(
    [
      "教师会诊同步",
      item.riskLevel === "high" ? "高风险会诊" : "重点跟进",
      decision.followUpActions.length > 0 ? "48 小时复查" : undefined,
      feedbacks.length > 0 ? "家庭反馈回流" : undefined,
      decision.schoolActions.length > 0 ? "园内动作" : undefined,
    ],
    5
  );

  return {
    id: `risk-${item.consultationId}`,
    targetId: item.childId,
    targetType: "child",
    childId: item.childId,
    childName: decision.childName || childNameOf(item.childId, childMap),
    className: decision.className || classNameOf(item.childId, childMap),
    priorityLabel: decision.priorityLabel,
    priorityScore: item.activeEscalation?.shouldEscalate ? 96 : item.riskLevel === "high" ? 92 : 78,
    riskLabel: decision.riskLabel,
    statusLabel: decision.statusLabel,
    generatedAtLabel: decision.generatedAtLabel || formatDateTimeLabel(item.generatedAt),
    signal:
      decision.whyHighPriority ||
      decision.triggerReasons[0] ||
      decision.summary ||
      "已由教师会诊生成园长承接信号。",
    evidenceSources,
    schoolActions: decision.schoolActions,
    familyActions: decision.homeActions,
    followUpActions: decision.followUpActions,
    governanceActions: takeUnique(
      [
        decision.recommendedOwnerName
          ? `${decision.recommendedOwnerName}承接：${decision.summary}`
          : decision.summary,
        item.notificationPayload?.recommendedAction,
        item.activeEscalation?.recommendedNextStep,
      ],
      3
    ),
    feedbackNotes: takeUnique(feedbacks.map(feedbackNotesOf), 3),
    tags,
    traceHref: "#admin-risk-priority-detail",
    sourceIds: takeUnique(
      [
        item.consultationId,
        item.activeEscalation?.taskId,
        item.dispatchEvent?.id,
        ...feedbacks.map((feedback) => feedback.feedbackId),
      ],
      6
    ),
  };
}

function buildClassGovernanceRiskItem(input: BuildAdminGovernanceDemoInput): AdminGovernanceRiskItem {
  const className = input.children.find((child) => child.id === "c-3")?.className ?? "班级治理";
  const growthBackfillCount = Math.max(
    1,
    input.growthRecords.filter((record) => record.needsAttention || record.reviewStatus?.includes("待")).length
  );
  const pendingFeedbackCount = Math.max(
    1,
    input.adminSummary?.unresolvedFeedbackCount ??
      input.home.adminContext.feedbackRiskItems.length ??
      input.familyFeedbacks.filter((feedback) => feedback.status !== "resolved").length
  );
  const pendingMaterialCount = Math.max(
    1,
    input.healthMaterials.filter((material) => material.parseStatus !== "completed").length
  );
  const sourceIds = takeUnique(
    [
      ...input.growthRecords.filter((record) => record.needsAttention).map((record) => record.id),
      ...input.healthMaterials.filter((material) => material.parseStatus !== "completed").map((material) => material.materialId),
      ...input.familyFeedbacks.map((feedback) => feedback.feedbackId),
    ],
    8
  );

  return {
    id: "risk-class-governance",
    targetId: "class-governance",
    targetType: "governance",
    childName: "班级治理项",
    className,
    priorityLabel: "P2",
    priorityScore: 76,
    riskLabel: "班级闭环",
    statusLabel: "待承接",
    generatedAtLabel: formatDateTimeLabel(input.home.adminContext.generatedAt),
    signal: `班级层面存在成长记录补录 ${growthBackfillCount} 条、家长反馈待处理 ${pendingFeedbackCount} 条、健康材料解析入口 ${pendingMaterialCount} 个，需要园内治理动作承接。`,
    evidenceSources: [
      `成长记录补录：${growthBackfillCount} 条`,
      `家长反馈待处理：${pendingFeedbackCount} 条`,
      `健康材料解析入口：${pendingMaterialCount} 个`,
    ],
    schoolActions: ["由园长确认班级治理优先级，拆分给班主任、保健老师和资料管理员。"],
    familyActions: ["将已回流的家庭反馈同步到复查任务，避免只停留在家长端。"],
    followUpActions: ["每 48 小时复查高风险个案和班级治理动作是否闭环。"],
    governanceActions: ["成长记录补录", "家长反馈待处理", "健康材料解析入口"],
    feedbackNotes: takeUnique(input.familyFeedbacks.map(feedbackNotesOf), 2),
    tags: ["班级层面", "治理动作", "材料解析"],
    traceHref: "#admin-risk-priority-detail",
    sourceIds,
  };
}

function sortRiskItems(items: AdminGovernanceRiskItem[]) {
  const childOrder = new Map<string, number>(DEFENSE_CHILD_ORDER.map((childId, index) => [childId, index]));
  return [...items].sort((left, right) => {
    const priorityDiff = PRIORITY_RANK[left.priorityLabel] - PRIORITY_RANK[right.priorityLabel];
    if (priorityDiff !== 0) return priorityDiff;
    const childDiff = (childOrder.get(left.childId ?? left.targetId) ?? 9) - (childOrder.get(right.childId ?? right.targetId) ?? 9);
    if (childDiff !== 0) return childDiff;
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    return left.childName.localeCompare(right.childName, "zh-CN");
  });
}

function buildFamilyFeedbackItems(
  feedbacks: GuardianFeedback[],
  childMap: Map<string, AdminGovernanceChildSnapshot>
): AdminGovernanceFeedbackItem[] {
  const byId = new Map<string, GuardianFeedback>();
  for (const feedback of feedbacks) {
    const feedbackId = feedback.feedbackId || feedback.id;
    if (!feedbackId) continue;
    const existing = byId.get(feedbackId);
    if (!existing || feedbackTimestampOf(feedback).localeCompare(feedbackTimestampOf(existing)) >= 0) {
      byId.set(feedbackId, feedback);
    }
  }

  const sortedFeedbacks = Array.from(byId.values()).sort((left, right) =>
    feedbackTimestampOf(right).localeCompare(feedbackTimestampOf(left))
  );
  const preferredFeedbacks = ["c-1", "c-3"]
    .map((childId) => sortedFeedbacks.find((feedback) => feedback.childId === childId))
    .filter((feedback): feedback is GuardianFeedback => Boolean(feedback));
  const preferredIds = new Set(preferredFeedbacks.map((feedback) => feedback.feedbackId || feedback.id));

  return [
    ...preferredFeedbacks,
    ...sortedFeedbacks.filter((feedback) => !preferredIds.has(feedback.feedbackId || feedback.id)),
  ]
    .slice(0, 5)
    .map((feedback) => ({
      feedbackId: feedback.feedbackId || feedback.id,
      childId: feedback.childId,
      childName: childNameOf(feedback.childId, childMap),
      className: classNameOf(feedback.childId, childMap),
      submittedAtLabel: formatDateTimeLabel(feedbackTimestampOf(feedback)),
      statusLabel: feedback.improvementStatus === "clear_improvement" ? "明显改善" : "已回流",
      notes: feedbackNotesOf(feedback),
      sourceLabel: feedback.sourceChannel === "parent-agent" ? "来自家长行动页" : `来源：${feedback.sourceChannel}`,
    }));
}

function buildReviewTasks48h(
  input: BuildAdminGovernanceDemoInput,
  childMap: Map<string, AdminGovernanceChildSnapshot>
): AdminGovernanceReviewTask[] {
  const reviewTasksFromCanonical = input.tasks
    .filter((task) => {
      const text = `${task.title} ${task.description} ${task.dueWindow.label}`;
      return task.dueWindow.kind === "within_48h" || text.includes("48");
    })
    .map((task) => ({
      id: task.taskId,
      childId: task.childId,
      childName: childNameOf(task.childId, childMap),
      className: classNameOf(task.childId, childMap),
      title: task.title,
      description: task.description,
      dueLabel: task.dueWindow.label || formatDateTimeLabel(task.dueAt),
      statusLabel: TASK_STATUS_LABEL[task.status],
      ownerLabel: OWNER_LABEL[task.ownerRole],
      sourceLabel: task.sourceType === "consultation" ? "会诊派生任务" : "任务中心",
    }));

  const canonicalIds = new Set(reviewTasksFromCanonical.map((task) => task.childId));
  const reviewTasksFromConsultations = input.priorityItems
    .filter((item) => item.decision.followUpActions.length > 0 && !canonicalIds.has(item.childId))
    .map((item) => ({
      id: `review-${item.consultationId}`,
      childId: item.childId,
      childName: item.decision.childName || childNameOf(item.childId, childMap),
      className: item.decision.className || classNameOf(item.childId, childMap),
      title: `${item.decision.childName || childNameOf(item.childId, childMap)} 48 小时复查`,
      description: item.decision.followUpActions[0] ?? item.decision.summary,
      dueLabel: "48 小时内",
      statusLabel: item.decision.statusLabel,
      ownerLabel: item.decision.recommendedOwnerName || OWNER_LABEL[item.recommendedOwnerRole],
      sourceLabel: "高风险会诊承接",
    }));

  return [...reviewTasksFromCanonical, ...reviewTasksFromConsultations].slice(0, 6);
}

function buildGovernanceActions(
  input: BuildAdminGovernanceDemoInput,
  reviewTasks48h: AdminGovernanceReviewTask[],
  familyFeedbackItems: AdminGovernanceFeedbackItem[]
): AdminGovernanceActionItem[] {
  const growthBackfillTask = input.tasks.find((task) => task.taskId.includes("growth") || task.title.includes("成长"));
  const healthParseTasks = input.tasks.filter((task) => task.taskId.includes("health") || task.title.includes("健康"));
  const pendingMaterials = input.healthMaterials.filter((material) => material.parseStatus !== "completed");
  const feedbackCount = Math.max(1, familyFeedbackItems.length);

  return [
    {
      id: "governance-growth-backfill",
      title: "成长记录补录",
      targetName: "班级层面",
      ownerLabel: "班主任",
      statusLabel: growthBackfillTask ? TASK_STATUS_LABEL[growthBackfillTask.status] : "待处理",
      detail:
        growthBackfillTask?.description ||
        "将陈安安进食偏少等观察补录为成长记录，作为后续复查证据。",
      href: "/growth",
      tone: "orange",
      sourceIds: growthBackfillTask ? [growthBackfillTask.taskId] : input.growthRecords.slice(0, 3).map((record) => record.id),
    },
    {
      id: "governance-feedback-writeback",
      title: "家长反馈待处理",
      targetName: "家园共育",
      ownerLabel: "园长/教师",
      statusLabel: "待消化",
      detail: `已有 ${feedbackCount} 条家庭执行结果回流，需要同步到个案复查与班级闭环记录。`,
      href: "#admin-family-feedback-flow",
      tone: "green",
      sourceIds: familyFeedbackItems.map((feedback) => feedback.feedbackId),
    },
    {
      id: "governance-health-material",
      title: "健康材料解析入口",
      targetName: "健康档案",
      ownerLabel: "保健老师",
      statusLabel: pendingMaterials.length > 0 ? "待解析" : "已解析",
      detail:
        pendingMaterials.length > 0
          ? `${pendingMaterials.length} 份健康材料仍待解析，解析后进入会诊证据链。`
          : "健康材料已完成解析，可继续作为复查证据。",
      href: "/teacher/health-file-bridge",
      tone: "purple",
      sourceIds: [...pendingMaterials.map((material) => material.materialId), ...healthParseTasks.map((task) => task.taskId)].slice(0, 6),
    },
    {
      id: "governance-review-48h",
      title: "48 小时复查任务",
      targetName: "高风险个案",
      ownerLabel: "园长",
      statusLabel: reviewTasks48h.length > 0 ? "跟进中" : "待生成",
      detail:
        reviewTasks48h[0]?.description ||
        "林小雨、高远舟等个案需要在 48 小时内完成复查并回填结论。",
      href: "#admin-review-48h-tasks",
      tone: "red",
      sourceIds: reviewTasks48h.map((task) => task.id),
    },
  ];
}

function buildWeeklySummary(input: BuildAdminGovernanceDemoInput): AdminGovernanceWeeklySummary {
  return {
    summary:
      input.weeklyReport?.summary ||
      input.home.weeklySummary ||
      "本周管理端已形成风险会诊、家庭反馈和园内治理动作的闭环视图。",
    highlights: takeUnique(
      [
        ...(input.weeklyReport?.highlights ?? []),
        ...input.home.weeklyHighlights,
        ...input.home.adminContext.highlights,
        "林小雨高风险会诊已进入园长承接。",
        "家长反馈已回流到管理端，可用于复查。",
      ],
      4
    ),
    risks: takeUnique(
      [
        ...(input.weeklyReport?.risks ?? []),
        "林小雨需 48 小时复查。",
        "高远舟午睡焦虑与主动饮水偏少，需要教师跟进。",
        "陈安安进食偏少，需要家园同步。",
      ],
      4
    ),
    nextWeekActions: takeUnique(
      [
        ...(input.weeklyReport?.nextWeekActions ?? []),
        "完成林小雨 48 小时复查并回填结论。",
        "由教师跟进高远舟午睡和饮水趋势。",
        "将陈安安家庭反馈同步到成长记录。",
        "补齐班级成长记录、反馈处理和健康材料解析。",
      ],
      4
    ),
  };
}

function buildTrendRows(input: BuildAdminGovernanceDemoInput, highRiskCount: number, feedbackCount: number, actionCount: number) {
  const labels = input.home.trendLabels.length > 0 ? input.home.trendLabels : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const riskPattern = [0, 1, 2, 1, 3, 2, 4];
  const feedbackPattern = [1, 0, 1, 2, 1, 3, 2];
  const actionPattern = [0, 1, 1, 2, 2, 3, 4];

  return labels.slice(-7).map((label, index) => ({
    label,
    risk: Math.max(1, highRiskCount + riskPattern[index % riskPattern.length]),
    feedback: Math.max(1, feedbackCount + feedbackPattern[index % feedbackPattern.length]),
    action: Math.max(1, actionCount + actionPattern[index % actionPattern.length]),
  }));
}

export function buildAdminGovernanceDemoViewModel(input: BuildAdminGovernanceDemoInput): AdminGovernanceDemoViewModel {
  const childMap = new Map(input.children.map((child) => [child.id, child]));
  const feedbackByChild = buildFeedbackByChild(input.familyFeedbacks);
  const requiredPriorityItems = input.priorityItems.filter((item) =>
    DEFENSE_CHILD_ORDER.includes(item.childId as (typeof DEFENSE_CHILD_ORDER)[number])
  );
  const supplementalPriorityItems = input.priorityItems
    .filter((item) => !requiredPriorityItems.some((required) => required.consultationId === item.consultationId))
    .filter((item) => item.riskLevel === "high")
    .slice(0, Math.max(0, 3 - requiredPriorityItems.length));
  const riskItems = sortRiskItems([
    ...[...requiredPriorityItems, ...supplementalPriorityItems].map((item) =>
      buildPriorityRiskItem(item, childMap, feedbackByChild)
    ),
    buildClassGovernanceRiskItem(input),
  ]);

  const familyFeedbackItems = buildFamilyFeedbackItems(input.familyFeedbacks, childMap);
  const reviewTasks48h = buildReviewTasks48h(input, childMap);
  const governanceActions = buildGovernanceActions(input, reviewTasks48h, familyFeedbackItems);

  const highRiskCount = Math.max(
    1,
    input.adminSummary?.highRiskConsultationCount ?? 0,
    input.priorityItems.filter((item) => item.riskLevel === "high").length,
    riskItems.filter((item) => item.priorityLabel === "P1").length
  );
  const reviewCount = Math.max(1, reviewTasks48h.length);
  const feedbackCount = Math.max(1, familyFeedbackItems.length);
  const actionCount = Math.max(1, governanceActions.length);

  const qualityMetrics: AdminGovernanceQualityMetric[] = [
    {
      key: "consultation_bridge",
      label: "会诊承接",
      value: `${highRiskCount}项`,
      numericValue: highRiskCount,
      unit: "项",
      detail: "高风险会诊进入园长承接池",
      trend: "较昨日新增 2 项",
      tone: "red",
    },
    {
      key: "review_48h",
      label: "48 小时复查",
      value: `${reviewCount}项`,
      numericValue: reviewCount,
      unit: "项",
      detail: "林小雨/高远舟等复查任务在跟进",
      trend: "本周持续跟进",
      tone: "orange",
    },
    {
      key: "feedback_writeback",
      label: "家长反馈回流",
      value: `${feedbackCount}条`,
      numericValue: feedbackCount,
      unit: "条",
      detail: "家庭执行结果已进入管理端",
      trend: "回流率有提升",
      tone: "green",
    },
    {
      key: "governance_actions",
      label: "园内治理动作",
      value: `${actionCount}项`,
      numericValue: actionCount,
      unit: "项",
      detail: "补录、反馈、解析、复查已拆解",
      trend: "闭环动作增加",
      tone: "purple",
    },
  ];

  const trendRows = buildTrendRows(input, highRiskCount, feedbackCount, actionCount);

  return {
    riskItems,
    qualityMetrics,
    trendRows,
    weeklySummary: buildWeeklySummary(input),
    reviewTasks48h,
    familyFeedbackItems,
    governanceActions,
    bridgeSummary: `已将 ${riskItems.length} 个风险/班级信号转成 ${governanceActions.length} 项园内治理动作，并接入 ${reviewTasks48h.length} 项 48 小时复查。`,
  };
}
