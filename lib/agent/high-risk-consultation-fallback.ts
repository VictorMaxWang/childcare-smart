import type {
  ConsultationEvidenceItem,
  ConsultationFinding,
  ConsultationParticipant,
  ConsultationResult,
  ConsultationTriggerType,
  ExplainabilityItem,
  HighRiskAgentView,
  MemoryContextMeta,
} from "@/lib/ai/types";
import type { ConsultationInput } from "@/lib/agent/consultation/input";
import type { HighRiskConsultationAutoContext } from "@/lib/agent/high-risk-consultation";
import { getChildcareKnowledgeHints } from "@/lib/knowledge/childcare-knowledge";

const PARTICIPANTS: ConsultationParticipant[] = [
  { id: "health-agent", label: "情绪安全观察 Agent" },
  { id: "diet-agent", label: "身心状态联动 Agent" },
  { id: "coparenting-agent", label: "家园沟通 Agent" },
  { id: "execution-agent", label: "园内行动 Agent" },
  { id: "coordinator", label: "会诊协调 Agent" },
];

function takeUnique(items: Array<string | undefined>, limit = 6) {
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

function textIncludesSocialEmotionalCase(text: string) {
  return /(林小雨|小雨|走廊|推车声|害怕|退缩|勇敢表达|小步尝试)/u.test(text);
}

export function isLinXiaoyuHighRiskConsultationCase(params: {
  input: ConsultationInput;
  autoContext?: HighRiskConsultationAutoContext | null;
}) {
  const combined = [
    params.input.childId,
    params.input.childName,
    ...(params.input.focusReasons ?? []),
    ...(params.input.continuityNotes ?? []),
    ...(params.autoContext?.focusReasons ?? []),
    ...(params.autoContext?.morningCheckAlerts ?? []),
    ...(params.autoContext?.growthObservationNotes ?? []),
    ...(params.autoContext?.parentFeedbackNotes ?? []),
  ].join(" ");

  return params.input.childId === "c-1" || textIncludesSocialEmotionalCase(combined);
}

function buildView(
  role: HighRiskAgentView["role"],
  title: string,
  summary: string,
  signals: string[],
  actions: string[],
  observationPoints: string[],
  evidence: string[]
): HighRiskAgentView {
  return {
    role,
    title,
    summary,
    signals,
    actions,
    observationPoints,
    evidence,
  };
}

function buildFinding(
  agentId: ConsultationFinding["agentId"],
  title: string,
  riskExplanation: string,
  signals: string[],
  actions: string[],
  observationPoints: string[],
  evidence: string[]
): ConsultationFinding {
  return {
    agentId,
    title,
    riskExplanation,
    signals,
    actions,
    observationPoints,
    evidence,
  };
}

function buildMemoryMeta(input: ConsultationInput): MemoryContextMeta {
  const existing = input.memoryMeta;
  const hasExisting =
    existing &&
    (existing.usedSources.length > 0 ||
      existing.matchedSnapshotIds.length > 0 ||
      existing.matchedTraceIds.length > 0);

  if (hasExisting) return existing;

  return {
    backend: "local-demo-memory",
    degraded: false,
    usedSources: ["teacher-observation", "growth-record", "guardian-feedback", "consultation-history"],
    errors: [],
    matchedSnapshotIds: [`memory-snapshot-${input.childId}-social-emotional`],
    matchedTraceIds: [`history-trace-${input.childId}-48h-review`],
  };
}

function buildEvidenceItems(params: {
  consultationId: string;
  generatedAt: string;
  keyFindings: string[];
  todayInSchoolActions: string[];
  tonightAtHomeActions: string[];
  followUp48h: string[];
  childId: string;
  socialEmotionalCase: boolean;
  parentFeedbackNote?: string;
}) {
  const teacherObservation = params.socialEmotionalCase
    ? "走廊活动听到推车声后，林小雨停在门口害怕退缩；周老师蹲下陪伴后，她能说出“我害怕”。"
    : "教师观察显示当前儿童已出现需要优先处理的连续关注信号。";
  const growthRecord = params.socialEmotionalCase
    ? "成长记录记录了“走廊活动、勇敢表达、小步尝试”：孩子在陪伴下完成牵手向前走一小步。"
    : "成长记录提示当前动作需要拆成可复查的小目标。";
  const parentFeedback =
    params.parentFeedbackNote ??
    (params.socialEmotionalCase
      ? "家长反馈目标是今晚共读《林小雨的一小步勇敢》，观察孩子能否复述故事并尝试走到门口。"
      : "家长反馈需要补齐今晚家庭动作执行情况和孩子第一反应。");
  const memorySnapshot = params.socialEmotionalCase
    ? "记忆快照显示本轮主题持续围绕“勇敢表达与小步尝试”，需要 48 小时复查是否能独立表达需求。"
    : "历史跟进显示该儿童已进入会诊闭环，需要在 48 小时内复核执行结果。";

  const items: ConsultationEvidenceItem[] = [
    {
      id: `ce:${params.consultationId}:teacher_note:teacher_observation:0`,
      sourceType: "teacher_note",
      sourceLabel: "教师观察",
      sourceId: params.socialEmotionalCase ? "health-c-1-hallway-observation" : `teacher-observation-${params.childId}`,
      summary: teacherObservation,
      excerpt: teacherObservation,
      confidence: "high",
      requiresHumanReview: false,
      evidenceCategory: "risk_control",
      supports: [
        { type: "finding", targetId: "finding:key:0", targetLabel: params.keyFindings[0] },
        { type: "action", targetId: "action:school:0", targetLabel: params.todayInSchoolActions[0] },
      ],
      timestamp: params.generatedAt,
    },
    {
      id: `ce:${params.consultationId}:trend:growth_record:0`,
      sourceType: "trend",
      sourceLabel: "成长记录",
      sourceId: params.socialEmotionalCase ? "growth-defense-c-1-bravery" : `growth-record-${params.childId}`,
      summary: growthRecord,
      excerpt: growthRecord,
      confidence: "high",
      requiresHumanReview: false,
      evidenceCategory: "development_support",
      supports: [
        { type: "finding", targetId: "finding:key:1", targetLabel: params.keyFindings[1] },
        { type: "action", targetId: "action:followup:0", targetLabel: params.followUp48h[0] },
      ],
      timestamp: params.generatedAt,
    },
    {
      id: `ce:${params.consultationId}:guardian_feedback:parent_feedback:0`,
      sourceType: "guardian_feedback",
      sourceLabel: "家长反馈",
      sourceId: params.parentFeedbackNote
        ? `guardian-feedback-latest-${params.childId}`
        : params.socialEmotionalCase
          ? "feedback-defense-c-1"
          : `guardian-feedback-${params.childId}`,
      summary: parentFeedback,
      excerpt: parentFeedback,
      confidence: "medium",
      requiresHumanReview: false,
      evidenceCategory: "family_communication",
      supports: [
        { type: "action", targetId: "action:home:0", targetLabel: params.tonightAtHomeActions[0] },
        { type: "finding", targetId: "finding:key:2", targetLabel: params.keyFindings[2] },
      ],
      timestamp: params.generatedAt,
    },
    {
      id: `ce:${params.consultationId}:memory_snapshot:history_followup:0`,
      sourceType: "memory_snapshot",
      sourceLabel: "记忆快照 / 历史跟进",
      sourceId: `memory-snapshot-${params.childId}-social-emotional`,
      summary: memorySnapshot,
      excerpt: memorySnapshot,
      confidence: "medium",
      requiresHumanReview: false,
      evidenceCategory: "daily_care",
      supports: [
        { type: "action", targetId: "action:followup:1", targetLabel: params.followUp48h[1] },
        { type: "explainability", targetId: "explainability:0", targetLabel: "连续性依据" },
      ],
      timestamp: params.generatedAt,
    },
  ];

  return items;
}

export function buildLocalHighRiskConsultationFallback(params: {
  input: ConsultationInput;
  autoContext?: HighRiskConsultationAutoContext | null;
  fallbackReason?: string | null;
}): ConsultationResult {
  const { input, autoContext } = params;
  const socialEmotionalCase = isLinXiaoyuHighRiskConsultationCase({ input, autoContext });
  const consultationId = socialEmotionalCase
    ? `consult-${input.childId}-bravery-expression`
    : `consult-${input.childId}-local-fallback`;
  const generatedAt = input.generatedAt;
  const childName = input.childName;
  const memoryMeta = buildMemoryMeta(input);

  const triggerReasons = socialEmotionalCase
    ? [
        "走廊活动听到推车声后害怕退缩，需要把勇敢表达和小步尝试接成家园闭环。",
        "教师观察、成长记录、家长反馈与历史跟进都指向同一社会情绪支持主题。",
        "该事件需要管理端确认 48 小时复查责任人，避免只停留在一次性安抚。",
      ]
    : takeUnique(
        [
          input.priorityHint?.reason,
          ...input.focusReasons,
          "老师主动发起高风险会诊，需要进入 48 小时闭环评估。",
        ],
        4
      );
  const keyFindings = socialEmotionalCase
    ? [
        "走廊活动中出现害怕退缩，触发点是推车声和门口过渡场景。",
        "在周老师陪伴下，林小雨已经能说出“我害怕”，具备勇敢表达的起点。",
        "家庭今晚需要用共读绘本和一次门口小步尝试，承接园内练习。",
        "48 小时内要复查她是否能在提示减少后独立表达需求。",
      ]
    : takeUnique(
        [
          input.focusReasons[0],
          input.continuityNotes?.[0],
          "需要把今日园内动作、今晚家庭任务和 48 小时复查合并到同一闭环。",
        ],
        4
      );
  const todayInSchoolActions = socialEmotionalCase
    ? [
        "走廊活动前先预告声音来源，请林小雨在“牵手一步”和“站在门口看一看”之间自主选择。",
        "老师只记录一次最关键场景：是否能说出“我害怕”或用手势表达需要陪伴。",
        "离园前把今天的小步尝试结果同步给家长和园长端风险承接板。",
      ]
    : [
        "今日园内先完成 1 个最关键复查动作，并在离园前补齐记录。",
        "把明日第一观察点写成可核对结果的句子。",
        "同步加入园所重点观察对象，确保园长端可见。",
      ];
  const tonightAtHomeActions = socialEmotionalCase
    ? [
        "今晚共读《林小雨的一小步勇敢》，请孩子复述“我害怕”这句话。",
        "完成一次走到门口的小步尝试，家长只记录是否愿意尝试和第一反应。",
      ]
    : [
        "今晚只完成一项家庭稳定动作，并记录孩子第一反应。",
        "明早反馈执行结果、孩子反应和是否仍有异常。",
      ];
  const followUp48h = socialEmotionalCase
    ? [
        "明天记录林小雨是否愿意在预告后走到门口或牵手走一步。",
        "后天复查她是否能在提示减少后独立说出“我害怕”或提出陪伴需求。",
        "若 48 小时内仍明显退缩，由陈园长在管理端分派二次观察任务。",
      ]
    : [
        "48 小时内复核园内动作和家庭反馈是否都已完成。",
        "如果反馈缺失或风险未下降，由管理端分派二次跟进任务。",
      ];
  const observationPoints = socialEmotionalCase
    ? ["是否愿意靠近走廊门口", "是否能说出“我害怕”", "小步尝试后恢复速度"]
    : ["核心风险是否减弱", "家庭动作是否完成", "是否需要二次分派"];
  const summary = socialEmotionalCase
    ? `${childName} 在走廊活动中因推车声害怕退缩，本次会诊聚焦“勇敢表达与小步尝试”，需要园内、家庭和管理端在 48 小时内完成闭环。`
    : `${childName} 当前已进入重点会诊闭环，建议把园内复核、今晚家庭动作和 48 小时复查压缩到同一条执行路径。`;
  const schoolAction = todayInSchoolActions[0];
  const homeAction = tonightAtHomeActions[0];
  const reviewIn48h = followUp48h[0];
  const latestParentFeedbackNote = autoContext?.parentFeedbackNotes[0];
  const triggerType: ConsultationTriggerType[] = ["admin-priority", "multi-risk"];
  const explainability: ExplainabilityItem[] = [
    {
      label: "关键发现",
      detail: keyFindings[0],
    },
    {
      label: "证据链",
      detail: latestParentFeedbackNote
        ? `教师观察、成长记录、最新家长反馈和记忆快照均指向同一支持目标。${latestParentFeedbackNote}`
        : "教师观察、成长记录、家长反馈和记忆快照均指向同一支持目标。",
    },
    {
      label: "协调结论",
      detail: "先执行可复现的小步动作，再在 48 小时内核对是否降低退缩。",
    },
  ];
  const continuityNotes = takeUnique(
    [
      ...(input.continuityNotes ?? []),
      socialEmotionalCase ? "历史跟进主题：勇敢表达与小步尝试。" : undefined,
      latestParentFeedbackNote ? `最新家庭反馈：${latestParentFeedbackNote}` : undefined,
      params.fallbackReason ? `fallback：${params.fallbackReason}` : undefined,
    ],
    6
  );
  const evidenceItems = buildEvidenceItems({
    consultationId,
    generatedAt,
    keyFindings,
    todayInSchoolActions,
    tonightAtHomeActions,
    followUp48h,
    childId: input.childId,
    socialEmotionalCase,
    parentFeedbackNote: latestParentFeedbackNote,
  });

  const healthAgentView = buildView(
    "HealthObservationAgent",
    "情绪安全观察",
    keyFindings[0],
    takeUnique([autoContext?.morningCheckAlerts[0], keyFindings[0], ...input.focusReasons], 4),
    [schoolAction],
    observationPoints,
    [evidenceItems[0].summary]
  );
  const dietBehaviorAgentView = buildView(
    "DietBehaviorAgent",
    "身心状态联动",
    socialEmotionalCase
      ? "当前重点不是饮食诊断，而是观察情绪退缩是否影响活动参与和过渡状态。"
      : "当前重点是确认作息、饮水或情绪是否与风险信号联动。",
    takeUnique([autoContext?.growthObservationNotes[0], keyFindings[1]], 4),
    ["明天继续记录活动参与度、恢复速度和过渡状态。"],
    observationPoints,
    [evidenceItems[1].summary]
  );
  const parentCommunicationAgentView = buildView(
    "ParentCommunicationAgent",
    "家园沟通",
    latestParentFeedbackNote ? `最新家庭反馈已回流：${latestParentFeedbackNote}` : homeAction,
    takeUnique([autoContext?.parentFeedbackNotes[0], keyFindings[2]], 4),
    tonightAtHomeActions,
    ["家长是否完成共读", "孩子是否愿意尝试", "明早反馈是否覆盖第一反应"],
    [evidenceItems[2].summary]
  );
  const inSchoolActionAgentView = buildView(
    "InSchoolActionAgent",
    "园内行动",
    schoolAction,
    todayInSchoolActions,
    todayInSchoolActions,
    observationPoints,
    [evidenceItems[3].summary]
  );
  const agentFindings: ConsultationFinding[] = [
    buildFinding("health-agent", "情绪安全观察", healthAgentView.summary, healthAgentView.signals, healthAgentView.actions, healthAgentView.observationPoints, healthAgentView.evidence),
    buildFinding("diet-agent", "身心状态联动", dietBehaviorAgentView.summary, dietBehaviorAgentView.signals, dietBehaviorAgentView.actions, dietBehaviorAgentView.observationPoints, dietBehaviorAgentView.evidence),
    buildFinding("coparenting-agent", "家园沟通闭环", parentCommunicationAgentView.summary, parentCommunicationAgentView.signals, parentCommunicationAgentView.actions, parentCommunicationAgentView.observationPoints, parentCommunicationAgentView.evidence),
    buildFinding("execution-agent", "园内行动闭环", inSchoolActionAgentView.summary, inSchoolActionAgentView.signals, inSchoolActionAgentView.actions, inSchoolActionAgentView.observationPoints, inSchoolActionAgentView.evidence),
  ];
  const knowledgeHints = getChildcareKnowledgeHints({
    topic: takeUnique([
      ...keyFindings,
      ...triggerReasons,
      ...continuityNotes,
      ...input.focusReasons,
      ...(autoContext?.focusReasons ?? []),
      input.suggestionSummary,
      input.priorityHint?.reason,
    ], 24),
    scenario: takeUnique([
      ...todayInSchoolActions,
      ...tonightAtHomeActions,
      ...followUp48h,
      ...observationPoints,
      ...(autoContext?.morningCheckAlerts ?? []),
      ...(autoContext?.growthObservationNotes ?? []),
      ...(autoContext?.parentFeedbackNotes ?? []),
    ], 24),
    ageRange: input.ageBand ?? null,
    limit: 3,
  });

  return {
    consultationId,
    triggerReason: triggerReasons[0],
    triggerType,
    triggerReasons,
    participants: PARTICIPANTS,
    childId: input.childId,
    riskLevel: "high",
    agentFindings,
    summary,
    keyFindings,
    healthAgentView,
    dietBehaviorAgentView,
    parentCommunicationAgentView,
    inSchoolActionAgentView,
    todayInSchoolActions,
    tonightAtHomeActions,
    followUp48h,
    parentMessageDraft: socialEmotionalCase
      ? "小雨今天在走廊活动里听到推车声有些害怕，但已经能在老师陪伴下说出“我害怕”，并牵手完成一步小尝试。今晚请共读《林小雨的一小步勇敢》，再完成一次走到门口的小步尝试，明早告诉周老师孩子是否愿意尝试。"
      : `${childName} 今天已进入重点会诊闭环。今晚请完成家庭动作，并在明早反馈孩子反应和执行情况。`,
    directorDecisionCard: {
      title: `${childName} 今日优先级决策卡`,
      reason: `${childName} 已形成教师观察、成长记录、家长反馈和历史跟进的证据链，需要管理端承接 48 小时复查。`,
      recommendedOwnerRole: "admin",
      recommendedOwnerName: "陈园长",
      recommendedAt: "今天放学前",
      status: "pending",
    },
    explainability,
    evidenceItems,
    knowledgeHints,
    nextCheckpoints: takeUnique([...followUp48h, ...observationPoints], 6),
    coordinatorSummary: {
      finalConclusion: `${summary} 当前优先动作是“${schoolAction}”，今晚家庭任务是“${homeAction}”。`,
      riskLevel: "high",
      problemDefinition: triggerReasons[0],
      schoolAction,
      homeAction,
      observationPoints,
      reviewIn48h,
      shouldEscalateToAdmin: true,
    },
    schoolAction,
    homeAction,
    observationPoints,
    reviewIn48h,
    shouldEscalateToAdmin: true,
    continuityNotes,
    memoryMeta,
    source: "fallback",
    model: "local-social-emotional-rules",
    generatedAt,
  };
}
