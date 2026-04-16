import type { InterventionCard } from "@/lib/agent/intervention-card";
import type {
  ConsultationFinding,
  ConsultationParticipant,
  ConsultationResult,
  ParentStoryBookHighlightCandidate,
  ParentStoryBookRequest,
  ParentStoryBookStylePreset,
} from "@/lib/ai/types";
import { buildConsultationEvidenceItems } from "@/lib/consultation/evidence";

export type ParentStoryBookDemoSeedId =
  | "recording-c1-bedtime"
  | "sleep-repair"
  | "growth-highlight";

interface ParentStoryBookDemoSeedDefinition {
  id: ParentStoryBookDemoSeedId;
  childId: string;
  stylePreset: ParentStoryBookStylePreset;
  requestSource: string;
  highlightCandidates: ParentStoryBookHighlightCandidate[];
  latestInterventionCard: InterventionCard;
  latestConsultation: ConsultationResult;
}

export const DEFAULT_PARENT_STORYBOOK_RECORDING_DEMO_SEED_ID: ParentStoryBookDemoSeedId =
  "recording-c1-bedtime";

const STYLE_PRESET_PROMPTS: Record<ParentStoryBookStylePreset, string> = {
  "sunrise-watercolor": "画面风格偏晨光水彩，暖金色高光，边缘柔和，像纸上晕染开的儿童绘本插图。",
  "moonlit-cutout": "画面风格偏月夜剪纸，靛蓝与奶白层叠，夜空柔雾感明显，像立体纸艺儿童绘本。",
  "forest-crayon": "画面风格偏森林蜡笔，浅绿和木质色调，保留明显手绘蜡笔纹理和轻冒险氛围。",
};

const DEFAULT_CONSULTATION_PARTICIPANTS: ConsultationParticipant[] = [
  { id: "health-agent", label: "健康观察 Agent" },
  { id: "diet-agent", label: "饮食行为 Agent" },
  { id: "coparenting-agent", label: "家长沟通 Agent" },
  { id: "execution-agent", label: "园内执行 Agent" },
  { id: "coordinator", label: "协调 Agent" },
];

function buildFinding(
  agentId: ConsultationParticipant["id"],
  title: string,
  summary: string,
  actions: string[],
  observationPoints: string[],
  evidence: string[]
): ConsultationFinding {
  return {
    agentId,
    title,
    riskExplanation: summary,
    signals: evidence.slice(0, 2),
    actions,
    observationPoints,
    evidence,
  };
}

