import type {
  AiRiskLevel,
  ConsultationFinding,
  ConsultationParticipant,
  ConsultationResult,
  ConsultationTriggerType,
  DirectorDecisionCard,
  HighRiskAgentView,
} from "@/lib/ai/types";
import { getLocalToday, shiftLocalDate } from "@/lib/date";

type DemoConsultationSeed = {
  consultationId: string;
  childId: string;
  childName: string;
  className: string;
  daysAgo: number;
  generatedHour: number;
  generatedMinute: number;
  recommendedHour: number;
  recommendedMinute: number;
  recommendedDaysFromNow: number;
  riskLevel: AiRiskLevel;
  status: DirectorDecisionCard["status"];
  shouldEscalateToAdmin: boolean;
  ownerRole: "teacher" | "parent" | "admin";
  ownerName: string;
  triggerReason: string;
  summary: string;
  schoolActions: string[];
  homeActions: string[];
  followUp48h: string[];
  observationPoints: string[];
  keyFindings: string[];
  healthSignal: string;
  mealSignal: string;
  familySignal: string;
  schoolSignal: string;
};

type DemoFeedItem = {
  consultationId: string;
  childId: string;
  generatedAt: string;
  riskLevel: AiRiskLevel;
  triggerReason: string;
  triggerReasons: string[];
  summary: string;
  directorDecisionCard: DirectorDecisionCard;
  status: DirectorDecisionCard["status"];
  ownerName: string;
  ownerRole: "teacher" | "parent" | "admin";
  dueAt: string;
  whyHighPriority: string;
  todayInSchoolActions: string[];
  tonightAtHomeActions: string[];
  followUp48h: string[];
  syncTargets: string[];
  shouldEscalateToAdmin: boolean;
};

