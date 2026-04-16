import type { InterventionCard } from "@/lib/agent/intervention-card";
import type { HighRiskConsultationResult, MemoryContextMeta } from "@/lib/ai/types";
import { buildConsultationTraceViewModel } from "@/lib/consultation/trace-view-model";
import type {
  ConsultationProviderTrace,
  ConsultationStageStatusEvent,
  ConsultationStageTextEvent,
  ConsultationTraceCase,
  ConsultationTraceMode,
  ConsultationTraceState,
} from "@/lib/consultation/trace-types";

const BASE_PROVIDER_TRACE: ConsultationProviderTrace = {
  source: "vivo",
  provider: "vivo-llm",
  model: "Volc-DeepSeek-V3.2",
  requestId: "trace-demo-001",
  realProvider: true,
  fallback: false,
};

const FALLBACK_PROVIDER_TRACE: ConsultationProviderTrace = {
  source: "mock",
  provider: "mock-brain",
  model: "fallback-demo",
  requestId: "trace-fallback-001",
  realProvider: false,
  fallback: true,
};

const BASE_MEMORY_META: MemoryContextMeta = {
  backend: "sqlite",
  degraded: false,
  usedSources: ["child_profile_memory", "agent_state_snapshots"],
  errors: [],
  matchedSnapshotIds: ["snapshot-001"],
  matchedTraceIds: ["trace-seed-001"],
  memory_context_used: true,
};

const EMPTY_MEMORY_META: MemoryContextMeta = {
  backend: "sqlite",
  degraded: false,
  usedSources: [],
  errors: [],
  matchedSnapshotIds: [],
  matchedTraceIds: [],
  memory_context_used: false,
};

const BASE_INTERVENTION_CARD: InterventionCard = {
  id: "card-demo-001",
  title: "小满 高风险家庭干预卡",
  riskLevel: "high",
  targetChildId: "child-demo-1",
  triggerReason: "午睡前抓耳、家长反馈夜间哭闹，近 48 小时连续出现。",
  summary: "今晚先完成情绪安抚与睡前观察，明早回收家庭反馈。",
  todayInSchoolAction: "午睡前后各记录一次抓耳频率，并观察情绪变化。",
  tonightHomeAction: "睡前 30 分钟降低刺激，记录抓耳和入睡时长。",
  homeSteps: [
    "睡前固定流程只保留 1 个安抚动作。",
    "记录抓耳、情绪和入睡时间。",
    "明早把反馈同步给老师。",
  ],
  observationPoints: ["抓耳频率", "入睡时长", "夜间哭闹是否缓解"],
  tomorrowObservationPoint: "明早入园后的情绪与抓耳情况。",
  reviewIn48h: "48 小时内复查家庭反馈与园内晨检表现是否一致。",
  parentMessageDraft: "今晚先做情绪安抚和睡前观察，做完后把孩子反应发给老师。",
  teacherFollowupDraft: "明早继续观察入园情绪，并回看家长反馈。",
  consultationMode: true,
  consultationId: "consult-demo-001",
  consultationSummary: "当前建议以今晚安抚、明早复查、48h 回看为主。",
  participants: ["HealthObservationAgent", "CoordinatorAgent"],
  shouldEscalateToAdmin: true,
  source: "vivo",
  model: "Volc-DeepSeek-V3.2",
};