function buildConsultationSeed(input: {
  childId: string;
  consultationId: string;
  summary: string;
  schoolAction: string;
  homeAction: string;
  observationPoints: string[];
  reviewIn48h: string;
  parentMessageDraft: string;
  triggerReason: string;
  keyFindings: string[];
  continuityNotes: string[];
  generatedAt: string;
}): ConsultationResult {
  const evidence = input.keyFindings.length > 0 ? input.keyFindings : [input.summary];
  /*
  const explainability = [
    {
      label: "浠婃櫄鍏堝仛涓€浠跺皬浜?,
      detail: input.homeAction,
    },
    {
      label: "鏄庢棭缁х画鐪嬩粈涔?,
      detail: input.reviewIn48h,
    },
  ];
  */
  const explainability = [
    {
      label: "Tonight first step",
      detail: input.homeAction,
    },
    {
      label: "Next observation",
      detail: input.reviewIn48h,
    },
  ];
  const agentFindings = [
    buildFinding(
      "health-agent",
      "睡眠前情绪波动需要柔性承接",
      input.summary,
      [input.schoolAction],
      input.observationPoints,
      evidence
    ),
    buildFinding(
      "coparenting-agent",
      "家庭陪伴动作要小而稳定",
      input.homeAction,
      [input.homeAction],
      input.observationPoints,
      evidence
    ),
    buildFinding(
      "execution-agent",
      "明早继续承接今晚动作",
      input.reviewIn48h,
      [input.reviewIn48h],
      input.observationPoints,
      evidence
    ),
  ];

  return {
    consultationId: input.consultationId,
    triggerReason: input.triggerReason,
    triggerType: ["continuous-abnormality"],
    triggerReasons: [input.triggerReason],
    participants: DEFAULT_CONSULTATION_PARTICIPANTS,
    childId: input.childId,
    riskLevel: "medium",
    agentFindings,
    summary: input.summary,
    keyFindings: input.keyFindings,
    healthAgentView: {
      role: "HealthObservationAgent",
      title: "健康观察结论",
      summary: input.summary,
      signals: evidence.slice(0, 2),
      actions: [input.schoolAction],
      observationPoints: input.observationPoints,
      evidence,
    },
    dietBehaviorAgentView: {
      role: "DietBehaviorAgent",
      title: "日常节奏观察",
      summary: "重点不是追求一次到位，而是让孩子在熟悉节奏里更容易配合。",
      signals: evidence.slice(0, 2),
      actions: [input.schoolAction],
      observationPoints: input.observationPoints,
      evidence,
    },
    parentCommunicationAgentView: {
      role: "ParentCommunicationAgent",
      title: "家长陪伴建议",
      summary: input.homeAction,
      signals: evidence.slice(0, 2),
      actions: [input.homeAction],
      observationPoints: input.observationPoints,
      evidence,
    },
    inSchoolActionAgentView: {
      role: "InSchoolActionAgent",
      title: "园内延续动作",
      summary: input.schoolAction,
      signals: evidence.slice(0, 2),
      actions: [input.schoolAction],
      observationPoints: input.observationPoints,
      evidence,
    },
    todayInSchoolActions: [input.schoolAction],
    tonightAtHomeActions: [input.homeAction],
    followUp48h: [input.reviewIn48h],
    parentMessageDraft: input.parentMessageDraft,
    directorDecisionCard: {
      title: "先以家庭陪伴闭环，不升级行政处理",
      reason: input.summary,
      recommendedOwnerRole: "parent",
      recommendedOwnerName: "家长",
      recommendedAt: input.generatedAt,
      status: "pending",
    },
    /*
    explainability: [
      {
        label: "今晚先做一件小事",
        detail: input.homeAction,
      },
      {
        label: "明早继续看什么",
        detail: input.reviewIn48h,
      },
    ],
    */
    explainability,
    evidenceItems: buildConsultationEvidenceItems({
      consultationId: input.consultationId,
      generatedAt: input.generatedAt,
      keyFindings: input.keyFindings,
      triggerReasons: [input.triggerReason],
      todayInSchoolActions: [input.schoolAction],
      tonightAtHomeActions: [input.homeAction],
      followUp48h: [input.reviewIn48h],
      explainability,
      continuityNotes: input.continuityNotes,
      memoryMeta: null,
      providerTrace: null,
      multimodalNotes: null,
      rawEvidenceItems: undefined,
    }),
    nextCheckpoints: [input.reviewIn48h],
    coordinatorSummary: {
      finalConclusion: input.summary,
      riskLevel: "medium",
      problemDefinition: input.triggerReason,
      schoolAction: input.schoolAction,
      homeAction: input.homeAction,
      observationPoints: input.observationPoints,
      reviewIn48h: input.reviewIn48h,
      shouldEscalateToAdmin: false,
    },
    schoolAction: input.schoolAction,
    homeAction: input.homeAction,
    observationPoints: input.observationPoints,
    reviewIn48h: input.reviewIn48h,
    shouldEscalateToAdmin: false,
    continuityNotes: input.continuityNotes,
    source: "rule",
    provider: "parent-storybook-demo-seed",
    model: "local-storybook-demo-seed-v1",
    fallback: true,
    realProvider: false,
    generatedAt: input.generatedAt,
  };
}

