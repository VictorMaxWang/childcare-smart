import { describeAgeBandWeeklyGuidance } from "@/lib/age-band/policy";
import type {
  AiTrendPrediction,
  MemoryContextMeta,
  WeeklyReportPayload,
  WeeklyReportPrimaryAction,
  WeeklyReportResponse,
  WeeklyReportRole,
  WeeklyReportSection,
  WeeklyReportSectionId,
  WeeklyReportSectionItem,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";

const TEACHER_SECTION_IDS = [
  "weeklyAnomalies",
  "makeUpItems",
  "nextWeekObservationFocus",
] as const satisfies WeeklyReportSectionId[];

const ADMIN_SECTION_IDS = [
  "highRiskClosureRate",
  "parentFeedbackRate",
  "classIssueHeat",
  "nextWeekGovernanceFocus",
] as const satisfies WeeklyReportSectionId[];

const PARENT_SECTION_IDS = [
  "weeklyChanges",
  "topHomeAction",
  "feedbackNeeded",
] as const satisfies WeeklyReportSectionId[];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function uniqueTexts(values: string[], limit = 4): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function buildItem(label: string, detail: string): WeeklyReportSectionItem {
  return {
    label,
    detail,
  };
}

function buildItemsFromStrings(items: string[], fallbackLabel: string): WeeklyReportSectionItem[] {
  return uniqueTexts(items, 4).map((detail, index) =>
    buildItem(`${fallbackLabel}${index + 1}`, detail)
  );
}

function getParentWeeklyAgeBandGuidance(snapshot: WeeklyReportSnapshot) {
  return describeAgeBandWeeklyGuidance(snapshot.ageBandContext);
}

export function normalizeWeeklyReportRole(value: unknown): WeeklyReportRole | null {
  const raw = normalizeText(value);
  if (!raw) return null;

  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "teacher" || normalized.includes("teacher") || raw.includes("教师")) return "teacher";
  if (
    normalized === "admin" ||
    normalized.includes("admin") ||
    raw.includes("管理员") ||
    raw.includes("园长") ||
    raw.includes("机构")
  ) {
    return "admin";
  }
  if (normalized === "parent" || normalized.includes("parent") || raw.includes("家长") || raw.includes("家庭")) {
    return "parent";
  }
  return null;
}

export function resolveWeeklyReportRole(payload: WeeklyReportPayload | null | undefined): WeeklyReportRole | null {
  if (!payload) return null;
  return normalizeWeeklyReportRole(payload.role) ?? normalizeWeeklyReportRole(payload.snapshot?.role);
}

function buildTeacherSections(
  snapshot: WeeklyReportSnapshot,
  highlights: string[],
  risks: string[],
  nextWeekActions: string[]
): WeeklyReportSection[] {
  const anomalyItems = buildItemsFromStrings(
    risks.length > 0
      ? risks
      : [
          snapshot.overview.healthAbnormalCount > 0
            ? `本周累计 ${snapshot.overview.healthAbnormalCount} 条健康异常，需要在班级周复盘中点名。`
            : "本周未出现集中健康异常，但仍需保留晨检异常复盘位。",
          snapshot.topAttentionChildren[0]
            ? `${snapshot.topAttentionChildren[0].childName} 仍在重点观察名单中，建议保留周初复查。`
            : "",
        ],
    "异常项"
  );
  const makeUpItems = uniqueTexts(
    [
      snapshot.overview.pendingReviewCount > 0
        ? `优先补齐 ${snapshot.overview.pendingReviewCount} 项待复查记录，避免周初继续积压。`
        : "待复查项目已基本清空，下周继续保持补录节奏。",
      snapshot.overview.feedbackCount > 0
        ? `核对本周 ${snapshot.overview.feedbackCount} 条家园反馈是否已回填到班级记录。`
        : "家园反馈量偏少，下周固定一次班级反馈回流检查。",
      highlights[0] ?? "",
    ],
    3
  );
  const observationItems = buildItemsFromStrings(nextWeekActions, "观察点");

  return [
    {
      id: TEACHER_SECTION_IDS[0],
      title: "本周异常",
      summary:
        anomalyItems[0]?.detail ?? "本周无集中异常，但仍需保留对重点儿童的异常复盘入口。",
      items: anomalyItems,
    },
    {
      id: TEACHER_SECTION_IDS[1],
      title: "补录项",
      summary:
        makeUpItems[0] ?? "优先清空待复查与家园反馈的补录空档，保证下周判断基于连续记录。",
      items: buildItemsFromStrings(makeUpItems, "补录项"),
    },
    {
      id: TEACHER_SECTION_IDS[2],
      title: "下周重点观察",
      summary:
        observationItems[0]?.detail ?? "下周继续围绕晨检异常、待复查和家园同步做重点观察。",
      items:
        observationItems.length > 0
          ? observationItems
          : [buildItem("观察点1", "下周固定一次周初重点儿童复盘。")],
    },
  ];
}

