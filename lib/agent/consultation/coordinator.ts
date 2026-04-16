import type {
  ConsultationParticipant,
  ConsultationResult,
  ConsultationResultSource,
  DirectorDecisionCard,
  ExplainabilityItem,
  HighRiskAgentView,
} from "@/lib/ai/types";
import { analyzeCoparentingConsultation } from "@/lib/agent/consultation/coparenting-agent";
import { analyzeDietConsultation } from "@/lib/agent/consultation/diet-agent";
import { analyzeExecutionConsultation } from "@/lib/agent/consultation/execution-agent";
import { analyzeHealthConsultation } from "@/lib/agent/consultation/health-agent";
import type { ConsultationInput } from "@/lib/agent/consultation/input";
import { detectConsultationTrigger } from "@/lib/agent/consultation/trigger";
import { buildConsultationEvidenceItems } from "@/lib/consultation/evidence";

const PARTICIPANTS: ConsultationParticipant[] = [
  { id: "health-agent", label: "HealthObservationAgent" },
  { id: "diet-agent", label: "DietBehaviorAgent" },
  { id: "coparenting-agent", label: "ParentCommunicationAgent" },
  { id: "execution-agent", label: "InSchoolActionAgent" },
  { id: "coordinator", label: "CoordinatorAgent" },
];

function createConsultationId(childId: string) {
  return `consult-${childId}-${Date.now()}`;
}