function buildInterventionSeed(input: {
  childId: string;
  seedId: ParentStoryBookDemoSeedId;
  title: string;
  summary: string;
  triggerReason: string;
  tonightHomeAction: string;
  homeSteps: string[];
  observationPoints: string[];
  tomorrowObservationPoint: string;
  reviewIn48h: string;
  consultationId: string;
}): InterventionCard {
  return {
    id: `card-${input.childId}-${input.seedId}`,
    title: input.title,
    riskLevel: "medium",
    targetChildId: input.childId,
    triggerReason: input.triggerReason,
    summary: input.summary,
    todayInSchoolAction: "老师在离园前先用熟悉的绘本和低声提醒，把节奏慢慢收住。",
    tonightHomeAction: input.tonightHomeAction,
    homeSteps: input.homeSteps,
    observationPoints: input.observationPoints,
    tomorrowObservationPoint: input.tomorrowObservationPoint,
    reviewIn48h: input.reviewIn48h,
    parentMessageDraft: `今晚建议先做：${input.tonightHomeAction}。做完后补一条孩子反应，明早老师继续承接。`,
    teacherFollowupDraft: `明天继续观察 ${input.tomorrowObservationPoint}，48 小时内重点复盘：${input.reviewIn48h}`,
    consultationMode: true,
    consultationId: input.consultationId,
    consultationSummary: input.summary,
    participants: ["老师", "家长"],
    shouldEscalateToAdmin: false,
    source: "fallback",
    model: "storybook-demo-seed",
  };
}