const BASE_RESULT: HighRiskConsultationResult & {
  interventionCard: InterventionCard;
} = {
  consultationId: "consult-demo-001",
  triggerReason: "连续异常信号需要升级会诊。",
  triggerType: ["continuous-abnormality"],
  triggerReasons: ["午睡前抓耳频率上升", "家长反馈昨晚夜醒两次"],
  participants: [
    { id: "health-agent", label: "健康观察" },
    { id: "coordinator", label: "协调汇总" },
  ],
  childId: "child-demo-1",
  riskLevel: "high",
  agentFindings: [],
  summary: "系统判断当前需要先稳住今晚家庭动作，再结合明早园内观察做 48 小时复查。",
  keyFindings: ["症状连续出现，非单次波动", "家园两端反馈存在一致信号"],
  healthAgentView: {
    role: "HealthObservationAgent",
    title: "健康观察",
    summary: "抓耳与情绪波动需要持续跟踪。",
    signals: [],
    actions: [],
    observationPoints: [],
    evidence: [],
  },
  dietBehaviorAgentView: {
    role: "DietBehaviorAgent",
    title: "饮食行为",
    summary: "今天饮食链路暂无新增高风险。",
    signals: [],
    actions: [],
    observationPoints: [],
    evidence: [],
  },
  parentCommunicationAgentView: {
    role: "ParentCommunicationAgent",
    title: "家长沟通",
    summary: "今晚家庭动作要明确且便于反馈。",
    signals: [],
    actions: [],
    observationPoints: [],
    evidence: [],
  },
  inSchoolActionAgentView: {
    role: "InSchoolActionAgent",
    title: "园内动作",
    summary: "明早继续观察入园情绪和抓耳表现。",
    signals: [],
    actions: [],
    observationPoints: [],
    evidence: [],
  },
  todayInSchoolActions: [
    "午睡前后各记录一次抓耳频率。",
    "离园前确认家长已理解今晚观察重点。",
  ],
  tonightAtHomeActions: [
    "睡前 30 分钟降低刺激，保留单一安抚动作。",
    "记录抓耳、情绪和入睡时长。",
  ],
  followUp48h: ["48 小时后对照家庭反馈与晨检表现再次复查。"],
  parentMessageDraft: BASE_INTERVENTION_CARD.parentMessageDraft,
  directorDecisionCard: {
    title: "园长决策卡",
    reason: "建议园长关注是否需要安排保健老师参与复查。",
    recommendedOwnerRole: "admin",
    recommendedOwnerName: "值班园长",
    recommendedAt: "今日 18:00 前",
    status: "pending",
  },
  explainability: [
    { label: "连续信号", detail: "午睡前抓耳 + 夜间哭闹在近 48 小时内重复出现。" },
    { label: "家园一致", detail: "园内观察与家长反馈指向同一问题。" },
  ],
  nextCheckpoints: ["明早入园后抓耳是否缓解", "今晚睡前情绪是否更稳定"],
  evidenceItems: [],
  coordinatorSummary: {
    finalConclusion: "当前建议先完成今晚家庭动作，并在明早回收反馈，再决定是否升级到保健复查。",
    riskLevel: "high",
    problemDefinition: "连续异常信号需要快速闭环。",
    schoolAction: "明早继续观察并记录。",
    homeAction: "今晚做情绪安抚与睡前观察。",
    observationPoints: ["抓耳频率", "入睡时长"],
    reviewIn48h: "48 小时内复查家园反馈。",
    shouldEscalateToAdmin: true,
  },
  schoolAction: "明早继续观察并记录。",
  homeAction: "今晚做情绪安抚与睡前观察。",
  observationPoints: ["抓耳频率", "入睡时长"],
  reviewIn48h: BASE_INTERVENTION_CARD.reviewIn48h,
  shouldEscalateToAdmin: true,
  continuityNotes: ["近两次记录都提到抓耳和离园前不稳定情绪。"],
  memoryMeta: BASE_MEMORY_META,
  source: "vivo",
  provider: "vivo-llm",
  model: "Volc-DeepSeek-V3.2",
  providerTrace: BASE_PROVIDER_TRACE,
  traceMeta: {
    memory: {
      ...BASE_MEMORY_META,
      memory_context_backend: "sqlite",
    },
  },
  realProvider: true,
  fallback: false,
  generatedAt: "2026-04-03T20:30:00+08:00",
  interventionCard: BASE_INTERVENTION_CARD,
};

function createStatus(
  stage: ConsultationStageStatusEvent["stage"],
  title: string,
  message: string,
  memory: MemoryContextMeta | Record<string, unknown>,
  providerTrace?: ConsultationProviderTrace
): ConsultationStageStatusEvent {
  return {
    stage,
    title,
    message,
    traceId: BASE_RESULT.consultationId,
    providerTrace,
    memory,
  };
}

function createNote(
  stage: ConsultationStageTextEvent["stage"],
  title: string,
  text: string,
  items: string[],
  source: string
): ConsultationStageTextEvent {
  return {
    stage,
    title,
    text,
    items,
    source,
  };
}