function buildAdminSections(
  snapshot: WeeklyReportSnapshot,
  highlights: string[],
  risks: string[],
  nextWeekActions: string[]
): WeeklyReportSection[] {
  const closureRateSummary =
    snapshot.overview.pendingReviewCount > 0
      ? `当前仍有 ${snapshot.overview.pendingReviewCount} 项待复查，周初要先追闭环率再扩展新动作。`
      : "高风险闭环项已基本清空，可把治理重心转向连续追踪。";
  const feedbackRateSummary =
    snapshot.overview.feedbackCount > 0
      ? `本周已沉淀 ${snapshot.overview.feedbackCount} 条家园反馈，下一步要看是否形成有效回流。`
      : "家长反馈覆盖仍偏薄，需在下周治理动作中单独追踪。";
  const heatItems = uniqueTexts(
    [
      ...risks,
      ...snapshot.topAttentionChildren.slice(0, 2).map(
        (child) =>
          `${child.childName} 本周被点名 ${child.attentionCount} 次，可作为班级问题热力入口。`
      ),
      highlights[0] ?? "",
    ],
    4
  );

  return [
    {
      id: ADMIN_SECTION_IDS[0],
      title: "高风险闭环率",
      summary: closureRateSummary,
      items: buildItemsFromStrings(
        [
          closureRateSummary,
          snapshot.overview.healthAbnormalCount > 0
            ? `把 ${snapshot.overview.healthAbnormalCount} 条健康异常与待复查任务对齐，避免重复派单。`
            : "下周保留一次高风险复盘，确认无新增积压。",
        ],
        "闭环动作"
      ),
    },
    {
      id: ADMIN_SECTION_IDS[1],
      title: "家长反馈率",
      summary: feedbackRateSummary,
      items: buildItemsFromStrings(
        [
          feedbackRateSummary,
          nextWeekActions[1] ?? "把家长反馈完成率列为固定治理指标，并绑定责任人。",
        ],
        "反馈动作"
      ),
    },
    {
      id: ADMIN_SECTION_IDS[2],
      title: "班级问题热力",
      summary:
        heatItems[0] ?? "当前未见明显班级热区，但仍需保留重点班级热力回看。",
      items: buildItemsFromStrings(heatItems, "热区"),
    },
    {
      id: ADMIN_SECTION_IDS[3],
      title: "下周治理重点",
      summary: nextWeekActions[0] ?? "下周先收敛治理重点，再安排班级与家园闭环动作。",
      items: buildItemsFromStrings(nextWeekActions, "治理动作"),
    },
  ];
}