const DEMO_CONSULTATION_SEEDS: DemoConsultationSeed[] = [
  {
    consultationId: "consultation-c-15",
    childId: "c-15",
    childName: "马若曦",
    className: "向阳班",
    daysAgo: 0,
    generatedHour: 17,
    generatedMinute: 20,
    recommendedHour: 10,
    recommendedMinute: 30,
    recommendedDaysFromNow: 1,
    riskLevel: "high",
    status: "pending",
    shouldEscalateToAdmin: true,
    ownerRole: "teacher",
    ownerName: "向阳班主班老师",
    triggerReason: "连续饮水偏低并叠加替代餐管理，已经能支撑餐食趋势与 follow-up 闭环。",
    summary: "这条样本适合用来讲饮水提醒、替代餐记录、家庭晚间补水与周报趋势如何串成一条线。",
    schoolActions: [
      "今日园内继续保留半小时饮水提醒，并记录主动饮水量和提醒后补水量。",
      "午后加餐后补一张水杯刻度示意图，供家长晚间对照反馈。",
    ],
    homeActions: [
      "今晚晚饭后完成一杯温水补水，并反馈孩子是主动喝还是需要提醒。",
      "睡前补一条是否仍有嘴唇干燥、拒水或明显口渴表现。",
    ],
    followUp48h: ["48 小时内对照园内与家庭补水记录，确认是否回到稳定区间。"],
    observationPoints: ["主动饮水次数", "午后补水量", "晚间补水配合度"],
    keyFindings: ["补水问题已连续多天出现", "替代餐管理和饮水提醒必须一起看"],
    healthSignal: "晨检无发热，但口唇偏干，提醒后才愿意补水。",
    mealSignal: "午餐完成度尚可，水杯刻度下降速度明显慢于同龄样本。",
    familySignal: "家长反馈回家后也需要频繁提醒才会继续喝水。",
    schoolSignal: "下午两点后的主动饮水明显放缓，适合纳入 weekly trend。 ",
  },
  {
    consultationId: "consultation-c-14",
    childId: "c-14",
    childName: "郑浩宇",
    className: "晨曦班",
    daysAgo: 1,
    generatedHour: 16,
    generatedMinute: 50,
    recommendedHour: 11,
    recommendedMinute: 0,
    recommendedDaysFromNow: 1,
    riskLevel: "high",
    status: "in_progress",
    shouldEscalateToAdmin: true,
    ownerRole: "teacher",
    ownerName: "晨曦班主班老师",
    triggerReason: "午睡入睡困难和晚间作息波动没有稳定改善，白天疲惫与易躁重复出现。",
    summary: "这条样本适合讲“连续几天观察后才升级 review”，不是一次性异常，也不是夸大的诊断结论。",
    schoolActions: [
      "今日园内继续保留固定白噪音和低刺激床位，并记录午睡入睡时长。",
      "午休后补一条醒后情绪与精力状态记录，避免只看睡了多久。",
    ],
    homeActions: [
      "今晚 21:00 前关闭屏幕，执行固定洗漱-故事-关灯顺序。",
      "若再次晚睡，请直接反馈卡在入睡前的哪个环节。",
    ],
    followUp48h: ["48 小时复查时同时回看午睡时长、醒后情绪和晚间入睡时间。"],
    observationPoints: ["午睡入睡时长", "醒后情绪", "晚间上床时间"],
    keyFindings: ["睡眠波动正在影响白天情绪稳定", "需要家园两端使用同一套作息节奏"],
    healthSignal: "晨间持续困倦，上半天活动时精力不足。",
    mealSignal: "进餐完成度尚可，但疲惫时进食速度明显变慢。",
    familySignal: "家长反馈前一晚再次超过 22:30 才入睡。",
    schoolSignal: "午睡超过 25 分钟仍未入睡，醒后情绪恢复慢。",
  },
  {
    consultationId: "consultation-c-8",
    childId: "c-8",
    childName: "黄嘉豪",
    className: "向阳班",
    daysAgo: 1,
    generatedHour: 15,
    generatedMinute: 40,
    recommendedHour: 9,
    recommendedMinute: 30,
    recommendedDaysFromNow: 1,
    riskLevel: "medium",
    status: "pending",
    shouldEscalateToAdmin: true,
    ownerRole: "teacher",
    ownerName: "向阳班配班老师",
    triggerReason: "入园分离焦虑和午睡前黏附行为仍有反复，但已经出现改善苗头。",
    summary: "这条样本适合 Teacher 端讲连续观察，也适合 Admin 端讲为什么仍要保留一条 48 小时 follow-up。",
    schoolActions: [
      "维持固定接园话术和安抚玩具，不临时更换照护人。",
      "离园前补一条午睡前哭闹时长和恢复方式，避免只写“已安抚”。",
    ],
    homeActions: [
      "今晚只做一轮短时分离练习，不额外加难度。",
      "完成后反馈孩子是更快平静还是再次明显黏附家长。",
    ],
    followUp48h: ["48 小时内回看入园分离时长与家庭短时分离练习反应是否同步缩短。"],
    observationPoints: ["入园哭闹时长", "午睡前黏附程度", "家庭短时分离练习反应"],
    keyFindings: ["分离焦虑有改善但不稳定", "家庭反馈缺口会直接影响判断"],
    healthSignal: "晨检体温正常，但午睡前黏附老师更明显。",
    mealSignal: "饮食完成度基本正常，紧张时会短暂停下勺子。",
    familySignal: "最近两晚分离练习的反馈不完整，影响闭环判断。",
    schoolSignal: "午睡前哭闹时长虽下降，但仍需要老师近身陪伴。",
  },
  {
    consultationId: "consultation-c-11",
    childId: "c-11",
    childName: "周诗雨",
    className: "向阳班",
    daysAgo: 2,
    generatedHour: 16,
    generatedMinute: 10,
    recommendedHour: 10,
    recommendedMinute: 0,
    recommendedDaysFromNow: 1,
    riskLevel: "medium",
    status: "pending",
    shouldEscalateToAdmin: true,
    ownerRole: "teacher",
    ownerName: "向阳班主班老师",
    triggerReason: "偏食与蔬果摄入低已经形成连续样本，适合展示餐食记录如何支撑家园协同。",
    summary: "这条样本不是为了制造高风险，而是为了让 Teacher / Admin / weekly-report 都有一条能讲餐食结构改善的案例。",
    schoolActions: [
      "今日继续用小份尝试法引导蔬菜入口，并记录第一口接受方式。",
      "午餐后补一条“熟悉食物 vs 新食物”完成度对照，支撑周报趋势解释。",
    ],
    homeActions: [
      "今晚只保留一种熟悉主食，再搭配一小份蔬菜，不同时增加难度。",
      "反馈孩子是直接拒绝、尝试一口，还是愿意在熟悉食物后继续入口。",
    ],
    followUp48h: ["48 小时内回看蔬菜尝试量和家庭执行难度，决定是否升级更细的饮食引导。"],
    observationPoints: ["第一口接受方式", "蔬果尝试量", "家庭执行阻力"],
    keyFindings: ["偏食问题已经有连续记录", "比起高风险，更适合讲趋势和家园协同"],
    healthSignal: "晨检状态稳定，但午餐前对新蔬菜仍明显犹豫。",
    mealSignal: "熟悉主食接受度高，新蔬菜入口量持续偏低。",
    familySignal: "家长愿意配合，但希望老师给出更具体的尝试节奏。",
    schoolSignal: "园内记录已能区分“拒绝”“尝试一口”“继续入口”三种表现。",
  },
  {
    consultationId: "consultation-c-1",
    childId: "c-1",
    childName: "林小雨",
    className: "向阳班",
    daysAgo: 0,
    generatedHour: 14,
    generatedMinute: 35,
    recommendedHour: 9,
    recommendedMinute: 20,
    recommendedDaysFromNow: 1,
    riskLevel: "low",
    status: "in_progress",
    shouldEscalateToAdmin: false,
    ownerRole: "parent",
    ownerName: "林妈妈",
    triggerReason: "午睡前情绪波动和晚间作息反馈形成了一个轻量但完整的家园闭环样本。",
    summary: "这条样本专门服务 Parent 端录屏，让 `/parent` 和 `/parent/agent` 不只是有功能，还有最新上下文可讲。",
    schoolActions: [
      "今日园内继续保留午睡前固定安抚提示，并记录平静下来所需时长。",
      "离园前补一条老师观察到的正向变化，帮助家长晚间延续同一节奏。",
    ],
    homeActions: [
      "今晚继续使用同一套睡前安抚顺序，只观察情绪是否更快稳定。",
      "睡前补一条孩子对故事、关灯和上床顺序的接受情况。",
    ],
    followUp48h: ["48 小时内回看情绪稳定时长和晚间作息是否同步改善。"],
    observationPoints: ["午睡前安抚时长", "晚间入睡顺序配合度", "第二天入园情绪"],
    keyFindings: ["轻量 follow-up 也能形成完整闭环", "适合 Parent 端稳定录屏讲述"],
    healthSignal: "晨检正常，午睡前情绪波动较上周更快恢复。",
    mealSignal: "餐食完成度稳定，午餐后情绪切换比之前顺畅。",
    familySignal: "家长近两晚都能按固定顺序执行，愿意继续补反馈。",
    schoolSignal: "老师已能观察到午睡前情绪恢复时长缩短。",
  },
];