const DEMO_SEEDS: Record<ParentStoryBookDemoSeedId, ParentStoryBookDemoSeedDefinition> = {
  "recording-c1-bedtime": (() => {
    const childId = "c-1";
    const consultationId = "consult-c-1-recording-seed";
    const stylePreset = "sunrise-watercolor";
    const generatedAt = "2026-04-07T20:30:00.000Z";
    const summary =
      "林小雨今天在午睡前已经能在熟悉绘本和安静陪伴里更快放松，适合把这份进步带回家继续接住。";
    const homeAction = "今晚洗漱后只读一本熟悉的晚安绘本，再一起做 3 次慢呼吸，不额外加新要求。";
    const reviewIn48h = "明早继续看入睡前是否更愿意靠近大人、入园前分离情绪是否更快稳定。";
    const observationPoints = [
      "洗漱后到上床之间，情绪是否比前两天更平稳",
      "听到熟悉绘本开头时，身体是否更愿意靠近家长",
      "明早入园前的分离反应是否缩短",
    ];

    return {
      id: "recording-c1-bedtime",
      childId,
      stylePreset,
      requestSource: "parent-storybook-demo-seed:recording-c1-bedtime",
      highlightCandidates: [
        {
          kind: "todayGrowth",
          title: "今天被看见的小进步",
          detail: "午睡前一开始有点不安，但在老师轻声翻到熟悉绘本时，林小雨很快愿意坐下来听完第一页。",
          priority: 1,
          source: "todayGrowth",
        },
        {
          kind: "consultationSummary",
          title: "老师和家长可以接着做什么",
          detail: "白天已经验证过“熟悉故事 + 稳定语速”能帮她更快放松，今晚继续同一套节奏最容易成功。",
          priority: 2,
          source: "latestConsultation",
        },
        {
          kind: "guardianFeedback",
          title: "家庭陪伴亮点",
          detail: "最近家里把睡前时间提前后，林小雨已经愿意先抱一下再上床，晚间情绪比上周更柔和。",
          priority: 3,
          source: "guardianFeedback",
        },
        {
          kind: "consultationAction",
          title: "今晚只做一件小事",
          detail: homeAction,
          priority: 4,
          source: "interventionCard",
        },
        {
          kind: "weeklyTrend",
          title: "明天继续看什么",
          detail: reviewIn48h,
          priority: 5,
          source: "weeklyTrend",
        },
      ],
      latestInterventionCard: buildInterventionSeed({
        childId,
        seedId: "recording-c1-bedtime",
        title: "睡前安抚闭环",
        summary,
        triggerReason: "午睡和晚睡前的情绪波动，需要家园使用同一套安抚节奏。",
        tonightHomeAction: homeAction,
        homeSteps: [
          "洗漱后立即关掉高刺激内容，只保留床边小灯",
          "和孩子一起读一本最近最熟悉的晚安绘本",
          "读完后一起做 3 次慢呼吸，再轻声说“今天已经很棒了”",
        ],
        observationPoints,
        tomorrowObservationPoint: "明早入园前是否更愿意牵手、分离时恢复平稳更快",
        reviewIn48h,
        consultationId,
      }),
      latestConsultation: buildConsultationSeed({
        childId,
        consultationId,
        summary,
        schoolAction: "老师继续在午睡前保留熟悉绘本和轻声提示，不临时更换流程。",
        homeAction,
        observationPoints,
        reviewIn48h,
        parentMessageDraft: "今晚不用追求睡得更快，只要把熟悉的故事和慢呼吸做完整，就已经是在帮孩子稳住节奏。",
        triggerReason: "连续两天睡前情绪波动，但熟悉陪伴动作已经开始出现正向变化。",
        keyFindings: [
          "熟悉绘本能显著降低午睡前的抗拒",
          "孩子在被提前预告和轻声陪伴时更愿意配合",
          "家庭已经开始形成可复用的睡前仪式",
        ],
        continuityNotes: [
          "继续使用同一本熟悉绘本，不临时更换新的讲述任务",
          "明早把今晚孩子是否更容易安静下来反馈给老师",
        ],
        generatedAt,
      }),
    };
  })(),
  "sleep-repair": (() => {
    const childId = "c-1";
    const consultationId = "consult-c-1-sleep-repair-seed";
    const stylePreset = "moonlit-cutout";
    const generatedAt = "2026-04-07T20:35:00.000Z";
    const summary =
      "今晚重点不是把孩子立刻哄睡，而是把睡前流程缩成一套更稳的三步，让情绪先慢慢落下来。";
    const homeAction = "今晚固定“喝温水 2 口 + 关小灯 + 说晚安句子”三步，不再追加谈条件。";
    const reviewIn48h = "明晚继续看洗漱后是否更少来回起身，后天早晨观察起床情绪是否更稳定。";
    const observationPoints = [
      "洗漱结束后是否还频繁提出拖延上床的新要求",
      "关灯后 5 分钟内身体动作是否减少",
      "次日早晨起床时是否更少烦躁和赖床",
    ];

    return {
      id: "sleep-repair",
      childId,
      stylePreset,
      requestSource: "parent-storybook-demo-seed:sleep-repair",
      highlightCandidates: [
        {
          kind: "todayGrowth",
          title: "今天的安静时刻",
          detail: "离园前的最后 10 分钟，林小雨已经能在轻声提醒下自己把动作放慢，没有像前几天那样一下子着急起来。",
          priority: 1,
          source: "todayGrowth",
        },
        {
          kind: "consultationSummary",
          title: "今晚要守住的节奏",
          detail: "先稳住流程，比追求更快入睡更重要；孩子在固定顺序里更容易感到安心。",
          priority: 2,
          source: "latestConsultation",
        },
        {
          kind: "consultationAction",
          title: "睡前修复动作",
          detail: homeAction,
          priority: 3,
          source: "interventionCard",
        },
        {
          kind: "guardianFeedback",
          title: "家里已经出现的变化",
          detail: "家长反馈只要提前预告“接下来要关灯”，孩子最近已经比上周更容易接受过渡。",
          priority: 4,
          source: "guardianFeedback",
        },
        {
          kind: "weeklyTrend",
          title: "后续观察点",
          detail: reviewIn48h,
          priority: 5,
          source: "weeklyTrend",
        },
      ],
      latestInterventionCard: buildInterventionSeed({
        childId,
        seedId: "sleep-repair",
        title: "睡前流程修复",
        summary,
        triggerReason: "睡前拖延和情绪拉扯需要先缩流程，恢复稳定感。",
        tonightHomeAction: homeAction,
        homeSteps: [
          "洗漱结束后先喝两口温水，作为开始信号",
          "把房间只留一盏小灯，不临时切换更多活动",
          "重复一句固定晚安句子，再自然结束对话",
        ],
        observationPoints,
        tomorrowObservationPoint: "明天晚上洗漱后是否更少拖延、动作是否更快放慢",
        reviewIn48h,
        consultationId,
      }),
      latestConsultation: buildConsultationSeed({
        childId,
        consultationId,
        summary,
        schoolAction: "老师在离园前继续用固定提醒语收尾，让孩子带着熟悉顺序回家。",
        homeAction,
        observationPoints,
        reviewIn48h,
        parentMessageDraft: "今晚只守住固定顺序，不和孩子争“马上睡”，先让她知道节奏是稳定的。",
        triggerReason: "睡前流程拉扯还在，但固定提醒已开始出现可复制的平稳窗口。",
        keyFindings: [
          "固定信号词比临时讲道理更有效",
          "孩子在小范围可预测流程里更容易安静下来",
          "最近家庭已经开始形成更稳定的晚间陪伴语气",
        ],
        continuityNotes: [
          "今晚和明晚尽量使用同一套三步流程",
          "后天继续看清晨起床情绪是否更稳",
        ],
        generatedAt,
      }),
    };
  })(),
  "growth-highlight": (() => {
    const childId = "c-1";
    const consultationId = "consult-c-1-growth-highlight-seed";
    const stylePreset = "forest-crayon";
    const generatedAt = "2026-04-07T20:40:00.000Z";
    const summary =
      "林小雨今天已经把“先听提醒、再自己试一试”的能力露出来，适合把这份亮点写成更有成就感的晚安故事。";
    const homeAction = "今晚让孩子自己选一个绘本角色，说一句“今天我像谁一样勇敢”，再由家长接一句鼓励。";
    const reviewIn48h = "明天继续看遇到小挫折时是否更愿意先听提醒，再自己补一次尝试。";
    const observationPoints = [
      "孩子是否更愿意先听完一句提醒再行动",
      "遇到卡住时是否比上周更快愿意再试一次",
      "被表扬“今天有进步”时是否更愿意回应",
    ];

    return {
      id: "growth-highlight",
      childId,
      stylePreset,
      requestSource: "parent-storybook-demo-seed:growth-highlight",
      highlightCandidates: [
        {
          kind: "todayGrowth",
          title: "今天的成长高光",
          detail: "老师提醒完收玩具顺序后，林小雨停了一下就自己把最后两样东西放回篮子里，没有继续僵住。",
          priority: 1,
          source: "todayGrowth",
        },
        {
          kind: "guardianFeedback",
          title: "家里也看见了变化",
          detail: "最近在家里提醒穿鞋时，她已经会先看向大人再决定自己尝试，不再立刻抗拒。",
          priority: 2,
          source: "guardianFeedback",
        },
        {
          kind: "consultationSummary",
          title: "今晚怎么把亮点接住",
          detail: "先夸“你今天已经会停下来听一句提醒”，再给一个小小的自我表达机会，孩子更容易记住自己做到了。",
          priority: 3,
          source: "latestConsultation",
        },
        {
          kind: "consultationAction",
          title: "今晚陪伴动作",
          detail: homeAction,
          priority: 4,
          source: "interventionCard",
        },
        {
          kind: "weeklyTrend",
          title: "明天继续观察",
          detail: reviewIn48h,
          priority: 5,
          source: "weeklyTrend",
        },
      ],
      latestInterventionCard: buildInterventionSeed({
        childId,
        seedId: "growth-highlight",
        title: "成长高光放大器",
        summary,
        triggerReason: "今天已经出现可复用的小进步，适合在家庭场景里再次确认成功感。",
        tonightHomeAction: homeAction,
        homeSteps: [
          "睡前先说出今天最棒的一件小事",
          "让孩子选一个喜欢的绘本角色做比喻",
          "家长只接一句简短鼓励，不追加追问",
        ],
        observationPoints,
        tomorrowObservationPoint: "明天在晨间准备或收拾物品时，是否更愿意先听提醒再自己尝试",
        reviewIn48h,
        consultationId,
      }),
      latestConsultation: buildConsultationSeed({
        childId,
        consultationId,
        summary,
        schoolAction: "老师明天继续在小任务前给一句短提醒，留出孩子自己补一次尝试的空间。",
        homeAction,
        observationPoints,
        reviewIn48h,
        parentMessageDraft: "今晚重点不是训练，而是让孩子带着“我今天做到了”的感觉去睡觉。",
        triggerReason: "白天已经出现稳定亮点，适合用家园同频的方式放大孩子的自我效能感。",
        keyFindings: [
          "孩子对简短提醒的接受度比上周更高",
          "先被看见再被鼓励，比连续要求更有效",
          "家庭和园内都可以延续“先停一下再试一次”的节奏",
        ],
        continuityNotes: [
          "明天继续看是否能把今天的主动尝试延续到晨间环节",
          "家长反馈一句最有效的鼓励话术给老师",
        ],
        generatedAt,
      }),
    };
  })(),
};