function buildParentSections(
  snapshot: WeeklyReportSnapshot,
  highlights: string[],
  risks: string[],
  nextWeekActions: string[],
  trendPrediction: AiTrendPrediction
): WeeklyReportSection[] {
  const ageBandGuidance = getParentWeeklyAgeBandGuidance(snapshot);
  const changeSummary =
    highlights[0] ??
    (ageBandGuidance
      ? `${ageBandGuidance.label}阶段更适合围绕${ageBandGuidance.focusText}看一周内的连续变化。`
      : `本周主要变化集中在出勤 ${snapshot.overview.attendanceRate}% 和重点观察项是否继续增加。`);
  const homeAction =
    nextWeekActions[0] ??
    (ageBandGuidance
      ? `下周先围绕${ageBandGuidance.actionText}安排一个稳定、容易复现的家庭动作。`
      : "下周只保留一个最重要的家庭配合动作，并在执行后回传结果。");
  const feedbackItems = uniqueTexts(
    [
      ageBandGuidance?.cautionText ?? "",
      risks[0] ?? "",
      snapshot.overview.feedbackCount > 0
        ? `请补充本周 ${snapshot.overview.feedbackCount} 次家园互动里最关键的一次家庭反馈。`
        : "请补充一次家庭侧观察，帮助老师判断本周变化是否持续。",
      ageBandGuidance
        ? `如果你观察到${ageBandGuidance.focusText}有变化，请尽量在当天回传给老师。`
        : "",
      trendPrediction === "up"
        ? "如果你观察到问题在加重，请在周初第一天直接反馈给老师。"
        : "如果你观察到问题已改善，也请回传给老师，方便调整下周重点。",
    ],
    3
  );

  return [
    {
      id: PARENT_SECTION_IDS[0],
      title: "本周变化",
      summary: changeSummary,
      items: buildItemsFromStrings(
        [
          changeSummary,
          highlights[1] ??
            (ageBandGuidance
              ? `${ageBandGuidance.label}阶段建议继续记录${ageBandGuidance.focusText}的连续表现。`
              : `本周共记录 ${snapshot.overview.mealRecordCount} 条饮食相关信息。`),
        ],
        "变化"
      ),
    },
    {
      id: PARENT_SECTION_IDS[1],
      title: "一个最重要家庭行动",
      summary: homeAction,
      items: buildItemsFromStrings([homeAction], "家庭行动"),
    },
    {
      id: PARENT_SECTION_IDS[2],
      title: "需反馈问题",
      summary:
        feedbackItems[0] ?? "请补充一次家庭反馈，帮助老师判断下周是否需要继续重点观察。",
      items: buildItemsFromStrings(feedbackItems, "反馈问题"),
    },
  ];
}

export function buildWeeklyReportSections(args: {
  role: WeeklyReportRole;
  snapshot: WeeklyReportSnapshot;
  highlights: string[];
  risks: string[];
  nextWeekActions: string[];
  trendPrediction: AiTrendPrediction;
}): WeeklyReportSection[] {
  const { role, snapshot, highlights, risks, nextWeekActions, trendPrediction } = args;

  if (role === "teacher") {
    return buildTeacherSections(snapshot, highlights, risks, nextWeekActions);
  }

  if (role === "admin") {
    return buildAdminSections(snapshot, highlights, risks, nextWeekActions);
  }

  return buildParentSections(snapshot, highlights, risks, nextWeekActions, trendPrediction);
}

export function buildWeeklyReportPrimaryAction(args: {
  role: WeeklyReportRole;
  nextWeekActions: string[];
  sections: WeeklyReportSection[];
}): WeeklyReportPrimaryAction | undefined {
  const actionText = args.nextWeekActions[0] ?? args.sections[args.sections.length - 1]?.items[0]?.detail;
  if (!actionText) return undefined;

  return {
    title:
      args.role === "teacher"
        ? "下周班级第一动作"
        : args.role === "admin"
          ? "下周治理第一动作"
          : "下周家庭第一动作",
    detail: actionText,
    ownerRole: args.role,
    dueWindow: args.role === "parent" ? "下周第一天反馈" : "下周优先处理",
  };
}

export function buildActionizedWeeklyReportResponse(args: {
  role: WeeklyReportRole;
  snapshot: WeeklyReportSnapshot;
  summary: string;
  highlights: string[];
  risks: string[];
  nextWeekActions: string[];
  trendPrediction: AiTrendPrediction;
  disclaimer: string;
  source: WeeklyReportResponse["source"];
  model?: string;
  continuityNotes?: string[];
  memoryMeta?: MemoryContextMeta;
  sections?: WeeklyReportSection[];
  primaryAction?: WeeklyReportPrimaryAction;
}): WeeklyReportResponse {
  const sections =
    args.sections && args.sections.length > 0
      ? args.sections
      : buildWeeklyReportSections({
          role: args.role,
          snapshot: args.snapshot,
          highlights: args.highlights,
          risks: args.risks,
          nextWeekActions: args.nextWeekActions,
          trendPrediction: args.trendPrediction,
        });

  return {
    schemaVersion: "v2-actionized",
    role: args.role,
    summary: args.summary,
    highlights: args.highlights,
    risks: args.risks,
    nextWeekActions: args.nextWeekActions,
    trendPrediction: args.trendPrediction,
    sections,
    primaryAction:
      args.primaryAction ??
      buildWeeklyReportPrimaryAction({
        role: args.role,
        nextWeekActions: args.nextWeekActions,
        sections,
      }),
    continuityNotes: args.continuityNotes,
    memoryMeta: args.memoryMeta,
    disclaimer: args.disclaimer,
    source: args.source,
    model: args.model,
  };
}