function buildRelativeIso(daysAgo: number, hour: number, minute: number) {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  now.setHours(hour, minute, 0, 0);
  return now.toISOString();
}

function buildRelativeFutureIso(daysFromNow: number, hour: number, minute: number) {
  const now = new Date();
  now.setDate(now.getDate() + daysFromNow);
  now.setHours(hour, minute, 0, 0);
  return now.toISOString();
}

function buildParticipants(): ConsultationParticipant[] {
  return [
    { id: "health-agent", label: "Health Agent" },
    { id: "diet-agent", label: "Diet Agent" },
    { id: "coparenting-agent", label: "Parent Agent" },
    { id: "execution-agent", label: "Execution Agent" },
    { id: "coordinator", label: "Coordinator" },
  ];
}

function buildFinding(
  agentId: ConsultationParticipant["id"],
  title: string,
  riskExplanation: string,
  signal: string,
  action: string,
  observationPoint: string
): ConsultationFinding {
  return {
    agentId,
    title,
    riskExplanation,
    signals: [signal],
    actions: [action],
    observationPoints: [observationPoint],
    evidence: [signal],
  };
}

function buildAgentView(
  role: HighRiskAgentView["role"],
  title: string,
  summary: string,
  signal: string,
  action: string,
  observationPoint: string
): HighRiskAgentView {
  return {
    role,
    title,
    summary,
    signals: [signal],
    actions: [action],
    observationPoints: [observationPoint],
    evidence: [signal],
  };
}

function buildTriggerTypes(seed: DemoConsultationSeed): ConsultationTriggerType[] {
  const triggerTypes: ConsultationTriggerType[] = ["multi-risk"];
  if (seed.riskLevel !== "low") {
    triggerTypes.push("continuous-abnormality");
  }
  if (seed.shouldEscalateToAdmin) {
    triggerTypes.push("admin-priority");
  }
  return triggerTypes;
}

function buildDirectorDecisionCard(seed: DemoConsultationSeed): DirectorDecisionCard {
  return {
    title: "重点会诊决策卡",
    reason: seed.triggerReason,
    recommendedOwnerRole: seed.ownerRole,
    recommendedOwnerName: seed.ownerName,
    recommendedAt: buildRelativeFutureIso(
      seed.recommendedDaysFromNow,
      seed.recommendedHour,
      seed.recommendedMinute
    ),
    status: seed.status,
  };
}