export function buildConsultationTraceFixture(
  traceCase: ConsultationTraceCase,
  mode: ConsultationTraceMode
) {
  const commonState: Omit<ConsultationTraceState, "result" | "memoryMeta" | "providerTrace"> = {
    mode,
    activeStage: null,
    isStreaming: false,
    streamMessage: "这是用于联调的本地调试态案例，不会发起真实请求。",
    streamError: null,
    traceId: BASE_RESULT.consultationId,
    stageNotes: [],
    stageStatuses: {},
    stageUi: {},
    receivedAnyEvent: false,
    receivedDone: false,
    streamEndedUnexpectedly: false,
    invalidResultReason: null,
  };

  if (traceCase === "empty-memory") {
    return buildConsultationTraceViewModel({
      ...commonState,
      result: {
        ...BASE_RESULT,
        memoryMeta: EMPTY_MEMORY_META,
        traceMeta: { memory: EMPTY_MEMORY_META },
      },
      memoryMeta: EMPTY_MEMORY_META,
      providerTrace: BASE_PROVIDER_TRACE,
      receivedAnyEvent: true,
      receivedDone: true,
    });
  }

  if (traceCase === "fallback") {
    return buildConsultationTraceViewModel({
      ...commonState,
      result: {
        ...BASE_RESULT,
        source: "mock",
        provider: "mock-brain",
        model: "fallback-demo",
        providerTrace: FALLBACK_PROVIDER_TRACE,
        realProvider: false,
        fallback: true,
        memoryMeta: BASE_MEMORY_META,
        traceMeta: { memory: BASE_MEMORY_META },
      },
      memoryMeta: BASE_MEMORY_META,
      providerTrace: FALLBACK_PROVIDER_TRACE,
      receivedAnyEvent: true,
      receivedDone: true,
    });
  }

  if (traceCase === "error") {
    return buildConsultationTraceViewModel({
      ...commonState,
      activeStage: "current_recommendation",
      result: null,
      memoryMeta: BASE_MEMORY_META,
      providerTrace: FALLBACK_PROVIDER_TRACE,
      streamError: "backend error: 503 upstream unavailable",
      stageStatuses: {
        long_term_profile: createStatus("long_term_profile", "长期画像", "已读取历史画像。", BASE_MEMORY_META),
        recent_context: createStatus("recent_context", "最近会诊 / 最近快照", "已整理最近连续性信号。", BASE_MEMORY_META),
        current_recommendation: createStatus("current_recommendation", "当前建议", "生成阶段遇到上游错误。", BASE_MEMORY_META, FALLBACK_PROVIDER_TRACE),
      },
      stageNotes: [
        createNote("long_term_profile", "长期画像", "已读取到长期画像与最近两次连续信号。", ["连续抓耳", "夜间哭闹"], "memory"),
        createNote("recent_context", "最近会诊 / 最近快照", "最近会诊提示要重点回看睡前情绪。", ["最近快照", "待复查"], "memory"),
      ],
      receivedAnyEvent: true,
    });
  }

  if (traceCase === "partial") {
    return buildConsultationTraceViewModel({
      ...commonState,
      activeStage: "current_recommendation",
      result: null,
      memoryMeta: BASE_MEMORY_META,
      providerTrace: BASE_PROVIDER_TRACE,
      streamMessage: "SSE 在当前建议阶段提前结束，已保留已收到的两段内容。",
      stageStatuses: {
        long_term_profile: createStatus("long_term_profile", "长期画像", "已读取长期画像。", BASE_MEMORY_META),
        recent_context: createStatus("recent_context", "最近会诊 / 最近快照", "已整理最近快照。", BASE_MEMORY_META),
        current_recommendation: createStatus("current_recommendation", "当前建议", "正在生成当前建议。", BASE_MEMORY_META, BASE_PROVIDER_TRACE),
      },
      stageNotes: [
        createNote("long_term_profile", "长期画像", "近两次记录都提到抓耳和离园前不稳定情绪。", ["连续抓耳", "离园前情绪波动"], "memory"),
        createNote("recent_context", "最近会诊 / 最近快照", "最近会诊提醒今晚先回收睡前反馈。", ["最近会诊", "睡前反馈"], "memory"),
      ],
      receivedAnyEvent: true,
      streamEndedUnexpectedly: true,
    });
  }

  return buildConsultationTraceViewModel({
    ...commonState,
    activeStage: "current_recommendation",
    result: null,
    memoryMeta: BASE_MEMORY_META,
    providerTrace: BASE_PROVIDER_TRACE,
    streamMessage: "done 事件已到达，但返回的 result 缺少关键字段。",
    stageStatuses: {
      long_term_profile: createStatus("long_term_profile", "长期画像", "已读取长期画像。", BASE_MEMORY_META),
      recent_context: createStatus("recent_context", "最近会诊 / 最近快照", "已整理最近快照。", BASE_MEMORY_META),
      current_recommendation: createStatus("current_recommendation", "当前建议", "已收到 done，但结果未通过校验。", BASE_MEMORY_META, BASE_PROVIDER_TRACE),
    },
    stageNotes: [
      createNote("long_term_profile", "长期画像", "历史画像已加载。", ["连续信号", "memory source"], "memory"),
      createNote("recent_context", "最近会诊 / 最近快照", "近期快照已整理。", ["最近会诊", "待复查"], "memory"),
      createNote("current_recommendation", "当前建议", "当前建议文本已收到，但最终业务结果对象不完整。", ["园内动作", "今晚任务"], "vivo"),
    ],
    receivedAnyEvent: true,
    receivedDone: true,
    invalidResultReason: "done.result 缺少关键字段：interventionCard、directorDecisionCard",
  });
}