function takeUnique(items: Array<string | undefined>, limit = 5) {
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

function mapToConsultationSource(
  source: ConsultationResultSource | "ai" | "fallback" | "mock" | "vivo"
): ConsultationResultSource {
  if (source === "ai" || source === "fallback" || source === "mock" || source === "vivo") {
    return source;
  }
  return "rule";
}

function mapFindingToView(
  role: HighRiskAgentView["role"],
  finding: {
    title: string;
    riskExplanation: string;
    signals: string[];
    actions: string[];
    observationPoints: string[];
    evidence: string[];
  }
): HighRiskAgentView {
  return {
    role,
    title: finding.title,
    summary: finding.riskExplanation,
    signals: finding.signals,
    actions: finding.actions,
    observationPoints: finding.observationPoints,
    evidence: finding.evidence,
  };
}

function buildExplainability(params: {
  triggerReasons: string[];
  healthView: HighRiskAgentView;
  dietView: HighRiskAgentView;
  parentView: HighRiskAgentView;
  schoolView: HighRiskAgentView;
  continuityNotes?: string[];
}): ExplainabilityItem[] {
  return takeUnique(
    [
      ...params.triggerReasons.map((item) => `触发原因：${item}`),
      ...(params.continuityNotes ?? []).map((item) => `连续性参考：${item}`),
      ...params.healthView.evidence.map((item) => `健康证据：${item}`),
      ...params.dietView.evidence.map((item) => `饮食证据：${item}`),
      ...params.parentView.evidence.map((item) => `家长证据：${item}`),
      ...params.schoolView.evidence.map((item) => `园内执行证据：${item}`),
    ],
    8
  ).map((item) => {
    const separatorIndex = item.indexOf("：");

    return separatorIndex > -1
      ? {
          label: item.slice(0, separatorIndex),
          detail: item.slice(separatorIndex + 1),
        }
      : {
          label: "说明",
          detail: item,
        };
  });
}

function buildDirectorDecisionCard(params: {
  childName: string;
  riskLevel: ConsultationResult["riskLevel"];
  shouldEscalateToAdmin: boolean;
  triggerReasons: string[];
  schoolAction: string;
  continuityNotes?: string[];
}): DirectorDecisionCard {
  const recommendedOwnerRole = params.shouldEscalateToAdmin ? "admin" : "teacher";
  const continuityReason = params.continuityNotes?.[0];

  return {
    title: `${params.childName} 今日优先级决策卡`,
    reason: [
      `${params.childName} 当前需要优先处理，原因是${params.triggerReasons[0] ?? "已出现连续高风险信号"}。`,
      continuityReason ?? "",
      `建议先落地：${params.schoolAction}`,
    ]
      .filter(Boolean)
      .join(" "),
    recommendedOwnerRole,
    recommendedOwnerName: recommendedOwnerRole === "admin" ? "园长" : "班主任",
    recommendedAt: params.riskLevel === "high" ? "今天放学前" : "今天晚饭前",
    status: "pending",
  };
}

function buildParentMessageDraft(params: {
  childName: string;
  tonightAtHomeActions: string[];
  nextCheckpoints: string[];
  continuityNotes?: string[];
}) {
  return [
    `${params.childName} 今天在园已进入重点会诊闭环。今晚请优先完成：${params.tonightAtHomeActions[0] ?? "一项家庭稳定动作"}。`,
    params.continuityNotes?.[0] ?? "",
    `反馈时请重点说明：${params.nextCheckpoints.slice(0, 2).join("、")}。`,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function maybeRunHighRiskConsultation(input: ConsultationInput): Promise<ConsultationResult | null> {
  const trigger = detectConsultationTrigger(input);
  if (!trigger.shouldTrigger) {
    return null;
  }

  const [healthFinding, dietFinding, coparentingFinding, executionFinding] = await Promise.all([
    Promise.resolve(analyzeHealthConsultation(input)),
    Promise.resolve(analyzeDietConsultation(input)),
    Promise.resolve(analyzeCoparentingConsultation(input)),
    Promise.resolve(analyzeExecutionConsultation(input)),
  ]);

  const agentFindings = [healthFinding, dietFinding, coparentingFinding, executionFinding];
  const healthAgentView = mapFindingToView("HealthObservationAgent", healthFinding);
  const dietBehaviorAgentView = mapFindingToView("DietBehaviorAgent", dietFinding);
  const parentCommunicationAgentView = mapFindingToView("ParentCommunicationAgent", coparentingFinding);
  const inSchoolActionAgentView = mapFindingToView("InSchoolActionAgent", executionFinding);

  const todayInSchoolActions = takeUnique([...executionFinding.actions, ...healthFinding.actions], 4);
  const tonightAtHomeActions = takeUnique([...coparentingFinding.actions, ...dietFinding.actions], 4);
  const observationPoints = takeUnique(agentFindings.flatMap((item) => item.observationPoints), 4);
  const shouldEscalateToAdmin =
    trigger.triggerTypes.includes("admin-priority") ||
    trigger.triggerTypes.includes("stale-intervention") ||
    trigger.riskLevel === "high";

  const schoolAction = todayInSchoolActions[0] ?? "今天先完成一次园内复核，并在离园前同步结果。";
  const homeAction = tonightAtHomeActions[0] ?? "今晚先完成一次家庭配合动作，并在睡前记录反馈。";
  const reviewIn48h =
    executionFinding.actions[1] ??
    input.currentInterventionCard?.reviewIn48h ??
    "48 小时内回看晨检、饮食和家长反馈是否同步改善。";
  const nextCheckpoints = takeUnique(
    [
      ...observationPoints,
      reviewIn48h,
      ...todayInSchoolActions.slice(1),
      ...tonightAtHomeActions.slice(1),
      ...(input.memoryContext?.openLoops ?? []).slice(0, 2),
    ],
    6
  );
  const triggerReasons = takeUnique(
    [...trigger.triggers.map((item) => item.reason), trigger.triggerReason, ...(input.continuityNotes ?? [])],
    4
  );
  const keyFindings = takeUnique(
    [
      healthFinding.riskExplanation,
      dietFinding.riskExplanation,
      coparentingFinding.riskExplanation,
      executionFinding.riskExplanation,
      ...(input.memoryContext?.lastConsultationTakeaways ?? []).slice(0, 2),
    ],
    5
  );
  const summary = [
    `${input.childName} 当前已进入高风险会诊闭环，建议把园内复核、今晚家庭动作和 48 小时复查压缩到同一条执行路径。`,
    input.continuityNotes?.[0] ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const finalConclusion = [
    summary,
    `当前优先动作是“${schoolAction}”，并要求家长今晚完成“${homeAction}”。`,
    input.memoryContext?.openLoops?.[0] ? `仍需继续盯住：${input.memoryContext.openLoops[0]}。` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const directorDecisionCard = buildDirectorDecisionCard({
    childName: input.childName,
    riskLevel: trigger.riskLevel,
    shouldEscalateToAdmin,
    triggerReasons,
    schoolAction,
    continuityNotes: input.continuityNotes,
  });
  const consultationId = createConsultationId(input.childId);
  const explainability = buildExplainability({
    triggerReasons,
    healthView: healthAgentView,
    dietView: dietBehaviorAgentView,
    parentView: parentCommunicationAgentView,
    schoolView: inSchoolActionAgentView,
    continuityNotes: input.continuityNotes,
  });
  const source = mapToConsultationSource(input.responseSource);
  const evidenceItems = buildConsultationEvidenceItems({
    consultationId,
    generatedAt: input.generatedAt,
    keyFindings,
    triggerReasons,
    todayInSchoolActions,
    tonightAtHomeActions,
    followUp48h: [reviewIn48h, ...nextCheckpoints.slice(0, 2)],
    explainability,
    continuityNotes: input.continuityNotes ?? [],
    memoryMeta:
      input.memoryMeta && typeof input.memoryMeta === "object"
        ? (input.memoryMeta as Record<string, unknown>)
        : null,
    providerTrace: null,
    multimodalNotes: null,
    rawEvidenceItems: undefined,
  });

  return {
    consultationId,
    triggerReason: trigger.triggerReason,
    triggerType: trigger.triggerTypes,
    triggerReasons,
    participants: PARTICIPANTS,
    childId: input.childId,
    riskLevel: trigger.riskLevel,
    agentFindings,
    summary,
    keyFindings,
    healthAgentView,
    dietBehaviorAgentView,
    parentCommunicationAgentView,
    inSchoolActionAgentView,
    todayInSchoolActions,
    tonightAtHomeActions,
    followUp48h: [reviewIn48h, ...nextCheckpoints.slice(0, 2)],
    parentMessageDraft: buildParentMessageDraft({
      childName: input.childName,
      tonightAtHomeActions,
      nextCheckpoints,
      continuityNotes: input.continuityNotes,
    }),
    directorDecisionCard,
    explainability,
    evidenceItems,
    nextCheckpoints,
    coordinatorSummary: {
      finalConclusion,
      riskLevel: trigger.riskLevel,
      problemDefinition: triggerReasons[0] ?? `${input.childName} 当前存在需要跨角色协同的连续风险。`,
      schoolAction,
      homeAction,
      observationPoints,
      reviewIn48h,
      shouldEscalateToAdmin,
    },
    schoolAction,
    homeAction,
    observationPoints,
    reviewIn48h,
    shouldEscalateToAdmin,
    continuityNotes: input.continuityNotes,
    memoryMeta: input.memoryMeta,
    source,
    model: input.model,
    generatedAt: input.generatedAt,
  };
}