function buildFeedItem(seed: DemoConsultationSeed): DemoFeedItem {
  const directorDecisionCard = buildDirectorDecisionCard(seed);

  return {
    consultationId: seed.consultationId,
    childId: seed.childId,
    generatedAt: buildRelativeIso(seed.daysAgo, seed.generatedHour, seed.generatedMinute),
    riskLevel: seed.riskLevel,
    triggerReason: seed.triggerReason,
    triggerReasons: [
      seed.triggerReason,
      `${seed.childName} 的园内观察与家庭反馈需要继续闭环。`,
    ],
    summary: seed.summary,
    directorDecisionCard,
    status: seed.status,
    ownerName: seed.ownerName,
    ownerRole: seed.ownerRole,
    dueAt: directorDecisionCard.recommendedAt,
    whyHighPriority: seed.triggerReason,
    todayInSchoolActions: seed.schoolActions,
    tonightAtHomeActions: seed.homeActions,
    followUp48h: seed.followUp48h,
    syncTargets: [
      "教师端结果卡",
      "家长端今晚任务",
      ...(seed.shouldEscalateToAdmin ? ["园长端决策卡"] : []),
    ],
    shouldEscalateToAdmin: seed.shouldEscalateToAdmin,
  };
}

function buildConsultationResult(seed: DemoConsultationSeed): ConsultationResult {
  const feedItem = buildFeedItem(seed);

  return {
    consultationId: feedItem.consultationId,
    triggerReason: seed.triggerReason,
    triggerType: buildTriggerTypes(seed),
    triggerReasons: feedItem.triggerReasons,
    participants: buildParticipants(),
    childId: seed.childId,
    riskLevel: seed.riskLevel,
    agentFindings: [
      buildFinding(
        "health-agent",
        "健康与情绪观察需要联动",
        seed.healthSignal,
        seed.healthSignal,
        seed.schoolActions[0],
        seed.observationPoints[0]
      ),
      buildFinding(
        "diet-agent",
        "餐食与补水记录需要纳入判断",
        seed.mealSignal,
        seed.mealSignal,
        seed.schoolActions[1] ?? seed.schoolActions[0],
        seed.observationPoints[1] ?? seed.observationPoints[0]
      ),
      buildFinding(
        "coparenting-agent",
        "需要家庭端补齐今晚反馈",
        seed.familySignal,
        seed.familySignal,
        seed.homeActions[0],
        seed.observationPoints[2] ?? seed.observationPoints[0]
      ),
      buildFinding(
        "execution-agent",
        "园内执行与离园前同步必须保留",
        seed.schoolSignal,
        seed.schoolSignal,
        seed.schoolActions[0],
        seed.observationPoints[0]
      ),
    ],
    summary: seed.summary,
    keyFindings: seed.keyFindings,
    healthAgentView: buildAgentView(
      "HealthObservationAgent",
      "Health Agent",
      seed.healthSignal,
      seed.healthSignal,
      seed.schoolActions[0],
      seed.observationPoints[0]
    ),
    dietBehaviorAgentView: buildAgentView(
      "DietBehaviorAgent",
      "Diet Agent",
      seed.mealSignal,
      seed.mealSignal,
      seed.schoolActions[1] ?? seed.schoolActions[0],
      seed.observationPoints[1] ?? seed.observationPoints[0]
    ),
    parentCommunicationAgentView: buildAgentView(
      "ParentCommunicationAgent",
      "Parent Agent",
      seed.familySignal,
      seed.familySignal,
      seed.homeActions[0],
      seed.observationPoints[2] ?? seed.observationPoints[0]
    ),
    inSchoolActionAgentView: buildAgentView(
      "InSchoolActionAgent",
      "Execution Agent",
      seed.schoolSignal,
      seed.schoolSignal,
      seed.schoolActions[0],
      seed.observationPoints[0]
    ),
    todayInSchoolActions: seed.schoolActions,
    tonightAtHomeActions: seed.homeActions,
    followUp48h: seed.followUp48h,
    parentMessageDraft: `今晚先执行：${seed.homeActions[0]} 完成后补一条孩子反应，明天老师继续承接。`,
    directorDecisionCard: buildDirectorDecisionCard(seed),
    explainability: [
      { label: "关键发现", detail: seed.keyFindings[0] ?? seed.triggerReason },
      { label: "闭环原因", detail: seed.triggerReason },
    ],
    evidenceItems: [
      {
        id: `ce:${seed.consultationId}:history`,
        sourceType: "consultation_history",
        sourceLabel: "演示连续性说明",
        sourceId: `demo-history-${seed.childId}`,
        summary: seed.triggerReason,
        confidence: seed.riskLevel === "high" ? "high" : "medium",
        requiresHumanReview: false,
        evidenceCategory: "risk_control",
        supports: [
          {
            type: "finding",
            targetId: "finding:key:0",
            targetLabel: seed.triggerReason,
          },
        ],
        timestamp: feedItem.generatedAt,
        metadata: {
          sourceField: "demo_consultations",
          provenance: { provider: "demo-seed", source: "mock" },
        },
      },
      {
        id: `ce:${seed.consultationId}:explainability`,
        sourceType: "derived_explainability",
        sourceLabel: "演示协调结论",
        sourceId: `demo-explainability-${seed.childId}`,
        summary: seed.summary,
        confidence: "medium",
        requiresHumanReview: false,
        evidenceCategory: "family_communication",
        supports: [
          {
            type: "action",
            targetId: "action:followup:0",
            targetLabel: seed.followUp48h[0],
          },
        ],
        timestamp: feedItem.generatedAt,
        metadata: {
          sourceField: "demo_consultations",
          provenance: { provider: "demo-seed", source: "mock" },
        },
      },
    ],
    nextCheckpoints: seed.observationPoints,
    coordinatorSummary: {
      finalConclusion: seed.summary,
      riskLevel: seed.riskLevel,
      problemDefinition: seed.triggerReason,
      schoolAction: seed.schoolActions[0],
      homeAction: seed.homeActions[0],
      observationPoints: seed.observationPoints,
      reviewIn48h: seed.followUp48h[0],
      shouldEscalateToAdmin: seed.shouldEscalateToAdmin,
    },
    schoolAction: seed.schoolActions[0],
    homeAction: seed.homeActions[0],
    observationPoints: seed.observationPoints,
    reviewIn48h: seed.followUp48h[0],
    shouldEscalateToAdmin: seed.shouldEscalateToAdmin,
    continuityNotes: [`Demo recovery hotfix seed for ${seed.childName}.`],
    memoryMeta: {
      backend: "demo_snapshot",
      degraded: false,
      usedSources: ["demo_consultations"],
      errors: [],
      matchedSnapshotIds: [],
      matchedTraceIds: [],
    },
    source: "mock",
    provider: "demo-seed",
    model: "demo-consultation-v2",
    providerTrace: {
      provider: "demo-seed",
      source: "demo-fallback",
      realProvider: false,
    },
    traceMeta: {
      childName: seed.childName,
      className: seed.className,
      keyFindings: seed.keyFindings,
    },
    realProvider: false,
    fallback: true,
    generatedAt: feedItem.generatedAt,
  };
}