export function resolveParentStoryBookDemoSeedId(
  value?: string | null
): ParentStoryBookDemoSeedId | null {
  if (!value) return null;
  return value in DEMO_SEEDS ? (value as ParentStoryBookDemoSeedId) : null;
}

export function resolveDefaultParentStoryBookDemoSeedId(input: {
  childId?: string | null;
  currentUserId?: string | null;
  accountKind?: string | null;
  explicitDemoSeedId?: string | null;
}): ParentStoryBookDemoSeedId | null {
  const explicitSeedId = resolveParentStoryBookDemoSeedId(input.explicitDemoSeedId);
  if (explicitSeedId) {
    return explicitSeedId;
  }

  if (
    input.currentUserId === "u-parent" &&
    input.accountKind === "demo" &&
    input.childId === "c-1"
  ) {
    return DEFAULT_PARENT_STORYBOOK_RECORDING_DEMO_SEED_ID;
  }

  return null;
}

export function getParentStoryBookDemoSeedPreset(
  demoSeedId?: ParentStoryBookDemoSeedId | null
): ParentStoryBookStylePreset | null {
  if (!demoSeedId) return null;
  return DEMO_SEEDS[demoSeedId]?.stylePreset ?? null;
}

export function applyParentStoryBookDemoSeed(
  request: ParentStoryBookRequest,
  demoSeedId?: ParentStoryBookDemoSeedId | null
): ParentStoryBookRequest {
  if (!demoSeedId) {
    return request;
  }

  const demoSeed = DEMO_SEEDS[demoSeedId];
  if (!demoSeed || request.childId !== demoSeed.childId) {
    return request;
  }

  const themeCandidates = request.highlightCandidates.filter(
    (item) =>
      item.kind === "manualTheme" ||
      item.kind === "goalKeyword" ||
      item.source === "manualTheme" ||
      item.source === "goalKeyword"
  );
  const stylePreset = request.stylePreset ?? demoSeed.stylePreset;
  const keepCustomStyle = request.styleMode === "custom";
  const stylePrompt = keepCustomStyle
    ? request.stylePrompt
    : request.stylePrompt || STYLE_PRESET_PROMPTS[stylePreset];
  const mergedHighlights =
    themeCandidates.length > 0
      ? [
          ...themeCandidates.map((item) => ({ ...item })),
          ...demoSeed.highlightCandidates.map((item) => ({ ...item })),
        ]
      : demoSeed.highlightCandidates.map((item) => ({ ...item }));
  const preserveRequestSource =
    request.generationMode === "manual-theme" ||
    request.generationMode === "hybrid" ||
    Boolean(request.manualTheme);

  return {
    ...request,
    storyMode: "storybook",
    generationMode: request.generationMode,
    manualTheme: request.manualTheme,
    manualPrompt: request.manualPrompt,
    pageCount: request.pageCount,
    goalKeywords: request.goalKeywords,
    protagonistArchetype: request.protagonistArchetype,
    stylePreset,
    styleMode: request.styleMode,
    customStylePrompt: request.customStylePrompt,
    customStyleNegativePrompt: request.customStyleNegativePrompt,
    stylePrompt,
    requestSource: preserveRequestSource ? request.requestSource : demoSeed.requestSource,
    highlightCandidates: mergedHighlights,
    latestInterventionCard: { ...demoSeed.latestInterventionCard },
    latestConsultation: { ...demoSeed.latestConsultation },
  };
}