function byPriorityAndRecency(left: DemoConsultationSeed, right: DemoConsultationSeed) {
  const leftRisk = left.riskLevel === "high" ? 0 : left.riskLevel === "medium" ? 1 : 2;
  const rightRisk = right.riskLevel === "high" ? 0 : right.riskLevel === "medium" ? 1 : 2;
  if (leftRisk !== rightRisk) {
    return leftRisk - rightRisk;
  }
  return left.daysAgo - right.daysAgo;
}

export function buildDemoConsultationResults(limit = DEMO_CONSULTATION_SEEDS.length) {
  return [...DEMO_CONSULTATION_SEEDS]
    .sort(byPriorityAndRecency)
    .slice(0, limit)
    .map(buildConsultationResult);
}

export function buildDemoConsultationFeedItems(options?: {
  limit?: number;
  escalatedOnly?: boolean;
}) {
  const limit = options?.limit ?? DEMO_CONSULTATION_SEEDS.length;
  const escalatedOnly = options?.escalatedOnly ?? false;

  return [...DEMO_CONSULTATION_SEEDS]
    .filter((seed) => (escalatedOnly ? seed.shouldEscalateToAdmin : true))
    .sort(byPriorityAndRecency)
    .slice(0, limit)
    .map(buildFeedItem);
}

export function buildDemoConsultationSummary() {
  return {
    generatedAt: buildRelativeIso(0, 18, 30),
    today: getLocalToday(),
    reviewWindowEnd: shiftLocalDate(getLocalToday(), 2),
  };
}
